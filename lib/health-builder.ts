import { VaultPosition } from "./types";
import { VaultHealthSummary, AgentHealthResponse, SourceFreshness, WalletPositionState } from "./domain";
import { generateEnrichedAlerts } from "./alert-engine";
import { buildRecommendation } from "./recommendations";
import { SEEDED_FRESHNESS } from "./benchmarks";
import { readWalletPosition } from "./wallet-reader";
import { buildLivePositions, LivePositionMeta } from "./live-positions";

// ---------------------------------------------------------------------------
// Response note builder
// ---------------------------------------------------------------------------

function buildNote(
  livePositionMeta: LivePositionMeta | null,
  benchmarkSources: Map<string, string>
): string {
  const parts: string[] = [];

  if (livePositionMeta) {
    const tvlLive: string[] = [];
    const tvlUnavail: string[] = [];
    const apyLive: string[] = [];
    const apyUnavail: string[] = [];

    livePositionMeta.vaultSources.forEach(({ tvl, apy }, vaultId) => {
      if (tvl === "live" || tvl === "partial") tvlLive.push(vaultId);
      else tvlUnavail.push(vaultId);
      if (apy === "live") apyLive.push(vaultId);
      else apyUnavail.push(vaultId);
    });

    if (tvlLive.length)
      parts.push(`TVL live (on-chain totalAssets): ${tvlLive.join(", ")}`);
    if (tvlUnavail.length)
      parts.push(`TVL unavailable (RPC error): ${tvlUnavail.join(", ")}`);
    if (apyLive.length)
      parts.push(`APY live (DeFiLlama Mellow vaults): ${apyLive.join(", ")}`);
    if (apyUnavail.length)
      parts.push(`APY unavailable (not found in DeFiLlama): ${apyUnavail.join(", ")}`);
  } else {
    parts.push("Vault-level metrics (TVL, APY, health) are seeded demo data.");
  }

  // Allocation source summary
  if (livePositionMeta) {
    const allocLive: string[] = [];
    const allocUnavail: string[] = [];
    livePositionMeta.vaultSources.forEach(({ allocation }, vaultId) => {
      if (allocation === "live" || allocation === "partial") allocLive.push(vaultId);
      else if (allocation === "unavailable") allocUnavail.push(vaultId);
    });
    if (allocLive.length)
      parts.push(`Allocation weights live (on-chain subvault reads): ${allocLive.join(", ")}`);
    if (allocUnavail.length)
      parts.push(`Allocation weights unavailable: ${allocUnavail.join(", ")}`);
  }
  parts.push(
    "Wallet position (deposited, shares) is read live — liquid balanceOf + Mellow claimableSharesOf."
  );

  benchmarkSources.forEach((source, vaultId) => {
    const api =
      vaultId === "earnETH" ? "Lido staking-stats API" : "DeFiLlama yields API";
    if (source === "live") {
      parts.push(`${vaultId} benchmark: live (${api})`);
    } else if (source === "cached_last_known_good") {
      parts.push(
        `${vaultId} benchmark: stale cache — live fetch failed, using last known-good`
      );
    } else if (source === "unavailable") {
      parts.push(
        `${vaultId} benchmark: unavailable — fetch failed, no cache; benchmark alerts suppressed`
      );
    }
  });

  return parts.join(". ") + ".";
}

// ---------------------------------------------------------------------------
// Data mode determination
// ---------------------------------------------------------------------------

function resolveDataMode(
  livePositionMeta: LivePositionMeta | null
): "live" | "partial_live" | "seeded_demo" {
  if (!livePositionMeta) return "seeded_demo";
  let anyLive = false;
  let anyUnavail = false;
  livePositionMeta.vaultSources.forEach(({ tvl, apy }) => {
    if (tvl === "live" || apy === "live") anyLive = true;
    if (tvl === "unavailable" && apy === "unavailable") anyUnavail = true;
  });
  if (anyLive && anyUnavail) return "partial_live";
  if (anyLive) return "partial_live"; // strategy weights are still seeded
  return "seeded_demo";
}

// ---------------------------------------------------------------------------
// Freshness tag for allocation snapshots
// ---------------------------------------------------------------------------

const ALLOCATION_FRESHNESS: SourceFreshness = {
  source: "seeded_demo",
  asOf: new Date().toISOString(),
  note:
    "Strategy weights are seeded — Mellow subvault allocation enumeration is not yet wired. " +
    "Tracked as a follow-up; all other vault metrics are live.",
};

