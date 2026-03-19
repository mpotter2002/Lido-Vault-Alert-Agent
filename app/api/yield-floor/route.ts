import { NextResponse } from "next/server";
import { buildHealthResponse } from "@/lib/health-builder";

const MONITORED_WALLET =
  process.env.MONITORED_WALLET ?? "0x8f7fD8947DE49C3FFCd4B25C03249B6D997f6112";

/**
 * GET /api/yield-floor
 *
 * MCP-callable yield-floor check using live vault data.
 * Answers: "Is this vault's APY above its benchmark floor right now?"
 *
 * Query params:
 *   vault=earnETH|earnUSD  — required; which vault to check
 *   threshold_bps=<int>    — optional override floor in bps (e.g. -100)
 *   wallet=0x...           — optional wallet override
 *
 * Response:
 *   {
 *     vault, vaultAPY, benchmarkName, benchmarkAPY,
 *     spreadBps, floorBps, belowFloor,
 *     recommendation: { action, headline, rationale },
 *     dataMode, freshness
 *   }
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const vaultFilter = searchParams.get("vault");
  const thresholdBpsParam = searchParams.get("threshold_bps");
  const wallet = searchParams.get("wallet") ?? MONITORED_WALLET;

  if (!vaultFilter) {
    return NextResponse.json(
      { error: "vault query param is required (earnETH or earnUSD)" },
      { status: 400 }
    );
  }

  const health = await buildHealthResponse(wallet);
  const vaultSummary = health.vaults.find((v) => v.vaultId === vaultFilter);

  if (!vaultSummary) {
    return NextResponse.json(
      { error: `Unknown vault: ${vaultFilter}. Valid values: earnETH, earnUSD` },
      { status: 404 }
    );
  }

  const bm = vaultSummary.benchmark;
  const effectiveFloorBps = thresholdBpsValid(thresholdBpsParam)
    ? parseInt(thresholdBpsParam!, 10)
    : bm.floorBps;
  const belowFloor = bm.spreadBps < effectiveFloorBps;

  return NextResponse.json({
    wallet,
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

function thresholdBpsValid(v: string | null): boolean {
  if (!v) return false;
  const n = parseInt(v, 10);
  return !isNaN(n);
}
