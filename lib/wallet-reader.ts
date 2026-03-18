/**
 * lib/wallet-reader.ts
 *
 * Server-side EVM wallet position reader using raw JSON-RPC eth_call.
 * No external SDK dependencies — uses the native fetch API.
 *
 * What it reads:
 *   1. balanceOf(wallet)          → vault shares held by the wallet (ERC-20)
 *   2. convertToAssets(shares)    → underlying asset amount    (ERC-4626)
 *   3. decimals()                 → asset decimal places for human-readable formatting
 *
 * Configuration:
 *   ETH_RPC_URL  (env var) — Ethereum mainnet JSON-RPC endpoint.
 *                            Defaults to https://cloudflare-eth.com (public, no key needed).
 *
 * Failure handling:
 *   All errors are caught and returned as WalletReadResult { source: "unavailable" }.
 *   Never throws. The caller decides whether to surface the error.
 *
 * Limitations (honest, as of this build):
 *   - Pending deposit / withdrawal queues require vault-specific internal state reads
 *     (e.g. ERC-4626 async withdrawal queue or Morpho/Pendle subgraph).
 *     They are NOT readable via a simple balanceOf / convertToAssets call.
 *     Those fields remain "unavailable" until we wire the relevant subgraph / event queries.
 */

export interface WalletReadSuccess {
  source: "live_wallet_read";
  wallet: string;
  contractAddress: string;
  shares: bigint;       // raw vault share token units
  sharesFormatted: number; // shares / 10**decimals
  deposited: number;    // underlying asset units (human-readable)
  decimals: number;
  fetchedAt: string;    // ISO timestamp
}

export interface WalletReadUnavailable {
  source: "unavailable";
  wallet: string;
  contractAddress: string;
  reason: string;       // human-readable explanation of why the read failed
  fetchedAt: string;
}

export type WalletReadResult = WalletReadSuccess | WalletReadUnavailable;

// ---------------------------------------------------------------------------
// ABI selectors (4-byte keccak256 of function signature)
// ---------------------------------------------------------------------------

// balanceOf(address) → 0x70a08231
const SEL_BALANCE_OF = "0x70a08231";
// convertToAssets(uint256) → 0x07a2d13a
const SEL_CONVERT_TO_ASSETS = "0x07a2d13a";
// decimals() → 0x313ce567
const SEL_DECIMALS = "0x313ce567";
// totalAssets() → 0x01e1d4aa  (ERC-4626 standard)
const SEL_TOTAL_ASSETS = "0x01e1d4aa";

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

function encodeAddress(addr: string): string {
  // address padded to 32 bytes (no 0x prefix in payload)
  return addr.replace(/^0x/, "").toLowerCase().padStart(64, "0");
}

function encodeUint256(n: bigint): string {
  return n.toString(16).padStart(64, "0");
}

function decodeUint256(hex: string): bigint {
  const cleaned = hex.replace(/^0x/, "");
  if (!cleaned || cleaned === "0".repeat(64)) return BigInt(0);
  return BigInt("0x" + cleaned.slice(0, 64));
}

// ---------------------------------------------------------------------------
// Raw JSON-RPC call
// ---------------------------------------------------------------------------

const DEFAULT_RPC = "https://cloudflare-eth.com";

async function ethCall(
  to: string,
  data: string,
  rpcUrl: string
): Promise<string> {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ to, data }, "latest"],
  });

  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    // 5-second timeout via AbortSignal
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    throw new Error(`RPC HTTP ${res.status}: ${res.statusText}`);
  }

  const json = (await res.json()) as { result?: string; error?: { message: string } };
  if (json.error) {
    throw new Error(`RPC error: ${json.error.message}`);
  }
  if (!json.result || json.result === "0x") {
    throw new Error("RPC returned empty result — contract may not exist on this network");
  }
  return json.result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Vault TVL reader — reads ERC-4626 totalAssets() from the vault contract
// ---------------------------------------------------------------------------

