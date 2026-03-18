import { VaultId } from "./types";
import { BenchmarkSnapshot, SourceFreshness } from "./domain";

// ---------------------------------------------------------------------------
// Benchmark reference metadata (floor thresholds only — no seeded APY fallback)
//
// Seeded APY values are removed from the production fallback path.
// They only appear in the explicitly-marked seeded_demo path below.
// ---------------------------------------------------------------------------

interface BenchmarkRef {
  name: string;
  /** Minimum acceptable spread vs benchmark in bps. Negative = vault is allowed
   *  to trail benchmark by this many bps before an alert fires. */
  floorBps: number;
  /** Seeded reference rate for demo mode only — not used in production paths. */
  demoApy: number;
}

const BENCHMARK_REFS: Record<VaultId, BenchmarkRef> = {
  earnETH: {
    name: "stETH APY (Lido)",
    floorBps: -50, // alert if vault trails stETH by > 50 bps
    demoApy: 3.62, // early-2025 stETH reference — demo mode only
  },
  earnUSD: {
    name: "Aave v3 USDC Supply Rate",
    floorBps: -30,  // alert if vault trails Aave by > 30 bps
    demoApy: 4.85,  // early-2025 Aave v3 USDC reference — demo mode only
  },
};

// ---------------------------------------------------------------------------
// Last-known-good cache
//
// Populated on every successful live fetch. When the live fetch subsequently
// fails, we return the cached value labeled "cached_last_known_good" so
// consumers can distinguish it from a fresh live read.
//
// This is an in-process Map — it survives across requests within the same
// Next.js worker process. Next.js HTTP-level revalidate (5 min) provides
// additional deduplication at the fetch layer.
// ---------------------------------------------------------------------------

const _lkgCache = new Map<VaultId, { apy: number; asOf: string }>();

// ---------------------------------------------------------------------------
// Seeded freshness for allocation snapshots (always demo — no live read wired)
// ---------------------------------------------------------------------------

