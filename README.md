# Lido Vault Alert Agent

A live monitoring agent and Telegram bot for [Lido Earn](https://lido.fi/earn) vaults (EarnETH and EarnUSD). Reads real on-chain data, tracks vault health, and sends plain-language alerts to subscribers.

**Live:** https://lido-vault-alert-agent.vercel.app

## What it does

- **Telegram bot** — users subscribe with their wallet, set alert preferences, and receive personalized vault alerts
- **Live on-chain reads** — APY and TVL from Mellow API, allocation weights from on-chain RiskManager, wallet position via `balanceOf` + `claimableSharesOf`
- **Alert engine** — detects yield drops, benchmark underperformance, allocation shifts, and TVL changes
- **API-first** — all endpoints return JSON and are designed to be called by other agents and bots

## Telegram bot commands

| Command | Description |
|---|---|
| `/subscribe 0xYourWallet` | Register wallet + onboarding |
| `/status` | Live vault snapshot with your position |
| `/alerts [critical\|all]` | View or change alert sensitivity |
| `/setfloor [N]` | Set minimum acceptable APY (%) |
| `/setemail [addr\|remove]` | Add or remove email for alert notifications |
| `/unsubscribe` | Stop receiving alerts |
| `/help` | Show command list |

## API endpoints

All endpoints return JSON and can be used as tools by other agents.

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Live vault health (TVL, APY, benchmarks, wallet position, alerts) |
| GET | `/api/alerts` | Active alerts for all vaults |
| GET | `/api/yield-floor` | APY vs benchmark for a vault |
| POST | `/api/telegram-broadcast` | Send alerts to all subscribers (`dryRun` supported) |
| GET | `/api/telegram-register-webhook` | Register or inspect Telegram webhook |

## Data sources

| Signal | Source |
|---|---|
| APY | Mellow API (`api.mellow.finance/v1/vaults`) |
| TVL | Mellow API |
| Benchmarks | Lido staking-stats API (stETH), DeFiLlama (Aave/USDC) |
| Allocation weights | On-chain `IRiskManager.subvaultState()` |
| Wallet position | On-chain `balanceOf` + `claimableSharesOf` |
| Subscriber store | Supabase (Postgres) |

## Stack

- Next.js 14 (App Router) + TypeScript
- Supabase — subscriber store
- Vercel — hosting + deployment
- Telegram Bot API — subscriber delivery

## Run locally

```bash
cp .env.local.example .env.local
# fill in ETH_RPC_URL, TELEGRAM_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev
```

## Environment variables

```
ETH_RPC_URL                  # Ethereum mainnet RPC (Alchemy/Infura)
TELEGRAM_BOT_TOKEN           # From @BotFather
SUPABASE_URL                 # Your Supabase project URL
SUPABASE_SERVICE_ROLE_KEY    # Supabase service role key (server-side only)
APP_URL                      # Your deployed URL (for webhook registration)
RESEND_API_KEY               # Optional — email alerts via Resend
RESEND_FROM_EMAIL            # Optional — verified sending address (e.g. alerts@yourdomain.com)
```

### Supabase schema migration (email support)

If adding email to an existing deployment, run this in your Supabase SQL editor:

```sql
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS email TEXT;
```

After deploying, register the Telegram webhook once:
```
GET /api/telegram-register-webhook
```

## Project structure

```
app/api/          API routes (health, alerts, telegram-*)
lib/              Alert engine, live positions, benchmarks, subscribers
```

## Hackathon track

Lido Ecosystem — tooling for Lido Earn vault users.
