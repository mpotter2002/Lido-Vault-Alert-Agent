import { NextResponse } from "next/server";
import { buildHealthResponse } from "@/lib/health-builder";

const MONITORED_WALLET =
  process.env.MONITORED_WALLET ?? "0x8f7fD8947DE49C3FFCd4B25C03249B6D997f6112";

/**
 * GET /api/health
 *
 * MCP-friendly vault health query surface.
 * Returns a full health summary for each monitored vault including:
 *   - live vault health status (on-chain paused() read)
 *   - live TVL (on-chain totalAssets())
 *   - live APY (DeFiLlama Mellow Protocol pools)
 *   - benchmark comparison (yield vs stETH APY / Aave USDC rate)
 *   - allocation snapshot across Aave, Morpho, Pendle, Gearbox, Maple
 *   - recommendation (action, headline, rationale)
 *   - wallet position (live balanceOf + Mellow claimableSharesOf)
 *   - active alert count
 *   - data freshness per field
 *
 * Query params:
 *   vault=earnETH|earnUSD        — filter to a single vault
 *   wallet=0x...                 — single wallet to check position for
 *   wallets=0x...,0x...,0x...   — comma-separated list of wallets (multi-wallet mode)
 *                                  returns perWalletHealth array alongside merged vaults
 *
 * Example MCP agent call:
 *   GET /api/health?vault=earnETH
 *   GET /api/health?vault=earnETH&wallet=0xYourAddress
 *   GET /api/health?wallets=0xWallet1,0xWallet2
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const vaultFilter = searchParams.get("vault");
  const walletsParam = searchParams.get("wallets");
  const walletOverride = searchParams.get("wallet");

  // Multi-wallet mode: wallets=0x...,0x...
  if (walletsParam) {
    const walletList = walletsParam
      .split(",")
      .map((w) => w.trim())
      .filter((w) => /^0x[0-9a-fA-F]{40}$/.test(w));

    if (walletList.length === 0) {
      return NextResponse.json(
        { error: "No valid wallet addresses in wallets param (expected 0x-prefixed hex)" },
        { status: 400 }
      );
    }

    const responses = await Promise.all(walletList.map((w) => buildHealthResponse(w)));
    const perWalletHealth = walletList.map((wallet, i) => ({
      wallet,
      vaults: vaultFilter
        ? responses[i].vaults.filter((v) => v.vaultId === vaultFilter)
        : responses[i].vaults,
    }));

    // Use the first wallet's response as the base (vault-level data is identical across wallets)
    const base = responses[0];
    const vaults = vaultFilter
      ? base.vaults.filter((v) => v.vaultId === vaultFilter)
      : base.vaults;

    return NextResponse.json({
      ...base,
      wallets: walletList,
      wallet: walletList[0],
      vaults,
      perWalletHealth,
    });
  }

  // Single wallet mode
  const wallet = walletOverride ?? MONITORED_WALLET;
  const health = await buildHealthResponse(wallet);

  const vaults = vaultFilter
    ? health.vaults.filter((v) => v.vaultId === vaultFilter)
    : health.vaults;

  return NextResponse.json({ ...health, vaults });
}
