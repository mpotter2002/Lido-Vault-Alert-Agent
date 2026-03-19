/**
 * lib/subscribers.ts
 *
 * File-based subscriber store.
 * Each subscriber has a Telegram chat_id, an Ethereum wallet address,
 * and an alert level preference set during onboarding.
 *
 * Storage:
 *   Local dev  — ./data/subscribers.json  (set DATA_DIR env var to override)
 *   Production — same path; on Vercel use a volume or swap to Vercel KV
 *
 * Format:
 *   { "subscribers": [{ chatId, wallet, subscribedAt, alertLevel, pendingOnboarding }] }
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

export type AlertLevel = "critical" | "all";

export interface Subscriber {
  chatId: string;
  wallet: string;
  subscribedAt: string;
  alertLevel: AlertLevel;
  /** true while waiting for the user to reply to the onboarding question */
  pendingOnboarding: boolean;
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
    if (!Array.isArray(parsed?.subscribers)) return [];
    // Back-compat: fill defaults for older records
    return parsed.subscribers.map((s: Partial<Subscriber>) => ({
      alertLevel: "all",
      pendingOnboarding: false,
      ...s,
    })) as Subscriber[];
  } catch {
    return [];
  }
}

function save(subscribers: Subscriber[]): boolean {
  try {
    writeFileSync(dataFile(), JSON.stringify({ subscribers }, null, 2));
    return true;
  } catch {
    return false;
  }
}

export function addSubscriber(chatId: string, wallet: string): boolean {
  const subscribers = getSubscribers();
  const existing = subscribers.find((s) => s.chatId === chatId);
  if (existing) {
    existing.wallet = wallet;
    existing.subscribedAt = new Date().toISOString();
    existing.pendingOnboarding = true;
  } else {
    subscribers.push({
      chatId,
      wallet,
      subscribedAt: new Date().toISOString(),
      alertLevel: "all",
      pendingOnboarding: true,
    });
  }
  return save(subscribers);
}

export function setAlertLevel(chatId: string, level: AlertLevel): boolean {
  const subscribers = getSubscribers();
  const sub = subscribers.find((s) => s.chatId === chatId);
  if (!sub) return false;
  sub.alertLevel = level;
  sub.pendingOnboarding = false;
  return save(subscribers);
}

export function clearPendingOnboarding(chatId: string): boolean {
  const subscribers = getSubscribers();
  const sub = subscribers.find((s) => s.chatId === chatId);
  if (!sub) return false;
  sub.pendingOnboarding = false;
  return save(subscribers);
}

export function removeSubscriber(chatId: string): boolean {
  try {
    const subscribers = getSubscribers().filter((s) => s.chatId !== chatId);
    return save(subscribers);
  } catch {
    return false;
  }
}

export function subscriberCount(): number {
  return getSubscribers().length;
}
