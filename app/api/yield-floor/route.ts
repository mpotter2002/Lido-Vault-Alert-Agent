import { NextResponse } from "next/server";
import { MOCK_POSITIONS, DEMO_WALLET } from "@/lib/mock-data";
import { buildHealthResponse } from "@/lib/health-builder";

/**
 * GET /api/yield-floor
 *
 * MCP-callable yield-floor check.
 * Answers: "Is this vault's APY above its benchmark floor?"
 *
 * Query params:
 *   vault=earnETH|earnUSD  — required; which vault to check
 *   threshold_bps=<int>    — optional override floor in bps (e.g. -100)
 *
 * Response:
 *   {
 *     vault, vaultAPY, benchmarkName, benchmarkAPY,
 *     spreadBps, floorBps, belowFloor,
 *     recommendation: { action, headline, rationale },
 *     dataMode, freshness
 *   }
 *
 * Example:
 *   GET /api/yield-floor?vault=earnETH
 *   GET /api/yield-floor?vault=earnUSD&threshold_bps=-50
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const vaultFilter = searchParams.get("vault");
  const thresholdBpsParam = searchParams.get("threshold_bps");

  if (!vaultFilter) {
    return NextResponse.json(
      { error: "vault query param is required (earnETH or earnUSD)" },
      { status: 400 }
    );
  }

  const health = await buildHealthResponse(DEMO_WALLET, MOCK_POSITIONS);
  const vaultSummary = health.vaults.find((v) => v.vaultId === vaultFilter);

  if (!vaultSummary) {
    return NextResponse.json(
      { error: `Unknown vault: ${vaultFilter}. Valid values: earnETH, earnUSD` },
      { status: 404 }
    );
  }

  const bm = vaultSummary.benchmark;
  // Allow caller to override the floor threshold
  const effectiveFloorBps =
    threshold_bps_valid(thresholdBpsParam)
      ? parseInt(thresholdBpsParam!, 10)
      : bm.floorBps;

  const belowFloor = bm.spreadBps < effectiveFloorBps;

  return NextResponse.json({
    wallet: DEMO_WALLET,
    generatedAt: health.generatedAt,
    dataMode: health.dataMode,
    vault: vaultSummary.vaultName,
    vaultId: vaultFilter,
    health: vaultSummary.health,
    vaultAPY: bm.vaultAPY,
    benchmarkName: bm.benchmarkName,
    benchmarkAPY: bm.benchmarkAPY,
    spreadBps: bm.spreadBps,
    floorBps: effectiveFloorBps,
    belowFloor,
    recommendation: vaultSummary.recommendation,
    freshness: bm.freshness,
  });
}

function threshold_bps_valid(v: string | null): boolean {
  if (!v) return false;
  const n = parseInt(v, 10);
  return !isNaN(n);
}
