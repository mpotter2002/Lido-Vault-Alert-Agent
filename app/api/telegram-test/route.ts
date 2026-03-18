import { NextResponse } from "next/server";
import { getTelegramDeliveryConfig, deliveryConfigSummary } from "@/lib/delivery-config";

/**
 * GET /api/telegram-test[?dryRun=true]
 *
 * Sends a minimal connectivity-test message via the Telegram Bot API.
 * Useful for verifying that TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are
 * configured correctly before relying on the full alert delivery path.
 *
 * Query params:
 *   dryRun=true  — Return the message that would be sent without actually sending.
 *                  Also shows delivery config status. Default: false.
 *
 * Response:
 *   {
 *     sent: boolean,
 *     dryRun: boolean,
 *     deliveryConfig: { channelType, ready, chatId, note, nextStep },
 *     message: string,          // the test message text
 *     telegramResponse?: object // raw Telegram API response (when sent=true)
 *     error?: string
 *     errorType?: string        // "config_missing" | "auth" | "chat_not_found" | "network" | "unknown"
 *   }
 *
 * Usage:
 *   curl http://localhost:3000/api/telegram-test?dryRun=true
 *   curl http://localhost:3000/api/telegram-test          # actually sends
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "true";

  const config = getTelegramDeliveryConfig();
  const configSummary = deliveryConfigSummary(config);

  const now = new Date().toLocaleString("en-US", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const message =
    `✅ *Lido Vault Alert Agent — connectivity test*\n\n` +
    `Bot is connected and delivery path is working\\.\n` +
    `Sent at: ${now} UTC\n\n` +
    `_This is a test message from /api/telegram\\-test\\._`;

  if (!dryRun && !config.ready) {
    return NextResponse.json(
      {
        sent: false,
        dryRun: false,
        deliveryConfig: configSummary,
        message,
        error:
          `Missing env vars: ${config.missing.join(", ")}. ` +
          "Set them in .env.local or use ?dryRun=true to inspect config without sending.",
        errorType: "config_missing",
      },
      { status: 400 }
    );
  }

  if (dryRun) {
    return NextResponse.json({
      sent: false,
      dryRun: true,
      deliveryConfig: configSummary,
      message,
      note: "dryRun=true — message composed but not sent. Remove ?dryRun=true to send the test.",
    });
  }

  // Send via Telegram Bot API (plain text variant — no MarkdownV2 for the test message
  // to avoid escaping issues; just send text for a clean connectivity check).
  const plainMessage =
    `✅ Lido Vault Alert Agent — connectivity test\n\n` +
    `Bot is connected and delivery path is working.\n` +
    `Sent at: ${now} UTC\n\n` +
    `This is a test message from /api/telegram-test.`;

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
          text: plainMessage,
          disable_notification: true, // silent — test messages shouldn't ping
        }),
        signal: AbortSignal.timeout(10_000),
      }
    );
    telegramResponse = await res.json();

    if (!res.ok) {
      const errBody = telegramResponse as { description?: string; error_code?: number };
      const desc = errBody?.description ?? res.statusText;
      sendError = `Telegram API error ${res.status}: ${desc}`;

      if (res.status === 401 || (desc && desc.includes("Unauthorized"))) {
        errorType = "auth";
      } else if (res.status === 400 && desc && desc.includes("chat not found")) {
        errorType = "chat_not_found";
      } else {
        errorType = "unknown";
      }
    }
  } catch (err) {
    sendError = err instanceof Error ? err.message : "Network error calling Telegram API";
    errorType = "network";
  }

  return NextResponse.json({
    sent: !sendError,
    dryRun: false,
    deliveryConfig: configSummary,
    message: plainMessage,
    ...(sendError
      ? { error: sendError, errorType, telegramErrorResponse: telegramResponse }
      : { telegramResponse }),
  });
}
