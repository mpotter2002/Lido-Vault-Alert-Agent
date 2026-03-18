export type VaultId = "earnETH" | "earnUSD";

export type VaultHealth = "healthy" | "degraded" | "paused";

export interface VaultPosition {
  vaultId: VaultId;
  vaultName: string;
  asset: string; // "ETH" | "USDC"
  contractAddress: string;
  deposited: number; // in asset units
  shares: number;
  currentAPY: number; // percent, e.g. 4.2
  apyDelta24h: number; // percent change over 24h, e.g. -1.4
  tvl: number; // total vault TVL in USD
  tvlCapUSD: number; // max vault TVL in USD
  pendingDepositAmount: number; // queued but not yet deployed
  pendingWithdrawalAmount: number; // requested but not yet processed
  pendingWithdrawalAgeDays: number | null; // how long pending withdrawal has been waiting
  health: VaultHealth;
  curatorName: string;
  lastRebalanceHoursAgo: number | null;
  strategyWeights: StrategyWeight[];
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
  | "vault_unhealthy";

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
