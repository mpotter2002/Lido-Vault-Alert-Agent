/**
 * POST /api/telegram-webhook
 *
 * Supported commands:
 *   /start or /help     — welcome + command list
 *   /subscribe 0x...    — register wallet + onboarding (alert level → yield floor)
 *   /unsubscribe        — stop receiving alerts
 *   /status             — live vault health snapshot
 *   /alerts [critical|all] — view or change alert sensitivity
 *   /setfloor [N]       — view or change personal yield floor (%)
 *
 * Onboarding (two-step, triggered after /subscribe):
 *   Step 1 — user replies "1" or "2" to choose alert level
 *   Step 2 — user replies a number (e.g. "4") or "skip" to set yield floor
 */

import { NextResponse } from "next/server";
import {
  addSubscriber,
  removeSubscriber,
  getSubscribers,
  setAlertLevel,
  setYieldFloor,
  clearPendingStep,
} from "@/lib/subscribers";
import { buildLivePositions } from "@/lib/live-positions";
import { buildHealthResponse } from "@/lib/health-builder";
import { generateEnrichedAlerts } from "@/lib/alert-engine";
import { composeTelegramMessage } from "@/lib/formatters";

// ---------------------------------------------------------------------------
// Helpers
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

const ALERT_LEVEL_QUESTION =
  `One quick question — how sensitive do you want alerts?\n\n` +
  `Reply:\n` +
  `1️⃣  Critical only — vault paused, TVL emergency\n` +
  `2️⃣  All alerts — includes yield underperformance warnings\n\n` +
  `You can change this anytime with /alerts`;

