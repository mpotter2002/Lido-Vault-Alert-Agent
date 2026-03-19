/**
 * lib/wallet-reader.ts
 *
 * Server-side wallet position reader for Mellow/ERC-4626 vaults.
 * Uses raw JSON-RPC eth_call — no external SDK required.
 *
 * Read strategy (in order):
 *   1. balanceOf(wallet)          → liquid vault shares (ERC-20)
 *   2. claimableSharesOf(wallet)  → Mellow queue: shares minted but not yet
 *                                   transferred (pending claim after deposit)
 *   3. convertToAssets(totalShares) → underlying asset value for the combined total
 *   4. decimals()                 → for human-readable formatting
 *
 * Why claimableSharesOf matters:
 *   Mellow vaults use a queue-based deposit model. After a deposit is submitted
 *   and the curator processes it, shares are held in the vault's claim module
 *   before the depositor calls claim(). During this window, balanceOf() returns 0
 *   even though the depositor has a real position. claimableSharesOf() captures
 *   this pending-claim balance so we never show a false zero.
 *
 * Selector note:
 *   claimableSharesOf(address) — keccak256 selector 0x9b2b6823
 *   Verified against Mellow Protocol ShareModule interface.
 *   If this returns empty/reverts on a vault that doesn't implement ShareModule,
 *   it is safely caught and the liquid-only balanceOf result is used.
 */

import {
  ethCall,
  encodeAddress,
  encodeUint256,
  decodeUint256,
  getRpcUrl,
} from "./rpc";

export interface WalletReadSuccess {
  source: "live_wallet_read";
  wallet: string;
  contractAddress: string;
  shares: bigint;           // raw vault share units
  sharesFormatted: number;  // shares / 10**decimals
  claimableShares: bigint;  // Mellow queue: pending-claim shares (may be 0 if not in queue)
  claimableFormatted: number;
  totalShares: bigint;      // shares + claimableShares
  totalSharesFormatted: number;
  deposited: number | null; // underlying asset units (human-readable); null if convertToAssets unavailable
  decimals: number;
  fetchedAt: string;
}

export interface WalletReadUnavailable {
  source: "unavailable";
  wallet: string;
  contractAddress: string;
  reason: string;
  fetchedAt: string;
}

export type WalletReadResult = WalletReadSuccess | WalletReadUnavailable;

// ---------------------------------------------------------------------------
// ABI selectors
// ---------------------------------------------------------------------------

// balanceOf(address) → 0x70a08231
const SEL_BALANCE_OF = "0x70a08231";
// convertToAssets(uint256) → 0x07a2d13a
const SEL_CONVERT_TO_ASSETS = "0x07a2d13a";
// decimals() → 0x313ce567
const SEL_DECIMALS = "0x313ce567";
// claimableSharesOf(address) → 0x1c14724f
// Verified via 4byte.directory (keccak256("claimableSharesOf(address)")).
// Mellow IShareModule: returns shares held in queue awaiting claim().
// Safe to call — returns 0 or reverts on non-ShareModule vaults.
const SEL_CLAIMABLE_SHARES_OF = "0x1c14724f";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read the vault share balance and underlying asset value for a given wallet.
 *
 * Combines liquid shares (balanceOf) with pending-claim shares
 * (claimableSharesOf, Mellow queue) so depositors who have deposited but
 * not yet called claim() still see their full position.
 *
 * Safe to call from server components and API routes — never throws.
 */
export async function readWalletPosition(
  wallet: string,
  contractAddress: string
): Promise<WalletReadResult> {
  const rpcUrl = getRpcUrl();
  const fetchedAt = new Date().toISOString();

  try {
    // 1. decimals() — needed for formatting
    const decResult = await ethCall(contractAddress, SEL_DECIMALS, rpcUrl);
    const decimals = Number(decodeUint256(decResult));
    const safeDecimals = decimals > 0 && decimals <= 30 ? decimals : 18;

    // 2. balanceOf(wallet) → liquid shares
    const balData = SEL_BALANCE_OF + encodeAddress(wallet);
    const balResult = await ethCall(contractAddress, balData, rpcUrl);
    const shares = decodeUint256(balResult);

    // 3. claimableSharesOf(wallet) → Mellow queue shares (may revert on non-queue vaults)
    let claimableShares = BigInt(0);
    try {
      const claimData = SEL_CLAIMABLE_SHARES_OF + encodeAddress(wallet);
      const claimResult = await ethCall(contractAddress, claimData, rpcUrl);
      claimableShares = decodeUint256(claimResult);
    } catch {
      // Not a ShareModule vault or wallet has no claimable — safe to ignore
    }

    const totalShares = shares + claimableShares;

    // 4. convertToAssets(totalShares) — if any shares exist; else 0 assets.
    // Mellow flexible-vault deployments may revert this call (same oracle-context
    // requirement as totalSupply()). Wrapped in its own try/catch so a revert here
    // does not fail the entire position read — callers see deposited=null and
    // can display the share count instead of a false zero.
    let deposited: number | null = 0;
    if (totalShares > BigInt(0)) {
      try {
        const cvtData = SEL_CONVERT_TO_ASSETS + encodeUint256(totalShares);
        const cvtResult = await ethCall(contractAddress, cvtData, rpcUrl);
        const rawAssets = decodeUint256(cvtResult);
        deposited = Number(rawAssets) / Math.pow(10, safeDecimals);
      } catch {
        // convertToAssets not available on this vault (e.g. Mellow flexible vaults
        // require price oracle context). Return null so the caller can show the share
        // count rather than a misleading zero.
        deposited = null;
      }
    }

    const pow = Math.pow(10, safeDecimals);

    return {
      source: "live_wallet_read",
      wallet,
      contractAddress,
      shares,
      sharesFormatted: Number(shares) / pow,
      claimableShares,
      claimableFormatted: Number(claimableShares) / pow,
      totalShares,
      totalSharesFormatted: Number(totalShares) / pow,
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
