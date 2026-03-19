/**
 * lib/subscribers.ts
 *
 * Supabase-backed subscriber store.
 * Each subscriber has a Telegram chat_id, alert preferences, and one or more
 * tracked wallet addresses (stored in the `wallets` table).
 *
 * Onboarding steps tracked via pendingStep:
 *   null         — fully onboarded
 *   "alertLevel" — waiting for 1/2 reply
 *   "yieldFloor" — waiting for APY floor reply
 *
 * DB tables:
 *   subscribers (chat_id PK, wallet, subscribed_at, alert_level, yield_floor_pct, pending_step)
 *   wallets     (chat_id, wallet — composite PK, added_at)
 */

import { createClient } from "@supabase/supabase-js";

export type AlertLevel = "critical" | "all";
export type OnboardingStep = "alertLevel" | "yieldFloor" | "email" | null;

export const DEFAULT_YIELD_FLOOR_PCT = 3;

export interface Subscriber {
  chatId: string;
  /** Primary wallet (from subscribers table). Equals wallets[0] when wallets is populated. */
  wallet: string;
  /** All tracked wallet addresses for this subscriber (from wallets table). */
  wallets: string[];
  subscribedAt: string;
  alertLevel: AlertLevel;
  /** Minimum acceptable APY (%). Alert fires if any vault drops below this. */
  yieldFloorPct: number;
  /** Current onboarding step awaiting a reply, or null if complete. */
  pendingStep: OnboardingStep;
  /** Optional email address for email notifications. */
  email?: string;
}

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  return createClient(url, key);
}

function toSubscriber(row: Record<string, unknown>, wallets?: string[]): Subscriber {
  const primaryWallet = row.wallet as string;
  return {
    chatId: row.chat_id as string,
    wallet: primaryWallet,
    wallets: wallets ?? [primaryWallet],
    subscribedAt: row.subscribed_at as string,
    alertLevel: (row.alert_level as AlertLevel) ?? "all",
    yieldFloorPct: Number(row.yield_floor_pct ?? DEFAULT_YIELD_FLOOR_PCT),
    pendingStep: (row.pending_step as OnboardingStep) ?? null,
    email: (row.email as string) ?? undefined,
  };
}

export async function getSubscribers(): Promise<Subscriber[]> {
  try {
    const client = getClient();
    const [{ data: subs, error }, { data: walletRows }] = await Promise.all([
      client.from("subscribers").select("*"),
      client.from("wallets").select("chat_id, wallet"),
    ]);
    if (error || !subs) return [];

    // Build wallet map: chatId → wallet[]
    const walletMap = new Map<string, string[]>();
    for (const row of walletRows ?? []) {
      const chatId = row.chat_id as string;
      if (!walletMap.has(chatId)) walletMap.set(chatId, []);
      walletMap.get(chatId)!.push(row.wallet as string);
    }

    return subs.map((row) => {
      const sub = row as Record<string, unknown>;
      const chatId = sub.chat_id as string;
      return toSubscriber(sub, walletMap.get(chatId));
    });
  } catch {
    return [];
  }
}

/**
 * Register a new subscriber. Also inserts wallet into the wallets table.
 * Resets onboarding to the first step.
 */
export async function addSubscriber(chatId: string, wallet: string): Promise<boolean> {
  try {
    const client = getClient();
    const { error } = await client.from("subscribers").upsert({
      chat_id: chatId,
      wallet,
      subscribed_at: new Date().toISOString(),
      alert_level: "all",
      pending_step: "alertLevel",
    });
    if (error) return false;
    // Also register wallet in the wallets table
    await client.from("wallets").upsert({ chat_id: chatId, wallet });
    return true;
  } catch {
    return false;
  }
}

/** Add an additional wallet for an already-subscribed user. */
export async function addWallet(chatId: string, wallet: string): Promise<boolean> {
  try {
    const { error } = await getClient()
      .from("wallets")
      .upsert({ chat_id: chatId, wallet });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Remove a specific wallet for a subscriber.
 * Returns { ok: false, isLastWallet: true } if it's the only remaining wallet.
 */
export async function removeWallet(
  chatId: string,
  wallet: string
): Promise<{ ok: boolean; isLastWallet?: boolean }> {
  try {
    const client = getClient();
    const { data } = await client.from("wallets").select("wallet").eq("chat_id", chatId);
    if (!data || data.length <= 1) return { ok: false, isLastWallet: true };
    const { error } = await client
      .from("wallets")
      .delete()
      .eq("chat_id", chatId)
      .eq("wallet", wallet);
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}

/** Get all tracked wallets for a subscriber, ordered by when they were added. */
export async function getWallets(chatId: string): Promise<string[]> {
  try {
    const { data } = await getClient()
      .from("wallets")
      .select("wallet")
      .eq("chat_id", chatId)
      .order("added_at", { ascending: true });
    return (data ?? []).map((r) => r.wallet as string);
  } catch {
    return [];
  }
}

/** Set alert level and advance onboarding to the yield floor step. */
export async function setAlertLevel(chatId: string, level: AlertLevel): Promise<boolean> {
  try {
    const { error } = await getClient()
      .from("subscribers")
      .update({ alert_level: level, pending_step: "yieldFloor" })
      .eq("chat_id", chatId);
    return !error;
  } catch {
    return false;
  }
}

/** Set the personal yield floor and complete onboarding (used by /setfloor command). */
export async function setYieldFloor(chatId: string, pct: number): Promise<boolean> {
  try {
    const { error } = await getClient()
      .from("subscribers")
      .update({ yield_floor_pct: pct, pending_step: null })
      .eq("chat_id", chatId);
    return !error;
  } catch {
    return false;
  }
}

/** Set yield floor during onboarding and advance to email step. */
export async function setYieldFloorAndAdvance(chatId: string, pct: number): Promise<boolean> {
  try {
    const { error } = await getClient()
      .from("subscribers")
      .update({ yield_floor_pct: pct, pending_step: "email" })
      .eq("chat_id", chatId);
    return !error;
  } catch {
    return false;
  }
}

/** Set email address and complete onboarding. Pass null to skip email. */
export async function setEmail(chatId: string, email: string | null): Promise<boolean> {
  try {
    const { error } = await getClient()
      .from("subscribers")
      .update({ email, pending_step: null })
      .eq("chat_id", chatId);
    return !error;
  } catch {
    return false;
  }
}

export async function clearPendingStep(chatId: string): Promise<boolean> {
  try {
    const { error } = await getClient()
      .from("subscribers")
      .update({ pending_step: null })
      .eq("chat_id", chatId);
    return !error;
  } catch {
    return false;
  }
}

export async function removeSubscriber(chatId: string): Promise<boolean> {
  try {
    const client = getClient();
    await Promise.all([
      client.from("subscribers").delete().eq("chat_id", chatId),
      client.from("wallets").delete().eq("chat_id", chatId),
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function subscriberCount(): Promise<number> {
  try {
    const { count } = await getClient()
      .from("subscribers")
      .select("*", { count: "exact", head: true });
    return count ?? 0;
  } catch {
    return 0;
  }
}
