import { VaultPosition, Alert, AlertSeverity } from "./types";
import { BenchmarkSnapshot, AllocationSnapshot } from "./domain";
import { fetchBenchmark, getBenchmarkSnapshot } from "./benchmarks";
import { buildAllocationSnapshot, describeShifts } from "./allocations";
import { SEEDED_FRESHNESS } from "./benchmarks";
import { SourceFreshness } from "./domain";

let idCounter = 0;
function makeId() {
  return `alert-${++idCounter}-${Date.now()}`;
}

function ago(hours: number): Date {
  return new Date(Date.now() - hours * 3600 * 1000);
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function sortAlerts(alerts: Alert[]): Alert[] {
  return alerts.sort((a, b) => {
    const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return b.timestamp.getTime() - a.timestamp.getTime();
  });
}

// ---------------------------------------------------------------------------
// Core position-state alert rules (no external data needed)
// ---------------------------------------------------------------------------

function positionAlerts(positions: VaultPosition[]): Alert[] {
  const alerts: Alert[] = [];

  for (const pos of positions) {
    // APY drop > 0.5% absolute in 24h
    // At typical vault APYs (~4–6%), a 0.5% drop (e.g. 5% → 4.5%) is meaningful.
    // Suppressed when vault metrics are seeded: apyDelta24h is a fabricated demo value,
    // not a real observed change. Firing a "drop" alert from invented data is misleading.
    if (pos.vaultMetricsSource !== "seeded_demo" && pos.apyDelta24h < 0) {
      if (Math.abs(pos.apyDelta24h) >= 0.5) {
        const prevAPY = pos.currentAPY - pos.apyDelta24h;
        const prevFormatted = prevAPY.toFixed(1);
        alerts.push({
          id: makeId(),
          vaultId: pos.vaultId,
          vaultName: pos.vaultName,
          type: "apy_drop",
          severity: "warning",
          title: `APY dropped ${Math.abs(pos.apyDelta24h).toFixed(1)}pp in 24h`,
          summary: `${pos.vaultName} yield fell from ${prevFormatted}% to ${pos.currentAPY.toFixed(1)}% APY over the last 24 hours. This follows a strategy rebalance by the vault curator (${pos.curatorName}). No immediate action needed — yield is expected to stabilise as the new allocation settles.`,
          technicalDetail: buildStrategyDetail(pos) + ` vaultMetricsSource: ${pos.vaultMetricsSource}.`,
          actionRequired: false,
          suggestedAction: null,
          timestamp: ago(2),
          dismissed: false,
        });
      }
    }

    // APY recovery >= 10% relative in 24h
    // Same rationale: suppressed when seeded. apyDelta24h from demo scenarios is invented.
    if (pos.vaultMetricsSource !== "seeded_demo" && pos.apyDelta24h > 0) {
      const prevAPY = pos.currentAPY - pos.apyDelta24h;
      if (prevAPY > 0) {
        const relGain = pos.apyDelta24h / prevAPY;
        if (relGain >= 0.1) {
          alerts.push({
            id: makeId(),
            vaultId: pos.vaultId,
            vaultName: pos.vaultName,
            type: "apy_recovery",
            severity: "info",
            title: `APY recovering — now ${pos.currentAPY.toFixed(1)}%`,
            summary: `${pos.vaultName} yield has increased by ${pos.apyDelta24h.toFixed(1)}pp over the last 24 hours and is now ${pos.currentAPY.toFixed(1)}% APY. The curator rebalance appears to be settling positively.`,
            technicalDetail: buildStrategyDetail(pos) + ` vaultMetricsSource: ${pos.vaultMetricsSource}.`,
            actionRequired: false,
            suggestedAction: null,
            timestamp: ago(1),
            dismissed: false,
          });
        }
      }
    }

    // Pending withdrawal delay
    // NOTE: when walletPositionSource is "unavailable" these amounts come from a seeded
    // demo scenario, not from a live read of the monitored wallet.  Alerts are preserved
    // for demo purposes but the title and technicalDetail make the limitation explicit.
    if (pos.pendingWithdrawalAmount > 0 && pos.pendingWithdrawalAgeDays !== null) {
      const days = pos.pendingWithdrawalAgeDays;
      const demoTag =
        pos.walletPositionSource === "unavailable" ? " [demo scenario]" : "";
      const demoNote =
        pos.walletPositionSource === "unavailable"
          ? " Note: this pending amount is seeded demo data — no live wallet read has been performed."
          : "";
      if (days >= 7) {
        alerts.push({
          id: makeId(),
          vaultId: pos.vaultId,
          vaultName: pos.vaultName,
          type: "withdrawal_delay_extended",
          severity: "warning",
          title: `Withdrawal pending ${days} days — extended${demoTag}`,
          summary: `A withdrawal of ${pos.pendingWithdrawalAmount} ${pos.asset} from ${pos.vaultName} has been pending for ${days} days, longer than typical. The curator may be processing a large redemption batch. Check the Lido Earn dashboard for curator status.${demoNote}`,
          technicalDetail: `Pending redemption: ${pos.pendingWithdrawalAmount} ${pos.asset}. Vault: ${pos.contractAddress}. Curator: ${pos.curatorName}. walletPositionSource: ${pos.walletPositionSource}.`,
          actionRequired: true,
          suggestedAction:
            "Check the Lido Earn app for an updated withdrawal status or curator announcement.",
          timestamp: ago(days * 24 - 1),
          dismissed: false,
        });
      } else if (days >= 3) {
        alerts.push({
          id: makeId(),
          vaultId: pos.vaultId,
          vaultName: pos.vaultName,
          type: "withdrawal_delay",
          severity: "warning",
          title: `Withdrawal pending ${days} days${demoTag}`,
          summary: `A withdrawal of ${pos.pendingWithdrawalAmount} ${pos.asset} from ${pos.vaultName} is still being processed. The ${pos.curatorName} curator is managing redemptions in the current batch cycle. Most withdrawals complete within 5–7 days.${demoNote}`,
          technicalDetail: `Pending redemption: ${pos.pendingWithdrawalAmount} ${pos.asset}. Vault: ${pos.contractAddress}. Curator: ${pos.curatorName}. Last rebalance: ${pos.lastRebalanceHoursAgo}h ago. walletPositionSource: ${pos.walletPositionSource}.`,
          actionRequired: false,
          suggestedAction: null,
          timestamp: ago(days * 24 - 1),
          dismissed: false,
        });
      }
    }

    // Deposit queued
    // NOTE: same caveat as pending withdrawals — demo data when walletPositionSource is "unavailable".
    if (pos.pendingDepositAmount > 0) {
      const demoTag =
        pos.walletPositionSource === "unavailable" ? " [demo scenario]" : "";
      const demoNote =
        pos.walletPositionSource === "unavailable"
          ? " Note: this pending amount is seeded demo data — no live wallet read has been performed."
          : "";
      alerts.push({
        id: makeId(),
        vaultId: pos.vaultId,
        vaultName: pos.vaultName,
        type: "deposit_queued",
        severity: "info",
        title: `${pos.pendingDepositAmount} ${pos.asset} deposit queued${demoTag}`,
        summary: `A deposit of ${pos.pendingDepositAmount} ${pos.asset} into ${pos.vaultName} is queued and not yet earning yield. The ${pos.curatorName} curator will deploy it at the next rebalance (typically 1–24 hours).${demoNote}`,
        technicalDetail: `Pending deposit: ${pos.pendingDepositAmount} ${pos.asset}. Next rebalance expected within ~${24 - (pos.lastRebalanceHoursAgo ?? 0)}h. walletPositionSource: ${pos.walletPositionSource}.`,
        actionRequired: false,
        suggestedAction: null,
        timestamp: ago(3),
        dismissed: false,
      });
    }

    // TVL cap approaching (>88%)
    // Suppressed when vault metrics are seeded: the TVL and cap figures are demo values,
    // not real on-chain reads. Firing a cap alert from invented numbers is misleading.
    // When live vault TVL is wired (via totalAssets() reads), this block will activate.
    const tvlUtilization = pos.tvl / pos.tvlCapUSD;
    if (pos.vaultMetricsSource !== "seeded_demo" && tvlUtilization >= 0.88) {
      alerts.push({
        id: makeId(),
        vaultId: pos.vaultId,
        vaultName: pos.vaultName,
        type: "tvl_cap_approaching",
        severity: "warning",
        title: `${pos.vaultName} is ${(tvlUtilization * 100).toFixed(0)}% full`,
        summary: `${pos.vaultName} TVL is approaching its capacity cap ($${(pos.tvlCapUSD / 1e6).toFixed(0)}M). New deposits may be blocked once the cap is hit. Your existing position is unaffected.`,
        technicalDetail: `Current TVL: $${(pos.tvl / 1e6).toFixed(1)}M. Cap: $${(pos.tvlCapUSD / 1e6).toFixed(0)}M. Utilization: ${(tvlUtilization * 100).toFixed(1)}%. vaultMetricsSource: ${pos.vaultMetricsSource}.`,
        actionRequired: false,
        suggestedAction: "Deposit soon if you plan to increase your position, or monitor for a cap raise.",
        timestamp: ago(5),
        dismissed: false,
      });
    }

    // Vault health degraded or paused
    const healthSeededNote =
      pos.vaultMetricsSource === "seeded_demo"
        ? ` vaultMetricsSource: seeded_demo — health status is a demo scenario value, not a live contract read.`
        : "";

    if (pos.health === "degraded") {
      alerts.push({
        id: makeId(),
        vaultId: pos.vaultId,
        vaultName: pos.vaultName,
        type: "vault_unhealthy",
        severity: "critical",
        title: `${pos.vaultName} vault health degraded`,
        summary: `The ${pos.vaultName} vault is reporting a degraded health status. This may indicate a strategy issue or oracle problem. New deposits are not recommended.`,
        technicalDetail: `Vault health check returned: ${pos.health}. Curator: ${pos.curatorName}.${healthSeededNote}`,
        actionRequired: true,
        suggestedAction:
          "Monitor Lido Earn announcements. Consider initiating a withdrawal if the status persists.",
        timestamp: ago(0.5),
        dismissed: false,
      });
    }

    if (pos.health === "paused") {
      alerts.push({
        id: makeId(),
        vaultId: pos.vaultId,
        vaultName: pos.vaultName,
        type: "vault_pause",
        severity: "critical",
        title: `${pos.vaultName} is paused`,
        summary: `The ${pos.vaultName} vault has been paused. Deposits and withdrawals are temporarily halted as a safety measure. Funds in this vault cannot move until the pause is lifted.`,
        technicalDetail: `Vault ${pos.contractAddress} is in paused state. Curator: ${pos.curatorName}.${healthSeededNote}`,
        actionRequired: true,
        suggestedAction:
          "Follow Lido Earn channels for a resolution timeline. No on-chain action is possible until unpaused.",
        timestamp: ago(0.25),
        dismissed: false,
      });
    }

    // Curator rebalance (recent, significant weight shift)
    if (pos.lastRebalanceHoursAgo !== null && pos.lastRebalanceHoursAgo <= 12) {
      const hasSignificantShift = pos.strategyWeights.some(
        (w) => Math.abs(w.currentWeight - w.previousWeight) >= 10
      );
      if (hasSignificantShift) {
        alerts.push({
          id: makeId(),
          vaultId: pos.vaultId,
          vaultName: pos.vaultName,
          type: "curator_rebalance",
          severity: "info",
          title: `Curator rebalanced strategy ${pos.lastRebalanceHoursAgo}h ago`,
          summary: `The ${pos.curatorName} curator rebalanced the ${pos.vaultName} strategy ${pos.lastRebalanceHoursAgo} hours ago. Yield may fluctuate briefly as the allocation settles. No action needed.`,
          technicalDetail: buildStrategyDetail(pos),
          actionRequired: false,
          suggestedAction: null,
          timestamp: ago(pos.lastRebalanceHoursAgo),
          dismissed: false,
        });
      }
    }
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Benchmark-relative alert rules
// ---------------------------------------------------------------------------

function benchmarkAlerts(
  positions: VaultPosition[],
  benchmarks: Map<string, BenchmarkSnapshot>
): Alert[] {
  const alerts: Alert[] = [];

  for (const pos of positions) {
    const bm = benchmarks.get(pos.vaultId);
    if (!bm) continue;

    // Skip benchmark alerts entirely when the value is unavailable — we have
    // no basis for comparison and must not fire false-positive warnings.
    if (bm.freshness.source === "unavailable") continue;

    if (bm.belowFloor) {
      const spreadAbs = Math.abs(bm.spreadBps);
      const dataNote =
        bm.freshness.source === "cached_last_known_good"
          ? ` (benchmark is stale — last cached value from ${bm.freshness.asOf})`
          : bm.freshness.source === "seeded_demo"
          ? ` (benchmark value is seeded demo data, not live)`
          : "";
      alerts.push({
        id: makeId(),
        vaultId: pos.vaultId,
        vaultName: pos.vaultName,
        type: "benchmark_underperformance",
        severity: "warning",
        title: `${pos.vaultName} yield trailing ${bm.benchmarkName} by ${spreadAbs}bps`,
        summary:
          `${pos.vaultName} is currently earning ${pos.currentAPY.toFixed(2)}% APY, which is ` +
          `${spreadAbs}bps below the ${bm.benchmarkName} (${bm.benchmarkAPY.toFixed(2)}%)${dataNote}. ` +
          `This exceeds the acceptable floor of ${Math.abs(bm.floorBps)}bps. ` +
          `New deposits are not recommended until yield recovers.`,
        technicalDetail:
          `Vault APY: ${bm.vaultAPY.toFixed(2)}%. Benchmark: ${bm.benchmarkName} = ${bm.benchmarkAPY.toFixed(2)}%. ` +
          `Spread: ${bm.spreadBps}bps (floor: ${bm.floorBps}bps). ` +
          `Benchmark source: ${bm.freshness.source} (as of ${bm.freshness.asOf}).`,
        actionRequired: false,
        suggestedAction: "Monitor for curator rebalance toward higher-yielding protocols.",
        timestamp: ago(1),
        dismissed: false,
      });
    } else if (bm.spreadBps >= 0 && pos.apyDelta24h > 0) {
      // Recovering above benchmark after a previous drop
      alerts.push({
        id: makeId(),
        vaultId: pos.vaultId,
        vaultName: pos.vaultName,
        type: "benchmark_recovery",
        severity: "info",
        title: `${pos.vaultName} yield back above ${bm.benchmarkName}`,
        summary:
          `${pos.vaultName} APY (${pos.currentAPY.toFixed(2)}%) has recovered and is now ` +
          `+${bm.spreadBps}bps above ${bm.benchmarkName} (${bm.benchmarkAPY.toFixed(2)}%). ` +
          `Yield conditions are favourable.`,
        technicalDetail:
          `Vault APY: ${bm.vaultAPY.toFixed(2)}%. Benchmark: ${bm.benchmarkAPY.toFixed(2)}%. Spread: +${bm.spreadBps}bps.`,
        actionRequired: false,
        suggestedAction: null,
        timestamp: ago(1),
        dismissed: false,
      });
    }
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Allocation-shift alert rules
// ---------------------------------------------------------------------------

function allocationAlerts(
  positions: VaultPosition[],
  allocationSnapshots: Map<string, AllocationSnapshot>
): Alert[] {
  const alerts: Alert[] = [];

  for (const pos of positions) {
    const snap = allocationSnapshots.get(pos.vaultId);
    if (!snap || !snap.significantShifts.length) continue;

    const shiftDesc = describeShifts(snap.significantShifts);
    const protocols = snap.significantShifts
      .map((s) => s.protocol)
      .filter((p, i, arr) => arr.indexOf(p) === i)
      .join(", ");

    alerts.push({
      id: makeId(),
      vaultId: pos.vaultId,
      vaultName: pos.vaultName,
      type: "allocation_shift",
      severity: "info",
      title: `Protocol allocation shifted: ${protocols}`,
      summary:
        `The ${pos.curatorName} curator adjusted ${pos.vaultName} protocol exposure. ` +
        `${shiftDesc}. ` +
        `Yield may fluctuate for 12–24h as the new allocation settles. No action needed.`,
      technicalDetail:
        `Allocation changes: ${shiftDesc}. ` +
        `Vault: ${pos.contractAddress}. Curator: ${pos.curatorName}. ` +
        `Source: ${snap.freshness.source}.`,
      actionRequired: false,
      suggestedAction: null,
      timestamp: ago(pos.lastRebalanceHoursAgo ?? 6),
      dismissed: false,
    });
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * generateAlerts — simple form, uses only position state.
 * Backward-compatible with the existing UI and original /api/alerts route.
 */
export function generateAlerts(positions: VaultPosition[]): Alert[] {
  return sortAlerts(positionAlerts(positions));
}

/**
 * generateEnrichedAlerts — full form, incorporates benchmark comparison and
 * allocation tracking alongside position-state alerts.
 * Used by /api/health, /api/alerts (enriched), and preview formatters.
 *
 * Benchmark values are fetched live (Lido staking-stats API for EarnETH,
 * DeFiLlama yields API for EarnUSD). Fallback order on failure:
 *   1. cached_last_known_good — last real value from a prior successful fetch
 *   2. unavailable            — no live data and no cache; comparison suppressed
 * seeded_demo values are never used here. Check freshness.source on each
 * BenchmarkSnapshot to know which path was taken.
 */
export async function generateEnrichedAlerts(positions: VaultPosition[]): Promise<{
  alerts: Alert[];
  benchmarks: Map<string, BenchmarkSnapshot>;
  allocationSnapshots: Map<string, AllocationSnapshot>;
}> {
  const benchmarks = new Map<string, BenchmarkSnapshot>();
  const allocationSnapshots = new Map<string, AllocationSnapshot>();

  // Fetch benchmarks in parallel; each call attempts live → cached_last_known_good → unavailable.
  const benchmarkResults = await Promise.all(
    positions.map((pos) => fetchBenchmark(pos.vaultId, pos.currentAPY))
  );

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    benchmarks.set(pos.vaultId, benchmarkResults[i]);
    const hasLiveWeights = pos.strategyWeights.some((w) => w.currentWeight > 0);
    const allocFreshness: SourceFreshness = hasLiveWeights
      ? {
          source: "live",
          asOf: new Date().toISOString(),
          note: "Allocation weights read live from on-chain RiskManager subvaultState().",
        }
      : SEEDED_FRESHNESS;
    allocationSnapshots.set(
      pos.vaultId,
      buildAllocationSnapshot(pos.vaultId, pos.strategyWeights, allocFreshness)
    );
  }

  const all = [
    ...positionAlerts(positions),
    ...benchmarkAlerts(positions, benchmarks),
    ...allocationAlerts(positions, allocationSnapshots),
  ];

  return {
    alerts: sortAlerts(all),
    benchmarks,
    allocationSnapshots,
  };
}

/**
 * generateEnrichedAlertsSync — synchronous form.
 * Uses the last-known-good benchmark cache if available, otherwise unavailable.
 * No seeded_demo values are returned — benchmark alerts are suppressed when unavailable.
 * @internal — prefer generateEnrichedAlerts() in async contexts.
 */
export function generateEnrichedAlertsSync(positions: VaultPosition[]): {
  alerts: Alert[];
  benchmarks: Map<string, BenchmarkSnapshot>;
  allocationSnapshots: Map<string, AllocationSnapshot>;
} {
  const benchmarks = new Map<string, BenchmarkSnapshot>();
  const allocationSnapshots = new Map<string, AllocationSnapshot>();

  for (const pos of positions) {
    benchmarks.set(pos.vaultId, getBenchmarkSnapshot(pos.vaultId, pos.currentAPY));
    allocationSnapshots.set(
      pos.vaultId,
      buildAllocationSnapshot(pos.vaultId, pos.strategyWeights, SEEDED_FRESHNESS)
    );
  }

  const all = [
    ...positionAlerts(positions),
    ...benchmarkAlerts(positions, benchmarks),
    ...allocationAlerts(positions, allocationSnapshots),
  ];

  return {
    alerts: sortAlerts(all),
    benchmarks,
    allocationSnapshots,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildStrategyDetail(pos: VaultPosition): string {
  if (!pos.strategyWeights.length)
    return `Vault: ${pos.contractAddress}. Curator: ${pos.curatorName}.`;
  const shifts = pos.strategyWeights
    .map((w) => `${w.name}: ${w.previousWeight}% → ${w.currentWeight}%`)
    .join(", ");
  return `Strategy weight changes: ${shifts}. Vault: ${pos.contractAddress}. Curator: ${pos.curatorName}.`;
}