// ---------------------------------------------------------------------------
// Core builder — used by /api/health and the Telegram delivery path
// ---------------------------------------------------------------------------

/**
 * Build the full agent health response from live on-chain + DeFiLlama data.
 *
 * Vault-level fields (TVL, APY, health) are fetched live.
 * Wallet position (deposited, shares) is read live via balanceOf + claimableSharesOf.
 * Strategy weights remain seeded (labeled clearly in the response note).
 *
 * If ANY live read fails, that field falls back gracefully and is labeled in the note.
 */
export async function buildHealthResponse(
  wallet: string,
  // Pass explicit positions to override live reads (e.g. for demo/test routes).
  // If omitted, live positions are built automatically.
  overridePositions?: VaultPosition[]
): Promise<AgentHealthResponse> {
  let positions: VaultPosition[];
  let livePositionMeta: LivePositionMeta | null = null;

  if (overridePositions) {
    positions = overridePositions;
  } else {
    const result = await buildLivePositions();
    positions = result.positions;
    livePositionMeta = result.meta;
  }

  const { alerts, benchmarks, allocationSnapshots } =
    await generateEnrichedAlerts(positions);

  // Live wallet reads — liquid shares + Mellow claimable shares
  const walletReads = await Promise.all(
    positions.map((pos) => readWalletPosition(wallet, pos.contractAddress))
  );

  const vaults: VaultHealthSummary[] = positions.map((pos, idx) => {
    const bm = benchmarks.get(pos.vaultId)!;
    const alloc = allocationSnapshots.get(pos.vaultId)!;

    // Stamp allocation freshness
    alloc.freshness = ALLOCATION_FRESHNESS;

    const posAlerts = alerts.filter((a) => a.vaultId === pos.vaultId);
    const recommendation = buildRecommendation(
      pos.vaultId,
      pos.health,
      bm,
      alloc,
      posAlerts
    );

    const read = walletReads[idx];
    let walletPosition: WalletPositionState;

    if (read.source === "live_wallet_read") {
      const claimNote =
        read.claimableFormatted > 0
          ? ` (+${read.claimableFormatted.toFixed(6)} in Mellow claim queue)`
          : "";
      walletPosition = {
        source: "live_wallet_read",
        deposited: read.deposited,
        shares: read.totalSharesFormatted,
        note:
          `Live read at ${read.fetchedAt}. ` +
          `Liquid shares: ${read.sharesFormatted.toFixed(6)}${claimNote}. ` +
          `Total underlying: ${read.deposited.toFixed(6)} ${pos.asset}.`,
      };
    } else {
      walletPosition = {
        source: "unavailable",
        deposited: null,
        shares: null,
        note: `Live wallet read failed: ${read.reason}. Set ETH_RPC_URL env var or check the contract address.`,
      };
    }

    const vaultFreshness: SourceFreshness = {
      source: livePositionMeta
        ? livePositionMeta.vaultSources.get(pos.vaultId)?.tvl === "live"
          ? "live"
          : "unavailable"
        : "seeded_demo",
      asOf: new Date().toISOString(),
      note: livePositionMeta ? "TVL and health from on-chain; APY from DeFiLlama; strategy weights seeded." : undefined,
    };

    return {
      vaultId: pos.vaultId,
      vaultName: pos.vaultName,
      contractAddress: pos.contractAddress,
      health: pos.health,
      currentAPY: pos.currentAPY,
      currentTVL: pos.tvl > 0 ? pos.tvl : null,
      tvlCapUSD: pos.tvlCapUSD ?? null,
      walletPosition,
      benchmark: bm,
      allocation: alloc,
      recommendation,
      activeAlertCount: posAlerts.length,
      criticalAlertCount: posAlerts.filter((a) => a.severity === "critical").length,
      freshness: vaultFreshness,
    };
  });

  const benchmarkSources = new Map<string, string>();
  benchmarks.forEach((bm, vaultId) =>
    benchmarkSources.set(vaultId, bm.freshness.source)
  );

  return {
    wallet,
    generatedAt: new Date().toISOString(),
    dataMode: resolveDataMode(livePositionMeta),
    note: buildNote(livePositionMeta, benchmarkSources),
    vaults,
  };
}

export { SEEDED_FRESHNESS };
export type { AgentHealthResponse };
