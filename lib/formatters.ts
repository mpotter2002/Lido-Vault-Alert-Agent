import { Alert } from "./types";
import { VaultHealthSummary } from "./domain";

// ---------------------------------------------------------------------------
// Telegram alert formatting
//
// Telegram supports MarkdownV2 in bots. This helper produces a compact
// multi-vault digest that is ready to drop into a bot sendMessage() call.
// Special chars that must be escaped in MarkdownV2: _ * [ ] ( ) ~ ` > # + - = | { } . !
// ---------------------------------------------------------------------------

function escapeMd(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, (c) => `\\${c}`);
}

// ---------------------------------------------------------------------------
// Structured Telegram message payload
//
// Use composeTelegramMessage() to get a payload object ready to POST to the
// Telegram Bot API sendMessage endpoint. Pass `payload.sendPayload` directly
// as the request body.
// ---------------------------------------------------------------------------

export interface TelegramMessageMeta {
  alertCount: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  actionRequiredCount: number;
  hasActionRequired: boolean;
  /** True when at least one alert has severity=critical. Use for routing / escalation. */
  isCritical: boolean;
  dataMode: "seeded_demo" | "live";
}

export interface TelegramMessagePayload {
  /** The MarkdownV2-formatted message text. */
  text: string;
  /** Always "MarkdownV2". */
  parse_mode: "MarkdownV2";
  /** Suppress link previews — recommended for alert digests. */
  disable_web_page_preview: boolean;
  /**
   * When true the message arrives silently (no sound/vibration).
   * Set for low-severity digests; false for critical alerts.
   */
  disable_notification: boolean;
  /** Agent-readable metadata about the alert content. Not sent to Telegram. */
  meta: TelegramMessageMeta;
}

/**
 * Build a structured Telegram message payload for a vault alert digest.
 *
 * `sendPayload` contains exactly the fields the Telegram Bot API expects
 * (minus chat_id, which the caller injects):
 *   { text, parse_mode, disable_web_page_preview, disable_notification }
 *
 * `meta` is agent-readable metadata — useful for routing decisions, filtering
 * by severity before send, or building downstream summaries.
 */
export function composeTelegramMessage(
  wallet: string,
  alerts: Alert[],
  vaultSummaries: VaultHealthSummary[],
  options: { silent?: boolean } = {}
): TelegramMessagePayload {
  const critical = alerts.filter((a) => a.severity === "critical");
  const warnings = alerts.filter((a) => a.severity === "warning");
  const infos = alerts.filter((a) => a.severity === "info");
  const actionRequired = alerts.filter((a) => a.actionRequired);
  const isCritical = critical.length > 0;

  const statusEmoji = isCritical ? "🚨" : warnings.length > 0 ? "⚠️" : "✅";
  const statusLabel = isCritical
    ? `${critical.length} CRITICAL`
    : warnings.length > 0
    ? `${warnings.length} warning${warnings.length > 1 ? "s" : ""}`
    : "All clear";

  const shortWallet = `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;

  const lines: string[] = [];
  lines.push(`${statusEmoji} *Lido Vault Monitor* \\— ${escapeMd(statusLabel)}`);
  lines.push(`Wallet: \`${shortWallet}\``);
  lines.push("");

  // Wallet position — always shown
  if (vaultSummaries.length > 0) {
    lines.push("*Your Position*");
    for (const vs of vaultSummaries) {
      const pos = vs.walletPosition;
      const apyStr = escapeMd(`${vs.currentAPY.toFixed(2)}% APY`);
      if (pos.source === "live_wallet_read" && pos.deposited !== null && pos.deposited > 0) {
        const asset = vs.vaultId === "earnETH" ? "ETH" : "USDC";
        const amount = escapeMd(`${pos.deposited.toFixed(4)} ${asset}`);
        lines.push(`• *${escapeMd(vs.vaultName)}*: ${amount} \\(${apyStr}\\)`);
      } else if (pos.source === "live_wallet_read" && (pos.deposited === null || pos.deposited === 0)) {
        lines.push(`• *${escapeMd(vs.vaultName)}*: ⏳ deposit pending \\(${apyStr}\\)`);
      } else {
        lines.push(`• *${escapeMd(vs.vaultName)}*: no position \\(${apyStr}\\)`);
      }
    }
    lines.push("");
  }

  // Alert list (top 5 max for Telegram brevity)
  const topAlerts = alerts.slice(0, 5);
  for (const a of topAlerts) {
    const icon = a.severity === "critical" ? "🔴" : a.severity === "warning" ? "🟡" : "🔵";
    lines.push(`${icon} *${escapeMd(a.title)}*`);
    lines.push(`_${escapeMd(a.summary.slice(0, 160))}${a.summary.length > 160 ? "…" : ""}_`);
    if (a.suggestedAction) {
      lines.push(`→ ${escapeMd(a.suggestedAction)}`);
    }
    lines.push("");
  }

  if (alerts.length > 5) {
    lines.push(`_\\+${alerts.length - 5} more alerts_`);
    lines.push("");
  }

  // Recommendations
  if (vaultSummaries.length > 0) {
    lines.push("*Recommendations*");
    for (const vs of vaultSummaries) {
      const urgEmoji =
        vs.recommendation.urgency === "high"
          ? "🔴"
          : vs.recommendation.urgency === "medium"
          ? "🟡"
          : vs.recommendation.urgency === "low"
          ? "🔵"
          : "🟢";
      lines.push(
        `${urgEmoji} *${escapeMd(vs.vaultName)}*: ${escapeMd(vs.recommendation.headline)}`
      );
    }
    lines.push("");
  }

  // Data source disclaimer
  const vaultSource = vaultSummaries[0]?.freshness.source;
  const isSeededDemo = vaultSource === "seeded_demo";
  const dataMode: "seeded_demo" | "live" | "partial_live" = isSeededDemo ? "seeded_demo" : "live";
  lines.push(isSeededDemo ? "⚠️ _Vault state: seeded demo data_" : "✅ _Vault state: live_");
  lines.push(`🤖 _Lido Vault Alert Agent_`);

  const text = lines.join("\n");

  // Silence non-critical notifications unless caller overrides
  const disable_notification = options.silent !== undefined ? options.silent : !isCritical;

  return {
    text,
    parse_mode: "MarkdownV2",
    disable_web_page_preview: true,
    disable_notification,
    meta: {
      alertCount: alerts.length,
      criticalCount: critical.length,
      warningCount: warnings.length,
      infoCount: infos.length,
      actionRequiredCount: actionRequired.length,
      hasActionRequired: actionRequired.length > 0,
      isCritical,
      dataMode,
    },
  };
}

