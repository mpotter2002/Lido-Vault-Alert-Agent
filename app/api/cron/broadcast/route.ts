/**
 * GET /api/cron/broadcast
 *
 * Vercel Cron endpoint — called automatically every hour by Vercel's scheduler.
 * Vercel injects Authorization: Bearer <CRON_SECRET> on every cron invocation.
 *
 * Internally calls /api/telegram-broadcast, which:
 *   - fetches live vault state (APY, TVL, allocations, benchmarks)
 *   - reads each subscriber's wallet positions on-chain
 *   - sends a Telegram (+ optional email) alert to any subscriber
 *     who has relevant alerts firing (respects their alertLevel + yield floor)
 *   - silently skips subscribers with nothing to report
 *
 * Schedule: every hour at :00 (see vercel.json)
 */

import { NextResponse } from "next/server";

export async function GET(request: Request) {
  // Vercel automatically passes CRON_SECRET as a Bearer token on cron invocations.
  // Reject anything else so this route can't be triggered externally.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const baseUrl = process.env.BASE_URL ?? "https://lidovaultagent.vercel.app";
  const broadcastSecret = process.env.BROADCAST_SECRET;

  const res = await fetch(`${baseUrl}/api/telegram-broadcast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(broadcastSecret ? { Authorization: `Bearer ${broadcastSecret}` } : {}),
    },
    body: JSON.stringify({}),
  });

  const data = await res.json().catch(() => ({}));

  return NextResponse.json({
    cronRanAt: new Date().toISOString(),
    broadcastStatus: res.status,
    ...data,
  });
}
