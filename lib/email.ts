/**
 * lib/email.ts
 *
 * Sends alert emails via Nodemailer + Gmail SMTP.
 *
 * Setup:
 *   1. Enable 2-Step Verification on your Google account
 *   2. Go to myaccount.google.com/apppasswords → generate an App Password
 *   3. Set GMAIL_USER and GMAIL_APP_PASSWORD in your environment
 *
 * Falls back gracefully if env vars are not set — errors are logged, not thrown.
 */

import nodemailer from "nodemailer";

export interface EmailResult {
  ok: boolean;
  error?: string;
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<EmailResult> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    return { ok: false, error: "GMAIL_USER or GMAIL_APP_PASSWORD not set" };
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: `"Lido Vault Alert Agent" <${user}>`,
      to,
      subject,
      text: body,
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
