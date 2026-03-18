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
 * GET /api/telegram-preview
 *
 * Returns a fully composed Telegram alert digest without sending it.
 * Useful for inspecting message output and testing bot integration before
 * wiring a live bot token.
 *
 * The `sendPayload` field contains the exact JSON body ready to POST to
 * the Telegram Bot API sendMessage endpoint — add `chat_id` and you're done:
 *
 *   POST https://api.telegram.org/bot<TOKEN>/sendMessage
 *   { "chat_id": "<YOUR_CHAT_ID>", ...sendPayload }
 *
 * Response:
 *   {
 *     wallet: string,
 *     generatedAt: string,
 *     dataMode: string,
 *     deliveryConfig: { channelType, ready, missing?, chatId, note, nextStep },
 *     alertMeta: { alertCount, criticalCount, warningCount, infoCount,
 *                  actionRequiredCount, hasActionRequired, isCritical },
 *     message: string,      // MarkdownV2-formatted text
 *     sendPayload: {        // Drop into Telegram sendMessage body (add chat_id)
 *       text, parse_mode, disable_web_page_preview, disable_notification
 *     },
 *     note: string
 *   }
 */
export async function GET(_request: Request) {
  const { alerts } = generateEnrichedAlerts(MOCK_POSITIONS);
  const health = await buildHealthResponse(DEMO_WALLET, MOCK_POSITIONS);
  const config = getTelegramDeliveryConfig();

  const payload = composeTelegramMessage(DEMO_WALLET, alerts, health.vaults);

  return NextResponse.json({
    wallet: DEMO_WALLET,
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
      "This is seeded demo data — not a live on-chain read.",
  });
}
