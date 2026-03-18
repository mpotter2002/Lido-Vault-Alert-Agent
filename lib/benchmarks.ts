import { VaultId } from "./types";
import { BenchmarkSnapshot, SourceFreshness } from "./domain";

// ---------------------------------------------------------------------------
// Seeded fallback reference values
//
// Used when live fetches fail. Represent early-2025 market conditions.
// Every caller should use fetchBenchmark() which attempts live reads first
// and only falls through to these values with an explicit "seeded" label.
// ---------------------------------------------------------------------------

interface BenchmarkRef {
  name: string;
  fallbackApy: number;
  /** Minimum acceptable spread vs benchmark in bps. Negative = vault is allowed
   *  to trail benchmark by this many bps before an alert fires. */
  floorBps: number;
}

const BENCHMARK_REFS: Record<VaultId, BenchmarkRef> = {
  earnETH: {
    name: "stETH APY (Lido)",
    fallbackApy: 3.62, // stETH native staking ~3.6% APY (early 2025)
    floorBps: -50,    // alert if vault trails stETH by > 50 bps
  },
  earnUSD: {
    name: "Aave v3 USDC Supply Rate",
    fallbackApy: 4.85, // Aave v3 USDC supply ~4.85% APY (early 2025)
    floorBps: -30,     // alert if vault trails Aave by > 30 bps
  },
};

// Exported for use as freshness label on allocation snapshots (which are
// always seeded — they come from mock strategy weights, not live contract reads).
export const SEEDED_FRESHNESS: SourceFreshness = {
  source: "seeded",
  asOf: "2025-03-01T00:00:00Z",
  note:
    "Seeded demo values (strategy weights are not read from a live contract). " +
    "Wire vault contract reads to replace allocation data with live data.",
};

// ---------------------------------------------------------------------------
// Live benchmark fetchers
// ---------------------------------------------------------------------------

/**
 * Fetch the current stETH 7-day APY SMA from Lido's staking-stats API.
 * Endpoint: GET https://eth-api.lido.fi/v1/protocol/steth/apr/sma
 * Returns null on any error (network, parse, out-of-range).
 */