const yieldFloorQuestion = (current: number) =>
  `Last one — what's your minimum acceptable APY?\n\n` +
  `I'll alert you if either vault drops below this threshold.\n\n` +
  `Reply with a number like 4 for 4%, or skip to keep the default (${current}%).\n\n` +
  `You can update this anytime with /setfloor`;

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

  const message = body?.message as Record<string, unknown> | undefined;
  if (!message) return NextResponse.json({ ok: true });

  const chatId = String((message.chat as Record<string, unknown>)?.id ?? "");
  const text = ((message.text as string) ?? "").trim();
  const firstName = (message.from as Record<string, unknown>)?.first_name ?? "there";

  if (!chatId || !text) return NextResponse.json({ ok: true });

  const subscribers = await getSubscribers();
  const sub = subscribers.find((s) => s.chatId === chatId);

  // ── Onboarding reply handler — intercepts non-command replies ──────────────
  if (sub?.pendingStep && !text.startsWith("/")) {

    // Step 1: alert level
    if (sub.pendingStep === "alertLevel") {
      if (text === "1") {
        await setAlertLevel(chatId, "critical");
        await reply(chatId, `✅ Critical alerts only.\n\n` + yieldFloorQuestion(sub.yieldFloorPct));
      } else if (text === "2") {
        await setAlertLevel(chatId, "all");
        await reply(chatId, `✅ All alerts enabled.\n\n` + yieldFloorQuestion(sub.yieldFloorPct));
      } else {
        await reply(chatId, `Please reply 1 (critical only) or 2 (all alerts).`);
      }
      return NextResponse.json({ ok: true });
    }

    // Step 2: yield floor
    if (sub.pendingStep === "yieldFloor") {
      if (text.toLowerCase() === "skip") {
        await clearPendingStep(chatId);
        await reply(
          chatId,
          `✅ Using default floor of ${sub.yieldFloorPct}%. You're all set!\n\n` +
            `Type /status to see a live snapshot anytime.`
        );
      } else {
        const num = parseFloat(text.replace("%", ""));
        if (isNaN(num) || num < 0 || num > 30) {
          await reply(chatId, `Please enter a number between 0 and 30 (e.g. 4 for 4%), or skip.`);
        } else {
          await setYieldFloor(chatId, Math.round(num * 10) / 10);
          await reply(
            chatId,
            `✅ Yield floor set to ${Math.round(num * 10) / 10}%. You're all set!\n\n` +
              `I'll alert you if EarnETH or EarnUSD APY drops below this.\n` +
              `Type /status to see a live snapshot anytime.`
          );
        }
      }
      return NextResponse.json({ ok: true });
    }
  }

  // ── /start or /help ────────────────────────────────────────────────────────
  if (text.startsWith("/start") || text.startsWith("/help")) {
    await reply(
      chatId,
      `👋 Hi ${firstName}! I'm the Lido Vault Alert Agent.\n\n` +
        `I monitor Lido Earn vaults (EarnETH and EarnUSD) and send you plain-language alerts when something changes — yield drops, rebalances, benchmark underperformance.\n\n` +
        `Commands:\n` +
        `/subscribe 0xYourWallet — start monitoring your position\n` +
        `/status — check current vault health\n` +
        `/alerts — view or change alert sensitivity\n` +
        `/setfloor — view or change your minimum APY threshold\n` +
        `/unsubscribe — stop receiving alerts\n` +
        `/help — show this message`
    );
    return NextResponse.json({ ok: true });
  }

  // ── /subscribe 0x... ───────────────────────────────────────────────────────
  if (text.startsWith("/subscribe")) {
    const wallet = text.split(/\s+/)[1]?.trim() ?? "";
    if (!wallet.match(/^0x[0-9a-fA-F]{40}$/)) {
      await reply(
        chatId,
        `❌ Invalid wallet address.\n\nUsage:\n/subscribe 0xYourWalletAddress`
      );
      return NextResponse.json({ ok: true });
    }
    const ok = await addSubscriber(chatId, wallet);
    if (ok) {
      await reply(
        chatId,
        `✅ Subscribed!\n\n` +
          `Wallet: ${wallet.slice(0, 6)}...${wallet.slice(-4)}\n\n` +
          `You'll receive alerts when:\n` +
          `• Vault yield drops below your floor\n` +
          `• Yield trails the stETH/Aave benchmark\n` +
          `• Protocol allocation shifts\n` +
          `• TVL cap is approaching\n` +
          `• Vault health changes\n\n` +
          ALERT_LEVEL_QUESTION
      );
    } else {
      await reply(chatId, `❌ Failed to save your subscription. Please try again.`);
    }
    return NextResponse.json({ ok: true });
  }

  // ── /unsubscribe ───────────────────────────────────────────────────────────
  if (text.startsWith("/unsubscribe")) {
    await removeSubscriber(chatId);
    await reply(
      chatId,
      `✅ Unsubscribed. You won't receive any more alerts.\n\nType /subscribe 0xYourWallet anytime to re-subscribe.`
    );
    return NextResponse.json({ ok: true });
  }

  // ── /alerts [critical|all] ─────────────────────────────────────────────────
  if (text.startsWith("/alerts")) {
    if (!sub) {
      await reply(chatId, `You're not subscribed yet.\n\nType /subscribe 0xYourWallet to start.`);
      return NextResponse.json({ ok: true });
    }
    const arg = text.split(/\s+/)[1]?.toLowerCase();
    if (arg === "critical") {
      await setAlertLevel(chatId, "critical");
      await reply(chatId, `✅ Alert level set to critical only.`);
    } else if (arg === "all") {
      await setAlertLevel(chatId, "all");
      await reply(chatId, `✅ Alert level set to all alerts.`);
    } else {
      const current = sub.alertLevel === "critical" ? "Critical only" : "All alerts";
      await reply(
        chatId,
        `Your alert level: ${current}\n\n` +
          `/alerts critical — serious issues only\n` +
          `/alerts all — all warnings and updates`
      );
    }
    return NextResponse.json({ ok: true });
  }

  // ── /setfloor [N] ─────────────────────────────────────────────────────────
  if (text.startsWith("/setfloor")) {
    if (!sub) {
      await reply(chatId, `You're not subscribed yet.\n\nType /subscribe 0xYourWallet to start.`);
      return NextResponse.json({ ok: true });
    }
    const arg = text.split(/\s+/)[1]?.replace("%", "");
    if (!arg) {
      await reply(
        chatId,
        `Your yield floor: ${sub.yieldFloorPct}%\n\n` +
          `I alert you if EarnETH or EarnUSD APY drops below this.\n\n` +
          `To change: /setfloor 4 (for 4%)`
      );
      return NextResponse.json({ ok: true });
    }
    const num = parseFloat(arg);
    if (isNaN(num) || num < 0 || num > 30) {
      await reply(chatId, `Please enter a number between 0 and 30, e.g. /setfloor 4`);
    } else {
      const rounded = Math.round(num * 10) / 10;
      await setYieldFloor(chatId, rounded);
      await reply(chatId, `✅ Yield floor updated to ${rounded}%.`);
    }
    return NextResponse.json({ ok: true });
  }

  // ── /status ────────────────────────────────────────────────────────────────
  if (text.startsWith("/status")) {
    if (!sub) {
      await reply(chatId, `You're not subscribed yet.\n\nType /subscribe 0xYourWallet to start.`);
      return NextResponse.json({ ok: true });
    }
    if (sub.pendingStep) await clearPendingStep(chatId);
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
