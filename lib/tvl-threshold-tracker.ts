/**
 * lib/tvl-threshold-tracker.ts
 *
 * Tracks which TVL capacity threshold was last broadcast per vault so that
 * subscribers only receive a notification when a new milestone is crossed
 * (25%, 50%, 75%, 90%, 98%) rather than every hour.
 *
 * Requires a Supabase table:
 *
 *   CREATE TABLE vault_tvl_thresholds (
 *     vault_id TEXT PRIMARY KEY,
 *     last_threshold_pct INTEGER NOT NULL DEFAULT 0,
 *     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 *   );
 */

import { createClient } from "@supabase/supabase-js";

export const TVL_THRESHOLDS = [25, 50, 75, 90, 98, 100] as const;

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  return createClient(url, key);
}

/**
 * Returns the highest threshold that has been crossed for a given utilization %.
 * Returns 0 if utilization is below the first threshold.
 */
export function getCurrentThreshold(utilizationPct: number): number {
  let crossed = 0;
  for (const t of TVL_THRESHOLDS) {
    if (utilizationPct >= t) crossed = t;
  }
  return crossed;
}

/**
 * Get the last threshold that was broadcast for a vault.
 * Returns 0 if no threshold has been notified yet.
 */
export async function getLastNotifiedThreshold(vaultId: string): Promise<number> {
  try {
    const { data } = await getClient()
      .from("vault_tvl_thresholds")
      .select("last_threshold_pct")
      .eq("vault_id", vaultId)
      .single();
    return (data?.last_threshold_pct as number) ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Update the last notified threshold for a vault.
 * If utilization has dropped below the previously notified threshold,
 * resets to the current threshold so future crossings trigger again.
 */
export async function setLastNotifiedThreshold(
  vaultId: string,
  thresholdPct: number
): Promise<void> {
  try {
    await getClient()
      .from("vault_tvl_thresholds")
      .upsert({
        vault_id: vaultId,
        last_threshold_pct: thresholdPct,
        updated_at: new Date().toISOString(),
      });
  } catch {
    // Best-effort — if this fails the worst case is a duplicate notification next hour
  }
}

/**
 * Determine whether a TVL cap notification should be sent for a vault.
 *
 * Rules:
 *   - No notification if utilization > 100% (vault is full, user already knows)
 *   - No notification if utilization hasn't crossed a new threshold since last broadcast
 *   - If utilization dropped below the last notified threshold (vault drained),
 *     the tracker resets so future crossings trigger again
 */
export async function shouldNotifyTvlThreshold(
  vaultId: string,
  utilizationPct: number
): Promise<{ notify: boolean; thresholdPct: number }> {
  const currentThreshold = getCurrentThreshold(utilizationPct);
  const lastNotified = await getLastNotifiedThreshold(vaultId);

  // Over 100% — vault already full, stop notifying until it drains back down
  if (utilizationPct > 100) {
    // If last notification was below 100, bump tracker to 100 so the reset
    // logic fires correctly when the vault drains back below 100%
    if (lastNotified < 100) {
      await setLastNotifiedThreshold(vaultId, 100);
    }
    return { notify: false, thresholdPct: 100 };
  }

  // Below all thresholds
  if (currentThreshold === 0) {
    // If we previously notified (vault drained), reset tracker
    if (lastNotified > 0) {
      await setLastNotifiedThreshold(vaultId, 0);
    }
    return { notify: false, thresholdPct: 0 };
  }

  // Vault drained below last notified threshold — reset so crossings re-trigger
  if (currentThreshold < lastNotified) {
    await setLastNotifiedThreshold(vaultId, currentThreshold);
    return { notify: false, thresholdPct: currentThreshold };
  }

  // New threshold crossed
  if (currentThreshold > lastNotified) {
    return { notify: true, thresholdPct: currentThreshold };
  }

  // Same threshold as last time — don't re-notify
  return { notify: false, thresholdPct: currentThreshold };
}
