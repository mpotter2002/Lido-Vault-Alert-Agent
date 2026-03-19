import { StrategyWeight, VaultId } from "./types";
import {
  ProtocolName,
  ProtocolAllocation,
  AllocationDiff,
  AllocationSnapshot,
  SourceFreshness,
} from "./domain";

// ---------------------------------------------------------------------------
// Protocol classification
// Maps free-text strategy labels to canonical protocol names.
// ---------------------------------------------------------------------------

// Matches both original seeded labels and real Mellow subvault protocol labels.
// EarnETH routes into strETH (EigenLayer/Symbiotic) + GGV (native ETH).
// EarnUSD routes into earnUSDc which integrates Aave, Morpho, Balancer, Fluid.
const PROTOCOL_KEYWORDS: Array<[ProtocolName, string[]]> = [
  ["Aave", ["aave", "spark"]],
  ["Morpho", ["morpho"]],
  ["Pendle", ["pendle", "pt-", "yt-"]],
  ["Gearbox", ["gearbox"]],
  ["Maple", ["maple"]],
];

export function classifyProtocol(strategyLabel: string): ProtocolName {
  const lower = strategyLabel.toLowerCase();
  for (const [protocol, keywords] of PROTOCOL_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) return protocol;
  }
  return "Other";
}

// A shift is "significant" if weight moved by >= this many percentage points
const SIGNIFICANT_SHIFT_THRESHOLD_PCT = 5;

/**
 * Build a full allocation snapshot from raw strategy weights.
 * Classifies each strategy into a canonical protocol and identifies
 * significant allocation shifts.
 */
export function buildAllocationSnapshot(
  vaultId: VaultId,
  strategyWeights: StrategyWeight[],
  freshness: SourceFreshness
): AllocationSnapshot {
  const allocations: ProtocolAllocation[] = strategyWeights.map((w) => ({
    protocol: classifyProtocol(w.name),
    strategyLabel: w.name,
    previousWeight: w.previousWeight,
    currentWeight: w.currentWeight,
  }));

  const significantShifts: AllocationDiff[] = allocations
    .map((a): AllocationDiff => {
      const delta = a.currentWeight - a.previousWeight;
      return {
        protocol: a.protocol,
        strategyLabel: a.strategyLabel,
        previousWeight: a.previousWeight,
        currentWeight: a.currentWeight,
        deltaWeight: delta,
        direction:
          delta > 0 ? "increased" : delta < 0 ? "decreased" : "unchanged",
      };
    })
    .filter((d) => Math.abs(d.deltaWeight) >= SIGNIFICANT_SHIFT_THRESHOLD_PCT);

  return { vaultId, allocations, significantShifts, freshness };
}

/**
 * Summarise allocation shifts for plain-language output.
 * e.g. "Pendle decreased by 15%, Morpho increased by 10%"
 */
export function describeShifts(shifts: AllocationDiff[]): string {
  if (!shifts.length) return "No significant allocation changes.";
  return shifts
    .map(
      (s) =>
        `${s.protocol} (${s.strategyLabel}) ${s.direction} by ${Math.abs(
          s.deltaWeight
        ).toFixed(0)}pp`
    )
    .join("; ");
}
