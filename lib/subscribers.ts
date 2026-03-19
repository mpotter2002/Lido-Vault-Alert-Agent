/**
 * lib/subscribers.ts
 *
 * File-based subscriber store.
 * Each subscriber has a Telegram chat_id, wallet address, alert level,
 * and a personal yield floor (minimum APY before they get alerted).
 *
 * Onboarding steps tracked via pendingStep:
 *   null        — fully onboarded
 *   "alertLevel" — waiting for 1/2 reply
 *   "yieldFloor" — waiting for APY floor reply
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

export type AlertLevel = "critical" | "all";
export type OnboardingStep = "alertLevel" | "yieldFloor" | null;

export const DEFAULT_YIELD_FLOOR_PCT = 3; // 3% — alert if vault APY drops below this

export interface Subscriber {
  chatId: string;
  wallet: string;
  subscribedAt: string;
  alertLevel: AlertLevel;
  /** Minimum acceptable APY (%). Alert fires if any vault drops below this. */
  yieldFloorPct: number;
  /** Current onboarding step awaiting a reply, or null if complete. */
  pendingStep: OnboardingStep;
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
    return parsed.subscribers.map((s: Partial<Subscriber> & { pendingOnboarding?: boolean }) => ({
      alertLevel: "all" as AlertLevel,
      yieldFloorPct: DEFAULT_YIELD_FLOOR_PCT,
      // back-compat: old records used pendingOnboarding boolean
      pendingStep: s.pendingStep ?? (s.pendingOnboarding ? "alertLevel" : null),
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

/** Register or update a subscriber. Resets onboarding to the first step. */
export function addSubscriber(chatId: string, wallet: string): boolean {
  const subscribers = getSubscribers();
  const existing = subscribers.find((s) => s.chatId === chatId);
  if (existing) {
    existing.wallet = wallet;
    existing.subscribedAt = new Date().toISOString();
    existing.pendingStep = "alertLevel";
  } else {
    subscribers.push({
      chatId,
      wallet,
      subscribedAt: new Date().toISOString(),
      alertLevel: "all",
      yieldFloorPct: DEFAULT_YIELD_FLOOR_PCT,
      pendingStep: "alertLevel",
    });
  }
  return save(subscribers);
}

/** Set alert level and advance onboarding to the yield floor step. */
export function setAlertLevel(chatId: string, level: AlertLevel): boolean {
  const subscribers = getSubscribers();
  const sub = subscribers.find((s) => s.chatId === chatId);
  if (!sub) return false;
  sub.alertLevel = level;
  sub.pendingStep = "yieldFloor";
  return save(subscribers);
}

/** Set the personal yield floor and complete onboarding. */
export function setYieldFloor(chatId: string, pct: number): boolean {
  const subscribers = getSubscribers();
  const sub = subscribers.find((s) => s.chatId === chatId);
  if (!sub) return false;
  sub.yieldFloorPct = pct;
  sub.pendingStep = null;
  return save(subscribers);
}

export function clearPendingStep(chatId: string): boolean {
  const subscribers = getSubscribers();
  const sub = subscribers.find((s) => s.chatId === chatId);
  if (!sub) return false;
  sub.pendingStep = null;
  return save(subscribers);
}

export function removeSubscriber(chatId: string): boolean {
  try {
    return save(getSubscribers().filter((s) => s.chatId !== chatId));
  } catch {
    return false;
  }
}

export function subscriberCount(): number {
  return getSubscribers().length;
}
