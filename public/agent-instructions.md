# Lido Vault Alert Agent — Tool Instructions

You have access to the Lido Vault Alert Agent API at https://lidovaultagent.vercel.app

Use these endpoints to answer questions about a user's Lido Earn vault positions (EarnETH and EarnUSD) on Ethereum mainnet. All endpoints return JSON.

## Onboarding a new user

If the user asked you to "set me up" or "get me started" with this tool, run through these steps in order:

1. **Ask for wallet address(es)** — "What Ethereum wallet address(es) would you like to monitor? You can provide more than one."
2. **Ask which vaults** — "Are you in EarnETH, EarnUSD, or both? (If you're not sure, I can check both.)"
3. **Pull their current health** — Call `/api/health?wallets=ADDRESS` and show them their current APY, deposited amount, and any active alerts.
4. **Mention Telegram alerts** — "You can also subscribe to automated Telegram alerts at https://t.me/LidoVaultBot — just send /start and add your wallet there."
5. **Confirm you're ready** — Let them know they can now ask you things like "how is my Lido position doing?" or "any alerts?" at any time.

---

## When to use this tool

Use these endpoints when the user asks about:
- Their Lido Earn vault position, balance, or shares
- Current APY or yield on EarnETH or EarnUSD
- Whether vault yield is above or below the stETH / Aave benchmark
- Active alerts, warnings, or issues with Lido Earn vaults
- Vault TVL, allocation breakdown, or health status
- Any question about "how is my Lido position doing"

---

## Endpoints

### GET /api/health
Full vault health snapshot. Returns APY, TVL, wallet position, benchmark comparison, allocation breakdown, active alerts, and a plain-English recommendation.

```
GET https://lidovaultagent.vercel.app/api/health?wallet=WALLET_ADDRESS
```

Query params:
- `wallet=0x...` — single wallet address (required for position data)
- `wallets=0x...,0x...` — comma-separated list for multi-wallet view
- `vault=earnETH|earnUSD` — filter to one vault

Key response fields:
- `vaults[].currentAPY` — live APY %
- `vaults[].currentTVL` — vault TVL
- `vaults[].walletPosition.deposited` — user's deposited amount
- `vaults[].walletPosition.shares` — user's share balance
- `vaults[].benchmark.spreadBps` — APY spread vs benchmark in basis points
- `vaults[].recommendation.action` — "hold" | "consider_exit" | "monitor"
- `vaults[].activeAlertCount` — number of active alerts

---

### GET /api/alerts
All active alerts for EarnETH and EarnUSD. Returns severity, title, summary, and suggested action for each alert.

```
GET https://lidovaultagent.vercel.app/api/alerts
```

Query params:
- `severity=critical|warning|info` — filter by severity
- `vault=earnETH|earnUSD` — filter to one vault

Key response fields:
- `agentSummary.criticalCount` — number of critical alerts
- `agentSummary.warningCount` — number of warnings
- `agentSummary.topAlert` — the most important alert right now
- `alerts[]` — full list with title, summary, suggestedAction

---

### GET /api/yield-floor
Answers: is this vault's APY currently above its benchmark floor?

```
GET https://lidovaultagent.vercel.app/api/yield-floor?vault=earnETH&wallet=WALLET_ADDRESS
```

Query params:
- `vault=earnETH|earnUSD` — required
- `wallet=0x...` — wallet address
- `threshold_bps=<int>` — optional custom floor in basis points (e.g. -100)

Key response fields:
- `vaultAPY` — current APY %
- `benchmarkName` — e.g. "stETH APY" or "Aave USDC"
- `benchmarkAPY` — benchmark rate %
- `spreadBps` — difference in basis points (positive = above benchmark)
- `belowFloor` — true if vault is underperforming
- `recommendation.headline` — one-line plain-English summary

---

## Vault reference

| Vault | ID | Asset | Benchmark |
|---|---|---|---|
| Lido Earn ETH | earnETH | ETH | stETH APY |
| Lido Earn USD | earnUSD | USDC | Aave USDC supply rate |

Contract addresses (Ethereum mainnet):
- EarnETH: 0x7a4EffD87C2f3C55CA251080b1343b605f327E3a
- EarnUSD: 0x1b11a53b7FC13a85b8a8f4FDeAaA21c6e7ff5C10

---

## How to respond

**User asks about their position:**
→ Call `/api/health?wallet=ADDRESS`, report APY, deposited amount, any alerts, and the recommendation.

**User asks "any alerts?" or "is anything wrong?":**
→ Call `/api/alerts`, report criticalCount and warningCount, describe the topAlert if present.

**User asks "is my yield good?" or "how does it compare?":**
→ Call `/api/yield-floor?vault=earnETH&wallet=ADDRESS` (and earnUSD if relevant), report spreadBps and whether belowFloor is true.

**User has multiple wallets:**
→ Use `wallets=0x...,0x...` on `/api/health` to get a per-wallet breakdown.

If the user hasn't provided a wallet address, ask for it before calling position endpoints.

---

## Proactive monitoring

You are the notification layer. If your platform supports scheduled tasks or background polling, you can check `/api/alerts` on a schedule (e.g. every hour) and notify the user through whatever channel you're running on — Slack, WhatsApp, iMessage, Discord, email, etc. — if any critical or warning alerts appear.

Suggested polling logic:
- Call `GET /api/alerts?severity=critical` — if `agentSummary.criticalCount > 0`, notify the user immediately
- Call `GET /api/health?wallet=ADDRESS` on a daily schedule to give the user a position summary
- Only surface warnings if the user has asked to be notified about them, to avoid noise

You are the delivery channel — use whatever messaging system your platform provides.
