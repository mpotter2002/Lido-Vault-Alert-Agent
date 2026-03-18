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

export function formatTelegramAlert(
  wallet: string,
  alerts: Alert[],
  vaultSummaries: VaultHealthSummary[]
): string {
  const critical = alerts.filter((a) => a.severity === "critical");
  const warnings = alerts.filter((a) => a.severity === "warning");

  const statusEmoji =
    critical.length > 0 ? "🚨" : warnings.length > 0 ? "⚠️" : "✅";
  const statusLabel =
    critical.length > 0
      ? `${critical.length} CRITICAL`
      : warnings.length > 0
      ? `${warnings.length} warning${warnings.length > 1 ? "s" : ""}`
      : "All clear";

  const shortWallet = `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;

  const lines: string[] = [];
  lines.push(`${statusEmoji} *Lido Vault Monitor* \\— ${escapeMd(statusLabel)}`);
  lines.push(`Wallet: \`${shortWallet}\``);
  lines.push("");

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
  const dataNote = vaultSummaries[0]?.freshness.source === "seeded"
    ? "⚠️ _Vault state: seeded demo data_"
    : "✅ _Vault state: live_";
  lines.push(dataNote);
  lines.push(`🤖 _Lido Vault Alert Agent_`);

  return lines.join("\n");
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
  const dataSource = vaultSummaries[0]?.freshness.source ?? "seeded";
  bodyLines.push(`DATA SOURCE: ${dataSource.toUpperCase()}`);
  if (dataSource === "seeded") {
    bodyLines.push("NOTE: Vault state is seeded demo data. Wire live SDK reads for production.");
  }
  bodyLines.push("");
  bodyLines.push("-- Lido Vault Alert Agent");

  return { subject, body: bodyLines.join("\n") };
}