async function fetchLiveStEthAPY(): Promise<{ apy: number; asOf: string } | null> {
  try {
    const resp = await fetch("https://eth-api.lido.fi/v1/protocol/steth/apr/sma", {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: "application/json" },
      next: { revalidate: 300 }, // Next.js: cache for 5 minutes
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    // Lido SMA endpoint returns: { data: { smaApr: "3.XX", aprs: [...] } }
    // Handle multiple possible shapes defensively.
    const raw =
      data?.data?.smaApr ??
      data?.data?.smaAPR ??
      data?.data?.apr ??
      (Array.isArray(data?.data?.aprs) && data.data.aprs.length > 0
        ? data.data.aprs[data.data.aprs.length - 1]?.apr
        : undefined);
    const apy =
      typeof raw === "string" ? parseFloat(raw) : typeof raw === "number" ? raw : NaN;
    // Sanity bounds: stETH APY should be between 0.5% and 15%
    if (isNaN(apy) || apy < 0.5 || apy > 15) return null;
    return { apy: Math.round(apy * 10000) / 10000, asOf: new Date().toISOString() };
  } catch {
    return null;
  }
}

/**
 * Fetch the current Aave v3 USDC supply APY from DeFiLlama yields API.
 * Endpoint: GET https://yields.llama.fi/pools
 * Filters for project=aave-v3, chain=Ethereum, symbol=USDC and selects
 * the pool with the highest TVL (the canonical main-market USDC supply pool).
 * Returns null on any error (network, parse, no match, out-of-range).
 */
async function fetchLiveAaveUsdcAPY(): Promise<{ apy: number; asOf: string } | null> {
  try {
    const resp = await fetch("https://yields.llama.fi/pools", {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
      next: { revalidate: 300 }, // Next.js: cache for 5 minutes
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!Array.isArray(data?.data)) return null;

    type DefiLlamaPool = {
      project?: string;
      chain?: string;
      symbol?: string;
      apy?: number;
      tvlUsd?: number;
    };

    // Filter for Aave v3 USDC on Ethereum mainnet
    const candidates = (data.data as DefiLlamaPool[]).filter(
      (p) =>
        p.project === "aave-v3" &&
        p.chain === "Ethereum" &&
        p.symbol === "USDC"
    );
    if (!candidates.length) return null;

    // Pick the pool with the highest TVL — that's the canonical supply pool
    const best = candidates.sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0))[0];
    const apy = best.apy;
    // Sanity bounds: Aave v3 USDC supply APY should be between 0.1% and 25%
    if (typeof apy !== "number" || isNaN(apy) || apy < 0.1 || apy > 25) return null;
    return { apy: Math.round(apy * 10000) / 10000, asOf: new Date().toISOString() };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Synchronous snapshot — seeded only, for backward-compat internal use
// ---------------------------------------------------------------------------

/**
 * Compute a benchmark snapshot synchronously from seeded fallback data.
 * Clearly labeled source = "seeded". Prefer fetchBenchmark() in async contexts.
 */
export function getBenchmarkSnapshot(
  vaultId: VaultId,
  vaultAPY: number
): BenchmarkSnapshot {
  const ref = BENCHMARK_REFS[vaultId];
  const spreadBps = Math.round((vaultAPY - ref.fallbackApy) * 100);
  return {
    vaultId,
    benchmarkName: ref.name,
    benchmarkAPY: ref.fallbackApy,
    vaultAPY,
    spreadBps,
    floorBps: ref.floorBps,
    belowFloor: spreadBps < ref.floorBps,
    freshness: {
      source: "seeded",
      asOf: "2025-03-01T00:00:00Z",
      note:
        `Seeded fallback (early-2025 conditions). ` +
        (vaultId === "earnETH"
          ? "Live fetch was not attempted; use fetchBenchmark() for live reads."
          : "Live fetch was not attempted; use fetchBenchmark() for live reads."),
    },
  };
}

// ---------------------------------------------------------------------------
// Async benchmark fetch — attempts live read, falls back to seeded
// ---------------------------------------------------------------------------

/**
 * Fetch a benchmark snapshot, attempting a live API read first.
 *
 * freshness.source on the returned snapshot:
 *   "live"   — value came from the live API (Lido / DeFiLlama) at freshness.asOf
 *   "seeded" — live fetch failed; value is a seeded early-2025 fallback
 *
 * Live sources:
 *   EarnETH  → Lido staking-stats API (7-day stETH APY SMA)
 *   EarnUSD  → DeFiLlama yields API (Aave v3 USDC, Ethereum, highest-TVL pool)
 */
export async function fetchBenchmark(
  vaultId: VaultId,
  vaultAPY: number
): Promise<BenchmarkSnapshot> {
  const ref = BENCHMARK_REFS[vaultId];

  let liveRate: { apy: number; asOf: string } | null = null;
  if (vaultId === "earnETH") {
    liveRate = await fetchLiveStEthAPY();
  } else if (vaultId === "earnUSD") {
    liveRate = await fetchLiveAaveUsdcAPY();
  }

  if (liveRate !== null) {
    const spreadBps = Math.round((vaultAPY - liveRate.apy) * 100);
    return {
      vaultId,
      benchmarkName: ref.name,
      benchmarkAPY: liveRate.apy,
      vaultAPY,
      spreadBps,
      floorBps: ref.floorBps,
      belowFloor: spreadBps < ref.floorBps,
      freshness: {
        source: "live",
        asOf: liveRate.asOf,
        note:
          vaultId === "earnETH"
            ? "Live 7-day SMA fetched from Lido staking-stats API (eth-api.lido.fi)."
            : "Live supply APY fetched from DeFiLlama yields API (Aave v3 USDC, Ethereum, highest-TVL pool).",
      },
    };
  }

  // Live fetch failed — fall back to seeded values, labeled explicitly
  const spreadBps = Math.round((vaultAPY - ref.fallbackApy) * 100);
  return {
    vaultId,
    benchmarkName: ref.name,
    benchmarkAPY: ref.fallbackApy,
    vaultAPY,
    spreadBps,
    floorBps: ref.floorBps,
    belowFloor: spreadBps < ref.floorBps,
    freshness: {
      source: "seeded",
      asOf: "2025-03-01T00:00:00Z",
      note:
        vaultId === "earnETH"
          ? "Seeded fallback (early-2025 conditions). Live fetch from Lido staking-stats API failed or timed out."
          : "Seeded fallback (early-2025 conditions). Live fetch from DeFiLlama yields API failed or timed out.",
    },
  };
}
