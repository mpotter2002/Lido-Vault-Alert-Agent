import { NextResponse } from "next/server";
import { MOCK_POSITIONS, DEMO_WALLET } from "@/lib/mock-data";
import { buildHealthResponse } from "@/lib/health-builder";
import { generateEnrichedAlerts } from "@/lib/alert-engine";
import { formatTelegramAlert } from "@/lib/formatters";

/**
 * GET /api/telegram-preview
 *
 * Returns a Telegram MarkdownV2-formatted alert message ready for a bot to send.
 * Useful for testing notification output before wiring a real bot token.
 *
 * Query params:
 *   format=raw     — return the raw MarkdownV2 string in a JSON envelope (default)
 *   format=text    — return plain text with the message in `message` key
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") ?? "raw";

  const { alerts } = generateEnrichedAlerts(MOCK_POSITIONS);
  const health = await buildHealthResponse(DEMO_WALLET, MOCK_POSITIONS);

  const message = formatTelegramAlert(DEMO_WALLET, alerts, health.vaults);

  return NextResponse.json({
    wallet: DEMO_WALLET,
    generatedAt: health.generatedAt,
    dataMode: health.dataMode,
    alertCount: alerts.length,
    criticalCount: alerts.filter((a) => a.severity === "critical").length,
    warningCount: alerts.filter((a) => a.severity === "warning").length,
    format: format === "text" ? "plain_text" : "telegram_markdownv2",
    message,
    note:
      "Pass this `message` payload to the Telegram Bot API sendMessage() with parse_mode=MarkdownV2. " +
      "This is seeded demo data — not a live on-chain read.",
  });
}
