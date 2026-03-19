/**
 * POST /api/telegram-webhook
 *
 * Supported commands:
 *   /start or /help           — welcome + command list
 *   /subscribe 0x...          — register first wallet + onboarding (alert level → yield floor → email)
 *   /addwallet 0x...          — add another wallet (for already-subscribed users)
 *   /wallets                  — list all tracked wallets
 *   /removewallet 0x...       — remove a tracked wallet (must have more than one)
 *   /unsubscribe              — stop receiving alerts and remove all data
 *   /status                   — live vault health snapshot (all wallets combined)
 *   /alerts [critical|all]    — view or change alert sensitivity
 *   /setfloor [N]             — view or change personal yield floor (%)
 *   /setemail [addr]          — view or change email for alert notifications
 *
 * Onboarding (three-step, triggered after /subscribe):
 *   Step 1 — user replies "1" or "2" to choose alert level
 *   Step 2 — user replies a number (e.g. "4") or "skip" to set yield floor
 *   Step 3 — user replies an email address or "skip" to opt into email alerts
 */

import { NextResponse } from "next/server";
import {
  addSubscriber,
  addWallet,
  removeWallet,
  removeSubscriber,
  getSubscribers,
  getWallets,
  setAlertLevel,
  setYieldFloor,
  setYieldFloorAndAdvance,
  setEmail,
  clearPendingStep,
} from "@/lib/subscribers";
import { buildLivePositions } from "@/lib/live-positions";
import { buildHealthResponse } from "@/lib/health-builder";
import { generateEnrichedAlerts } from "@/lib/alert-engine";
import { composeTelegramMessage } from "@/lib/formatters";
import { VaultHealthSummary } from "@/lib/domain";

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

/**
 * Fetch health for multiple wallets and merge their vault positions.
 * Vault-level data (APY, TVL, health) comes from the first wallet's response.
 * walletPosition.deposited and .shares are summed across all wallets.
 */
/** Fetch health for each wallet independently and return per-wallet results. */
async function buildPerWalletHealth(
  wallets: string[]
): Promise<{ wallet: string; vaults: VaultHealthSummary[] }[]> {
  if (wallets.length === 0) return [];
  const responses = await Promise.all(wallets.map((w) => buildHealthResponse(w)));
  return wallets.map((wallet, i) => ({ wallet, vaults: responses[i].vaults }));
}

const ALERT_LEVEL_QUESTION =
  `One quick question — how sensitive do you want alerts?\n\n` +
  `Reply:\n` +
  `1️⃣  Critical only — vault paused, TVL emergency\n` +
  `2️⃣  All alerts — includes yield underperformance warnings\n\n` +
  `You can change this anytime with /alerts`;

const yieldFloorQuestion = (current: number) =>
  `Almost there — what's your minimum acceptable APY?\n\n` +
  `I'll alert you if either vault drops below this threshold.\n\n` +
  `Reply with a number like 4 for 4%, or skip to keep the default (${current}%).\n\n` +
  `You can update this anytime with /setfloor`;

const EMAIL_QUESTION =
  `Last one — want email alerts too?\n\n` +
  `Reply with your email address to get alert emails alongside Telegram messages.\n` +
  `Or reply skip to use Telegram only.\n\n` +
  `You can update this anytime with /setemail`;

