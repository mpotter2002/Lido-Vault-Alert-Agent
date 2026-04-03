/**
 * POST /api/telegram-broadcast
 *
 * Sends personalized vault alerts to all subscribers via Telegram.
 * Subscribers who have an email set also receive an email alert via Gmail SMTP.
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
 *   { sent, skipped, results: [{ chatId, wallet, sent, alertCount, email?, emailSent? }] }
 */

import { NextResponse } from "next/server";
import { getSubscribers } from "@/lib/subscribers";
import { buildLivePositions } from "@/lib/live-positions";
import { buildHealthResponse } from "@/lib/health-builder";
import { generateEnrichedAlerts, claimableSharesAlerts } from "@/lib/alert-engine";
import { composeTelegramMessage, formatEmailAlert } from "@/lib/formatters";
import { sendEmail } from "@/lib/email";
import { VaultHealthSummary } from "@/lib/domain";
import { shouldNotifyTvlThreshold, setLastNotifiedThreshold } from "@/lib/tvl-threshold-tracker";

/** Fetch health for each wallet independently and return per-wallet results. */
async function buildPerWalletHealth(
  wallets: string[]
): Promise<{ wallet: string; vaults: VaultHealthSummary[] }[]> {
  if (wallets.length === 0) return [];
  const responses = await Promise.all(wallets.map((w) => buildHealthResponse(w)));
  return wallets.map((wallet, i) => ({ wallet, vaults: responses[i].vaults }));
}

export async function POST(request: Request) {
  // Require Authorization: Bearer <BROADCAST_SECRET>
  const secret = process.env.BROADCAST_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

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

  const subscribers = await getSubscribers();
  if (!subscribers.length) {
    return NextResponse.json({ sent: 0, skipped: 0, message: "No subscribers yet." });
  }

  // Build live vault state once — shared across all subscribers
  const { positions } = await buildLivePositions();
  const { alerts: rawAlerts } = await generateEnrichedAlerts(positions);

  // Filter TVL cap alerts through threshold tracker so each milestone
  // (25%, 50%, 75%, 90%, 98%) is only sent once, not every hour.
  const tvlVaultIdsToNotify = new Set<string>();
  const tvlThresholdUpdates: { vaultId: string; thresholdPct: number }[] = [];
  for (const pos of positions) {
    const utilizationPct = (pos.tvl / pos.tvlCapUSD) * 100;
    const result = await shouldNotifyTvlThreshold(pos.vaultId, utilizationPct);
    if (result.notify) {
      tvlVaultIdsToNotify.add(pos.vaultId);
      tvlThresholdUpdates.push({ vaultId: pos.vaultId, thresholdPct: result.thresholdPct });
    }
  }

  const alerts = rawAlerts.filter((a) => {
    if (a.type !== "tvl_cap_approaching") return true;
    return tvlVaultIdsToNotify.has(a.vaultId);
  });

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

  const criticalAlerts = alerts.filter((a) => a.severity === "critical");

  // Send personalized message to each subscriber (respecting their preferences)
  const results = await Promise.allSettled(
    subscribers.map(async (sub) => {
      // 1. Start with alerts filtered by their level preference
      let relevantAlerts =
        sub.alertLevel === "critical" ? criticalAlerts : alerts;

      // 2. Add a personal yield-floor alert if any vault APY is below their floor
      //    (this fires even in "critical" mode since it's their personal threshold)
      const yieldFloorBreaches = positions
        .filter((pos) => pos.currentAPY > 0 && pos.currentAPY < sub.yieldFloorPct)
        .map((pos) => ({
          id: `floor-${pos.vaultId}-${sub.chatId}`,
          vaultName: pos.vaultName,
          vaultId: pos.vaultId,
          type: "benchmark_underperformance" as const,
          severity: "warning" as const,
          title: `${pos.vaultName} APY (${pos.currentAPY.toFixed(2)}%) is below your ${sub.yieldFloorPct}% floor`,
          summary:
            `${pos.vaultName} is currently earning ${pos.currentAPY.toFixed(2)}% APY, ` +
            `which is below your personal yield floor of ${sub.yieldFloorPct}%.`,
          technicalDetail: `Vault APY: ${pos.currentAPY.toFixed(2)}%. Your floor: ${sub.yieldFloorPct}%.`,
          actionRequired: false,
          suggestedAction: "Review your position or update your floor with /setfloor.",
          timestamp: new Date(),
          dismissed: false,
        }));

      // Merge, deduplicating any vault already covered by a system alert
      const coveredVaults = new Set(relevantAlerts.map((a) => a.vaultId));
      const personalAlerts = yieldFloorBreaches.filter((a) => !coveredVaults.has(a.vaultId));
      relevantAlerts = [...relevantAlerts, ...personalAlerts];

      if (relevantAlerts.length === 0 && !dryRun) {
        return {
          chatId: sub.chatId,
          wallets: sub.wallets,
          sent: false,
          skipped: true,
          reason: `alertLevel=${sub.alertLevel}, floor=${sub.yieldFloorPct}%, no relevant alerts`,
        };
      }

      // Fetch per-wallet positions for display
      const perWalletHealth = await buildPerWalletHealth(sub.wallets);

      // Append per-wallet claimable share alerts
      const claimable = claimableSharesAlerts(
        perWalletHealth.flatMap(({ wallet: w, vaults }) =>
          vaults.map((vs) => ({
            wallet: w,
            vaultId: vs.vaultId,
            vaultName: vs.vaultName,
            claimableShares: vs.walletPosition.claimableShares ?? 0,
          }))
        )
      );
      relevantAlerts = [...relevantAlerts, ...claimable];

      const payload = composeTelegramMessage(
        sub.wallets,
        relevantAlerts,
        perWalletHealth[0]?.vaults ?? [],
        { perWalletVaults: perWalletHealth }
      );

      if (dryRun) {
        const { subject, body } = formatEmailAlert(sub.wallets[0] ?? sub.wallet, relevantAlerts, perWalletHealth[0]?.vaults ?? []);
        return {
          chatId: sub.chatId,
          wallets: sub.wallets,
          sent: false,
          dryRun: true,
          alertCount: alerts.length,
          message: payload.text,
          ...(sub.email ? { email: sub.email, emailSubject: subject, emailBody: body } : {}),
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

      // Also send email if subscriber has one set
      let emailResult: { ok: boolean; error?: string } | undefined;
      if (sub.email) {
        const { subject, body } = formatEmailAlert(sub.wallets[0] ?? sub.wallet, relevantAlerts, perWalletHealth[0]?.vaults ?? []);
        emailResult = await sendEmail(sub.email, subject, body);
      }

      return {
        chatId: sub.chatId,
        wallets: sub.wallets,
        sent: res.ok,
        alertCount: alerts.length,
        ...(sub.email ? { email: sub.email, emailSent: emailResult?.ok, emailError: emailResult?.error } : {}),
        ...(res.ok ? {} : { error: (telegramBody as Record<string, unknown>)?.description }),
      };
    })
  );

  const settled = results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { chatId: subscribers[i].chatId, wallets: subscribers[i].wallets, sent: false, error: String(r.reason) }
  );

  const sentCount = settled.filter((r) => r.sent).length;

  // Update TVL threshold tracker after successful broadcast so the same
  // milestone isn't re-sent next hour
  if (sentCount > 0) {
    await Promise.all(
      tvlThresholdUpdates.map(({ vaultId, thresholdPct }) =>
        setLastNotifiedThreshold(vaultId, thresholdPct)
      )
    );
  }

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
