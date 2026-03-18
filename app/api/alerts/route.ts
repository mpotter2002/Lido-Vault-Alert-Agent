import { NextResponse } from "next/server";
import { MOCK_POSITIONS } from "@/lib/mock-data";
import { generateAlerts } from "@/lib/alert-engine";

/**
 * GET /api/alerts
 *
 * Returns the current alert set for the demo position set.
 * In production this would accept a wallet address and fetch live
 * vault state from the Lido JS SDK before running the alert engine.
 *
 * Query params:
 *   severity=critical|warning|info  — filter by severity
 *   vault=earnETH|earnUSD           — filter by vault
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const severityFilter = searchParams.get("severity");
  const vaultFilter = searchParams.get("vault");

  const alerts = generateAlerts(MOCK_POSITIONS);

  const filtered = alerts.filter((a) => {
    if (severityFilter && a.severity !== severityFilter) return false;
    if (vaultFilter && a.vaultId !== vaultFilter) return false;
    return true;
  });

  return NextResponse.json({
    wallet: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    generatedAt: new Date().toISOString(),
    note: "Demo data — wire up Lido JS SDK for live vault reads",
    alertCount: filtered.length,
    alerts: filtered.map((a) => ({
      id: a.id,
      vault: a.vaultName,
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