const ONBOARDING_COMPLETE_SUFFIX =
  `\n\nTracking another wallet? Use /addwallet 0xYourOtherWallet to add it.\n` +
  `Type /status to see a live snapshot anytime.`;

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
        await setYieldFloorAndAdvance(chatId, sub.yieldFloorPct);
        await reply(chatId, `✅ Using default floor of ${sub.yieldFloorPct}%.\n\n` + EMAIL_QUESTION);
      } else {
        const num = parseFloat(text.replace("%", ""));
        if (isNaN(num) || num < 0 || num > 30) {
          await reply(chatId, `Please enter a number between 0 and 30 (e.g. 4 for 4%), or skip.`);
        } else {
          await setYieldFloorAndAdvance(chatId, Math.round(num * 10) / 10);
          await reply(
            chatId,
            `✅ Yield floor set to ${Math.round(num * 10) / 10}%.\n\n` + EMAIL_QUESTION
          );
        }
      }
      return NextResponse.json({ ok: true });
    }

    // Step 3: email
    if (sub.pendingStep === "email") {
      if (text.toLowerCase() === "skip") {
        await setEmail(chatId, null);
        await reply(
          chatId,
          `✅ Telegram only — got it. You're all set!\n\n` +
            `To add email later: /setemail you@example.com` +
            ONBOARDING_COMPLETE_SUFFIX
        );
      } else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
        await setEmail(chatId, text.toLowerCase());
        await reply(
          chatId,
          `✅ Email set to ${text.toLowerCase()}. You're all set!\n\n` +
            `You'll receive alerts on Telegram and by email.` +
            ONBOARDING_COMPLETE_SUFFIX
        );
      } else {
        await reply(chatId, `That doesn't look like a valid email. Try again or reply skip.`);
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
        `/addwallet 0xYourWallet — track an additional wallet\n` +
        `/wallets — list your tracked wallets\n` +
        `/removewallet 0xYourWallet — stop tracking a wallet\n` +
        `/status — check current vault health\n` +
        `/alerts — view or change alert sensitivity\n` +
        `/setfloor — view or change your minimum APY threshold\n` +
        `/setemail — view or change your email for alert notifications\n` +
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

    // If already subscribed, just add the wallet without resetting preferences
    if (sub) {
      const alreadyTracked = sub.wallets.some((w) => w.toLowerCase() === wallet.toLowerCase());
      if (alreadyTracked) {
        await reply(
          chatId,
          `That wallet is already being tracked.\n\nUse /wallets to see all your tracked wallets.`
        );
        return NextResponse.json({ ok: true });
      }
      const ok = await addWallet(chatId, wallet);
      if (ok) {
        await reply(
          chatId,
          `✅ Wallet added: ${wallet.slice(0, 6)}...${wallet.slice(-4)}\n\n` +
            `You now have ${sub.wallets.length + 1} tracked wallets.\n` +
            `Use /wallets to see them all or /status for a live snapshot.`
        );
      } else {
        await reply(chatId, `❌ Failed to add wallet. Please try again.`);
      }
      return NextResponse.json({ ok: true });
    }

    // New subscriber — full onboarding
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

  // ── /addwallet 0x... ───────────────────────────────────────────────────────
  if (text.startsWith("/addwallet")) {
    if (!sub) {
      await reply(chatId, `You're not subscribed yet.\n\nType /subscribe 0xYourWallet to start.`);
      return NextResponse.json({ ok: true });
    }
    const wallet = text.split(/\s+/)[1]?.trim() ?? "";
    if (!wallet.match(/^0x[0-9a-fA-F]{40}$/)) {
      await reply(
        chatId,
        `❌ Invalid wallet address.\n\nUsage:\n/addwallet 0xYourWalletAddress`
      );
      return NextResponse.json({ ok: true });
    }
    const alreadyTracked = sub.wallets.some((w) => w.toLowerCase() === wallet.toLowerCase());
    if (alreadyTracked) {
      await reply(
        chatId,
        `That wallet is already being tracked.\n\nUse /wallets to see all your tracked wallets.`
      );
      return NextResponse.json({ ok: true });
    }
    const ok = await addWallet(chatId, wallet);
    if (ok) {
      await reply(
        chatId,
        `✅ Wallet added: ${wallet.slice(0, 6)}...${wallet.slice(-4)}\n\n` +
          `You now have ${sub.wallets.length + 1} tracked wallets.\n` +
          `Use /wallets to see them all or /status for a live snapshot.`
      );
    } else {
      await reply(chatId, `❌ Failed to add wallet. Please try again.`);
    }
    return NextResponse.json({ ok: true });
  }

  // ── /wallets ───────────────────────────────────────────────────────────────
  if (text.startsWith("/wallets")) {
    if (!sub) {
      await reply(chatId, `You're not subscribed yet.\n\nType /subscribe 0xYourWallet to start.`);
      return NextResponse.json({ ok: true });
    }
    const wallets = await getWallets(chatId);
    if (wallets.length === 0) {
      await reply(chatId, `No wallets tracked. Use /addwallet 0xYourWallet to add one.`);
      return NextResponse.json({ ok: true });
    }
    const list = wallets
      .map((w, i) => `${i + 1}. ${w.slice(0, 6)}...${w.slice(-4)} (${w})`)
      .join("\n");
    await reply(
      chatId,
      `Your tracked wallets (${wallets.length}):\n\n${list}\n\n` +
        `Add another: /addwallet 0xYourWallet\n` +
        `Remove one: /removewallet 0xYourWallet`
    );
    return NextResponse.json({ ok: true });
  }

  // ── /removewallet 0x... ────────────────────────────────────────────────────
  if (text.startsWith("/removewallet")) {
    if (!sub) {
      await reply(chatId, `You're not subscribed yet.\n\nType /subscribe 0xYourWallet to start.`);
      return NextResponse.json({ ok: true });
    }
    const wallet = text.split(/\s+/)[1]?.trim() ?? "";
    if (!wallet.match(/^0x[0-9a-fA-F]{40}$/)) {
      await reply(
        chatId,
        `❌ Invalid wallet address.\n\nUsage:\n/removewallet 0xYourWalletAddress`
      );
      return NextResponse.json({ ok: true });
    }
    const tracked = sub.wallets.some((w) => w.toLowerCase() === wallet.toLowerCase());
    if (!tracked) {
      await reply(
        chatId,
        `That wallet isn't being tracked.\n\nUse /wallets to see your tracked wallets.`
      );
      return NextResponse.json({ ok: true });
    }
    const result = await removeWallet(chatId, wallet);
    if (result.isLastWallet) {
      await reply(
        chatId,
        `❌ Can't remove your only wallet.\n\n` +
          `To stop receiving alerts entirely, use /unsubscribe.`
      );
    } else if (result.ok) {
      await reply(
        chatId,
        `✅ Removed wallet: ${wallet.slice(0, 6)}...${wallet.slice(-4)}\n\n` +
          `Use /wallets to see your remaining tracked wallets.`
      );
    } else {
      await reply(chatId, `❌ Failed to remove wallet. Please try again.`);
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
          `  • Vault paused\n` +
          `  • Vault health degraded\n` +
          `  • APY drops below your personal floor (always on)\n\n` +
          `/alerts all — all warnings and updates\n` +
          `  • Everything in critical, plus:\n` +
          `  • APY drops more than 0.5% in 24h\n` +
          `  • Yield trailing stETH / Aave benchmark\n` +
          `  • TVL cap approaching\n` +
          `  • Protocol allocation shift\n` +
          `  • Curator rebalance\n` +
          `  • Withdrawal delays`
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

  // ── /setemail [addr] ──────────────────────────────────────────────────────
  if (text.startsWith("/setemail")) {
    if (!sub) {
      await reply(chatId, `You're not subscribed yet.\n\nType /subscribe 0xYourWallet to start.`);
      return NextResponse.json({ ok: true });
    }
    const arg = text.split(/\s+/)[1]?.trim();
    if (!arg) {
      const current = sub.email ? `Email: ${sub.email}` : `No email set (Telegram only)`;
      await reply(
        chatId,
        `${current}\n\n` +
          `To add or change: /setemail you@example.com\n` +
          `To remove: /setemail remove`
      );
      return NextResponse.json({ ok: true });
    }
    if (arg.toLowerCase() === "remove") {
      await setEmail(chatId, null);
      await reply(chatId, `✅ Email removed. You'll receive alerts on Telegram only.`);
    } else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(arg)) {
      await setEmail(chatId, arg.toLowerCase());
      await reply(chatId, `✅ Email set to ${arg.toLowerCase()}.`);
    } else {
      await reply(chatId, `That doesn't look like a valid email.\n\nUsage: /setemail you@example.com`);
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
      const [{ alerts }, perWalletHealth] = await Promise.all([
        generateEnrichedAlerts(positions),
        buildPerWalletHealth(sub.wallets),
      ]);
      const payload = composeTelegramMessage(
        sub.wallets,
        alerts,
        perWalletHealth[0]?.vaults ?? [],
        { perWalletVaults: perWalletHealth }
      );
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
