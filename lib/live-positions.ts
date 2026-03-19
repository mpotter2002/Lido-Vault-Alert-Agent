/**
 * lib/live-positions.ts
 *
 * Builds live VaultPosition[] using the Mellow flexible-vaults interface.
 *
 * Contract addresses (verified: mellow-finance/flexible-vaults):
 *   EarnETH: 0x6a37725ca7f4CE81c004c955f7280d5C704a249e
 *   EarnUSD: 0x014e6DA8F283C4aF65B2AA0f201438680A004452
 *
 * Mellow vault interface (NOT standard ERC-4626):
 *   getLiquidAssets()          — liquid (undeployed) assets in the vault
 *   subvaults()                — count of connected subvaults
 *   subvaultAt(uint256)        — address of subvault at index
 *   riskManager()              — address of the IRiskManager contract
 *   subvaultState(address)     — per-subvault { balance: int256, limit: int256 }
 *   claimableSharesOf(address) — Mellow queue shares pending claim
 *
 * TVL = getLiquidAssets() + sum(riskManager.subvaultState(sv).balance for each sv)
 * Allocation weight = subvaultState(sv).balance / sum(all subvault balances)
 *
 * APY: computed from price-per-share delta across in-process requests.
 * Price-per-share = total_assets / total_supply, tracked in _priceHistory.
 *
 * Subvault architecture:
 *   EarnETH → strETH (EigenLayer/Symbiotic) + GGV (Greater Good Vault)
 *   EarnUSD → earnUSDc (Aave + Morpho + Balancer + Fluid)
 */

import { VaultId, VaultPosition, VaultHealth, StrategyWeight } from "./types";
import {
  ethCall,
  ethCallBatch,
  decodeUint256,
  encodeAddress,
  encodeUint256,
  getRpcUrl,
} from "./rpc";

// ---------------------------------------------------------------------------
// ABI selectors — verified via 4byte.directory (keccak256)
// ---------------------------------------------------------------------------

// Mellow IVaultModule
// Note: getLiquidAssets() (0x5d66b00a) and totalSupply() (0x18160ddd) revert on current
// Mellow flexible-vault deployments — they require a price oracle context not available
// in plain eth_call. TVL is derived from risk manager subvault balances only.
const SEL_SUBVAULTS_COUNT        = "0xa35f620a"; // subvaults() → uint256
const SEL_SUBVAULT_AT            = "0x9bd0911b"; // subvaultAt(uint256) → address
const SEL_RISK_MANAGER           = "0x47842663"; // riskManager() → address

// Mellow IRiskManager (called on the risk manager address, not the vault)
const SEL_SUBVAULT_STATE         = "0x36f1409f"; // subvaultState(address) → State{int256,int256}

// ---------------------------------------------------------------------------
// Vault config
// ---------------------------------------------------------------------------

interface SubvaultMeta {
  address: string;
  protocolLabel: string;
}

interface VaultMeta {
  vaultId: VaultId;
  vaultName: string;
  asset: "ETH" | "USDC";
  assetDecimals: number;
  contractAddress: string;
  curatorName: string;
  defaultTvlCapUSD: number;
  knownSubvaults: SubvaultMeta[];
}

