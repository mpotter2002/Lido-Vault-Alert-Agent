import { NextResponse } from "next/server";
import { buildHealthResponse } from "@/lib/health-builder";
import { generateEnrichedAlerts } from "@/lib/alert-engine";
import { composeTelegramMessage } from "@/lib/formatters";
import {
  getTelegramDeliveryConfig,
  deliveryConfigSummary,
} from "@/lib/delivery-config";
import { buildLivePositions } from "@/lib/live-positions";

const MONITORED_WALLET =
  process.env.MONITORED_WALLET ?? "0x8f7fD8947DE49C3FFCd4B25C03249B6D997f6112";

/**
 * POST /api/telegram-send
 *
 * Builds a live vault alert digest and delivers it to Telegram.
 * Vault state (APY, TVL, health) is read live before composing the message.
 *
 * Required env vars (unless dryRun=true):
 *   TELEGRAM_BOT_TOKEN  — Bot token from @BotFather
 *   TELEGRAM_CHAT_ID    — Chat ID (your user ID for DM, group/channel ID for bot mode)
 *
 * Optional env vars:
 *   TELEGRAM_CHANNEL_TYPE — "telegram_dm" (default) | "telegram_bot"
 *   MONITORED_WALLET      — Ethereum address to read vault position for
 *   ETH_RPC_URL           — Ethereum JSON-RPC endpoint (default: cloudflare-eth.com)
 *
 * Optional JSON body:
 *   {
 *     "dryRun": true,          // Compose + return message without sending (default: false)
 *     "silent": true|false,    // Override notification sound
 *     "wallet": "0x..."        // Override monitored wallet
 *   }
 */
export async function POST(request: Request) {
  let dryRun = false;
  let silentOverride: boolean | undefined = undefined;
  let walletOverride: string | undefined = undefined;

  try {
    const body = await request.json().catch(() => ({}));
    dryRun = body?.dryRun === true;
    if (typeof body?.silent === "boolean") silentOverride = body.silent;
    if (typeof body?.wallet === "string" && body.wallet.startsWith("0x")) {
      walletOverride = body.wallet;
    }
  } catch {
    // ignore parse errors
  }

  const wallet = walletOverride ?? MONITORED_WALLET;
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

  // Build live alert content
  const { positions } = await buildLivePositions();
  const [{ alerts }, health] = await Promise.all([
    generateEnrichedAlerts(positions),
    buildHealthResponse(wallet),
  ]);

  const payload = composeTelegramMessage(
    wallet,
    alerts,
    health.vaults,
    silentOverride !== undefined ? { silent: silentOverride } : {}
  );

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
      wallet,
      dataMode: health.dataMode,
      deliveryConfig: configSummary,
      alertMeta: payload.meta,
      message: payload.text,
      sendPayload,
      note: "dryRun=true — message composed from live data but not sent. Remove dryRun or set to false to deliver.",
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
    wallet,
    dataMode: health.dataMode,
    deliveryConfig: configSummary,
    alertMeta: payload.meta,
    message: payload.text,
    sendPayload,
    ...(sendError
      ? { error: sendError, errorType, telegramErrorResponse: telegramResponse }
      : { telegramResponse }),
  });
}
