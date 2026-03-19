import { NextResponse } from "next/server";
import { MOCK_POSITIONS, DEMO_WALLET } from "@/lib/mock-data";
import { buildHealthResponse } from "@/lib/health-builder";
import { generateEnrichedAlerts } from "@/lib/alert-engine";
import { formatEmailAlert } from "@/lib/formatters";

/**
 * GET /api/email-preview
 *
 * Returns a plain-text email alert ready for delivery via Gmail SMTP (or any SMTP provider).
 * Includes subject line, full body, and structured metadata.
 *
 * Uses seeded demo data. For live delivery use POST /api/telegram-broadcast (subscribers
 * with email set receive alerts automatically). Use GET /api/email-test to verify SMTP config.
 */
export async function GET() {
  const { alerts } = await generateEnrichedAlerts(MOCK_POSITIONS);
  const health = await buildHealthResponse(DEMO_WALLET, MOCK_POSITIONS);

  const email = formatEmailAlert(DEMO_WALLET, alerts, health.vaults);

  return NextResponse.json({
    wallet: DEMO_WALLET,
    generatedAt: health.generatedAt,
    dataMode: health.dataMode,
    alertCount: alerts.length,
    subject: email.subject,
    body: email.body,
    note:
      "This is seeded demo data — not a live on-chain read. " +
      "For live email delivery, POST /api/telegram-broadcast handles it automatically for subscribers with an email set. " +
      "Use GET /api/email-test?to=you@example.com to verify Gmail SMTP is configured.",
  });
}
