/**
 * GET /api/telegram-register-webhook
 *
 * One-time setup: tells Telegram where to send incoming bot messages.
 * Call this once after deploying to production.
 *
 * Required env vars:
 *   TELEGRAM_BOT_TOKEN — your bot token from @BotFather
 *   APP_URL — your deployed URL, e.g. https://yourapp.vercel.app
 *
 * After calling this, Telegram will POST to:
 *   https://yourapp.vercel.app/api/telegram-webhook
 * every time a user messages your bot.
 *
 * Usage:
 *   GET /api/telegram-register-webhook          — register webhook
 *   GET /api/telegram-register-webhook?delete=1 — remove webhook (pause bot)
 *   GET /api/telegram-register-webhook?info=1   — check current webhook status
 */

import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not set" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const appUrl = process.env.APP_URL ?? searchParams.get("url");

  // Info mode — show current webhook status
  if (searchParams.get("info") === "1") {
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const data = await res.json();
    return NextResponse.json(data);
  }

  // Delete mode — remove webhook
  if (searchParams.get("delete") === "1") {
    const res = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`);
    const data = await res.json();
    return NextResponse.json({ deleted: true, telegram: data });
  }

  // Register webhook
  if (!appUrl) {
    return NextResponse.json(
      {
        error:
          "APP_URL env var not set. " +
          "Set it to your deployed URL (e.g. https://yourapp.vercel.app) or pass ?url=https://... as a query param.",
        hint: "For local testing with ngrok: GET /api/telegram-register-webhook?url=https://your-ngrok-url.ngrok.io",
      },
      { status: 400 }
    );
  }

  const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/telegram-webhook`;

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      allowed_updates: ["message"],
      drop_pending_updates: true,
    }),
  });

  const data = await res.json();

  return NextResponse.json({
    registered: res.ok && data.ok,
    webhookUrl,
    telegram: data,
    next:
      res.ok && data.ok
        ? `Webhook registered. Users can now DM your bot and use /subscribe.`
        : `Registration failed: ${data?.description ?? "unknown error"}`,
  });
}
