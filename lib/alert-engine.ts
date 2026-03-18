import { VaultPosition, Alert, AlertSeverity } from "./types";

let idCounter = 0;
function makeId() {
  return `alert-${++idCounter}-${Date.now()}`;
}

function ago(hours: number): Date {
  return new Date(Date.now() - hours * 3600 * 1000);
}

export function generateAlerts(positions: VaultPosition[]): Alert[] {
  const alerts: Alert[] = [];

  for (const pos of positions) {
    // APY drop > 15% relative in 24h
    if (pos.apyDelta24h < 0) {
      const prevAPY = pos.currentAPY - pos.apyDelta24h;
      const relDrop = Math.abs(pos.apyDelta24h) / prevAPY;
      if (relDrop >= 0.15) {
        const prevFormatted = prevAPY.toFixed(1);
        alerts.push({
          id: makeId(),
          vaultId: pos.vaultId,
          vaultName: pos.vaultName,
          type: "apy_drop",
          severity: "warning",
          title: `APY dropped ${Math.abs(pos.apyDelta24h).toFixed(1)}% in 24h`,
          summary: `Your ${pos.vaultName} yield fell from ${prevFormatted}% to ${pos.currentAPY.toFixed(1)}% APY over the last 24 hours. This follows a strategy rebalance by the vault curator (${pos.curatorName}). No immediate action needed — yield is expected to stabilize as the new allocation settles.`,
          technicalDetail: buildStrategyDetail(pos),
          actionRequired: false,
          suggestedAction: null,
          timestamp: ago(2),
          dismissed: false,
        });
      }
    }

    // APY recovery after drop
    if (pos.apyDelta24h > 0) {
      const prevAPY = pos.currentAPY - pos.apyDelta24h;
      const relGain = pos.apyDelta24h / prevAPY;
      if (relGain >= 0.1) {
        alerts.push({
          id: makeId(),
          vaultId: pos.vaultId,
          vaultName: pos.vaultName,
          type: "apy_recovery",
          severity: "info",
          title: `APY recovering — now ${pos.currentAPY.toFixed(1)}%`,
          summary: `Your ${pos.vaultName} yield has increased by ${pos.apyDelta24h.toFixed(1)}% over the last 24 hours and is now ${pos.currentAPY.toFixed(1)}% APY. The curator rebalance appears to be settling positively.`,
          technicalDetail: buildStrategyDetail(pos),
          actionRequired: false,
          suggestedAction: null,
          timestamp: ago(1),
          dismissed: false,
        });
      }
    }

    // Pending withdrawal delay
    if (pos.pendingWithdrawalAmount > 0 && pos.pendingWithdrawalAgeDays !== null) {
      const days = pos.pendingWithdrawalAgeDays;
      if (days >= 7) {
        alerts.push({
          id: makeId(),
          vaultId: pos.vaultId,
          vaultName: pos.vaultName,
          type: "withdrawal_delay_extended",
          severity: "warning",
          title: `Withdrawal pending ${days} days`,
          summary: `Your withdrawal request for ${pos.pendingWithdrawalAmount} ${pos.asset} from ${pos.vaultName} has been pending for ${days} days, which is longer than typical. The curator may be processing a large batch or rebalancing liquidity. You may want to check the Lido Earn dashboard for curator status.`,
          technicalDetail: `Pending redemption: ${pos.pendingWithdrawalAmount} ${pos.asset}. Vault: ${pos.contractAddress}. Curator: ${pos.curatorName}.`,
          actionRequired: true,
          suggestedAction: "Check the Lido Earn app for an updated withdrawal status or curator announcement.",
          timestamp: ago(days * 24 - 1),
          dismissed: false,
        });
      } else if (days >= 3) {
        alerts.push({
          id: makeId(),
          vaultId: pos.vaultId,
          vaultName: pos.vaultName,
          type: "withdrawal_delay",
          severity: "warning",
          title: `Withdrawal pending ${days} days`,
          summary: `Your withdrawal request for ${pos.pendingWithdrawalAmount} ${pos.asset} from ${pos.vaultName} is still being processed. The ${pos.curatorName} curator is managing redemptions in the current batch cycle. This is normal — most withdrawals complete within 5–7 days.`,
          technicalDetail: `Pending redemption: ${pos.pendingWithdrawalAmount} ${pos.asset}. Vault: ${pos.contractAddress}. Curator: ${pos.curatorName}. Last rebalance: ${pos.lastRebalanceHoursAgo}h ago.`,
          actionRequired: false,
          suggestedAction: null,
          timestamp: ago(days * 24 - 1),
          dismissed: false,
        });
      }
    }

    // Deposit queued (not yet deployed)
    if (pos.pendingDepositAmount > 0) {
      alerts.push({
        id: makeId(),
        vaultId: pos.vaultId,
        vaultName: pos.vaultName,
        type: "deposit_queued",
        severity: "info",
        title: `${pos.pendingDepositAmount} ${pos.asset} deposit queued`,
        summary: `Your recent deposit of ${pos.pendingDepositAmount} ${pos.asset} into ${pos.vaultName} is queued and not yet earning yield. The ${pos.curatorName} curator will deploy it into active strategies at the next rebalance. This typically takes 1–24 hours.`,
        technicalDetail: `Pending deposit: ${pos.pendingDepositAmount} ${pos.asset}. Next curator rebalance expected within ~${24 - (pos.lastRebalanceHoursAgo ?? 0)}h based on last rebalance ${pos.lastRebalanceHoursAgo}h ago.`,
        actionRequired: false,
        suggestedAction: null,
        timestamp: ago(3),
        dismissed: false,
      });
    }

    // TVL cap approaching (>88%)
    const tvlUtilization = pos.tvl / pos.tvlCapUSD;
    if (tvlUtilization >= 0.88) {
      alerts.push({
        id: makeId(),
        vaultId: pos.vaultId,
        vaultName: pos.vaultName,
        type: "tvl_cap_approaching",
        severity: "warning",
        title: `${pos.vaultName} is ${(tvlUtilization * 100).toFixed(0)}% full`,
        summary: `${pos.vaultName} TVL is approaching its capacity cap ($${(pos.tvlCapUSD / 1e6).toFixed(0)}M). New deposits may be blocked once the cap is hit. Your existing position is unaffected. If you plan to add more, consider acting soon or depositing into an alternate vault.`,
        technicalDetail: `Current TVL: $${(pos.tvl / 1e6).toFixed(1)}M. Cap: $${(pos.tvlCapUSD / 1e6).toFixed(0)}M. Utilization: ${(tvlUtilization * 100).toFixed(1)}%.`,
        actionRequired: false,
        suggestedAction: "Deposit soon if you plan to increase your position, or monitor for a cap raise.",
        timestamp: ago(5),
        dismissed: false,
      });
    }

    // Vault health degraded or paused
    if (pos.health === "degraded") {
      alerts.push({
        id: makeId(),
        vaultId: pos.vaultId,
        vaultName: pos.vaultName,
        type: "vault_unhealthy",
        severity: "critical",
        title: `${pos.vaultName} vault health degraded`,
        summary: `The ${pos.vaultName} vault is reporting a degraded health status. This may indicate a strategy issue or oracle problem. New deposits are not recommended until the issue is resolved. Your current position is still intact.`,
        technicalDetail: `Vault health check returned: ${pos.health}. Curator: ${pos.curatorName}.`,
        actionRequired: true,
        suggestedAction: "Monitor Lido Earn announcements. Consider initiating a withdrawal if the status persists.",
        timestamp: ago(0.5),
        dismissed: false,
      });
    }

    if (pos.health === "paused") {
      alerts.push({
        id: makeId(),
        vaultId: pos.vaultId,
        vaultName: pos.vaultName,
        type: "vault_pause",
        severity: "critical",
        title: `${pos.vaultName} is paused`,
        summary: `The ${pos.vaultName} vault has been paused. Deposits and withdrawals are temporarily halted. This is a safety measure taken by the curator or Lido governance. Your funds are not at risk, but you cannot move them until the pause is lifted.`,
        technicalDetail: `Vault ${pos.contractAddress} is in paused state. Curator: ${pos.curatorName}.`,
        actionRequired: true,
        suggestedAction: "Follow Lido Earn channels for a resolution timeline. No on-chain action is possible until unpaused.",
        timestamp: ago(0.25),
        dismissed: false,
      });
    }

    // Curator rebalance (recent, significant weight shift)
    if (pos.lastRebalanceHoursAgo !== null && pos.lastRebalanceHoursAgo <= 12) {
      const hasSignificantShift = pos.strategyWeights.some(
        (w) => Math.abs(w.currentWeight - w.previousWeight) >= 10
      );
      if (hasSignificantShift) {
        alerts.push({
          id: makeId(),
          vaultId: pos.vaultId,
          vaultName: pos.vaultName,
          type: "curator_rebalance",
          severity: "info",
          title: `Curator rebalanced strategy ${pos.lastRebalanceHoursAgo}h ago`,
          summary: `The ${pos.curatorName} curator rebalanced the ${pos.vaultName} strategy ${pos.lastRebalanceHoursAgo} hours ago, shifting asset weights across underlying protocols. This is routine and no action is needed. Your yield may fluctuate briefly as the allocation settles.`,
          technicalDetail: buildStrategyDetail(pos),
          actionRequired: false,
          suggestedAction: null,
          timestamp: ago(pos.lastRebalanceHoursAgo),
          dismissed: false,
        });
      }
    }
  }

  // Sort: critical first, then warning, then info; newest within each tier
  const order: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => {
    const severityDiff = order[a.severity] - order[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return b.timestamp.getTime() - a.timestamp.getTime();
  });
}

function buildStrategyDetail(pos: VaultPosition): string {
  if (!pos.strategyWeights.length) return `Vault: ${pos.contractAddress}. Curator: ${pos.curatorName}.`;
  const shifts = pos.strategyWeights
    .map((w) => `${w.name}: ${w.previousWeight}% → ${w.currentWeight}%`)
    .join(", ");
  return `Strategy weight changes: ${shifts}. Vault: ${pos.contractAddress}. Curator: ${pos.curatorName}.`;
}
