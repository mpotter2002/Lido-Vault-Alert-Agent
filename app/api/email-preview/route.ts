import { NextResponse } from "next/server";
import { MOCK_POSITIONS, DEMO_WALLET } from "@/lib/mock-data";
import { buildHealthResponse } from "@/lib/health-builder";
import { generateEnrichedAlerts } from "@/lib/alert-engine";
import { formatEmailAlert } from "@/lib/formatters";

/**
 * GET /api/email-preview
 *
 * Returns a plain-text email alert ready for delivery via any SMTP provider.
 * Includes subject line, full body, and structured metadata.
 *
 * This is a prototype surface — wire sendgrid/ses/etc in a server action or
 * cron handler to deliver these via real email when ready.
 */
export async function GET() {
  const { alerts } = generateEnrichedAlerts(MOCK_POSITIONS);
  const health = buildHealthResponse(DEMO_WALLET, MOCK_POSITIONS);

  const email = formatEmailAlert(DEMO_WALLET, alerts, health.vaults);

  return NextResponse.json({
    wallet: DEMO_WALLET,
    generatedAt: health.generatedAt,
    dataMode: health.dataMode,
    alertCount: alerts.length,
    subject: email.subject,
    body: email.body,
    note:
      "Wire subject + body into your SMTP provider (SendGrid, SES, Resend, etc.). " +
      "This is seeded demo data — not a live on-chain read.",
  });
}
