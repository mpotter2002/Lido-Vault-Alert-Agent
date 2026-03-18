# Lido Vault Alert Agent

A position monitor and plain-language alert agent for [Lido Earn](https://lido.fi/earn) vaults (EarnETH and EarnUSD), built for the Lido hackathon.

## What it does

- **Position dashboard** — shows your deposited amount, current APY, pending deposits/withdrawals, and vault health across EarnETH and EarnUSD
- **Alert engine** — detects meaningful state changes (APY shifts, withdrawal delays, curator rebalances, vault pauses) and explains them in plain language
- **Action guidance** — each alert tells you whether action is needed and what to do

## Why it matters

Lido Earn vaults use a curator/strategy model (Mellow Protocol-backed) that introduces nuance: deposits can queue, yields reflect multi-strategy allocations, and withdrawal timing depends on curator rebalancing. Most users have no visibility into this. This agent surfaces the signal.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- Mocked vault state + alert engine (swap in real SDK reads when ready)

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project structure

```
app/              Next.js app router pages
components/       UI components (VaultCard, AlertPanel, etc.)
lib/              Types, mock data, alert engine logic
docs/mvp.md       Full product spec and roadmap
```

## Hackathon track

Lido Ecosystem — tooling for Lido Earn vault users.
