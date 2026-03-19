/**
 * lib/subscribers.ts
 *
 * File-based subscriber store.
 * Each subscriber has a Telegram chat_id and an Ethereum wallet address.
 * The agent monitors vault positions for each wallet and sends personalized
 * Telegram alerts when something changes.
 *
 * Storage:
 *   Local dev  — ./data/subscribers.json  (set DATA_DIR env var to override)
 *   Production — same path; on Vercel use a volume or swap to Vercel KV
 *
 * Format:
 *   { "subscribers": [{ chatId, wallet, subscribedAt }] }
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

export interface Subscriber {
  chatId: string;
  wallet: string;
  subscribedAt: string;
}

function dataFile(): string {
  const dir = process.env.DATA_DIR ?? join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "subscribers.json");
}

export function getSubscribers(): Subscriber[] {
  try {
    const file = dataFile();
    if (!existsSync(file)) return [];
    const raw = readFileSync(file, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.subscribers) ? parsed.subscribers : [];
  } catch {
    return [];
  }
}

export function addSubscriber(chatId: string, wallet: string): boolean {
  try {
    const subscribers = getSubscribers();
    const existing = subscribers.find((s) => s.chatId === chatId);
    if (existing) {
      existing.wallet = wallet;
      existing.subscribedAt = new Date().toISOString();
    } else {
      subscribers.push({ chatId, wallet, subscribedAt: new Date().toISOString() });
    }
    writeFileSync(dataFile(), JSON.stringify({ subscribers }, null, 2));
    return true;
  } catch {
    return false;
  }
}

export function removeSubscriber(chatId: string): boolean {
  try {
    const subscribers = getSubscribers().filter((s) => s.chatId !== chatId);
    writeFileSync(dataFile(), JSON.stringify({ subscribers }, null, 2));
    return true;
  } catch {
    return false;
  }
}

export function subscriberCount(): number {
  return getSubscribers().length;
}
