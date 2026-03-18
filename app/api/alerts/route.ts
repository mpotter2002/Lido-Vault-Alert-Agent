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

  const { alerts, benchmarks } = await generateEnrichedAlerts(MOCK_POSITIONS);

  const filtered = alerts.filter((a) => {
    if (severityFilter && a.severity !== severityFilter) return false;
    if (vaultFilter && a.vaultId !== vaultFilter) return false;
    if (typeFilter && a.type !== typeFilter) return false;
    return true;
  });

  // Attach benchmark freshness info to the response envelope.
  // freshness.source = "live"                  — fetched from Lido/DeFiLlama this request
  // freshness.source = "cached_last_known_good" — live fetch failed; using last real cached value (stale)
  // freshness.source = "unavailable"            — live fetch failed and no cache; comparison suppressed
  // freshness.source = "seeded_demo"            — explicit demo mode only (not a production fallback)
  const benchmarkMeta: Record<string, object> = {};
  benchmarks.forEach((bm, vaultId) => {
    benchmarkMeta[vaultId] = {
      benchmarkName: bm.benchmarkName,
      benchmarkAPY: bm.benchmarkAPY,
      vaultAPY: bm.vaultAPY,
      spreadBps: bm.spreadBps,
      belowFloor: bm.belowFloor,
      freshness: {
        source: bm.freshness.source,
        asOf: bm.freshness.asOf,
        note: bm.freshness.note,
      },
    };
  });

  // Agent-friendly summary — quick scan without iterating the full alert list
  const allCritical = alerts.filter((a) => a.severity === "critical");
  const allWarnings = alerts.filter((a) => a.severity === "warning");
  const allActionRequired = alerts.filter((a) => a.actionRequired);
  const topAlert = allCritical[0] ?? allWarnings[0] ?? alerts[0] ?? null;

  const agentSummary = {
    criticalCount: allCritical.length,
    warningCount: allWarnings.length,
    infoCount: alerts.filter((a) => a.severity === "info").length,
    actionRequiredCount: allActionRequired.length,
    hasActionRequired: allActionRequired.length > 0,
    isCritical: allCritical.length > 0,
    topAlert: topAlert
      ? {
          vaultId: topAlert.vaultId,
          type: topAlert.type,
          severity: topAlert.severity,
          title: topAlert.title,
          actionRequired: topAlert.actionRequired,
          suggestedAction: topAlert.suggestedAction,
        }
      : null,
  };

  return NextResponse.json({
    wallet: DEMO_WALLET,
    generatedAt: new Date().toISOString(),
    dataMode: "seeded_demo",
    note:
      "Vault state (APY, TVL, health, strategies) is seeded demo data. " +
      "Benchmark APYs are attempted live (Lido staking-stats API / DeFiLlama yields API). " +
      "On failure: last-known-good cached real value (cached_last_known_good) → unavailable. " +
      "seeded_demo values are never used as a silent fallback. " +
      "See benchmarks[vaultId].freshness.source for the actual outcome per vault.",
    agentSummary,
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
