import { NextResponse } from "next/server";
import { MOCK_POSITIONS, DEMO_WALLET } from "@/lib/mock-data";
import { buildHealthResponse } from "@/lib/health-builder";
import { generateEnrichedAlerts } from "@/lib/alert-engine";
import { composeTelegramMessage } from "@/lib/formatters";
import {
  getTelegramDeliveryConfig,
  deliveryConfigSummary,
} from "@/lib/delivery-config";

/**
 * POST /api/telegram-send
 *
 * Builds the current vault alert digest and delivers it to a Telegram chat
 * via the Telegram Bot API.
 *
 * Required env vars (unless dryRun=true):
 *   TELEGRAM_BOT_TOKEN  — Bot token from @BotFather
 *   TELEGRAM_CHAT_ID    — Chat ID to send to (your user ID for DM testing,
 *                         a group/channel ID for bot mode)
 *
 * Optional env var:
 *   TELEGRAM_CHANNEL_TYPE — "telegram_dm" (default) | "telegram_bot"
 *                           Set to "telegram_bot" when using a dedicated public bot.
 *
 * Optional JSON body:
 *   {
 *     "dryRun": true,        // Compose + return message without sending (default: false)
 *     "silent": true|false   // Override notification sound. Default: silent for
 *                            // non-critical digests, audible for critical alerts.
 *   }
 *
 * Response:
 *   {
 *     sent: boolean,
 *     dryRun: boolean,
 *     wallet: string,
 *     deliveryConfig: { channelType, ready, chatId, note, nextStep },
 *     alertMeta: { alertCount, criticalCount, warningCount, infoCount,
 *                  actionRequiredCount, hasActionRequired, isCritical },
 *     message: string,          // MarkdownV2 text
 *     sendPayload: object,      // Exact body POSTed to Telegram (minus chat_id)
 *     telegramResponse?: object // Raw Telegram API response when sent=true
 *     error?: string            // If delivery failed
 *     errorType?: string        // "config_missing"|"auth"|"chat_not_found"|"network"|"unknown"
 *   }
 *
 * Usage:
 *   curl -X POST http://localhost:3000/api/telegram-send
 *   curl -X POST http://localhost:3000/api/telegram-send \
 *        -d '{"dryRun":true}' -H 'Content-Type: application/json'
 */
export async function POST(request: Request) {
  let dryRun = false;
  let silentOverride: boolean | undefined = undefined;

  try {
    const body = await request.json().catch(() => ({}));
    dryRun = body?.dryRun === true;
    if (typeof body?.silent === "boolean") {
      silentOverride = body.silent;
    }
  } catch {
    // ignore body parse errors
  }

  const config = getTelegramDeliveryConfig();
  const configSummary = deliveryConfigSummary(config);

  if (!dryRun && !config.ready) {
    return NextResponse.json(
      {
        sent: false,
        dryRun: false,
        deliveryConfig: configSummary,
        error:
          `Missing env vars: ${config.missing.join(", ")}. ` +
          "Set them in .env.local or pass dryRun:true to inspect the message without sending.",
        errorType: "config_missing",
      },
      { status: 400 }
    );
  }

  // Build alert content
  const { alerts } = generateEnrichedAlerts(MOCK_POSITIONS);
  const health = await buildHealthResponse(DEMO_WALLET, MOCK_POSITIONS);
  const payload = composeTelegramMessage(
    DEMO_WALLET,
    alerts,
    health.vaults,
    silentOverride !== undefined ? { silent: silentOverride } : {}
  );

  // The body POSTed to Telegram (chat_id added below on live send)
  const sendPayload = {
    text: payload.text,
    parse_mode: payload.parse_mode,
    disable_web_page_preview: payload.disable_web_page_preview,
    disable_notification: payload.disable_notification,
  };

  if (dryRun) {
    return NextResponse.json({
      sent: false,
      dryRun: true,
      wallet: DEMO_WALLET,
      deliveryConfig: configSummary,
      alertMeta: payload.meta,
      message: payload.text,
      sendPayload,
      note: "dryRun=true — message composed but not sent. Set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID and POST without dryRun to deliver.",
    });
  }

  // Send via Telegram Bot API
  let telegramResponse: unknown;
  let sendError: string | null = null;
  let errorType: string | null = null;

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: config.chatId,
          ...sendPayload,
        }),
      }
    );
    telegramResponse = await res.json();

    if (!res.ok) {
      const errBody = telegramResponse as {
        description?: string;
        error_code?: number;
      };
      const desc = errBody?.description ?? res.statusText;
      sendError = `Telegram API error ${res.status}: ${desc}`;

      if (res.status === 401 || desc.includes("Unauthorized")) {
        errorType = "auth";
      } else if (res.status === 400 && desc.includes("chat not found")) {
        errorType = "chat_not_found";
      } else {
        errorType = "unknown";
      }
    }
  } catch (err) {
    sendError =
      err instanceof Error ? err.message : "Network error calling Telegram API";
    errorType = "network";
  }

  return NextResponse.json({
    sent: !sendError,
    dryRun: false,
    wallet: DEMO_WALLET,
    deliveryConfig: configSummary,
    alertMeta: payload.meta,
    message: payload.text,
    sendPayload,
    ...(sendError
      ? { error: sendError, errorType, telegramErrorResponse: telegramResponse }
      : { telegramResponse }),
  });
}
