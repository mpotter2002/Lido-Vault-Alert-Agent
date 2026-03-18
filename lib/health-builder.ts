import { VaultPosition } from "./types";
import { VaultHealthSummary, AgentHealthResponse, SourceFreshness, WalletPositionState } from "./domain";
import { generateEnrichedAlerts } from "./alert-engine";
import { buildRecommendation } from "./recommendations";
import { SEEDED_FRESHNESS } from "./benchmarks";
import { readWalletPosition } from "./wallet-reader";

const SEEDED_DATA_MODE_NOTE =
  "Vault-level metrics (APY, TVL, health, allocation) are seeded demo data. " +
  "Wallet-specific position (deposited, shares) is attempted via live on-chain read — " +
  "see walletPosition.source on each vault for the actual outcome. " +
  "Benchmark values are fixed reference rates. " +
  "See /api/alerts, /api/yield-floor, /api/telegram-preview, /api/email-preview for other surfaces.";

const VAULT_DATA_FRESHNESS: SourceFreshness = {
  source: "seeded",
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
  const { alerts, benchmarks, allocationSnapshots } = generateEnrichedAlerts(positions);

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

  const anyLive = walletReads.some((r) => r.source === "live_wallet_read");
  const dataMode: "seeded_demo" | "live" = anyLive ? "seeded_demo" : "seeded_demo";
  // dataMode stays "seeded_demo" because vault-level data is still seeded;
  // individual walletPosition.source indicates the live/unavailable status per vault.

  return {
    wallet,
    generatedAt: new Date().toISOString(),
    dataMode,
    note: SEEDED_DATA_MODE_NOTE,
    vaults,
  };
}

export { SEEDED_FRESHNESS };
export type { AgentHealthResponse };
