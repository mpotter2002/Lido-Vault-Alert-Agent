import { VaultPosition } from "./types";

export const MOCK_POSITIONS: VaultPosition[] = [
  {
    vaultId: "earnETH",
    vaultName: "Lido Earn ETH",
    asset: "ETH",
    contractAddress: "0x7047F90229a057C13BF847C0744D646CFb6c9E1a",
    deposited: 2.0,
    shares: 1.9847,
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
    strategyWeights: [
      { name: "stETH / wstETH LP", previousWeight: 60, currentWeight: 45 },
      { name: "wstETH Morpho Supply", previousWeight: 40, currentWeight: 55 },
    ],
  },
  {
    vaultId: "earnUSD",
    vaultName: "Lido Earn USD",
    asset: "USDC",
    contractAddress: "0x4f3166003E149C1B6E7E01cEa4B5Bb9FeD62aBCf",
    deposited: 5000,
    shares: 4989.12,
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
    strategyWeights: [
      { name: "USDC Aave v3 Supply", previousWeight: 50, currentWeight: 50 },
      { name: "USDC Morpho Curated", previousWeight: 35, currentWeight: 38 },
      { name: "Cash Reserve", previousWeight: 15, currentWeight: 12 },
    ],
  },
];

// Simulate a refreshed state with a new scenario
export const MOCK_POSITIONS_REFRESH: VaultPosition[] = [
  {
    ...MOCK_POSITIONS[0],
    currentAPY: 3.1,
    apyDelta24h: 0.3,
    pendingWithdrawalAgeDays: 4, // still pending but APY recovering
  },
  {
    ...MOCK_POSITIONS[1],
    tvl: 93_000_000, // closer to cap
    currentAPY: 5.1,
    pendingDepositAmount: 0, // deposit deployed
  },
];
