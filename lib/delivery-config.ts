/**
 * lib/delivery-config.ts
 *
 * Delivery channel configuration model for the Lido Vault Alert Agent.
 *
 * Current setup: single Telegram DM for prototype testing.
 * Migration path: when you create a public bot token via @BotFather, set
 *   TELEGRAM_CHANNEL_TYPE=telegram_bot
 * in your environment.  Everything else (botToken, chatId) stays the same
 * shape — only the operational context changes.
 *
 * Env vars:
 *   TELEGRAM_BOT_TOKEN     — Bot token from @BotFather (required to send)
 *   TELEGRAM_CHAT_ID       — Target chat or channel ID (required to send)
 *   TELEGRAM_CHANNEL_TYPE  — "telegram_dm" (default) | "telegram_bot"
 *                            Set to "telegram_bot" when using a dedicated public bot token.
 *
 * The bot token is NEVER returned in API responses.  Only a masked prefix is
 * included in debug/config output.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * telegram_dm    — Prototype mode. Sending to a private DM chat via a personal
 *                  bot token created for testing. Chat ID is your own user ID.
 *
 * telegram_bot   — Production mode. Dedicated public bot token (@YourBotName).
 *                  Chat ID is the subscriber's user/channel/group ID.
 *                  Supports multi-subscriber expansion in future.
 *
 * unset          — Neither TELEGRAM_BOT_TOKEN nor TELEGRAM_CHAT_ID are configured.
 *                  dryRun mode only.
 */
export type TelegramChannelType = "telegram_dm" | "telegram_bot" | "unset";

export interface TelegramDeliveryConfig {
  channelType: TelegramChannelType;
  /** True when both TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set. */
  ready: boolean;
  /** Which env vars are absent (empty array when ready=true). */
  missing: string[];
  /** Chat ID that messages will be sent to. Safe to include in responses. */
  chatId: string | null;
  /**
   * Masked token prefix for debugging — never the full token.
   * Format: "123456:AB..." or null if unset.
   */
  tokenPrefix: string | null;
  /** Human-readable status note. */
  note: string;
  /** Next step guidance, relevant to current channelType. */
  nextStep: string;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function getTelegramDeliveryConfig(): TelegramDeliveryConfig {
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? null;
  const chatId = process.env.TELEGRAM_CHAT_ID ?? null;
  const channelTypeEnv = process.env.TELEGRAM_CHANNEL_TYPE;

  const missing: string[] = [];
  if (!botToken) missing.push("TELEGRAM_BOT_TOKEN");
  if (!chatId) missing.push("TELEGRAM_CHAT_ID");

  const ready = missing.length === 0;

  // Resolve channelType: default to "telegram_dm" when configured
  const channelType: TelegramChannelType = !ready
    ? "unset"
    : channelTypeEnv === "telegram_bot"
    ? "telegram_bot"
    : "telegram_dm";

  // Mask the token: show first segment (bot ID) + "..." — never the secret part
  const tokenPrefix = botToken
    ? botToken.split(":")[0] + ":..." // e.g. "7412983:..."
    : null;

  let note: string;
  let nextStep: string;

  if (!ready) {
    note = `Telegram delivery not configured. Missing: ${missing.join(", ")}.`;
    nextStep =
      "Create a bot at @BotFather, copy the token into TELEGRAM_BOT_TOKEN, " +
      "and set TELEGRAM_CHAT_ID to your Telegram user ID (for DM testing). " +
      "Use @userinfobot to find your user ID.";
  } else if (channelType === "telegram_dm") {
    note =
      "Delivery configured in DM mode — messages go to a single private chat. " +
      "Good for prototype testing.";
    nextStep =
      "When ready for a public bot: create a separate token via @BotFather, " +
      "set TELEGRAM_CHANNEL_TYPE=telegram_bot, and update TELEGRAM_BOT_TOKEN. " +
      "The chat ID becomes each subscriber's user ID (implement per-user routing).";
  } else {
    note =
      "Delivery configured in bot mode — using a dedicated public bot token.";
    nextStep =
      "Expand to per-subscriber routing: replace the single TELEGRAM_CHAT_ID " +
      "with a subscriber store (database or env list) and iterate on send.";
  }

  return {
    channelType,
    ready,
    missing,
    chatId,
    tokenPrefix,
    note,
    nextStep,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a safe config summary for inclusion in API responses.
 * Never includes the full bot token.
 */
export function deliveryConfigSummary(config: TelegramDeliveryConfig) {
  return {
    channelType: config.channelType,
    ready: config.ready,
    missing: config.missing.length > 0 ? config.missing : undefined,
    chatId: config.chatId,
    tokenPrefix: config.tokenPrefix,
    note: config.note,
    nextStep: config.nextStep,
  };
}
