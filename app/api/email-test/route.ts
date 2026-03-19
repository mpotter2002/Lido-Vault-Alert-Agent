/**
 * GET /api/email-test?to=you@example.com
 *
 * Sends a test email to verify Gmail SMTP is configured correctly.
 * Pass ?to= to override the recipient (defaults to GMAIL_USER).
 */

import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const to = searchParams.get("to") ?? process.env.GMAIL_USER;

  if (!to) {
    return NextResponse.json({ error: "Pass ?to=you@example.com or set GMAIL_USER" }, { status: 400 });
  }

  const result = await sendEmail(
    to,
    "✅ Lido Vault Alert Agent — test email",
    `This is a test email from your Lido Vault Alert Agent.\n\nIf you received this, Gmail SMTP is configured correctly.\n\n-- Lido Vault Alert Agent`
  );

  return NextResponse.json({ to, ...result });
}
