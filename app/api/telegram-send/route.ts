import { NextResponse } from "next/server";
import { MOCK_POSITIONS, DEMO_WALLET } from "@/lib/mock-data";
import { buildHealthResponse } from "@/lib/health-builder";
import { generateEnrichedAlerts } from "@/lib/alert-engine";
import { formatTelegramAlert } from "@/lib/formatters";

/**
 * POST /api/telegram-send
 *
 * Formats the current alert digest and delivers it to a Telegram chat via
 * the Telegram Bot API.
 *
 * Required env vars:
 *   TELEGRAM_BOT_TOKEN  — Bot token from @BotFather (format: 123456:ABC-DEF...)
 *   TELEGRAM_CHAT_ID    — Chat or channel ID where the message will be sent
 *                         (negative number for groups/channels, e.g. -1001234567890)
 *
 * Optional body (JSON):
 *   { "dryRun": true }  — Build and return the message without sending it
 *
 * Response:
 *   {
 *     sent: boolean,
 *     dryRun: boolean,
 *     wallet: string,
 *     alertCount: number,
 *     message: string,       // the formatted MarkdownV2 text
 *     telegramResponse?: object  // raw Telegram API response when sent=true
 *     error?: string             // if Telegram returned an error
 *   }
 *
 * Usage (curl):
 *   curl -X POST http://localhost:3000/api/telegram-send
 *   curl -X POST http://localhost:3000/api/telegram-send -d '{"dryRun":true}' -H 'Content-Type: application/json'
 */
export async function POST(request: Request) {
  let dryRun = false;
  try {
    const body = await request.json().catch(() => ({}));
    dryRun = body?.dryRun === true;
  } catch {
    // ignore body parse errors
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!dryRun && (!botToken || !chatId)) {
    return NextResponse.json(
      {
        sent: false,
        dryRun: false,
        error:
          "TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env vars are required. " +
          "Set them in .env.local or pass dryRun:true to inspect the message without sending.",
      },
      { status: 400 }
    );
  }

  // Build alert content
  const { alerts } = generateEnrichedAlerts(MOCK_POSITIONS);
  const health = await buildHealthResponse(DEMO_WALLET, MOCK_POSITIONS);
  const message = formatTelegramAlert(DEMO_WALLET, alerts, health.vaults);

  if (dryRun) {
    return NextResponse.json({
      sent: false,
      dryRun: true,
      wallet: DEMO_WALLET,
      alertCount: alerts.length,
      criticalCount: alerts.filter((a) => a.severity === "critical").length,
      warningCount: alerts.filter((a) => a.severity === "warning").length,
      message,
      note: "dryRun=true — message formatted but not sent. Set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID and POST without dryRun to deliver.",
    });
  }

  // Send via Telegram Bot API
  const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
  let telegramResponse: unknown;
  let sendError: string | null = null;

  try {
    const res = await fetch(telegramUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "MarkdownV2",
      }),
    });
    telegramResponse = await res.json();

    if (!res.ok) {
      const errBody = telegramResponse as { description?: string };
      sendError = `Telegram API error ${res.status}: ${errBody?.description ?? res.statusText}`;
    }
  } catch (err) {
    sendError = err instanceof Error ? err.message : "Network error calling Telegram API";
  }

  return NextResponse.json({
    sent: !sendError,
    dryRun: false,
    wallet: DEMO_WALLET,
    alertCount: alerts.length,
    criticalCount: alerts.filter((a) => a.severity === "critical").length,
    warningCount: alerts.filter((a) => a.severity === "warning").length,
    message,
    telegramResponse,
    error: sendError ?? undefined,
  });
}