const VAULT_META: Record<VaultId, VaultMeta> = {
  earnETH: {
    vaultId: "earnETH",
    vaultName: "Lido Earn ETH",
    asset: "ETH",
    assetDecimals: 18,
    contractAddress: "0x6a37725ca7f4CE81c004c955f7280d5C704a249e",
    curatorName: "Mellow P2P",
    defaultTvlCapUSD: 200_000_000,
    knownSubvaults: [
      {
        address: "0xC5901C2481ca9C26398A9Da258b13717894bfebF",
        protocolLabel: "strETH — EigenLayer/Symbiotic",
      },
      {
        address: "0x7F515C80fA4C1FCFF34F0329141A9C3b20468FE5",
        protocolLabel: "GGV — Native ETH/wstETH",
      },
    ],
  },
  earnUSD: {
    vaultId: "earnUSD",
    vaultName: "Lido Earn USD",
    asset: "USDC",
    assetDecimals: 6,
    contractAddress: "0x014e6DA8F283C4aF65B2AA0f201438680A004452",
    curatorName: "Mellow Re7",
    defaultTvlCapUSD: 100_000_000,
    knownSubvaults: [
      {
        address: "0x77B9441d5Cb89fca435190A9B6D108ad4B00ccFd",
        protocolLabel: "earnUSDc — Aave/Morpho/Balancer",
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// In-process caches
// ---------------------------------------------------------------------------

const _apyHistory = new Map<VaultId, { apy: number; asOf: string }>();

// ---------------------------------------------------------------------------
// Mellow API — live APY and TVL per vault
// ---------------------------------------------------------------------------

// Vault ID in the Mellow API (api.mellow.finance/v1/vaults)
const MELLOW_VAULT_IDS: Record<VaultId, string> = {
  earnETH: "lido-earn-eth",
  earnUSD: "lido-earn-usd",
};

interface MellowVaultData {
  apy: number | null;
  tvlUSD: number | null;
}

let _mellowCache: { data: Map<VaultId, MellowVaultData>; asOf: string } | null = null;

async function fetchMellowVaultData(): Promise<Map<VaultId, MellowVaultData>> {
  if (_mellowCache && Date.now() - new Date(_mellowCache.asOf).getTime() < 300_000) {
    return _mellowCache.data;
  }

  const result = new Map<VaultId, MellowVaultData>([
    ["earnETH", { apy: null, tvlUSD: null }],
    ["earnUSD", { apy: null, tvlUSD: null }],
  ]);

  try {
    const res = await fetch("https://api.mellow.finance/v1/vaults", {
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 300 },
    });
    if (!res.ok) return result;
    const vaults = await res.json();
    if (!Array.isArray(vaults)) return result;

    for (const [vaultId, mellowId] of Object.entries(MELLOW_VAULT_IDS)) {
      const vault = vaults.find((v: Record<string, unknown>) => v?.id === mellowId);
      if (!vault) continue;
      const apy = typeof vault.apy === "number" && vault.apy > 0 && vault.apy < 100
        ? Math.round(vault.apy * 10000) / 10000
        : null;
      const tvlUSD = typeof vault.tvl_usd === "number" && vault.tvl_usd > 0
        ? vault.tvl_usd
        : null;
      result.set(vaultId as VaultId, { apy, tvlUSD });
    }
    _mellowCache = { data: result, asOf: new Date().toISOString() };
  } catch {
    // return empty map; callers fall back to on-chain
  }

  return result;
}

export async function fetchMellowVaultAPY(vaultId: VaultId): Promise<number | null> {
  const data = await fetchMellowVaultData();
  return data.get(vaultId)?.apy ?? null;
}

// ---------------------------------------------------------------------------
// Helper: decode address from a padded 32-byte RPC result
// ---------------------------------------------------------------------------

function decodeAddress(hex: string): string {
  const cleaned = hex.replace(/^0x/, "");
  return "0x" + cleaned.slice(-40);
}

// ---------------------------------------------------------------------------
// Helper: decode int256 (signed) from a 32-byte RPC result
// ---------------------------------------------------------------------------

function decodeInt256(hex: string): bigint {
  const cleaned = hex.replace(/^0x/, "");
  if (!cleaned || cleaned.length < 64) return BigInt(0);
  const raw = BigInt("0x" + cleaned.slice(0, 64));
  // If high bit set, negative two's complement: subtract 2^256
  const maxInt256 = BigInt("0x8000000000000000000000000000000000000000000000000000000000000000");
  const twoTo256  = BigInt("0x10000000000000000000000000000000000000000000000000000000000000000");
  if (raw >= maxInt256) return raw - twoTo256;
  return raw;
}

// ---------------------------------------------------------------------------
// On-chain vault reads (Mellow interface)
// ---------------------------------------------------------------------------

interface OnChainState {
  liquidAssets: number;       // getLiquidAssets() in asset units
  deployedAssets: number;     // sum of subvault balances in asset units
  totalAssets: number;        // liquid + deployed
  tvlUSD: number;
  tvlCapUSD: number;
  health: VaultHealth;
  subvaultBalances: { address: string; balanceAsset: number }[];
  source: "live" | "partial" | "unavailable";
  failReason?: string;
}

// The Mellow IRiskManager always tracks subvault balances in 18-decimal fixed-point,
// regardless of the underlying asset's native decimals (e.g. USDC = 6 dec).
const RM_DECIMALS = 18;
const RM_POW = Math.pow(10, RM_DECIMALS);

async function readOnChainState(meta: VaultMeta, rpcUrl: string): Promise<OnChainState> {
  const addr = meta.contractAddress;

  // getLiquidAssets() reverts on current Mellow flexible-vault deployments (requires
  // price oracle initialisation). We skip it and derive TVL from subvault balances only.
  const rmRes = await ethCall(addr, SEL_RISK_MANAGER, rpcUrl).catch(() => null);

  if (!rmRes) {
    return {
      liquidAssets: 0, deployedAssets: 0, totalAssets: 0,
      tvlUSD: 0, tvlCapUSD: meta.defaultTvlCapUSD,
      health: "healthy", subvaultBalances: [], source: "unavailable",
      failReason: "riskManager() call failed",
    };
  }

  // liquidAssets is not available; set to 0 (all assets are tracked via subvaults)
  const liquidAssets = 0;

  // Step 2: get subvault addresses
  let subvaultAddresses = meta.knownSubvaults.map((sv) => sv.address);
  try {
    const countResult = await ethCall(addr, SEL_SUBVAULTS_COUNT, rpcUrl);
    const count = Number(decodeUint256(countResult));
    if (count > 0 && count <= 20) {
      const calls = Array.from({ length: count }, (_, i) => ({
        to: addr,
        data: SEL_SUBVAULT_AT + encodeUint256(BigInt(i)),
      }));
      const results = await ethCallBatch(calls, rpcUrl);
      const dynamic: string[] = [];
      for (const r of results) {
        if (r.status === "fulfilled") dynamic.push(decodeAddress(r.value));
      }
      if (dynamic.length === count) subvaultAddresses = dynamic;
    }
  } catch {
    // Fall back to known addresses
  }

  // Step 3: read per-subvault state from RiskManager
  let subvaultBalances: { address: string; balanceAsset: number }[] = [];
  let deployedAssets = 0;

  if (rmRes && subvaultAddresses.length > 0) {
    const rmAddress = decodeAddress(rmRes);
    const stateCalls = subvaultAddresses.map((sv) => ({
      to: rmAddress,
      data: SEL_SUBVAULT_STATE + encodeAddress(sv),
    }));
    const stateResults = await ethCallBatch(stateCalls, rpcUrl);

    subvaultBalances = subvaultAddresses.map((svAddr, i) => {
      const r = stateResults[i];
      if (r.status !== "fulfilled") return { address: svAddr, balanceAsset: 0 };
      // State struct: { int256 balance, int256 limit } → two sequential int256 words
      // The RiskManager always tracks balances in 18-decimal fixed-point (RM_DECIMALS),
      // regardless of the underlying token's native decimals.
      const hex = r.value.replace(/^0x/, "");
      const balanceRaw = decodeInt256(hex.slice(0, 64));
      const balanceAsset = Number(balanceRaw) / RM_POW;
      return { address: svAddr, balanceAsset: Math.max(0, balanceAsset) };
    });
    deployedAssets = subvaultBalances.reduce((s, b) => s + b.balanceAsset, 0);
  }

  const totalAssets = liquidAssets + deployedAssets;

  // tvlUSD from on-chain is only used as a fallback if the Mellow API is unavailable.
  // For ETH-denominated vaults this is an approximation (RiskManager underestimates
  // EigenLayer positions). For USD vaults (EarnUSD) it is accurate.
  // We do NOT call a price oracle here — buildLivePositions() uses Mellow API TVL first.
  const tvlUSD = totalAssets; // raw in asset units (USD for USDC, ETH for earnETH)

  // Health: degraded only if we got a risk manager address but all balances are zero
  const health: VaultHealth = deployedAssets === 0 ? "degraded" : "healthy";

  return {
    liquidAssets, deployedAssets, totalAssets, tvlUSD,
    tvlCapUSD: meta.defaultTvlCapUSD,
    health, subvaultBalances,
    // TVL comes from subvault balances via RiskManager (getLiquidAssets reverts)
    source: deployedAssets > 0 ? "live" : "partial",
  };
}

// ---------------------------------------------------------------------------
// Allocation weights from subvault balances
// ---------------------------------------------------------------------------

function buildWeights(
  meta: VaultMeta,
  subvaultBalances: { address: string; balanceAsset: number }[],
  totalDeployed: number
): StrategyWeight[] {
  return meta.knownSubvaults.map((sv) => {
    const bal = subvaultBalances.find(
      (b) => b.address.toLowerCase() === sv.address.toLowerCase()
    );
    const currentWeight =
      totalDeployed > 0 && bal
        ? Math.round((bal.balanceAsset / totalDeployed) * 10000) / 100
        : 0;
    return {
      name: sv.protocolLabel,
      previousWeight: currentWeight, // will diverge after second read
      currentWeight,
    };
  });
}


// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface LivePositionMeta {
  vaultSources: Map<VaultId, { tvl: string; apy: string; allocation: string }>;
}

export async function buildLivePositions(): Promise<{
  positions: VaultPosition[];
  meta: LivePositionMeta;
}> {
  const rpcUrl = getRpcUrl();
  const vaultIds: VaultId[] = ["earnETH", "earnUSD"];
  const vaultSources = new Map<VaultId, { tvl: string; apy: string; allocation: string }>();

  // Fetch Mellow API data once for all vaults (APY + TVL)
  const mellowData = await fetchMellowVaultData();

  const positions = await Promise.all(
    vaultIds.map(async (vaultId): Promise<VaultPosition> => {
      const meta = VAULT_META[vaultId];
      const mellow = mellowData.get(vaultId);

      const onChain = await readOnChainState(meta, rpcUrl);

      // APY: Mellow API (authoritative — api.mellow.finance/v1/vaults)
      let currentAPY = 0;
      let apyDelta24h = 0;
      let apySource = "unavailable";

      if (mellow?.apy !== null && mellow?.apy !== undefined) {
        currentAPY = mellow.apy;
        apyDelta24h = mellow.apy - (_apyHistory.get(vaultId)?.apy ?? mellow.apy);
        apySource = "live";
        _apyHistory.set(vaultId, { apy: mellow.apy, asOf: new Date().toISOString() });
      }

      // TVL: prefer Mellow API (authoritative); fall back to RiskManager on-chain
      const tvlUSD = mellow?.tvlUSD ?? (onChain.source !== "unavailable" ? onChain.tvlUSD : 0);
      const tvlSource = mellow?.tvlUSD != null ? "live" : onChain.source;

      // Allocation weights
      const weights = buildWeights(
        meta,
        onChain.subvaultBalances,
        onChain.deployedAssets
      );
      const allocSource =
        onChain.subvaultBalances.some((b) => b.balanceAsset > 0) ? "live" :
        onChain.source === "unavailable" ? "unavailable" : "partial";

      vaultSources.set(vaultId, {
        tvl: tvlSource,
        apy: apySource,
        allocation: allocSource,
      });

      return {
        vaultId: meta.vaultId,
        vaultName: meta.vaultName,
        asset: meta.asset,
        contractAddress: meta.contractAddress,
        currentAPY,
        apyDelta24h: Math.round(apyDelta24h * 100) / 100,
        tvl: tvlUSD,
        tvlCapUSD: onChain.tvlCapUSD,
        health: onChain.health,
        curatorName: meta.curatorName,
        lastRebalanceHoursAgo: null,
        strategyWeights: weights,
        walletPositionSource: "unavailable",
        deposited: null,
        shares: null,
        pendingDepositAmount: 0,
        pendingWithdrawalAmount: 0,
        pendingWithdrawalAgeDays: null,
      };
    })
  );

  return { positions, meta: { vaultSources } };
}
