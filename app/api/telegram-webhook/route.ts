/**
 * POST /api/telegram-webhook
 *
 * Telegram calls this URL every time a user messages your bot.
 * Register this URL once via GET /api/telegram-register-webhook.
 *
 * Supported commands:
 *   /start or /help  — welcome message + command list
 *   /subscribe 0x... — register wallet address for alerts
 *   /unsubscribe     — stop receiving alerts
 *   /status          — check current vault health snapshot
 *
 * User flow:
 *   1. User searches for @YourBotUsername on Telegram
 *   2. Types /subscribe 0xTheirWallet
 *   3. From then on they receive alerts whenever the broadcast runs
 */

import { NextResponse } from "next/server";
import { addSubscriber, removeSubscriber, getSubscribers } from "@/lib/subscribers";
import { buildLivePositions } from "@/lib/live-positions";
import { buildHealthResponse } from "@/lib/health-builder";
import { generateEnrichedAlerts } from "@/lib/alert-engine";
import { composeTelegramMessage } from "@/lib/formatters";

// ---------------------------------------------------------------------------
// Telegram send helper — plain text (no parse_mode) for bot responses
// ---------------------------------------------------------------------------

async function reply(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

// ---------------------------------------------------------------------------
// Webhook handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Telegram sends message or callback_query; we handle message only
  const message = body?.message as Record<string, unknown> | undefined;
  if (!message) return NextResponse.json({ ok: true });

  const chatId = String((message.chat as Record<string, unknown>)?.id ?? "");
  const text = ((message.text as string) ?? "").trim();
  const firstName = (message.from as Record<string, unknown>)?.first_name ?? "there";

  if (!chatId || !text) return NextResponse.json({ ok: true });

  // ── /start or /help ────────────────────────────────────────────────────────
  if (text.startsWith("/start") || text.startsWith("/help")) {
    await reply(
      chatId,
      `👋 Hi ${firstName}! I'm the Lido Vault Alert Agent.\n\n` +
        `I monitor Lido Earn vaults (EarnETH and EarnUSD) and send you plain-language alerts when something changes — yield drops, rebalances, benchmark underperformance.\n\n` +
        `Commands:\n` +
        `/subscribe 0xYourWallet — start monitoring your position\n` +
        `/status — check current vault health\n` +
        `/unsubscribe — stop receiving alerts\n` +
        `/help — show this message`
    );
    return NextResponse.json({ ok: true });
  }

  // ── /subscribe 0x... ───────────────────────────────────────────────────────
  if (text.startsWith("/subscribe")) {
    const parts = text.split(/\s+/);
    const wallet = parts[1]?.trim() ?? "";

    if (!wallet.match(/^0x[0-9a-fA-F]{40}$/)) {
      await reply(
        chatId,
        `❌ Invalid wallet address.\n\nUsage:\n/subscribe 0xYourWalletAddress\n\nExample:\n/subscribe 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`
      );
      return NextResponse.json({ ok: true });
    }

    const ok = addSubscriber(chatId, wallet);
    if (ok) {
      await reply(
        chatId,
        `✅ Subscribed!\n\n` +
          `Wallet: ${wallet.slice(0, 6)}...${wallet.slice(-4)}\n\n` +
          `You'll receive alerts when:\n` +
          `• Vault yield drops significantly\n` +
          `• Yield trails the stETH/Aave benchmark\n` +
          `• Protocol allocation shifts\n` +
          `• TVL cap is approaching\n` +
          `• Vault health changes\n\n` +
          `Type /status for a snapshot right now.`
      );
    } else {
      await reply(chatId, `❌ Failed to save your subscription. Please try again.`);
    }
    return NextResponse.json({ ok: true });
  }

  // ── /unsubscribe ───────────────────────────────────────────────────────────
  if (text.startsWith("/unsubscribe")) {
    removeSubscriber(chatId);
    await reply(chatId, `✅ Unsubscribed. You won't receive any more alerts.\n\nType /subscribe 0xYourWallet anytime to re-subscribe.`);
    return NextResponse.json({ ok: true });
  }

  // ── /status ────────────────────────────────────────────────────────────────
  if (text.startsWith("/status")) {
    const sub = getSubscribers().find((s) => s.chatId === chatId);
    if (!sub) {
      await reply(chatId, `You're not subscribed yet.\n\nType /subscribe 0xYourWallet to start.`);
      return NextResponse.json({ ok: true });
    }

    await reply(chatId, `⏳ Fetching live vault data...`);

    try {
      const { positions } = await buildLivePositions();
      const [{ alerts }, health] = await Promise.all([
        generateEnrichedAlerts(positions),
        buildHealthResponse(sub.wallet),
      ]);
      const payload = composeTelegramMessage(sub.wallet, alerts, health.vaults);

      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (token) {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: payload.text,
            parse_mode: payload.parse_mode,
            disable_web_page_preview: payload.disable_web_page_preview,
            disable_notification: true,
          }),
        });
      }
    } catch {
      await reply(chatId, `❌ Failed to fetch vault data. Try again in a moment.`);
    }

    return NextResponse.json({ ok: true });
  }

  // ── unknown command ────────────────────────────────────────────────────────
  if (text.startsWith("/")) {
    await reply(chatId, `Unknown command. Type /help to see what I can do.`);
  }

  return NextResponse.json({ ok: true });
}
