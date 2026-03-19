import { NextResponse } from "next/server";
import { buildHealthResponse } from "@/lib/health-builder";
import { generateEnrichedAlerts } from "@/lib/alert-engine";
import { composeTelegramMessage } from "@/lib/formatters";
import { getTelegramDeliveryConfig, deliveryConfigSummary } from "@/lib/delivery-config";
import { buildLivePositions } from "@/lib/live-positions";

const MONITORED_WALLET =
  process.env.MONITORED_WALLET ?? "0x8f7fD8947DE49C3FFCd4B25C03249B6D997f6112";

/**
 * GET /api/telegram-preview
 *
 * Returns a fully composed Telegram alert digest built from live vault data —
 * without sending it. Useful for inspecting message output and testing bot
 * integration before wiring a live bot token.
 *
 * The `sendPayload` field contains the exact JSON body ready to POST to
 * the Telegram Bot API sendMessage endpoint — add `chat_id` and you're done:
 *
 *   POST https://api.telegram.org/bot<TOKEN>/sendMessage
 *   { "chat_id": "<YOUR_CHAT_ID>", ...sendPayload }
 *
 * Query params:
 *   wallet=0x...  — override monitored wallet (default: MONITORED_WALLET env var)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get("wallet") ?? MONITORED_WALLET;

  const { positions } = await buildLivePositions();
  const [{ alerts }, health, config] = await Promise.all([
    generateEnrichedAlerts(positions),
    buildHealthResponse(wallet),
    Promise.resolve(getTelegramDeliveryConfig()),
  ]);

  const payload = composeTelegramMessage(wallet, alerts, health.vaults);

  return NextResponse.json({
    wallet,
    generatedAt: health.generatedAt,
    dataMode: health.dataMode,
    deliveryConfig: deliveryConfigSummary(config),
    alertMeta: payload.meta,
    message: payload.text,
    sendPayload: {
      text: payload.text,
      parse_mode: payload.parse_mode,
      disable_web_page_preview: payload.disable_web_page_preview,
      disable_notification: payload.disable_notification,
    },
    note:
      "Add chat_id to sendPayload and POST to https://api.telegram.org/bot<TOKEN>/sendMessage. " +
      "Use POST /api/telegram-send to deliver from the server. " +
      `Data mode: ${health.dataMode}. ${health.note}`,
  });
}
