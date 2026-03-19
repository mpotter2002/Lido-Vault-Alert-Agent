import { VaultId, VaultHealth } from "./types";

// ---------------------------------------------------------------------------
// Source freshness — every data structure carries this so callers know
// whether they're looking at live data or a seeded placeholder.
// ---------------------------------------------------------------------------

export type SourceStatus =
  | "live"               // value fetched from the live API this request
  | "cached_last_known_good" // live fetch failed; using last successful real value (marked stale)
  | "unavailable"        // live fetch failed and no cached value exists
  | "seeded_demo";       // explicit demo/test data — only used when demo mode is active

export interface SourceFreshness {
  source: SourceStatus;
  asOf: string; // ISO timestamp
  note?: string;
}

// ---------------------------------------------------------------------------
// Benchmark comparison
// ---------------------------------------------------------------------------

export interface BenchmarkSnapshot {
  vaultId: VaultId;
  benchmarkName: string; // e.g. "stETH APY (Lido)" or "Aave v3 USDC Supply Rate"
  benchmarkAPY: number; // percent
  vaultAPY: number; // percent
  spreadBps: number; // (vaultAPY - benchmarkAPY) * 100 — negative = underperforming
  floorBps: number; // min acceptable spread; if spreadBps < floorBps → below_floor
  belowFloor: boolean;
  freshness: SourceFreshness;
}

// ---------------------------------------------------------------------------
// Allocation tracking — normalised across known protocols
// ---------------------------------------------------------------------------

export type ProtocolName = "Aave" | "Morpho" | "Pendle" | "Gearbox" | "Maple" | "Other";

export interface ProtocolAllocation {
  protocol: ProtocolName;
  strategyLabel: string;
  previousWeight: number; // percent of vault
  currentWeight: number; // percent of vault
}

export interface AllocationDiff {
  protocol: ProtocolName;
  strategyLabel: string;
  previousWeight: number;
  currentWeight: number;
  deltaWeight: number; // currentWeight - previousWeight
  direction: "increased" | "decreased" | "unchanged";
}

export interface AllocationSnapshot {
  vaultId: VaultId;
  allocations: ProtocolAllocation[];
  significantShifts: AllocationDiff[]; // shifts >= threshold
  freshness: SourceFreshness;
}

// ---------------------------------------------------------------------------
// Recommendation
// ---------------------------------------------------------------------------

export type RecommendationAction =
  | "no_action"
  | "monitor"
  | "avoid_new_deposits"
  | "consider_withdrawal"
  | "favorable_to_deposit";

export interface Recommendation {
  vaultId: VaultId;
  action: RecommendationAction;
  headline: string; // one-liner for humans / notifications
  rationale: string; // full plain-language explanation
  urgency: "none" | "low" | "medium" | "high";
}

// ---------------------------------------------------------------------------
// Wallet position state — explicitly tracks whether we have a real wallet read
// ---------------------------------------------------------------------------

export interface WalletPositionState {
  // "live_wallet_read" = values came from a real on-chain read for the wallet.
  // "unavailable" = no wallet read has been wired; deposited and shares are null.
  source: "live_wallet_read" | "unavailable";
  deposited: number | null; // asset units; null when source = "unavailable"
  shares: number | null;    // vault shares; null when source = "unavailable"
  note: string;
}

// ---------------------------------------------------------------------------
// Live TVL from ERC-4626 totalAssets() — separate from seeded TVL in position
// ---------------------------------------------------------------------------

export interface LiveTvlState {
  /**
   * "live_vault_read" — fetched from totalAssets() this request.
   * "unavailable"     — RPC call failed or timed out.
   */
  source: "live_vault_read" | "unavailable";
  /**
   * Total assets in the vault's native token (ETH for earnETH, USDC for earnUSD).
   * null when source === "unavailable".
   */
  totalAssetsNative: number | null;
  /**
   * Asset ticker ("ETH" | "USDC").
   * For USDC: totalAssetsNative ≈ USD value.
   * For ETH:  USD value requires a price feed (not wired; totalAssetsNative is in ETH).
   */
  asset: string;
  note: string;
}

// ---------------------------------------------------------------------------
// Live vault APY from DeFiLlama — separate from the seeded APY in VaultPosition
// ---------------------------------------------------------------------------

export interface LiveVaultApySummary {
  /**
   * "live"        — APY fetched from DeFiLlama this request (may be from LKG cache).
   * "unavailable" — DeFiLlama fetch failed or vault not indexed; seeded APY applies.
   */
  source: "live" | "unavailable";
  /** Current APY % from DeFiLlama. null when source = "unavailable". */
  apy: number | null;
  /** 7-day average APY % from DeFiLlama (coarse trend indicator). null if not returned. */
  apy7dAvg: number | null;
  note: string;
}

// ---------------------------------------------------------------------------
// Vault health summary — the canonical MCP-friendly output shape
// ---------------------------------------------------------------------------

export interface VaultHealthSummary {
  vaultId: VaultId;
  vaultName: string;
  contractAddress: string;
  health: VaultHealth;
  /**
   * currentAPY reflects the live DeFiLlama APY when available, otherwise the
   * seeded demo value. Always check liveVaultApy.source to understand provenance.
   */
  currentAPY: number;
  currentTVL: number | null;
  tvlCapUSD: number | null;
  // walletPosition is separate from vault-level metrics.
  // When source = "unavailable" the agent has not yet wired a live wallet read.
  walletPosition: WalletPositionState;
  /**
   * Live vault APY from DeFiLlama. When source = "live", currentAPY is the real
   * on-chain published APY and benchmark comparisons are real vs real.
   * When source = "unavailable", currentAPY is the seeded demo value.
   */
  liveVaultApy: LiveVaultApySummary;
  /**
   * Live vault TVL read via ERC-4626 totalAssets(). Separate from the seeded
   * TVL in VaultPosition (used for internal alert rules). When available, this
   * is the authoritative TVL for display; when unavailable, the seeded value
   * in the agent's dataMode note applies.
   */
  liveTvl: LiveTvlState;
  benchmark: BenchmarkSnapshot;
  allocation: AllocationSnapshot;
  recommendation: Recommendation;
  activeAlertCount: number;
  criticalAlertCount: number;
  freshness: SourceFreshness;
}

// Top-level response envelope for /api/health
export interface AgentHealthResponse {
  wallet: string;
  generatedAt: string;
  dataMode: "seeded_demo" | "live" | "partial_live";
  note: string;
  vaults: VaultHealthSummary[];
}
