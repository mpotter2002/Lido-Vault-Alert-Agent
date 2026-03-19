import { NextResponse } from "next/server";
import { buildHealthResponse } from "@/lib/health-builder";
import { generateEnrichedAlerts } from "@/lib/alert-engine";
import { composeTelegramMessage } from "@/lib/formatters";
import { getTelegramDeliveryConfig, deliveryConfigSummary } from "@/lib/delivery-config";
import { buildLivePositions } from "@/lib/live-positions";
import { VaultHealthSummary } from "@/lib/domain";

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
 *   wallet=0x...                 — single wallet (default: MONITORED_WALLET env var)
 *   wallets=0x...,0x...,0x...   — comma-separated wallets for multi-wallet preview
 *                                  mirrors the exact message format sent by /api/telegram-broadcast
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const walletsParam = searchParams.get("wallets");
  const singleWallet = searchParams.get("wallet") ?? MONITORED_WALLET;

  const walletList = walletsParam
    ? walletsParam.split(",").map((w) => w.trim()).filter((w) => /^0x[0-9a-fA-F]{40}$/.test(w))
    : [singleWallet];

  if (walletList.length === 0) {
    return NextResponse.json(
      { error: "No valid wallet addresses provided" },
      { status: 400 }
    );
  }

  const { positions } = await buildLivePositions();
  const [{ alerts }, ...walletHealthResponses] = await Promise.all([
    generateEnrichedAlerts(positions),
    ...walletList.map((w) => buildHealthResponse(w)),
  ]);

  const config = getTelegramDeliveryConfig();
  const perWalletHealth: { wallet: string; vaults: VaultHealthSummary[] }[] =
    walletList.map((wallet, i) => ({ wallet, vaults: walletHealthResponses[i].vaults }));

  const primaryHealth = walletHealthResponses[0];
  const payload = composeTelegramMessage(
    walletList,
    alerts,
    primaryHealth.vaults,
    { perWalletVaults: perWalletHealth }
  );

  return NextResponse.json({
    wallets: walletList,
    wallet: walletList[0],
    generatedAt: primaryHealth.generatedAt,
    dataMode: primaryHealth.dataMode,
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
      `Data mode: ${primaryHealth.dataMode}. ${primaryHealth.note}`,
  });
}
