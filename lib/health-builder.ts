import { VaultPosition } from "./types";
import { VaultHealthSummary, AgentHealthResponse, SourceFreshness, WalletPositionState, LiveTvlState, LiveVaultApySummary } from "./domain";
import { generateEnrichedAlerts } from "./alert-engine";
import { buildRecommendation } from "./recommendations";
import { SEEDED_FRESHNESS } from "./benchmarks";
import { readWalletPosition, readVaultTvl } from "./wallet-reader";
import { fetchVaultAPY } from "./vault-apy-reader";

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
    "Vault APY is attempted live from DeFiLlama — see liveVaultApy.source on each vault. " +
    "When live, currentAPY and benchmark comparisons are real vs real. " +
    "When unavailable, currentAPY is seeded demo data. " +
    "Vault health and allocation data are seeded. " +
    "Wallet-specific position is attempted via live on-chain read — see walletPosition.source. " +
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
  // Attempt live vault APY reads from DeFiLlama in parallel with everything else.
  // If found, overlay real APY so benchmark comparisons are real vs real.
  const [liveApyReads, walletReads, tvlReads] = await Promise.all([
    Promise.all(positions.map((pos) => fetchVaultAPY(pos.contractAddress, pos.asset))),
    Promise.all(positions.map((pos) => readWalletPosition(wallet, pos.contractAddress))),
    Promise.all(positions.map((pos) => readVaultTvl(pos.contractAddress, pos.asset))),
  ]);

  // Patch positions: overlay live APY where available so alert engine and
  // benchmark comparisons use real data instead of seeded demo values.
  // apyDelta24h is set to 0 when live APY is used — we don't have a reliable
  // 24h delta from DeFiLlama (only 7d avg), so we suppress delta-based alerts
  // rather than mix real and invented numbers.
  const patchedPositions: VaultPosition[] = positions.map((pos, idx) => {
    const liveApy = liveApyReads[idx];
    if (liveApy.source === "live" && liveApy.apy !== null) {
      return {
        ...pos,
        currentAPY: liveApy.apy,
        apyDelta24h: 0, // no reliable 24h delta from DeFiLlama
        vaultMetricsSource: "live" as const,
      };
    }
    return pos;
  });

  const { alerts, benchmarks, allocationSnapshots } = await generateEnrichedAlerts(patchedPositions);

  const vaults: VaultHealthSummary[] = patchedPositions.map((pos, idx) => {
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

    // Build liveVaultApy summary for this vault.
    const liveApyRead = liveApyReads[idx];
    let liveVaultApy: LiveVaultApySummary;
    if (liveApyRead.source === "live" && liveApyRead.apy !== null) {
      liveVaultApy = {
        source: "live",
        apy: liveApyRead.apy,
        apy7dAvg: liveApyRead.apy7dAvg,
        note: liveApyRead.note,
      };
    } else {
      liveVaultApy = {
        source: "unavailable",
        apy: null,
        apy7dAvg: null,
        note:
          liveApyRead.source === "unavailable"
            ? liveApyRead.reason
            : "DeFiLlama vault APY not found — seeded demo APY applies.",
      };
    }

    // Build liveTvl state from on-chain totalAssets() read.
    const tvlRead = tvlReads[idx];
    let liveTvl: LiveTvlState;
    if (tvlRead.source === "live_vault_read") {
      const isUsd = pos.asset === "USDC";
      liveTvl = {
        source: "live_vault_read",
        totalAssetsNative: tvlRead.totalAssetsNative,
        asset: tvlRead.asset,
        note: isUsd
          ? `Live totalAssets() read at ${tvlRead.fetchedAt}. ${tvlRead.totalAssetsNative.toLocaleString("en-US", { maximumFractionDigits: 0 })} USDC ≈ USD value.`
          : `Live totalAssets() read at ${tvlRead.fetchedAt}. ${tvlRead.totalAssetsNative.toFixed(4)} ETH (USD value requires price feed — not wired).`,
      };
    } else {
      liveTvl = {
        source: "unavailable",
        totalAssetsNative: null,
        asset: pos.asset,
        note: `Live totalAssets() read failed: ${tvlRead.reason}. Wire ETH_RPC_URL env var or check the contract address.`,
      };
    }

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
      // Use live APY (already patched into pos.currentAPY) when available;
      // otherwise falls back to the seeded demo value.
      currentAPY: pos.currentAPY,
      walletPosition,
      liveVaultApy,
      liveTvl,
      benchmark: bm,
      allocation: alloc,
      recommendation,
      activeAlertCount: posAlerts.length,
      criticalAlertCount: posAlerts.filter((a) => a.severity === "critical").length,
      freshness: VAULT_DATA_FRESHNESS,
    };
  });

  // dataMode: "partial_live" when any live data succeeded (APY, wallet, or TVL reads);
  // "seeded_demo" when all live reads failed and we're serving only seeded values.
  const anyLiveApy = vaults.some((v) => v.liveVaultApy.source === "live");
  const anyLiveTvl = vaults.some((v) => v.liveTvl.source === "live_vault_read");
  const anyLiveWallet = vaults.some((v) => v.walletPosition.source === "live_wallet_read");
  const dataMode: "seeded_demo" | "partial_live" =
    anyLiveApy || anyLiveTvl || anyLiveWallet ? "partial_live" : "seeded_demo";

  const benchmarkSources = new Map<string, string>();
  benchmarks.forEach((bm, vaultId) => benchmarkSources.set(vaultId, bm.freshness.source));

  return {
    wallet,
    generatedAt: new Date().toISOString(),
    dataMode,
    note: buildNote(benchmarkSources),
    vaults,
  };
}

export { SEEDED_FRESHNESS };
export type { AgentHealthResponse };