/**
 * @deprecated Use composeTelegramMessage() and access .text instead.
 * Kept for backward compatibility with existing call sites.
 */
export function formatTelegramAlert(
  wallet: string,
  alerts: Alert[],
  vaultSummaries: VaultHealthSummary[]
): string {
  return composeTelegramMessage(wallet, alerts, vaultSummaries).text;
}

// ---------------------------------------------------------------------------
// Plain-text email formatting
// ---------------------------------------------------------------------------

export interface EmailAlert {
  subject: string;
  body: string;
}

export function formatEmailAlert(
  wallet: string,
  alerts: Alert[],
  vaultSummaries: VaultHealthSummary[]
): EmailAlert {
  const critical = alerts.filter((a) => a.severity === "critical");
  const warnings = alerts.filter((a) => a.severity === "warning");

  const severityLabel =
    critical.length > 0
      ? `[CRITICAL]`
      : warnings.length > 0
      ? `[WARNING]`
      : `[INFO]`;

  const topAlert = alerts[0];
  const subject = topAlert
    ? `${severityLabel} Lido Vault Alert — ${topAlert.title}`
    : `[INFO] Lido Vault Monitor — All clear`;

  const shortWallet = `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
  const generatedAt = new Date().toUTCString();

  const bodyLines: string[] = [
    `Lido Vault Alert Agent`,
    `======================`,
    `Wallet: ${shortWallet}`,
    `Generated: ${generatedAt}`,
    ``,
    `ALERT SUMMARY`,
    `-------------`,
    `Critical: ${critical.length}`,
    `Warning:  ${warnings.length}`,
    `Info:     ${alerts.filter((a) => a.severity === "info").length}`,
    `Total:    ${alerts.length}`,
    ``,
  ];

  if (alerts.length === 0) {
    bodyLines.push("No active alerts. All vaults are healthy.");
  } else {
    bodyLines.push("ACTIVE ALERTS");
    bodyLines.push("-------------");
    for (const a of alerts) {
      const sev = a.severity.toUpperCase().padEnd(8);
      bodyLines.push(`[${sev}] ${a.title}`);
      bodyLines.push(`Vault: ${a.vaultName}`);
      bodyLines.push(`What changed: ${a.summary}`);
      if (a.technicalDetail) {
        bodyLines.push(`Technical: ${a.technicalDetail}`);
      }
      if (a.suggestedAction) {
        bodyLines.push(`Action: ${a.suggestedAction}`);
      }
      bodyLines.push("");
    }
  }

  if (vaultSummaries.length > 0) {
    bodyLines.push("RECOMMENDATIONS");
    bodyLines.push("---------------");
    for (const vs of vaultSummaries) {
      bodyLines.push(`${vs.vaultName} (${vs.health.toUpperCase()})`);
      bodyLines.push(`  APY: ${vs.currentAPY.toFixed(2)}%`);
      bodyLines.push(`  Benchmark: ${vs.benchmark.benchmarkName} ${vs.benchmark.benchmarkAPY.toFixed(2)}% (spread: ${vs.benchmark.spreadBps > 0 ? "+" : ""}${vs.benchmark.spreadBps}bps)`);
      bodyLines.push(`  Action: ${vs.recommendation.action.replace(/_/g, " ")}`);
      bodyLines.push(`  ${vs.recommendation.headline}`);
      bodyLines.push(`  Rationale: ${vs.recommendation.rationale}`);
      bodyLines.push("");
    }
  }

  // Data source note
  const dataSource = vaultSummaries[0]?.freshness.source ?? "seeded_demo";
  bodyLines.push(`DATA SOURCE: ${dataSource.toUpperCase()}`);
  if (dataSource === "seeded_demo") {
    bodyLines.push("NOTE: Vault state is seeded demo data. Wire live SDK reads for production.");
  }
  bodyLines.push("");
  bodyLines.push("-- Lido Vault Alert Agent");

  return { subject, body: bodyLines.join("\n") };
}
