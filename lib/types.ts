export type VaultId = "earnETH" | "earnUSD";

export type VaultHealth = "healthy" | "degraded" | "paused";

export interface VaultPosition {
  // ── Vault-level fields (public on-chain / from vault contract) ──────────
  vaultId: VaultId;
  vaultName: string;
  asset: string; // "ETH" | "USDC"
  contractAddress: string;
  /**
   * Source of vault-level metrics (APY, TVL, health, strategies).
   * "seeded_demo" — values come from seeded mock data, not a live contract read.
   * "live"        — values fetched from a live on-chain or API source.
   * "unavailable" — live read attempted and failed; metrics are absent.
   */
  vaultMetricsSource: "seeded_demo" | "live" | "unavailable";
  currentAPY: number; // percent, e.g. 4.2
  apyDelta24h: number; // percent change over 24h, e.g. -1.4
  tvl: number; // total vault TVL in USD
  tvlCapUSD: number; // max vault TVL in USD
  health: VaultHealth;
  curatorName: string;
  lastRebalanceHoursAgo: number | null;
  strategyWeights: StrategyWeight[];

  // ── Wallet-position fields (require a per-wallet on-chain read) ──────────
  // walletPositionSource indicates whether these values are real.
  // When "unavailable" the agent has not yet performed a live wallet read;
  // deposited and shares will be null and must not be presented as known facts.
  walletPositionSource: "live_wallet_read" | "unavailable";
  deposited: number | null; // asset units held by the monitored wallet; null = not read
  shares: number | null;    // vault shares held; null = not read

  // ── Demo-scenario pending-transaction fields ──────────────────────────────
  // In production these also require wallet reads.  In the seeded demo they are
  // set to non-zero values purely to exercise withdrawal-delay and deposit-queued
  // alert scenarios; they do NOT represent reads from the demo wallet.
  pendingDepositAmount: number;
  pendingWithdrawalAmount: number;
  pendingWithdrawalAgeDays: number | null;
}

export interface StrategyWeight {
  name: string;
  previousWeight: number; // percent
  currentWeight: number; // percent
}

export type AlertSeverity = "info" | "warning" | "critical";
export type AlertType =
  | "apy_drop"
  | "apy_recovery"
  | "withdrawal_delay"
  | "withdrawal_delay_extended"
  | "withdrawal_completed"
  | "deposit_queued"
  | "deposit_deployed"
  | "vault_pause"
  | "tvl_cap_approaching"
  | "curator_rebalance"
  | "vault_unhealthy"
  | "benchmark_underperformance"
  | "benchmark_recovery"
  | "allocation_shift";

export interface Alert {
  id: string;
  vaultId: VaultId;
  vaultName: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  summary: string; // plain language for the user
  technicalDetail: string; // what actually happened on-chain / in the vault
  actionRequired: boolean;
  suggestedAction: string | null;
  timestamp: Date;
  dismissed: boolean;
}
