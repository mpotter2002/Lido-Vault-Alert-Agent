import { NextResponse } from "next/server";
import { MOCK_POSITIONS, DEMO_WALLET } from "@/lib/mock-data";
import { generateEnrichedAlerts } from "@/lib/alert-engine";

/**
 * GET /api/alerts
 *
 * Returns the enriched alert set for the demo position set.
 * Alerts now include benchmark-relative alerts (yield vs stETH / Aave USDC)
 * and allocation-shift alerts (Aave, Morpho, Pendle, Gearbox, Maple).
 *
 * Each alert carries a `type` field to distinguish alert classes:
 *   position-state: apy_drop, apy_recovery, withdrawal_delay, deposit_queued,
 *                   tvl_cap_approaching, vault_pause, vault_unhealthy, curator_rebalance
 *   benchmark:      benchmark_underperformance, benchmark_recovery
 *   allocation:     allocation_shift
 *
 * Query params:
 *   severity=critical|warning|info  — filter by severity
 *   vault=earnETH|earnUSD           — filter by vault
 *   type=<AlertType>                — filter by alert type
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const severityFilter = searchParams.get("severity");
  const vaultFilter = searchParams.get("vault");
  const typeFilter = searchParams.get("type");

  const { alerts, benchmarks } = generateEnrichedAlerts(MOCK_POSITIONS);

  const filtered = alerts.filter((a) => {
    if (severityFilter && a.severity !== severityFilter) return false;
    if (vaultFilter && a.vaultId !== vaultFilter) return false;
    if (typeFilter && a.type !== typeFilter) return false;
    return true;
  });

  // Attach benchmark freshness info to the response envelope
  const benchmarkMeta: Record<string, object> = {};
  benchmarks.forEach((bm, vaultId) => {
    benchmarkMeta[vaultId] = {
      benchmarkName: bm.benchmarkName,
      benchmarkAPY: bm.benchmarkAPY,
      vaultAPY: bm.vaultAPY,
      spreadBps: bm.spreadBps,
      belowFloor: bm.belowFloor,
      source: bm.freshness.source,
      asOf: bm.freshness.asOf,
    };
  });

  return NextResponse.json({
    wallet: DEMO_WALLET,
    generatedAt: new Date().toISOString(),
    dataMode: "seeded_demo",
    note:
      "Vault state is seeded demo data. Benchmark values are fixed reference rates. " +
      "See freshness.source on each benchmark entry. " +
      "Wire Lido JS SDK for live vault reads.",
    benchmarks: benchmarkMeta,
    alertCount: filtered.length,
    alerts: filtered.map((a) => ({
      id: a.id,
      vault: a.vaultName,
      vaultId: a.vaultId,
      type: a.type,
      severity: a.severity,
      title: a.title,
      summary: a.summary,
      technicalDetail: a.technicalDetail,
      actionRequired: a.actionRequired,
      suggestedAction: a.suggestedAction,
      timestamp: a.timestamp.toISOString(),
    })),
  });
}
