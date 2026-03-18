#!/usr/bin/env node
/**
 * scripts/send-telegram.mjs
 *
 * Standalone Node.js script to test real Telegram alert delivery.
 * Fetches the formatted alert from the running Next.js dev server and
 * delivers it to the configured Telegram channel.
 *
 * Prerequisites:
 *   1. Copy .env.local.example → .env.local and fill in:
 *        TELEGRAM_BOT_TOKEN=<your-bot-token>
 *        TELEGRAM_CHAT_ID=<your-chat-id>
 *   2. Start the dev server:  npm run dev
 *   3. Run this script:       node scripts/send-telegram.mjs
 *
 * Options:
 *   --dry-run   Print the formatted message without sending to Telegram.
 *   --host      Base URL of the dev server (default: http://localhost:3000).
 *
 * Examples:
 *   node scripts/send-telegram.mjs --dry-run
 *   node scripts/send-telegram.mjs
 *   node scripts/send-telegram.mjs --host http://localhost:3001
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const hostIdx = args.indexOf("--host");
const host = hostIdx >= 0 ? args[hostIdx + 1] : "http://localhost:3000";

// ---------------------------------------------------------------------------
// Load .env.local if present (simple key=value parser — no dotenv needed)
// ---------------------------------------------------------------------------

function loadEnvLocal() {
  try {
    const envPath = resolve(process.cwd(), ".env.local");
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local does not exist — rely on process.env already set
  }
}

loadEnvLocal();

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n=== Lido Vault Alert Agent — Telegram Send Script ===`);
  console.log(`Host:    ${host}`);
  console.log(`Dry run: ${dryRun}`);
  console.log();

  // 1. Fetch the preview from the running server
  const previewUrl = `${host}/api/telegram-preview`;
  let previewData;

  try {
    console.log(`Fetching alert preview from ${previewUrl} ...`);
    const res = await fetch(previewUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    previewData = await res.json();
  } catch (err) {
    console.error(`\n❌  Failed to fetch preview: ${err.message}`);
    console.error(`    Is the dev server running at ${host}?  (npm run dev)`);
    process.exit(1);
  }

  const { message, alertCount, criticalCount, warningCount, dataMode } = previewData;

  console.log(`Alert count : ${alertCount} (${criticalCount} critical, ${warningCount} warning)`);
  console.log(`Data mode   : ${dataMode}`);
  console.log();
  console.log("--- Formatted message (MarkdownV2) ---");
  console.log(message);
  console.log("--------------------------------------");
  console.log();

  if (dryRun) {
    console.log("✅  Dry run — message NOT sent.  Remove --dry-run to deliver.");
    return;
  }

  // 2. Send via the /api/telegram-send endpoint (POST with dryRun:false)
  const sendUrl = `${host}/api/telegram-send`;
  console.log(`Sending to Telegram via ${sendUrl} ...`);

  let sendData;
  try {
    const res = await fetch(sendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun: false }),
    });
    sendData = await res.json();
  } catch (err) {
    console.error(`\n❌  Send request failed: ${err.message}`);
    process.exit(1);
  }

  if (sendData.sent) {
    console.log("✅  Message delivered to Telegram.");
    console.log(`    Chat ID  : ${process.env.TELEGRAM_CHAT_ID ?? "(from server env)"}`);
    console.log(`    Alerts   : ${sendData.alertCount}`);
  } else if (sendData.error) {
    console.error(`\n❌  Telegram delivery failed: ${sendData.error}`);
    if (sendData.error.includes("TELEGRAM_BOT_TOKEN")) {
      console.error(
        "\n    Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env.local"
      );
    }
    process.exit(1);
  } else {
    console.log("Response:", JSON.stringify(sendData, null, 2));
  }
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
