/**
 * lib/subscribers.ts
 *
 * Supabase-backed subscriber store.
 * Each subscriber has a Telegram chat_id, wallet address, alert level,
 * and a personal yield floor (minimum APY before they get alerted).
 *
 * Onboarding steps tracked via pendingStep:
 *   null         — fully onboarded
 *   "alertLevel" — waiting for 1/2 reply
 *   "yieldFloor" — waiting for APY floor reply
 */

import { createClient } from "@supabase/supabase-js";

export type AlertLevel = "critical" | "all";
export type OnboardingStep = "alertLevel" | "yieldFloor" | null;

export const DEFAULT_YIELD_FLOOR_PCT = 3;

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

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  return createClient(url, key);
}

function toSubscriber(row: Record<string, unknown>): Subscriber {
  return {
    chatId: row.chat_id as string,
    wallet: row.wallet as string,
    subscribedAt: row.subscribed_at as string,
    alertLevel: (row.alert_level as AlertLevel) ?? "all",
    yieldFloorPct: Number(row.yield_floor_pct ?? DEFAULT_YIELD_FLOOR_PCT),
    pendingStep: (row.pending_step as OnboardingStep) ?? null,
  };
}

export async function getSubscribers(): Promise<Subscriber[]> {
  try {
    const { data, error } = await getClient().from("subscribers").select("*");
    if (error) return [];
    return (data ?? []).map(toSubscriber);
  } catch {
    return [];
  }
}

/** Register or update a subscriber. Resets onboarding to the first step. */
export async function addSubscriber(chatId: string, wallet: string): Promise<boolean> {
  try {
    const { error } = await getClient().from("subscribers").upsert({
      chat_id: chatId,
      wallet,
      subscribed_at: new Date().toISOString(),
      alert_level: "all",
      pending_step: "alertLevel",
    });
    return !error;
  } catch {
    return false;
  }
}

/** Set alert level and advance onboarding to the yield floor step. */
export async function setAlertLevel(chatId: string, level: AlertLevel): Promise<boolean> {
  try {
    const { error } = await getClient()
      .from("subscribers")
      .update({ alert_level: level, pending_step: "yieldFloor" })
      .eq("chat_id", chatId);
    return !error;
  } catch {
    return false;
  }
}

/** Set the personal yield floor and complete onboarding. */
export async function setYieldFloor(chatId: string, pct: number): Promise<boolean> {
  try {
    const { error } = await getClient()
      .from("subscribers")
      .update({ yield_floor_pct: pct, pending_step: null })
      .eq("chat_id", chatId);
    return !error;
  } catch {
    return false;
  }
}

export async function clearPendingStep(chatId: string): Promise<boolean> {
  try {
    const { error } = await getClient()
      .from("subscribers")
      .update({ pending_step: null })
      .eq("chat_id", chatId);
    return !error;
  } catch {
    return false;
  }
}

export async function removeSubscriber(chatId: string): Promise<boolean> {
  try {
    const { error } = await getClient().from("subscribers").delete().eq("chat_id", chatId);
    return !error;
  } catch {
    return false;
  }
}

export async function subscriberCount(): Promise<number> {
  try {
    const { count } = await getClient()
      .from("subscribers")
      .select("*", { count: "exact", head: true });
    return count ?? 0;
  } catch {
    return 0;
  }
}