export interface VaultTvlSuccess {
  source: "live_vault_read";
  contractAddress: string;
  /** Total assets held by the vault in the vault's native asset (e.g. ETH or USDC). */
  totalAssetsNative: number;
  /**
   * Asset ticker for the native amount.
   * "USDC" → totalAssetsNative ≈ USD value.
   * "ETH"  → requires a price feed for USD conversion (not wired here).
   */
  asset: string;
  decimals: number;
  fetchedAt: string;
}

export interface VaultTvlUnavailable {
  source: "unavailable";
  contractAddress: string;
  asset: string;
  reason: string;
  fetchedAt: string;
}

export type VaultTvlResult = VaultTvlSuccess | VaultTvlUnavailable;

/**
 * Read the vault's total assets under management via ERC-4626 totalAssets().
 *
 * For earnUSD (USDC, 6 decimals): totalAssetsNative ≈ USD value.
 * For earnETH (ETH, 18 decimals): totalAssetsNative is in ETH; USD conversion
 *   requires a price feed that is not wired here.
 *
 * Never throws; returns { source: "unavailable", reason } on any failure.
 */
export async function readVaultTvl(
  contractAddress: string,
  asset: string
): Promise<VaultTvlResult> {
  const rpcUrl = process.env.ETH_RPC_URL ?? DEFAULT_RPC;
  const fetchedAt = new Date().toISOString();

  try {
    // 1. decimals() — needed to convert raw uint256 to human-readable units
    const decResult = await ethCall(contractAddress, SEL_DECIMALS, rpcUrl);
    const decimals = Number(decodeUint256(decResult));
    const safeDecimals = decimals > 0 && decimals <= 30 ? decimals : 18;

    // 2. totalAssets() — ERC-4626 total underlying assets
    const taResult = await ethCall(contractAddress, SEL_TOTAL_ASSETS, rpcUrl);
    const rawTotalAssets = decodeUint256(taResult);
    const totalAssetsNative = Number(rawTotalAssets) / Math.pow(10, safeDecimals);

    return {
      source: "live_vault_read",
      contractAddress,
      totalAssetsNative,
      asset,
      decimals: safeDecimals,
      fetchedAt,
    };
  } catch (err) {
    const reason =
      err instanceof Error ? err.message : "Unknown error during vault TVL read";
    return {
      source: "unavailable",
      contractAddress,
      asset,
      reason,
      fetchedAt,
    };
  }
}

/**
 * Read the vault share balance and underlying asset value for a given wallet.
 * Safe to call from server components and API routes; never throws.
 */
export async function readWalletPosition(
  wallet: string,
  contractAddress: string
): Promise<WalletReadResult> {
  const rpcUrl = process.env.ETH_RPC_URL ?? DEFAULT_RPC;
  const fetchedAt = new Date().toISOString();

  try {
    // 1. balanceOf(wallet) → shares
    const balData = SEL_BALANCE_OF + encodeAddress(wallet);
    const balResult = await ethCall(contractAddress, balData, rpcUrl);
    const shares = decodeUint256(balResult);

    // 2. decimals() — needed for human-readable formatting
    const decResult = await ethCall(contractAddress, SEL_DECIMALS, rpcUrl);
    const decimals = Number(decodeUint256(decResult));
    const safeDecimals = decimals > 0 && decimals <= 30 ? decimals : 18;

    // 3. convertToAssets(shares) — if shares > 0; else 0 assets
    let deposited = 0;
    if (shares > BigInt(0)) {
      const cvtData = SEL_CONVERT_TO_ASSETS + encodeUint256(shares);
      const cvtResult = await ethCall(contractAddress, cvtData, rpcUrl);
      const rawAssets = decodeUint256(cvtResult);
      deposited = Number(rawAssets) / Math.pow(10, safeDecimals);
    }

    const sharesFormatted = Number(shares) / Math.pow(10, safeDecimals);

    return {
      source: "live_wallet_read",
      wallet,
      contractAddress,
      shares,
      sharesFormatted,
      deposited,
      decimals: safeDecimals,
      fetchedAt,
    };
  } catch (err) {
    const reason =
      err instanceof Error ? err.message : "Unknown error during wallet read";
    return {
      source: "unavailable",
      wallet,
      contractAddress,
      reason,
      fetchedAt,
    };
  }
}
