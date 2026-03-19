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
 *   vault=earnETH|earnUSD  — filter to a single vault
 *   wallet=0x...           — override monitored wallet address
 *
 * Example MCP agent call:
 *   GET /api/health?vault=earnETH
 *   GET /api/health?vault=earnETH&wallet=0xYourAddress
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const vaultFilter = searchParams.get("vault");
  const walletOverride = searchParams.get("wallet");
  const wallet = walletOverride ?? MONITORED_WALLET;

  const health = await buildHealthResponse(wallet);

  const vaults = vaultFilter
    ? health.vaults.filter((v) => v.vaultId === vaultFilter)
    : health.vaults;

  return NextResponse.json({ ...health, vaults });
}
