"use client";

import { useState } from "react";
import { VaultCard } from "@/components/VaultCard";
import { AlertPanel } from "@/components/AlertPanel";
import { MOCK_SCENARIOS, SCENARIO_LABELS, DEMO_WALLET } from "@/lib/mock-data";
import { generateEnrichedAlertsSync } from "@/lib/alert-engine";
import { VaultPosition } from "@/lib/types";

export default function Home() {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [positions, setPositions] = useState<VaultPosition[]>([...MOCK_SCENARIOS[0]]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Sync form used here: this is a client component that can't await.
  // Benchmarks shown in the UI will use seeded values; live benchmarks are
  // available via /api/alerts, /api/health, /api/yield-floor.
  const { alerts: allAlerts } = generateEnrichedAlertsSync(positions);
  const alerts = allAlerts.filter((a) => !dismissedIds.has(a.id));
  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const warningCount = alerts.filter((a) => a.severity === "warning").length;

  function handleRefresh() {
    setRefreshing(true);
    setTimeout(() => {
      const nextIdx = (scenarioIdx + 1) % MOCK_SCENARIOS.length;
      setScenarioIdx(nextIdx);
      setPositions([...MOCK_SCENARIOS[nextIdx]]);
      setDismissedIds(new Set());
      setLastRefreshed(new Date());
      setRefreshing(false);
    }, 900);
  }

  function handleDismiss(id: string) {
    setDismissedIds((prev) => { const next = new Set(prev); next.add(id); return next; });
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-xs font-bold">
              L
            </div>
            <div>
              <h1 className="text-sm font-bold text-white">Lido Earn Monitor</h1>
              <p className="text-[11px] text-slate-500">Vault alert agent</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <AlertSummaryBadge critical={criticalCount} warning={warningCount} />
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 hover:border-slate-600 transition-all disabled:opacity-50"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-8">
        {/* Wallet + scenario context */}
        <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            <span>
              Monitoring{" "}
              <span className="font-mono text-slate-400">
                {DEMO_WALLET.slice(0, 6)}…{DEMO_WALLET.slice(-4)}
              </span>
              <span className="ml-2 text-slate-600">(seeded demo — no live reads)</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-slate-600">
              Scenario {scenarioIdx + 1}/{MOCK_SCENARIOS.length}:{" "}
              <span className="text-slate-500">{SCENARIO_LABELS[scenarioIdx]}</span>
            </span>
            <span className="text-slate-700">
              Last checked {formatAge(lastRefreshed)}
            </span>
          </div>
        </div>

        {/* Vault status — vault-level metrics only; wallet balance not wired */}
        <section>
          <SectionHeader
            title="Vault Status"
            sub={`${positions.length} vault${positions.length !== 1 ? "s" : ""} · wallet balance unavailable`}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {positions.map((pos) => (
              <VaultCard key={pos.vaultId} position={pos} />
            ))}
          </div>
        </section>

        {/* Alert feed */}
        <section>
          <SectionHeader
            title="Alerts"
            sub={
              alerts.length > 0
                ? `${alerts.length} active alert${alerts.length !== 1 ? "s" : ""}${
                    dismissedIds.size > 0 ? ` · ${dismissedIds.size} dismissed` : ""
                  }`
                : "No active alerts"
            }
          />
          <AlertPanel alerts={alerts} onDismiss={handleDismiss} />
        </section>

        {/* Footer note */}
        <p className="text-center text-xs text-slate-700 pb-4">
          Seeded demo data &middot; Alerts include benchmark + allocation signals &middot;{" "}
          {["/api/health", "/api/alerts", "/api/yield-floor?vault=earnETH", "/api/telegram-preview", "/api/email-preview"].map((path, i) => (
            <span key={path}>
              {i > 0 && " · "}
              <a
                href={path}
                target="_blank"
                className="underline hover:text-slate-500 transition-colors"
              >
                {path.split("?")[0]}
              </a>
            </span>
          ))}
          {" "}&middot; Press Refresh to cycle scenarios
        </p>
      </div>
    </main>
  );
}

function SectionHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h2 className="text-sm font-semibold text-white uppercase tracking-wide">{title}</h2>
      <span className="text-xs text-slate-500">{sub}</span>
    </div>
  );
}

function AlertSummaryBadge({
  critical,
  warning,
}: {
  critical: number;
  warning: number;
}) {
  if (critical === 0 && warning === 0) {
    return (
      <span className="text-xs text-emerald-500 flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        All clear
      </span>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      {critical > 0 && (
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-900/60 border border-red-700 text-red-400 font-medium">
          {critical} critical
        </span>
      )}
      {warning > 0 && (
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-900/60 border border-amber-700 text-amber-400 font-medium">
          {warning} warning
        </span>
      )}
    </div>
  );
}

function formatAge(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const secs = Math.round(diffMs / 1000);
  if (secs < 10) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  return `${mins}m ago`;
}
