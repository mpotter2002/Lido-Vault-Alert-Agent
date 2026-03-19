/**
 * lib/wallet-reader.ts
 *
 * Server-side wallet position reader for Mellow flexible vaults.
 * Uses raw JSON-RPC eth_call — no external SDK required.
 *
 * Read strategy (in order):
 *   1. vault.shareManager()         → address of the separate ERC-20 share token
 *   2. shareManager.decimals()      → decimal places for formatting
 *   3. shareManager.balanceOf(wallet) → liquid vault shares (ERC-20, post-claim)
 *   4. vault.claimableSharesOf(wallet) → Mellow queue: shares minted but not yet
 *                                        transferred (pending claim after deposit)
 *   5. convertToAssets(totalShares) → underlying asset value (may revert on Mellow;
 *                                     inner try/catch shows share count instead)
 *
 * Why shareManager matters:
 *   Mellow flexible vaults separate the vault logic from the ERC-20 share token.
 *   The vault contract's balanceOf() intentionally reverts. The share token lives
 *   at the address returned by vault.shareManager(). After a user calls claim(),
 *   their shares are held as ERC-20 tokens in the shareManager contract.
 *
 * Why claimableSharesOf matters:
 *   After a deposit is queued and the curator processes it, shares are held in
 *   the vault's claim module before the depositor calls claim(). During this
 *   window, shareManager.balanceOf() returns 0 even though the depositor has a
 *   real position. claimableSharesOf() on the vault captures this pending balance.
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

// shareManager() → 0x5c60173d  (Mellow IVaultModule: returns the ERC-20 share token address)
const SEL_SHARE_MANAGER = "0x5c60173d";
// balanceOf(address) → 0x70a08231  (called on shareManager, not the vault)
const SEL_BALANCE_OF = "0x70a08231";
// decimals() → 0x313ce567  (called on shareManager)
const SEL_DECIMALS = "0x313ce567";
// convertToAssets(uint256) → 0x07a2d13a  (may revert; inner try/catch)
const SEL_CONVERT_TO_ASSETS = "0x07a2d13a";
// claimableSharesOf(address) → 0x1c14724f  (called on vault; Mellow queue shares pre-claim)
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
    // 1. shareManager() → the separate ERC-20 share token contract
    //    Mellow flexible vaults delegate ERC-20 accounting to a separate shareManager.
    //    balanceOf / decimals must be called on the shareManager, not the vault itself.
    const smResult = await ethCall(contractAddress, SEL_SHARE_MANAGER, rpcUrl);
    const shareManagerAddress = "0x" + smResult.slice(-40);

    // 2. decimals() on shareManager — needed for formatting
    const decResult = await ethCall(shareManagerAddress, SEL_DECIMALS, rpcUrl);
    const decimals = Number(decodeUint256(decResult));
    const safeDecimals = decimals > 0 && decimals <= 30 ? decimals : 18;

    // 3. balanceOf(wallet) on shareManager → liquid shares (ERC-20, post-claim)
    const balData = SEL_BALANCE_OF + encodeAddress(wallet);
    const balResult = await ethCall(shareManagerAddress, balData, rpcUrl);
    const shares = decodeUint256(balResult);

    // 4. claimableSharesOf(wallet) on vault → Mellow queue shares (may revert on non-queue vaults)
    let claimableShares = BigInt(0);
    try {
      const claimData = SEL_CLAIMABLE_SHARES_OF + encodeAddress(wallet);
      const claimResult = await ethCall(contractAddress, claimData, rpcUrl);
      claimableShares = decodeUint256(claimResult);
    } catch {
      // Not a ShareModule vault or wallet has no claimable — safe to ignore
    }

    const totalShares = shares + claimableShares;

    // 5. convertToAssets(totalShares) — if any shares exist; else 0 assets.
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
