/**
 * lib/vault-apy-reader.ts
 *
 * Fetches live vault APY from DeFiLlama by searching for the vault's contract
 * address in the yields pools dataset.
 *
 * Strategy:
 *   1. Search all DeFiLlama pools for an exact case-insensitive match on the
 *      `pool` field (which equals the vault contract address for many ERC-4626
 *      protocols including Mellow Finance).
 *   2. If not found by address, try searching within project="mellow-protocol"
 *      on Ethereum, matching by vault asset symbol (fallback heuristic).
 *   3. If nothing matches, return { source: "unavailable" }.
 *
 * Never returns seeded/demo values as a fallback.
 *
 * Configuration:
 *   No env vars required. Uses the public DeFiLlama yields API.
 *   Cached by Next.js for 5 minutes to avoid hammering the endpoint.
 *
 * Limitations (honest):
 *   - DeFiLlama pool IDs are UUIDs for some protocols; address-based lookup may
 *     not find every vault. The fallback heuristic (project + symbol) may return
 *     the wrong pool if multiple Mellow vaults share the same asset.
 *   - apyDelta24h is not available from DeFiLlama; apy7dAvg (7-day average) is
 *     provided as a coarse trend indicator only.
 *   - DeFiLlama's APY may lag by up to ~1 hour.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LiveVaultApy {
  source: "live";
  apy: number;             // current APY %
  apy7dAvg: number | null; // 7-day average APY %; null if unavailable
  tvlUsd: number | null;   // TVL from DeFiLlama (USD); null if unavailable
  project: string | null;  // DeFiLlama project slug (provenance label)
  asOf: string;            // ISO timestamp of fetch
  note: string;
}

export interface VaultApyUnavailable {
  source: "unavailable";
  reason: string;
  asOf: string;
}

export type VaultApyResult = LiveVaultApy | VaultApyUnavailable;

// ---------------------------------------------------------------------------
// Last-known-good in-process cache (same pattern as benchmarks.ts)
// ---------------------------------------------------------------------------

const _lkgCache = new Map<
  string, // contractAddress (lowercased)
  { apy: number; apy7dAvg: number | null; tvlUsd: number | null; project: string | null; asOf: string }
>();

// ---------------------------------------------------------------------------
// DeFiLlama pool shape (partial — only fields we use)
// ---------------------------------------------------------------------------

interface DeFiLlamaPool {
  pool?: string;        // UUID or contract address
  project?: string;     // e.g. "mellow-protocol"
  chain?: string;       // e.g. "Ethereum"
  symbol?: string;      // e.g. "WSTETH" or "USDC"
  apy?: number;         // current APY %
  apyBase?: number;     // base APY (same as apy for simple pools)
  apyBase7d?: number;   // 7-day average base APY
  tvlUsd?: number;
}

// Candidate project slugs that Mellow/Lido Earn vaults may appear under.
const MELLOW_PROJECT_SLUGS = ["mellow-protocol", "mellow", "lido-staking-v2"];

// ---------------------------------------------------------------------------
// Core fetch + search
// ---------------------------------------------------------------------------

async function fetchDeFiLlamaPools(): Promise<DeFiLlamaPool[] | null> {
  try {
    const resp = await fetch("https://yields.llama.fi/pools", {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/json" },
      // Next.js: cache for 5 minutes — avoids fetching the full dataset per request.
      // This is a server-side fetch; the Next.js data cache applies.
      next: { revalidate: 300 },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!Array.isArray(data?.data)) return null;
    return data.data as DeFiLlamaPool[];
  } catch {
    return null;
  }
}

function selectBestPool(candidates: DeFiLlamaPool[]): DeFiLlamaPool | null {
  if (!candidates.length) return null;
  // Prefer pools with the highest TVL — they're the most canonical.
  return candidates
    .filter((p) => typeof p.apy === "number" && !isNaN(p.apy) && p.apy >= 0)
    .sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0))[0] ?? null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch the live APY for a vault contract from DeFiLlama.
 *
 * Safe to call from API routes; never throws.
 * Falls back gracefully:
 *   live → cached_last_known_good → unavailable
 *
 * @param contractAddress  EVM contract address of the vault
 * @param fallbackSymbol   Asset symbol hint for heuristic search (e.g. "ETH", "USDC")
 */
export async function fetchVaultAPY(
  contractAddress: string,
  fallbackSymbol?: string
): Promise<VaultApyResult> {
  const addrKey = contractAddress.toLowerCase();
  const fetchedAt = new Date().toISOString();

  const pools = await fetchDeFiLlamaPools();

  if (pools !== null) {
    // --- Pass 1: exact address match on `pool` field ---
    let match = pools.find(
      (p) => typeof p.pool === "string" && p.pool.toLowerCase() === addrKey
    ) ?? null;

    // --- Pass 2: heuristic — Mellow project on Ethereum, asset symbol match ---
    if (!match && fallbackSymbol) {
      const sym = fallbackSymbol.toUpperCase();
      const mellowPools = pools.filter(
        (p) =>
          typeof p.project === "string" &&
          MELLOW_PROJECT_SLUGS.includes(p.project.toLowerCase()) &&
          p.chain === "Ethereum" &&
          typeof p.symbol === "string" &&
          p.symbol.toUpperCase().includes(sym)
      );
      match = selectBestPool(mellowPools);
    }

    if (match) {
      const apy = match.apy ?? match.apyBase ?? null;
      // Sanity bounds: vault APY should be between 0% and 50%
      if (typeof apy === "number" && !isNaN(apy) && apy >= 0 && apy <= 50) {
        const apy7dAvg =
          typeof match.apyBase7d === "number" && !isNaN(match.apyBase7d)
            ? Math.round(match.apyBase7d * 10000) / 10000
            : null;

        const entry = {
          apy: Math.round(apy * 10000) / 10000,
          apy7dAvg,
          tvlUsd: match.tvlUsd ?? null,
          project: match.project ?? null,
          asOf: fetchedAt,
        };
        _lkgCache.set(addrKey, entry);

        return {
          source: "live",
          ...entry,
          note:
            `Live APY from DeFiLlama (project: ${match.project ?? "unknown"}, ` +
            `pool: ${match.pool ?? "heuristic match"}). ` +
            (apy7dAvg !== null
              ? `7-day average: ${apy7dAvg.toFixed(2)}%.`
              : "7-day average not available."),
        };
      }
    }

    // Pools fetched successfully but vault not found — try last-known-good.
    const cached = _lkgCache.get(addrKey);
    if (cached) {
      return {
        source: "live",
        ...cached,
        asOf: cached.asOf,
        note:
          `Stale cached value from last successful DeFiLlama lookup (${cached.asOf}). ` +
          `Current fetch succeeded but did not find this vault address.`,
      };
    }

    return {
      source: "unavailable",
      reason:
        "DeFiLlama pools fetched but vault not found by address or project heuristic. " +
        "Vault may not be indexed by DeFiLlama yet, or pool ID is not the contract address.",
      asOf: fetchedAt,
    };
  }

  // DeFiLlama fetch failed — try last-known-good.
  const cached = _lkgCache.get(addrKey);
  if (cached) {
    return {
      source: "live",
      ...cached,
      asOf: cached.asOf,
      note: `Stale cached value from last successful DeFiLlama lookup (${cached.asOf}). Current fetch failed or timed out.`,
    };
  }

  return {
    source: "unavailable",
    reason: "DeFiLlama fetch failed (network error or timeout) and no cached value exists.",
    asOf: fetchedAt,
  };
}
