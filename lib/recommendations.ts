import { VaultId, VaultHealth, Alert } from "./types";
import {
  BenchmarkSnapshot,
  AllocationSnapshot,
  Recommendation,
  RecommendationAction,
} from "./domain";
import { describeShifts } from "./allocations";

/**
 * Derive a single plain-language recommendation from vault state.
 *
 * Priority order (highest wins):
 *   1. Vault paused
 *   2. Vault degraded or any critical alert
 *   3. Yield below benchmark floor
 *   4. Significant allocation shift
 *   5. Healthy — no action
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
  } else if (benchmark.belowFloor) {
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
      `Current APY (${benchmark.vaultAPY.toFixed(2)}%) is within acceptable range of ` +
      `${benchmark.benchmarkName} (${benchmark.benchmarkAPY.toFixed(2)}%). ` +
      `Yield may fluctuate for 12–24h as the new allocation settles. No action needed.`;
  } else {
    action = "no_action";
    urgency = "none";
    const spreadSign = benchmark.spreadBps >= 0 ? "+" : "";
    headline = `${vaultLabel} is healthy — no action needed`;
    rationale =
      `Vault is operating normally. Current APY (${benchmark.vaultAPY.toFixed(2)}%) is ` +
      `${spreadSign}${benchmark.spreadBps}bps vs ${benchmark.benchmarkName} ` +
      `(${benchmark.benchmarkAPY.toFixed(2)}%), within acceptable range. ` +
      `No significant allocation changes detected.`;
  }

  return { vaultId, action, headline, rationale, urgency };
}
