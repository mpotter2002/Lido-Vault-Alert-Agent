import { NextResponse } from "next/server";
import { buildLivePositions } from "@/lib/live-positions";
import { generateEnrichedAlerts } from "@/lib/alert-engine";

const MONITORED_WALLET =
  process.env.MONITORED_WALLET ?? "0x8f7fD8947DE49C3FFCd4B25C03249B6D997f6112";

/**
 * GET /api/alerts
 *
 * Returns the enriched alert set from live vault data.
 * Vault state (APY, TVL, health) is read live; benchmarks fetched from
 * Lido staking-stats API and DeFiLlama.
 *
 * Query params:
 *   severity=critical|warning|info  — filter by severity
 *   vault=earnETH|earnUSD           — filter by vault
 *   type=<AlertType>                — filter by alert type
 *   wallet=0x...                    — wallet to include in context
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const severityFilter = searchParams.get("severity");
  const vaultFilter = searchParams.get("vault");
  const typeFilter = searchParams.get("type");
  const wallet = searchParams.get("wallet") ?? MONITORED_WALLET;

  const { positions, meta } = await buildLivePositions();
  const { alerts, benchmarks } = await generateEnrichedAlerts(positions);

  const filtered = alerts.filter((a) => {
    if (severityFilter && a.severity !== severityFilter) return false;
    if (vaultFilter && a.vaultId !== vaultFilter) return false;
    if (typeFilter && a.type !== typeFilter) return false;
    return true;
  });

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

  // Data source summary
  const vaultDataSources: Record<string, object> = {};
  meta.vaultSources.forEach(({ tvl, apy }, vaultId) => {
    vaultDataSources[vaultId] = { tvlSource: tvl, apySource: apy };
  });

  return NextResponse.json({
    wallet,
    generatedAt: new Date().toISOString(),
    dataMode: "partial_live",
    vaultDataSources,
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
