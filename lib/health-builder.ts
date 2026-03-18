import { VaultPosition } from "./types";
import { VaultHealthSummary, AgentHealthResponse, SourceFreshness, WalletPositionState } from "./domain";
import { generateEnrichedAlerts } from "./alert-engine";
import { buildRecommendation } from "./recommendations";
import { SEEDED_FRESHNESS } from "./benchmarks";

const DATA_MODE_FRESHNESS: SourceFreshness = {
  source: "seeded",
  asOf: new Date().toISOString(),
  note:
    "Vault state is seeded demo data. The wallet below has no live on-chain read in this build. " +
    "Wire Lido JS SDK / EVM calls to replace MOCK_POSITIONS with live vault state.",
};

/**
 * Build the full agent health response from a set of VaultPositions.
 * This is the single source of truth consumed by /api/health, /api/yield-floor,
 * and the preview formatters.
 */
export function buildHealthResponse(
  wallet: string,
  positions: VaultPosition[]
): AgentHealthResponse {
  const { alerts, benchmarks, allocationSnapshots } = generateEnrichedAlerts(positions);

  const vaults: VaultHealthSummary[] = positions.map((pos) => {
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

    const walletPosition: WalletPositionState =
      pos.walletPositionSource === "unavailable"
        ? {
            source: "unavailable",
            deposited: null,
            shares: null,
            note: "Wallet balance not read. Wire Lido JS SDK / EVM call to populate deposited and shares.",
          }
        : {
            source: "live_wallet_read",
            deposited: pos.deposited,
            shares: pos.shares,
            note: "Values sourced from a live on-chain wallet read.",
          };

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
      freshness: DATA_MODE_FRESHNESS,
    };
  });

  return {
    wallet,
    generatedAt: new Date().toISOString(),
    dataMode: "seeded_demo",
    note:
      "Vault-level metrics (APY, TVL, health, allocation) are seeded demo data. " +
      "Wallet-specific position (deposited, shares) is not wired — see walletPosition.source on each vault. " +
      "Benchmark values are fixed reference rates. " +
      "See /api/alerts, /api/yield-floor, /api/telegram-preview, /api/email-preview for other surfaces.",
    vaults,
  };
}

export { SEEDED_FRESHNESS };
export type { AgentHealthResponse };
