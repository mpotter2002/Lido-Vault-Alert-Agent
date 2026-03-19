"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

const BASE_URL = "https://lidovaultagent.vercel.app";
const BOT_URL = "https://t.me/LidoVaultBot";

// ── Tokens ───────────────────────────────────────────────────────────────────

const c = {
  bg: "#1a1a1a",
  surface: "#222222",
  surface2: "#282828",
  border: "#2e2e2e",
  borderSubtle: "#252525",
  text: "#efefef",
  text2: "#888888",
  text3: "#555555",
  accent: "#3b9eff",          // Lido blue (matched from logo)
  accentDim: "rgba(59,158,255,0.12)",
  accentBorder: "rgba(59,158,255,0.25)",
  green: "#30d158",
  greenDim: "rgba(48,209,88,0.12)",
  greenBorder: "rgba(48,209,88,0.2)",
  font: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif`,
  mono: `"SF Mono", "Fira Code", Menlo, monospace`,
};

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyButton({ text, small }: { text: string; small?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      style={{
        flexShrink: 0,
        padding: small ? "3px 10px" : "5px 14px",
        fontSize: 12,
        fontFamily: c.font,
        fontWeight: 500,
        background: copied ? c.greenDim : c.surface2,
        border: `1px solid ${copied ? c.greenBorder : c.border}`,
        borderRadius: 8,
        cursor: "pointer",
        color: copied ? c.green : c.text3,
        transition: "all 0.15s",
        whiteSpace: "nowrap",
      }}
    >
      {copied ? "✓ copied" : "copy"}
    </button>
  );
}

// ── Inline copy block (install command) ──────────────────────────────────────

function CopyBlock({ cmd }: { cmd: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: c.surface2, border: `1px solid ${c.borderSubtle}`, borderRadius: 8, padding: "9px 12px" }}>
      <code style={{ flex: 1, fontFamily: c.mono, fontSize: 12, color: c.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cmd}</code>
      <CopyButton text={cmd} small />
    </div>
  );
}

// ── Method badge ──────────────────────────────────────────────────────────────

function MethodBadge({ method }: { method: "GET" | "POST" }) {
  const isGet = method === "GET";
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      fontSize: 11,
      fontFamily: c.mono,
      fontWeight: 600,
      letterSpacing: "0.02em",
      borderRadius: 6,
      background: isGet ? c.greenDim : c.accentDim,
      color: isGet ? c.green : c.accent,
      border: `1px solid ${isGet ? c.greenBorder : c.accentBorder}`,
      flexShrink: 0,
    }}>
      {method}
    </span>
  );
}

// ── Pill ─────────────────────────────────────────────────────────────────────

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      padding: "5px 13px",
      fontSize: 12,
      fontWeight: 500,
      color: c.text2,
      background: c.surface,
      border: `1px solid ${c.border}`,
      borderRadius: 20,
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: c.text3, marginBottom: 18 }}>
      {children}
    </div>
  );
}

// ── Data ──────────────────────────────────────────────────────────────────────

const endpoints = [
  { method: "GET" as const, path: "/api/health", description: "Live vault health — APY, TVL, benchmarks, wallet position, alerts, allocation", params: "?wallet=0x… | ?wallets=0x…,0x… | ?vault=earnETH|earnUSD" },
  { method: "GET" as const, path: "/api/alerts", description: "Active alerts for all vaults", params: "?severity=critical|warning|info | ?vault=earnETH|earnUSD" },
  { method: "GET" as const, path: "/api/yield-floor", description: "Current APY vs benchmark floor for a vault", params: "?vault=earnETH|earnUSD (required) | ?wallet=0x…" },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Home() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      {/* Nav */}
      <nav className="nav-bar" style={{
        position: "sticky", top: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 32px", height: 64,
        background: "rgba(26,26,26,0.88)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        borderBottom: scrolled ? `1px solid rgba(46,46,46,0.6)` : "1px solid transparent",
        transition: "border-color 0.2s",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <Image src="/logo.png" alt="Lido Vault Bot" width={26} height={26} style={{ borderRadius: 6, imageRendering: "pixelated" }} />
          <span className="nav-title" style={{ fontSize: 14, fontWeight: 600, color: c.text, letterSpacing: "-0.02em" }}>
            Lido Vault Position Monitor + Alert Agent
          </span>
          <span className="nav-version" style={{
            fontSize: 11, fontWeight: 500, color: c.text3,
            background: c.surface, border: `1px solid ${c.border}`,
            borderRadius: 20, padding: "1px 8px", fontFamily: c.mono,
          }}>v1.0</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <a href={BOT_URL} target="_blank" rel="noopener noreferrer" className="nav-open-bot" style={{
            fontSize: 13, fontWeight: 600, color: "#fff",
            textDecoration: "none", padding: "5px 16px",
            background: c.accent,
            borderRadius: 20, letterSpacing: "-0.01em",
            transition: "opacity 0.15s", whiteSpace: "nowrap",
          }}
            onMouseEnter={(e) => ((e.target as HTMLElement).style.opacity = "0.85")}
            onMouseLeave={(e) => ((e.target as HTMLElement).style.opacity = "1")}
          >
            Open Bot →
          </a>
          <a href="https://github.com/mpotter2002/Lido-Vault-Alert-Agent" target="_blank" rel="noopener noreferrer" className="nav-github" style={{
            fontSize: 13, fontWeight: 500, color: c.text2,
            textDecoration: "none", padding: "5px 14px",
            border: `1px solid ${c.border}`, borderRadius: 20, letterSpacing: "-0.01em",
            transition: "color 0.15s, border-color 0.15s",
          }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.color = c.text; (e.target as HTMLElement).style.borderColor = c.text3; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.color = c.text2; (e.target as HTMLElement).style.borderColor = c.border; }}
          >
            GitHub
          </a>
        </div>
      </nav>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "72px 28px 80px" }}>

        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <Image src="/logo.png" alt="Lido Vault Bot" width={122} height={122} style={{ borderRadius: 30, imageRendering: "pixelated", marginBottom: 24 }} />
          <h1 style={{
            fontSize: "clamp(36px, 6vw, 54px)",
            fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.08,
            color: c.text, marginBottom: 18,
          }}>
            Monitor your<br />Lido Earn vaults.
          </h1>
          <p style={{
            fontSize: 16, color: c.text2,
            maxWidth: 460, margin: "0 auto 28px",
            lineHeight: 1.6, letterSpacing: "-0.01em",
          }}>
            Live on-chain data and personalised Telegram alerts for EarnETH and EarnUSD.
            Built for humans and AI agents alike.
          </p>

          {/* Primary CTA */}
          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 28 }}>
            <a href={BOT_URL} target="_blank" rel="noopener noreferrer" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "11px 24px", fontSize: 15, fontWeight: 600,
              color: "#fff", textDecoration: "none",
              background: c.accent, borderRadius: 24,
              letterSpacing: "-0.02em",
              transition: "opacity 0.15s",
            }}
              onMouseEnter={(e) => ((e.target as HTMLElement).style.opacity = "0.85")}
              onMouseLeave={(e) => ((e.target as HTMLElement).style.opacity = "1")}
            >
              <span>Start on Telegram</span>
              <span style={{ opacity: 0.8 }}>→</span>
            </a>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
            <Pill>EarnETH</Pill>
            <Pill>EarnUSD</Pill>
            <Pill>Live APY + TVL</Pill>
            <Pill>Multi-wallet</Pill>
            <Pill>Email alerts</Pill>
            <Pill>No AI costs</Pill>
          </div>
        </div>

        {/* Agent + Bot section */}
        <div style={{ marginBottom: 56 }}>
          <SectionLabel>Add to your AI agent</SectionLabel>

          {/* Agent instructions card — first */}
          <div style={{
            background: c.surface, border: `1px solid ${c.border}`,
            borderRadius: 14, padding: "18px 20px",
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: c.text, letterSpacing: "-0.02em", marginBottom: 4 }}>
              Works with any agent
            </div>
            <div style={{ fontSize: 12, color: c.text2, lineHeight: 1.55, marginBottom: 14 }}>
              Run this in your agent to get started. It will fetch the setup instructions and walk you through connecting your wallet.
            </div>
            <CopyBlock cmd={`curl -s ${BASE_URL}/agent-instructions.md`} />
          </div>

          {/* Bot nudge — below agent card */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 18px", marginTop: 8,
            background: c.accentDim,
            border: `1px solid ${c.accentBorder}`,
            borderRadius: 12,
            gap: 16,
          }}>
            <span style={{ fontSize: 13, color: c.text2 }}>Prefer to set it up yourself? Subscribe directly in Telegram — no code needed.</span>
            <a href={BOT_URL} target="_blank" rel="noopener noreferrer" style={{
              flexShrink: 0,
              fontSize: 13, fontWeight: 600, color: c.accent,
              textDecoration: "none", padding: "6px 16px",
              border: `1px solid ${c.accentBorder}`,
              borderRadius: 20, whiteSpace: "nowrap",
              transition: "opacity 0.15s",
            }}
              onMouseEnter={(e) => ((e.target as HTMLElement).style.opacity = "0.7")}
              onMouseLeave={(e) => ((e.target as HTMLElement).style.opacity = "1")}
            >
              @LidoVaultBot →
            </a>
          </div>
        </div>

        <div style={{ height: 1, background: c.borderSubtle, marginBottom: 44 }} />

        {/* All Endpoints */}
        <div>
          <SectionLabel>All endpoints</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {endpoints.map((e) => (
              <div key={e.path} style={{
                display: "flex", alignItems: "flex-start", gap: 12,
                padding: "13px 14px",
                background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10,
              }}>
                <MethodBadge method={e.method} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <code style={{ fontFamily: c.mono, fontSize: 13, color: c.text, letterSpacing: "-0.01em" }}>{e.path}</code>
                    <CopyButton text={`${BASE_URL}${e.path}`} small />
                  </div>
                  <div style={{ fontSize: 12, color: c.text2 }}>{e.description}</div>
                  {e.params && <div style={{ fontSize: 11, color: c.text3, marginTop: 3, fontFamily: c.mono }}>{e.params}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 56, paddingTop: 22,
          borderTop: `1px solid ${c.borderSubtle}`,
          display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8,
        }}>
          <span style={{ fontSize: 12, color: c.text3 }}>
            All endpoints return JSON · Live on-chain via Mellow RiskManager
          </span>
          <a href="https://lido.fi/earn" target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 12, color: c.text3, textDecoration: "none" }}>
            Lido Earn ↗
          </a>
        </div>
      </main>
    </>
  );
}
