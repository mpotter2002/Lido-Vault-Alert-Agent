"use client";

import { useState } from "react";
import { Alert } from "@/lib/types";

interface Props {
  alerts: Alert[];
}

export function AlertPanel({ alerts }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (alerts.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-6 text-center backdrop-blur-sm">
        <p className="text-slate-400 text-sm">No active alerts</p>
        <p className="text-slate-600 text-xs mt-1">Your positions look normal.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {alerts.map((alert) => (
        <AlertRow
          key={alert.id}
          alert={alert}
          isExpanded={expanded === alert.id}
          onToggle={() =>
            setExpanded(expanded === alert.id ? null : alert.id)
          }
        />
      ))}
    </div>
  );
}

function AlertRow({
  alert,
  isExpanded,
  onToggle,
}: {
  alert: Alert;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { border, icon, badge } = severityStyles(alert.severity);

  return (
    <div
      className={`rounded-xl border ${border} bg-slate-800/70 backdrop-blur-sm overflow-hidden`}
    >
      <button
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-slate-700/30 transition-colors"
        onClick={onToggle}
      >
        <span className="mt-0.5 text-lg flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white">{alert.title}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide ${badge}`}>
              {alert.severity}
            </span>
            <span className="text-[10px] text-slate-500 ml-auto">
              {alert.vaultName} &middot; {formatAge(alert.timestamp)}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400 leading-relaxed line-clamp-2">
            {alert.summary}
          </p>
        </div>
        <span className="text-slate-600 text-xs mt-1 flex-shrink-0">
          {isExpanded ? "▲" : "▼"}
        </span>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-700/50">
          <p className="text-xs text-slate-300 leading-relaxed mb-3">{alert.summary}</p>

          <div className="rounded-lg bg-slate-900/60 px-3 py-2 mb-3">
            <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-1 font-medium">
              Technical detail
            </p>
            <p className="text-xs text-slate-400 font-mono leading-relaxed">
              {alert.technicalDetail}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {alert.actionRequired ? (
              <span className="text-[11px] px-2 py-1 rounded bg-amber-900/50 border border-amber-700 text-amber-300 font-medium">
                Action may be needed
              </span>
            ) : (
              <span className="text-[11px] px-2 py-1 rounded bg-slate-700/50 border border-slate-600 text-slate-400">
                No action needed
              </span>
            )}
            {alert.suggestedAction && (
              <p className="text-xs text-slate-400 italic">{alert.suggestedAction}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function severityStyles(severity: Alert["severity"]) {
  switch (severity) {
    case "critical":
      return {
        border: "border-red-700/70",
        icon: "🔴",
        badge: "bg-red-900/60 text-red-400 border border-red-700",
      };
    case "warning":
      return {
        border: "border-amber-700/60",
        icon: "🟡",
        badge: "bg-amber-900/60 text-amber-400 border border-amber-700",
      };
    case "info":
    default:
      return {
        border: "border-slate-600/60",
        icon: "🔵",
        badge: "bg-slate-700/60 text-slate-400 border border-slate-600",
      };
  }
}

function formatAge(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const hours = diffMs / (1000 * 60 * 60);
  if (hours < 1) return `${Math.round(hours * 60)}m ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
