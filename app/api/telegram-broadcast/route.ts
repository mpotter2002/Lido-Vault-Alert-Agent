/**
 * POST /api/telegram-broadcast
 *
 * Sends personalized vault alerts to all subscribers.
 * Each subscriber gets a message tailored to their wallet position.
 *
 * This is the route your scheduler (cron, Vercel cron, or external scheduler)
 * should call periodically (e.g. every hour).
 *
 * Optional JSON body:
 *   { "dryRun": true }  — compose messages but don't send
 *   { "onlyCritical": true } — only send if there are critical alerts
 *
 * Response:
 *   { sent, skipped, results: [{ chatId, wallet, sent, alertCount }] }
 */

import { NextResponse } from "next/server";
import { getSubscribers } from "@/lib/subscribers";
import { buildLivePositions } from "@/lib/live-positions";
import { buildHealthResponse } from "@/lib/health-builder";
import { generateEnrichedAlerts } from "@/lib/alert-engine";
import { composeTelegramMessage } from "@/lib/formatters";

export async function POST(request: Request) {
  let dryRun = false;
  let onlyCritical = false;

  try {
    const body = await request.json().catch(() => ({}));
    dryRun = body?.dryRun === true;
    onlyCritical = body?.onlyCritical === true;
  } catch {
    // ignore
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!dryRun && !token) {
    return NextResponse.json(
      { error: "TELEGRAM_BOT_TOKEN not set" },
      { status: 400 }
    );
  }

  const subscribers = getSubscribers();
  if (!subscribers.length) {
    return NextResponse.json({ sent: 0, skipped: 0, message: "No subscribers yet." });
  }

  // Build live vault state once — shared across all subscribers
  const { positions } = await buildLivePositions();
  const { alerts } = await generateEnrichedAlerts(positions);

  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const warningCount = alerts.filter((a) => a.severity === "warning").length;

  // If onlyCritical and no critical alerts, skip broadcast
  if (onlyCritical && criticalCount === 0) {
    return NextResponse.json({
      sent: 0,
      skipped: subscribers.length,
      message: `No critical alerts — broadcast skipped (onlyCritical=true). Warnings: ${warningCount}.`,
    });
  }

  // Send personalized message to each subscriber
  const results = await Promise.allSettled(
    subscribers.map(async (sub) => {
      // Read wallet-specific position for this subscriber
      const health = await buildHealthResponse(sub.wallet);
      const payload = composeTelegramMessage(sub.wallet, alerts, health.vaults);

      if (dryRun) {
        return {
          chatId: sub.chatId,
          wallet: sub.wallet,
          sent: false,
          dryRun: true,
          alertCount: alerts.length,
          message: payload.text,
        };
      }

      const res = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: sub.chatId,
            text: payload.text,
            parse_mode: payload.parse_mode,
            disable_web_page_preview: payload.disable_web_page_preview,
            disable_notification: payload.disable_notification,
          }),
        }
      );

      const telegramBody = await res.json().catch(() => ({}));
      return {
        chatId: sub.chatId,
        wallet: sub.wallet,
        sent: res.ok,
        alertCount: alerts.length,
        ...(res.ok ? {} : { error: (telegramBody as Record<string, unknown>)?.description }),
      };
    })
  );

  const settled = results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { chatId: subscribers[i].chatId, wallet: subscribers[i].wallet, sent: false, error: String(r.reason) }
  );

  const sentCount = settled.filter((r) => r.sent).length;

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    dryRun,
    subscriberCount: subscribers.length,
    alertCount: alerts.length,
    criticalCount,
    warningCount,
    sent: sentCount,
    skipped: subscribers.length - sentCount,
    results: settled,
  });
}
