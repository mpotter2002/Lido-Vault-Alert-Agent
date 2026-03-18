import { VaultId, VaultHealth } from "./types";

// ---------------------------------------------------------------------------
// Source freshness — every data structure carries this so callers know
// whether they're looking at live data or a seeded placeholder.
// ---------------------------------------------------------------------------

export type SourceStatus = "live" | "seeded" | "unavailable";

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
// Vault health summary — the canonical MCP-friendly output shape
// ---------------------------------------------------------------------------

export interface VaultHealthSummary {
  vaultId: VaultId;
  vaultName: string;
  contractAddress: string;
  health: VaultHealth;
  currentAPY: number;
  // walletPosition is separate from vault-level metrics.
  // When source = "unavailable" the agent has not yet wired a live wallet read.
  walletPosition: WalletPositionState;
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
  dataMode: "seeded_demo" | "live";
  note: string;
  vaults: VaultHealthSummary[];
}
