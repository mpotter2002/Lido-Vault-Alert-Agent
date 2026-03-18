import { VaultId, VaultHealth, Alert } from "./types";
import {
  BenchmarkSnapshot,
  AllocationSnapshot,
  Recommendation,
  RecommendationAction,
  SourceStatus,
} from "./domain";
import { describeShifts } from "./allocations";

/** Returns a parenthetical note about benchmark data quality to append to rationale. */
function bmQualityNote(source: SourceStatus): string {
  switch (source) {
    case "live":
      return "";
    case "cached_last_known_good":
      return " (Note: benchmark value is stale — using last successful live fetch; comparison may not reflect current market rates.)";
    case "unavailable":
      return " (Note: benchmark comparison unavailable — live fetch failed and no cached value exists; yield analysis is suspended.)";
    case "seeded_demo":
      return " (Note: benchmark value is seeded demo data, not a live or cached value.)";
  }
}

/**
 * Derive a single plain-language recommendation from vault state.
 *
 * Priority order (highest wins):
 *   1. Vault paused
 *   2. Vault degraded or any critical alert
 *   3. Yield below benchmark floor  (skipped when benchmark is unavailable)
 *   4. Significant allocation shift
 *   5. Healthy — no action (conservative wording when benchmark is stale/unavailable)
 */
export function buildRecommendation(
  vaultId: VaultId,
  health: VaultHealth,
  benchmark: BenchmarkSnapshot,
  allocation: AllocationSnapshot,
  alerts: Alert[]
): Recommendation {
  const vaultLabel = vaultId === "earnETH" ? "EarnETH" : "EarnUSD";
  const criticalAlerts = alerts.filter((a) => a.severity === "critical");
  const hasCritical = criticalAlerts.length > 0;
  const bigShifts = allocation.significantShifts.length > 0;
  const bmSource = benchmark.freshness.source;
  const bmUnavailable = bmSource === "unavailable";

  let action: RecommendationAction;
  let urgency: Recommendation["urgency"];
  let headline: string;
  let rationale: string;

  if (health === "paused") {
    action = "consider_withdrawal";
    urgency = "high";
    headline = `${vaultLabel} is paused — prepare withdrawal if needed`;
    rationale =
      `The ${vaultLabel} vault has been paused. Deposits and withdrawals are temporarily ` +
      `halted as a safety measure. Your funds are intact. Monitor official Lido channels ` +
      `for a resolution timeline. If you need liquidity, queue a withdrawal request now ` +
      `so it is first in line when the vault unpauses.`;
  } else if (health === "degraded" || hasCritical) {
    action = "avoid_new_deposits";
    urgency = "medium";
    const alertNote = hasCritical
      ? ` Active critical alert: "${criticalAlerts[0].title}".`
      : "";
    headline = `${vaultLabel} health ${health} — avoid new deposits`;
    rationale =
      `Vault health is reporting "${health}".${alertNote} Hold off on new deposits ` +
      `until the issue is resolved. Existing positions are unaffected. ` +
      `Monitor the curator's on-chain activity for a rebalance that resolves the condition.`;
  } else if (!bmUnavailable && benchmark.belowFloor) {
    // Only fire benchmark-based recommendation when we have a real value.
    action = "monitor";
    urgency = "low";
    const spreadAbs = Math.abs(benchmark.spreadBps);
    const shiftNote = bigShifts
      ? ` Recent allocation shifts (${describeShifts(allocation.significantShifts)}) may be a contributing factor.`
      : "";
    headline = `${vaultLabel} yield trailing ${benchmark.benchmarkName} by ${spreadAbs}bps — monitor`;
    rationale =
      `Current vault APY (${benchmark.vaultAPY.toFixed(2)}%) is trailing ` +
      `${benchmark.benchmarkName} (${benchmark.benchmarkAPY.toFixed(2)}%) by ${spreadAbs}bps, ` +
      `exceeding the acceptable floor of ${Math.abs(benchmark.floorBps)}bps.` +
      bmQualityNote(bmSource) +
      shiftNote +
      ` No emergency action required, but new deposits are not recommended until yield ` +
      `recovers. The curator is expected to rebalance toward higher-yielding protocols.`;
  } else if (bigShifts) {
    action = "monitor";
    urgency = "none";
    const shiftDesc = describeShifts(allocation.significantShifts);
    headline = `${vaultLabel} curator rebalanced — yield may fluctuate briefly`;
    rationale =
      `The vault curator adjusted protocol allocations: ${shiftDesc}. ` +
      (bmUnavailable
        ? `Current APY (${benchmark.vaultAPY.toFixed(2)}%) — benchmark comparison is currently unavailable.`
        : `Current APY (${benchmark.vaultAPY.toFixed(2)}%) is within acceptable range of ` +
          `${benchmark.benchmarkName} (${benchmark.benchmarkAPY.toFixed(2)}%).`) +
      bmQualityNote(bmSource) +
      ` Yield may fluctuate for 12–24h as the new allocation settles. No action needed.`;
  } else {
    action = "no_action";
    urgency = "none";
    if (bmUnavailable) {
      headline = `${vaultLabel} vault health OK — benchmark comparison unavailable`;
      rationale =
        `Vault is operating normally with no critical alerts or significant allocation shifts. ` +
        `Benchmark yield comparison is currently unavailable (live fetch failed and no cached value exists). ` +
        `Cannot confirm relative yield performance until the benchmark feed recovers.`;
    } else {
      const spreadSign = benchmark.spreadBps >= 0 ? "+" : "";
      headline = `${vaultLabel} is healthy — no action needed`;
      rationale =
        `Vault is operating normally. Current APY (${benchmark.vaultAPY.toFixed(2)}%) is ` +
        `${spreadSign}${benchmark.spreadBps}bps vs ${benchmark.benchmarkName} ` +
        `(${benchmark.benchmarkAPY.toFixed(2)}%), within acceptable range.` +
        bmQualityNote(bmSource) +
        ` No significant allocation changes detected.`;
    }
  }

  return { vaultId, action, headline, rationale, urgency };
}
