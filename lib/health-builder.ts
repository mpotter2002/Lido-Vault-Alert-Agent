import { VaultPosition } from "./types";
import { VaultHealthSummary, AgentHealthResponse, SourceFreshness, WalletPositionState } from "./domain";
import { generateEnrichedAlerts } from "./alert-engine";
import { buildRecommendation } from "./recommendations";
import { SEEDED_FRESHNESS } from "./benchmarks";
import { readWalletPosition } from "./wallet-reader";

function buildNote(benchmarkSources: Map<string, string>): string {
  // Build a note that accurately reflects data provenance.
  const bmLines: string[] = [];
  benchmarkSources.forEach((source, vaultId) => {
    const api = vaultId === "earnETH" ? "Lido staking-stats API" : "DeFiLlama yields API";
    if (source === "live") {
      bmLines.push(`${vaultId} benchmark: live (${api})`);
    } else if (source === "cached_last_known_good") {
      bmLines.push(`${vaultId} benchmark: stale cached value — live fetch failed, using last successful real read`);
    } else if (source === "unavailable") {
      bmLines.push(`${vaultId} benchmark: unavailable — live fetch failed and no cached value exists; benchmark alerts suppressed`);
    } else {
      bmLines.push(`${vaultId} benchmark: seeded demo value (explicit demo mode)`);
    }
  });
  const bmSummary = bmLines.length
    ? `Benchmark APYs — ${bmLines.join("; ")}. `
    : "Benchmark values are unavailable. ";

  return (
    "Vault-level metrics (APY, TVL, health, allocation) are seeded demo data. " +
    "Wallet-specific position (deposited, shares) is attempted via live on-chain read — " +
    "see walletPosition.source on each vault for the actual outcome. " +
    bmSummary +
    "See /api/alerts, /api/yield-floor, /api/telegram-preview, /api/email-preview for other surfaces."
  );
}

const VAULT_DATA_FRESHNESS: SourceFreshness = {
  source: "seeded_demo",
  asOf: new Date().toISOString(),
  note:
    "Vault state (APY, TVL, health, strategies) is seeded demo data. " +
    "Wallet balance read is attempted live from the Ethereum mainnet contract. " +
    "Wire Lido JS SDK / EVM calls to replace vault state with live data.",
};

/**
 * Build the full agent health response from a set of VaultPositions.
 *
 * Wallet position (deposited, shares) is fetched live from the on-chain contracts
 * for the given wallet address.  If the read fails for any vault (RPC error,
 * contract not found, timeout) that vault's walletPosition falls back to
 * { source: "unavailable", reason: "..." } — the rest of the response is unaffected.
 *
 * This is the single source of truth consumed by /api/health, /api/yield-floor,
 * and the preview formatters.
 */
export async function buildHealthResponse(
  wallet: string,
  positions: VaultPosition[]
): Promise<AgentHealthResponse> {
  const { alerts, benchmarks, allocationSnapshots } = await generateEnrichedAlerts(positions);

  // Attempt live wallet reads for all vaults in parallel.
  const walletReads = await Promise.all(
    positions.map((pos) => readWalletPosition(wallet, pos.contractAddress))
  );

  const vaults: VaultHealthSummary[] = positions.map((pos, idx) => {
    const bm = benchmarks.get(pos.vaultId)!;
    const alloc = allocationSnapshots.get(pos.vaultId)!;
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
      walletPosition = {
        source: "live_wallet_read",
        deposited: read.deposited,
        shares: read.sharesFormatted,
        note: `Live on-chain read at ${read.fetchedAt}. Shares: ${read.sharesFormatted.toFixed(6)}, Assets: ${read.deposited.toFixed(6)}.`,
      };
    } else {
      walletPosition = {
        source: "unavailable",
        deposited: null,
        shares: null,
        note: `Live wallet read failed: ${read.reason}. Wire ETH_RPC_URL env var or check the contract address.`,
      };
    }

    // Determine the effective dataMode for this position:
    // If the wallet read succeeded, update the position's source field for alerting context.
    const effectivePos: VaultPosition =
      read.source === "live_wallet_read"
        ? {
            ...pos,
            walletPositionSource: "live_wallet_read",
            deposited: read.deposited,
            shares: read.sharesFormatted,
          }
        : pos;
    void effectivePos; // reserved for future alert-engine pass with live data

    return {
      vaultId: pos.vaultId,
      vaultName: pos.vaultName,
      contractAddress: pos.contractAddress,
      health: pos.health,
      currentAPY: pos.currentAPY,
      walletPosition,
      benchmark: bm,
      allocation: alloc,
      recommendation,
      activeAlertCount: posAlerts.length,
      criticalAlertCount: posAlerts.filter((a) => a.severity === "critical").length,
      freshness: VAULT_DATA_FRESHNESS,
    };
  });

  // dataMode stays "seeded_demo" because vault-level data (APY, TVL, health,
  // strategies) is still seeded. Individual walletPosition.source and each
  // vault's benchmark.freshness.source show per-field live/seeded status.
  const benchmarkSources = new Map<string, string>();
  benchmarks.forEach((bm, vaultId) => benchmarkSources.set(vaultId, bm.freshness.source));

  return {
    wallet,
    generatedAt: new Date().toISOString(),
    dataMode: "seeded_demo" as const,
    note: buildNote(benchmarkSources),
    vaults,
  };
}

export { SEEDED_FRESHNESS };
export type { AgentHealthResponse };