export const SEEDED_FRESHNESS: SourceFreshness = {
  source: "seeded_demo",
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
// Shared snapshot builder
// ---------------------------------------------------------------------------

function buildSnapshot(
  vaultId: VaultId,
  vaultAPY: number,
  benchmarkAPY: number,
  freshness: SourceFreshness
): BenchmarkSnapshot {
  const ref = BENCHMARK_REFS[vaultId];
  const spreadBps = Math.round((vaultAPY - benchmarkAPY) * 100);
  return {
    vaultId,
    benchmarkName: ref.name,
    benchmarkAPY,
    vaultAPY,
    spreadBps,
    floorBps: ref.floorBps,
    belowFloor: spreadBps < ref.floorBps,
    freshness,
  };
}

function buildUnavailableSnapshot(vaultId: VaultId, vaultAPY: number): BenchmarkSnapshot {
  const ref = BENCHMARK_REFS[vaultId];
  // benchmarkAPY/spreadBps/belowFloor are meaningless when unavailable.
  // belowFloor = false so no false-positive alerts fire; consumers must
  // check freshness.source === "unavailable" before trusting comparison fields.
  return {
    vaultId,
    benchmarkName: ref.name,
    benchmarkAPY: 0,
    vaultAPY,
    spreadBps: 0,
    floorBps: ref.floorBps,
    belowFloor: false,
    freshness: {
      source: "unavailable",
      asOf: new Date().toISOString(),
      note:
        vaultId === "earnETH"
          ? "Benchmark unavailable — live fetch from Lido staking-stats API failed and no cached value exists."
          : "Benchmark unavailable — live fetch from DeFiLlama yields API failed and no cached value exists.",
    },
  };
}

// ---------------------------------------------------------------------------
// Synchronous snapshot — uses last-known-good cache, or returns unavailable
// ---------------------------------------------------------------------------

/**
 * Compute a benchmark snapshot synchronously.
 *
 * Fallback order:
 *   1. cached_last_known_good — last value from a successful live fetch
 *   2. unavailable            — no cached value; comparison fields are zeroed
 *
 * Prefer fetchBenchmark() in async contexts so the cache stays warm.
 * Never returns seeded_demo — seeded data requires an explicit demo-mode call.
 */
export function getBenchmarkSnapshot(
  vaultId: VaultId,
  vaultAPY: number
): BenchmarkSnapshot {
  const cached = _lkgCache.get(vaultId);
  if (cached) {
    return buildSnapshot(vaultId, vaultAPY, cached.apy, {
      source: "cached_last_known_good",
      asOf: cached.asOf,
      note:
        `Stale cached value from last successful live fetch (${cached.asOf}). ` +
        `Live fetch was not attempted; use fetchBenchmark() for a fresh read.`,
    });
  }
  return buildUnavailableSnapshot(vaultId, vaultAPY);
}

// ---------------------------------------------------------------------------
// Async benchmark fetch — live → cached_last_known_good → unavailable
// ---------------------------------------------------------------------------

/**
 * Fetch a benchmark snapshot, attempting a live API read first.
 *
 * Fallback order:
 *   1. live                   — value fetched from the live API this request
 *   2. cached_last_known_good — live fetch failed; last successful real value (stale)
 *   3. unavailable            — live fetch failed and no cached value exists
 *
 * seeded_demo values are NEVER returned here — they only appear via
 * getBenchmarkSnapshotForDemo() which must be called explicitly.
 *
 * Live sources:
 *   EarnETH  → Lido staking-stats API (7-day stETH APY SMA)
 *   EarnUSD  → DeFiLlama yields API (Aave v3 USDC, Ethereum, highest-TVL pool)
 */
export async function fetchBenchmark(
  vaultId: VaultId,
  vaultAPY: number
): Promise<BenchmarkSnapshot> {
  let liveRate: { apy: number; asOf: string } | null = null;
  if (vaultId === "earnETH") {
    liveRate = await fetchLiveStEthAPY();
  } else if (vaultId === "earnUSD") {
    liveRate = await fetchLiveAaveUsdcAPY();
  }

  if (liveRate !== null) {
    // Warm the cache on every successful fetch.
    _lkgCache.set(vaultId, liveRate);
    return buildSnapshot(vaultId, vaultAPY, liveRate.apy, {
      source: "live",
      asOf: liveRate.asOf,
      note:
        vaultId === "earnETH"
          ? "Live 7-day SMA fetched from Lido staking-stats API (eth-api.lido.fi)."
          : "Live supply APY fetched from DeFiLlama yields API (Aave v3 USDC, Ethereum, highest-TVL pool).",
    });
  }

  // Live fetch failed — try last-known-good cache before declaring unavailable.
  const cached = _lkgCache.get(vaultId);
  if (cached) {
    return buildSnapshot(vaultId, vaultAPY, cached.apy, {
      source: "cached_last_known_good",
      asOf: cached.asOf,
      note:
        vaultId === "earnETH"
          ? `Stale cached value from last successful Lido API fetch (${cached.asOf}). Live fetch failed or timed out.`
          : `Stale cached value from last successful DeFiLlama API fetch (${cached.asOf}). Live fetch failed or timed out.`,
    });
  }

  // No live data and no cache — return unavailable; do not substitute seeded values.
  return buildUnavailableSnapshot(vaultId, vaultAPY);
}

// ---------------------------------------------------------------------------
// Demo-only snapshot — seeded values, must be called explicitly
// ---------------------------------------------------------------------------

/**
 * Build a benchmark snapshot using seeded demo values.
 * ONLY call this from explicitly-flagged demo paths (e.g. mock scenario routes).
 * Never use this as a silent production fallback.
 */
export function getBenchmarkSnapshotForDemo(
  vaultId: VaultId,
  vaultAPY: number
): BenchmarkSnapshot {
  const ref = BENCHMARK_REFS[vaultId];
  return buildSnapshot(vaultId, vaultAPY, ref.demoApy, {
    source: "seeded_demo",
    asOf: "2025-03-01T00:00:00Z",
    note:
      `Seeded demo value (early-2025 ${vaultId === "earnETH" ? "stETH" : "Aave v3 USDC"} reference rate). ` +
      `This is explicit demo mode — not a live or cached value.`,
  });
}
