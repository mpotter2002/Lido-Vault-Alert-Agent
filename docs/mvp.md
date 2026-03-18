# MVP Spec: Lido Vault Alert Agent

## Problem

Users depositing into Lido Earn vaults (EarnETH, EarnUSD) have minimal visibility into what is happening with their position. The curator/strategy model means:

- Deposits may queue before being deployed into yield-generating strategies
- Withdrawals are not instant — they depend on curator rebalancing cycles
- APY fluctuates as the underlying strategy mix changes
- Vault-level events (curator rotation, strategy pause, TVL cap hit) affect yield but are never surfaced to depositors

The result: users are flying blind. They discover problems only after they've caused confusion or loss.

## Target User

A DeFi-native user or small treasury operator with ETH or USD stablecoin exposure in Lido Earn vaults. They check their positions periodically but don't want to run their own subgraph or parse on-chain events manually. They want a quick answer to: *"Is anything happening with my vault that I should know about?"*

## Demo Story

> Alice deposited 2 ETH into EarnETH three weeks ago. Today she opens the dashboard and sees a yellow alert: "Your EarnETH APY dropped from 4.2% to 2.8% over the last 24 hours. This follows a strategy rebalance by the vault curator. No immediate action needed — yield is expected to stabilize within 48 hours."
>
> She also has a pending withdrawal of 0.5 ETH she requested 4 days ago. A second alert reads: "Your withdrawal request is still pending. The curator is processing redemptions in the current batch cycle. Estimated resolution: 1–2 days."
>
> She closes the tab knowing she doesn't need to do anything.

## Must-Have Flow (MVP)

1. **Vault Position Dashboard**
   - Show EarnETH and EarnUSD vault cards
   - Each card: deposited amount, current APY, 24h APY delta, pending deposit amount, pending withdrawal amount, vault health status

2. **Alert Feed**
   - Ordered list of active alerts for the user's positions
   - Each alert: severity (info / warning / critical), vault, event type, plain-language explanation, action required (yes/no), suggested action if yes

3. **Alert Detail**
   - Expanding an alert shows technical context (e.g., "Strategy weight shifted: stETH allocation 60% → 45%, wstETH allocation 40% → 55%") alongside the plain-language summary

## Alert Types

| Type | Trigger | Severity | Action Needed |
|------|---------|----------|---------------|
| APY Drop | APY falls >15% in 24h | Warning | No (monitor) |
| APY Recovery | APY rises >15% after prior drop | Info | No |
| Withdrawal Delay | Pending withdrawal >3 days | Warning | No (wait) |
| Withdrawal Delay Extended | Pending withdrawal >7 days | Warning | Consider contacting curator |
| Withdrawal Completed | Withdrawal processed | Info | No |
| Deposit Queued | Deposit not yet deployed | Info | No |
| Deposit Deployed | Queued deposit now earning | Info | No |
| Vault Pause | Vault deposits/withdrawals halted | Critical | Wait for resolution |
| TVL Cap Approaching | Vault >90% capacity | Warning | Consider alternative vault |
| Curator Rebalance | Strategy weights shifted significantly | Info | No |
| Vault Unhealthy | Vault health check fails | Critical | Consider withdrawing |

## What Is Mocked (MVP)

- Wallet address and vault positions (no wallet connect)
- Vault state: APY, TVL, pending amounts (seeded JSON, not live SDK)
- Alert history: pre-seeded events with timestamps
- "Refresh" button simulates a state change and re-runs alert engine

**Not mocked (ready to wire up):**
- Lido JS SDK calls to fetch real vault state
- On-chain event listening via ethers.js / viem
- Actual pending queue sizes from Mellow Protocol contracts

## Roadmap

### V1 (post-hackathon)
- Connect to Lido JS SDK for live EarnETH / EarnUSD vault reads
- Wallet connect (wagmi) to scope alerts to a real user position
- Push notifications via email or Telegram for critical alerts

### V2
- Multi-vault support (any Mellow-backed Lido Earn vault)
- Historical APY chart per vault
- Alert history log persisted to local storage or simple backend

### V3
- Agent mode: natural language Q&A about your position ("Why did my yield drop?")
- Automated rebalance suggestions across EarnETH and EarnUSD
- Integration with Lido stETH staking for full portfolio view
