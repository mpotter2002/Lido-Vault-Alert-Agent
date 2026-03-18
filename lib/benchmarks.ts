import { VaultId } from "./types";
import { BenchmarkSnapshot, SourceFreshness } from "./domain";

// ---------------------------------------------------------------------------
// Seeded benchmark reference values
//
// These represent market conditions as of early 2025. They are intentionally
// labelled "seeded" so every consumer knows they are not live.
//
// To wire live data:
//   EarnETH  → Lido staking-stats API  (stETH 7-day APY)
//   EarnUSD  → Aave v3 subgraph query  (USDC supply APR, annualised)
// ---------------------------------------------------------------------------

interface BenchmarkRef {
  name: string;
  apy: number;
  /** Minimum acceptable spread vs benchmark in bps. Negative = vault is allowed
   *  to trail benchmark by this many bps before an alert fires. */
  floorBps: number;
}

const BENCHMARK_REFS: Record<VaultId, BenchmarkRef> = {
  earnETH: {
    name: "stETH APY (Lido)",
    apy: 3.62, // stETH native staking ~3.6% APY
    floorBps: -50, // alert if vault trails stETH by > 50 bps
  },
  earnUSD: {
    name: "Aave v3 USDC Supply Rate",
    apy: 4.85, // Aave v3 USDC supply ~4.85% APY
    floorBps: -30, // alert if vault trails Aave by > 30 bps
  },
};

export const SEEDED_FRESHNESS: SourceFreshness = {
  source: "seeded",
  asOf: "2025-03-01T00:00:00Z",
  note:
    "Seeded demo values representative of early-2025 conditions. " +
    "Wire fetchBenchmark() to Lido staking-stats API (EarnETH) " +
    "and Aave v3 subgraph (EarnUSD) for live rates.",
};

/**
 * Compute a benchmark snapshot synchronously from seeded data.
 * Use this inside the alert engine and API routes until live feeds are wired.
 */
export function getBenchmarkSnapshot(
  vaultId: VaultId,
  vaultAPY: number
): BenchmarkSnapshot {
  const ref = BENCHMARK_REFS[vaultId];
  const spreadBps = Math.round((vaultAPY - ref.apy) * 100);
  return {
    vaultId,
    benchmarkName: ref.name,
    benchmarkAPY: ref.apy,
    vaultAPY,
    spreadBps,
    floorBps: ref.floorBps,
    belowFloor: spreadBps < ref.floorBps,
    freshness: SEEDED_FRESHNESS,
  };
}

/**
 * Async wrapper — swap the body for a real API call when ready.
 * Currently falls through to seeded data with a "seeded" freshness label.
 */
export async function fetchBenchmark(
  vaultId: VaultId,
  vaultAPY: number
): Promise<BenchmarkSnapshot> {
  // TODO (EarnETH): GET https://eth-api.lido.fi/v1/protocol/steth/apr/sma
  // TODO (EarnUSD): Aave v3 subgraph — reserveData(underlyingAsset: USDC).liquidityRate
  return getBenchmarkSnapshot(vaultId, vaultAPY);
}
