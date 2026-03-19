import { VaultPosition } from "./types";

// Demo wallet — the address we monitor in the seeded demo.
// No live on-chain reads are performed; wallet-specific balance fields
// (deposited, shares) are intentionally null/unavailable.
export const DEMO_WALLET = "0x8f7fD8947DE49C3FFCd4B25C03249B6D997f6112";

// ---------------------------------------------------------------------------
// DATA MODEL NOTE
// ---------------
// Vault-level fields (APY, TVL, health, strategy weights) are seeded demo
// values that mimic realistic on-chain state.  They are NOT reads from any
// live contract but they do represent plausible vault metrics.
//
// Wallet-position fields (deposited, shares) are NOT seeded.  The agent has
// no wired wallet read, so those fields are null with source "unavailable".
// Never present them as known facts in UI or API responses.
//
// Pending-transaction fields (pendingDepositAmount, pendingWithdrawalAmount,
// pendingWithdrawalAgeDays) are set in some scenarios purely to exercise
// withdrawal-delay and deposit-queued alert paths.  They are demo scenarios,
// not reads from the actual demo wallet.
// ---------------------------------------------------------------------------

// Scenario 1 — Initial state
//
// EarnETH: moderate APY drop, Pendle allocation reduced heavily (→ Morpho).
// EarnUSD: healthy, with a pending deposit and a spread across all 5 protocols.

export const MOCK_POSITIONS: VaultPosition[] = [
  {
    vaultId: "earnETH",
    vaultName: "Lido Earn ETH",
    asset: "ETH",
    contractAddress: "0x7047F90229a057C13BF847C0744D646CFb6c9E1a",
    vaultMetricsSource: "seeded_demo",
    walletPositionSource: "unavailable",
    deposited: null,
    shares: null,
    currentAPY: 2.8,
    apyDelta24h: -1.4,
    tvl: 148_200_000,
    tvlCapUSD: 200_000_000,
    pendingDepositAmount: 0,
    pendingWithdrawalAmount: 0.5,
    pendingWithdrawalAgeDays: 4,
    health: "healthy",
    curatorName: "Mellow P2P",
    lastRebalanceHoursAgo: 6,
    // Pendle PT-stETH reduced sharply → Morpho absorbed
    strategyWeights: [
      { name: "Morpho wstETH Curated", previousWeight: 35, currentWeight: 50 },
      { name: "Pendle PT-stETH (Dec)", previousWeight: 40, currentWeight: 25 },
      { name: "Aave v3 wstETH Supply", previousWeight: 15, currentWeight: 15 },
      { name: "Gearbox stETH Farming", previousWeight: 10, currentWeight: 10 },
    ],
  },
  {
    vaultId: "earnUSD",
    vaultName: "Lido Earn USD",
    asset: "USDC",
    contractAddress: "0x4f3166003E149C1B6E7E01cEa4B5Bb9FeD62aBCf",
    vaultMetricsSource: "seeded_demo",
    walletPositionSource: "unavailable",
    deposited: null,
    shares: null,
    currentAPY: 5.1,
    apyDelta24h: 0.2,
    tvl: 87_500_000,
    tvlCapUSD: 100_000_000,
    pendingDepositAmount: 500,
    pendingWithdrawalAmount: 0,
    pendingWithdrawalAgeDays: null,
    health: "healthy",
    curatorName: "Mellow Re7",
    lastRebalanceHoursAgo: 18,
    // All 5 protocols represented
    strategyWeights: [
      { name: "Aave v3 USDC Supply", previousWeight: 40, currentWeight: 40 },
      { name: "Morpho USDC Curated", previousWeight: 30, currentWeight: 35 },
      { name: "Pendle PT-USDC (Jun)", previousWeight: 15, currentWeight: 10 },
      { name: "Maple USDC Pool", previousWeight: 10, currentWeight: 10 },
      { name: "Gearbox USDC Strategy", previousWeight: 5, currentWeight: 5 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Scenario 2 — APY recovering, TVL rising, Pendle allocation rebuilt
// ---------------------------------------------------------------------------

export const MOCK_POSITIONS_REFRESH: VaultPosition[] = [
  {
    ...MOCK_POSITIONS[0],
    currentAPY: 3.1,
    apyDelta24h: 0.3,
    pendingWithdrawalAgeDays: 4,
    strategyWeights: [
      { name: "Morpho wstETH Curated", previousWeight: 50, currentWeight: 45 },
      { name: "Pendle PT-stETH (Dec)", previousWeight: 25, currentWeight: 35 },
      { name: "Aave v3 wstETH Supply", previousWeight: 15, currentWeight: 10 },
      { name: "Gearbox stETH Farming", previousWeight: 10, currentWeight: 10 },
    ],
  },
  {
    ...MOCK_POSITIONS[1],
    tvl: 93_000_000, // TVL rising toward cap
    currentAPY: 5.1,
    pendingDepositAmount: 0, // deposit deployed
    strategyWeights: [
      { name: "Aave v3 USDC Supply", previousWeight: 40, currentWeight: 38 },
      { name: "Morpho USDC Curated", previousWeight: 35, currentWeight: 37 },
      { name: "Pendle PT-USDC (Jun)", previousWeight: 10, currentWeight: 12 },
      { name: "Maple USDC Pool", previousWeight: 10, currentWeight: 10 },
      { name: "Gearbox USDC Strategy", previousWeight: 5, currentWeight: 3 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Scenario 3 — EarnETH vault paused, withdrawal resolved, EarnUSD healthy
// ---------------------------------------------------------------------------

export const MOCK_POSITIONS_SCENARIO3: VaultPosition[] = [
  {
    ...MOCK_POSITIONS[0],
    currentAPY: 0,
    apyDelta24h: -2.8,
    health: "paused",
    pendingWithdrawalAmount: 0,
    pendingWithdrawalAgeDays: null,
    lastRebalanceHoursAgo: null,
    strategyWeights: [
      { name: "Morpho wstETH Curated", previousWeight: 50, currentWeight: 50 },
      { name: "Pendle PT-stETH (Dec)", previousWeight: 25, currentWeight: 25 },
      { name: "Aave v3 wstETH Supply", previousWeight: 15, currentWeight: 15 },
      { name: "Gearbox stETH Farming", previousWeight: 10, currentWeight: 10 },
    ],
  },
  {
    ...MOCK_POSITIONS_REFRESH[1],
    currentAPY: 5.3,
    apyDelta24h: 0.2,
  },
];

export const MOCK_SCENARIOS = [
  MOCK_POSITIONS,
  MOCK_POSITIONS_REFRESH,
  MOCK_POSITIONS_SCENARIO3,
] as const;

export const SCENARIO_LABELS = [
  "Initial: APY drop + Pendle shift",
  "APY recovering, TVL rising",
  "EarnETH paused, withdrawal resolved",
] as const;
