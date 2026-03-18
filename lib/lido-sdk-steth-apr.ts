/**
 * lib/lido-sdk-steth-apr.ts
 *
 * Fetches the current stETH APR directly from the Ethereum mainnet using
 * the official @lidofinance/lido-ethereum-sdk.
 *
 * What the SDK does here:
 *   - Queries the stETH contract on-chain for the most recent TokenRebased event
 *   - Computes APR from the pre/post total ether and shares in that event
 *   - Returns the instantaneous APR from the last rebase (not a time-weighted average)
 *
 * This is used as a SECONDARY source for the stETH benchmark, tried only when
 * the primary Lido staking-stats REST API call fails. It gives the app an
 * on-chain fallback that doesn't depend on Lido's API infrastructure.
 *
 * What the SDK does NOT solve for this project:
 *   - EarnETH / EarnUSD vault reads: the SDK's stvault module targets Lido's
 *     own staking vaults (validator-level), not the Mellow Finance ERC-4626
 *     vaults we monitor. Wallet balance, TVL, and strategy reads for
 *     EarnETH/EarnUSD stay on the raw JSON-RPC path in wallet-reader.ts.
 *   - Vault APY: DeFiLlama remains the right source for Mellow vault APY.
 *   - Pending withdrawal queues: not available from the SDK for these vaults.
 *
 * Requires: ETH_RPC_URL env var (or falls back to cloudflare-eth.com).
 * Never throws; returns null on any failure so callers can fall through gracefully.
 */

// Dynamic import to avoid issues with ESM interop at build time.
// The SDK is CJS-compatible (dual exports); we use the CJS path via require().
/* eslint-disable @typescript-eslint/no-explicit-any */

const DEFAULT_RPC = "https://cloudflare-eth.com";
const MAINNET_CHAIN_ID = 1;

/**
 * Fetch the most recent stETH APR from the last on-chain rebase event.
 *
 * Returns the APR as a number (e.g. 3.42 for 3.42%), or null on any error.
 * Applies sanity bounds: 0.5% – 15% (outside that range, something is wrong).
 */
export async function fetchStEthAprFromChain(): Promise<{
  apr: number;
  asOf: string;
} | null> {
  const rpcUrl = process.env.ETH_RPC_URL ?? DEFAULT_RPC;
  try {
    // Use dynamic require to keep this server-only and avoid Next.js bundling issues.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { LidoSDKApr } = require(
      "@lidofinance/lido-ethereum-sdk/statistics"
    ) as { LidoSDKApr: any };

    const aprInstance = new LidoSDKApr({
      chainId: MAINNET_CHAIN_ID,
      rpcUrls: [rpcUrl],
      logMode: "none",
    });

    const apr: number = await Promise.race([
      aprInstance.getLastApr(),
      // Timeout: on-chain event queries can be slow — cap at 8 s.
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("SDK APR fetch timed out")), 8000)
      ),
    ]);

    if (typeof apr !== "number" || isNaN(apr) || apr < 0.5 || apr > 15) {
      return null;
    }

    return {
      apr: Math.round(apr * 10000) / 10000,
      asOf: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
