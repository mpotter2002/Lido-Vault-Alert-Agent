"use client";

import { VaultPosition } from "@/lib/types";

interface Props {
  position: VaultPosition;
}

export function VaultCard({ position: p }: Props) {
  const healthColor = {
    healthy: "bg-emerald-500",
    degraded: "bg-amber-500",
    paused: "bg-red-500",
  }[p.health];

  const apyColor =
    p.apyDelta24h < -0.5
      ? "text-red-400"
      : p.apyDelta24h > 0.5
      ? "text-emerald-400"
      : "text-slate-400";

  const apySign = p.apyDelta24h >= 0 ? "+" : "";
  const tvlPct = ((p.tvl / p.tvlCapUSD) * 100).toFixed(0);
  const tvlBarWidth = Math.min(100, (p.tvl / p.tvlCapUSD) * 100);
  const tvlBarColor =
    tvlBarWidth >= 90
      ? "bg-amber-400"
      : tvlBarWidth >= 75
      ? "bg-yellow-400"
      : "bg-emerald-500";

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-5 flex flex-col gap-4 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${healthColor}`}
            />
            <h2 className="text-base font-semibold text-white">{p.vaultName}</h2>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {p.curatorName} &middot;{" "}
            <span className="font-mono text-[11px]">
              {p.contractAddress.slice(0, 6)}…{p.contractAddress.slice(-4)}
            </span>
          </p>
        </div>
        <span
          className={`text-xs capitalize px-2 py-0.5 rounded-full font-medium border ${
            p.health === "healthy"
              ? "border-emerald-700 text-emerald-400 bg-emerald-900/40"
              : p.health === "degraded"
              ? "border-amber-700 text-amber-400 bg-amber-900/40"
              : "border-red-700 text-red-400 bg-red-900/40"
          }`}
        >
          {p.health}
        </span>
      </div>

      {/* Key metrics row */}
      <div className="grid grid-cols-3 gap-3">
        <Metric label="Deposited" value={`${p.deposited} ${p.asset}`} />
        <Metric
          label="Current APY"
          value={`${p.currentAPY.toFixed(1)}%`}
          sub={
            <span className={`text-xs ${apyColor}`}>
              {apySign}
              {p.apyDelta24h.toFixed(1)}% 24h
            </span>
          }
        />
        <Metric
          label="Shares"
          value={p.shares.toFixed(4)}
          sub={<span className="text-xs text-slate-500">{p.asset} equiv.</span>}
        />
      </div>

      {/* Pending state */}
      {(p.pendingDepositAmount > 0 || p.pendingWithdrawalAmount > 0) && (
        <div className="flex gap-3 flex-wrap">
          {p.pendingDepositAmount > 0 && (
            <PendingTag
              label={`+${p.pendingDepositAmount} ${p.asset} queued`}
              color="blue"
            />
          )}
          {p.pendingWithdrawalAmount > 0 && (
            <PendingTag
              label={`−${p.pendingWithdrawalAmount} ${p.asset} withdrawing${
                p.pendingWithdrawalAgeDays !== null
                  ? ` · ${p.pendingWithdrawalAgeDays}d`
                  : ""
              }`}
              color={
                (p.pendingWithdrawalAgeDays ?? 0) >= 7
                  ? "amber"
                  : (p.pendingWithdrawalAgeDays ?? 0) >= 3
                  ? "yellow"
                  : "slate"
              }
            />
          )}
        </div>
      )}

      {/* TVL bar */}
      <div>
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span>TVL</span>
          <span>
            ${(p.tvl / 1e6).toFixed(1)}M / ${(p.tvlCapUSD / 1e6).toFixed(0)}M cap
            <span
              className={`ml-1 font-medium ${
                tvlBarWidth >= 90 ? "text-amber-400" : "text-slate-400"
              }`}
            >
              ({tvlPct}%)
            </span>
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-slate-700">
          <div
            className={`h-full rounded-full transition-all ${tvlBarColor}`}
            style={{ width: `${tvlBarWidth}%` }}
          />
        </div>
      </div>

      {/* Strategy weights */}
      <div>
        <p className="text-xs text-slate-500 mb-2">Strategy allocation</p>
        <div className="flex flex-col gap-1">
          {p.strategyWeights.map((w) => {
            const changed = w.currentWeight !== w.previousWeight;
            const up = w.currentWeight > w.previousWeight;
            return (
              <div key={w.name} className="flex items-center justify-between text-xs">
                <span className="text-slate-400 truncate max-w-[60%]">{w.name}</span>
                <div className="flex items-center gap-1.5">
                  {changed && (
                    <span className="text-slate-600 line-through text-[10px]">
                      {w.previousWeight}%
                    </span>
                  )}
                  <span
                    className={`font-medium ${
                      changed ? (up ? "text-emerald-400" : "text-red-400") : "text-slate-300"
                    }`}
                  >
                    {w.currentWeight}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-white">{value}</span>
      {sub}
    </div>
  );
}

function PendingTag({
  label,
  color,
}: {
  label: string;
  color: "blue" | "yellow" | "amber" | "slate";
}) {
  const styles = {
    blue: "border-blue-700 text-blue-300 bg-blue-900/40",
    yellow: "border-yellow-700 text-yellow-300 bg-yellow-900/40",
    amber: "border-amber-600 text-amber-300 bg-amber-900/50",
    slate: "border-slate-600 text-slate-400 bg-slate-700/40",
  }[color];
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${styles}`}>
      {label}
    </span>
  );
}
