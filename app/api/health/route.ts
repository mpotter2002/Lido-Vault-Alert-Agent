import { NextResponse } from "next/server";
import { MOCK_POSITIONS, DEMO_WALLET } from "@/lib/mock-data";
import { buildHealthResponse } from "@/lib/health-builder";

/**
 * GET /api/health
 *
 * MCP-friendly vault health query surface.
 * Returns a full health summary for each monitored vault including:
 *   - vault health status
 *   - benchmark comparison (yield vs stETH APY / Aave USDC rate)
 *   - allocation snapshot across Aave, Morpho, Pendle, Gearbox, Maple
 *   - recommendation (action, headline, rationale)
 *   - active alert count
 *   - data freshness / source status
 *
 * Query params:
 *   vault=earnETH|earnUSD  — filter to a single vault
 *
 * Example MCP agent call:
 *   GET /api/health?vault=earnETH
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const vaultFilter = searchParams.get("vault");

  const health = buildHealthResponse(DEMO_WALLET, MOCK_POSITIONS);

  const vaults = vaultFilter
    ? health.vaults.filter((v) => v.vaultId === vaultFilter)
    : health.vaults;

  return NextResponse.json({ ...health, vaults });
}
