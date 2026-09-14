"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

const BASE_URL = "https://www.lidovaultagent.app";
const BOT_URL = "https://t.me/LidoVaultBot";
const GITHUB_URL = "https://github.com/mpotter2002/Lido-Vault-Alert-Agent";

const c = {
  surface2: "#282828",
  border: "#383838",
  text2: "#a3a3a3",
  accentBright: "#48a8ff",
  accentDim: "rgba(8,120,209,0.14)",
  accentBorder: "rgba(72,168,255,0.35)",
  green: "#30d158",
  greenDim: "rgba(48,209,88,0.12)",
  greenBorder: "rgba(48,209,88,0.28)",
  font: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif`,
  mono: `"SF Mono", "Fira Code", Menlo, monospace`,
};

const monitoringSignals = [
  {
    title: "Live APY and TVL",
    detail:
      "See current vault yield and total value locked without assembling data from several dashboards.",
  },
  {
    title: "Benchmark performance",
    detail:
      "Compare EarnETH with stETH APY and EarnUSD with the Aave USDC supply rate.",
  },
  {
    title: "Wallet position",
    detail:
      "Check deposited assets, shares, claimable amounts, and multiple Ethereum wallets through read-only calls.",
  },
  {
    title: "Vault health",
    detail:
      "Surface pauses, degraded health, queue activity, and other conditions that may deserve attention.",
  },
  {
    title: "Allocation changes",
    detail:
      "Watch for meaningful shifts in the protocols and strategies used by each Lido Earn vault.",
  },
  {
    title: "Yield-floor alerts",
    detail:
      "Set a personal minimum APY and receive an alert when a vault falls below your threshold.",
  },
];

const setupSteps = [
  {
    number: "01",
    title: "Add a public wallet address",
    detail:
      "The monitor reads public Ethereum data. It never needs a seed phrase, private key, or transaction signature.",
  },
  {
    number: "02",
    title: "Choose vaults and sensitivity",
    detail:
      "Monitor EarnETH, EarnUSD, or both, then choose critical-only alerts or broader warning coverage.",
  },
  {
    number: "03",
    title: "Receive useful updates",
    detail:
      "Critical conditions can be sent immediately, while lower-priority changes can be grouped into quieter digests.",
  },
];

const vaults = [
  {
    name: "EarnETH",
    asset: "ETH",
    benchmark: "stETH APY",
    description:
      "Tracks vault yield, TVL, allocations, wallet shares, claimable assets, and performance relative to stETH.",
  },
  {
    name: "EarnUSD",
    asset: "USDC",
    benchmark: "Aave USDC",
    description:
      "Tracks the same health and wallet signals for the USD vault, with Aave USDC supply yield as its benchmark.",
  },
];

const endpoints = [
  {
    method: "GET" as const,
    path: "/api/health",
    description:
      "Live vault health - APY, TVL, benchmarks, wallet position, alerts, and allocation",
    params:
      "?wallet=0x... | ?wallets=0x...,0x... | ?vault=earnETH|earnUSD",
  },
  {
    method: "GET" as const,
    path: "/api/alerts",
    description: "Active alerts for all supported vaults",
    params:
      "?severity=critical|warning|info | ?vault=earnETH|earnUSD",
  },
  {
    method: "GET" as const,
    path: "/api/yield-floor",
    description: "Current APY compared with a vault benchmark floor",
    params: "?vault=earnETH|earnUSD (required) | ?wallet=0x...",
  },
];

function CopyButton({ text, small }: { text: string; small?: boolean }) {
  const [copied, setCopied] = useState(false);

  function copyText() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      aria-label={copied ? "Copied to clipboard" : `Copy ${text}`}
      onClick={copyText}
      style={{
        flexShrink: 0,
        padding: small ? "3px 10px" : "5px 14px",
        fontSize: 12,
        fontFamily: c.font,
        fontWeight: 600,
        background: copied ? c.greenDim : c.surface2,
        border: `1px solid ${copied ? c.greenBorder : c.border}`,
        borderRadius: 7,
        cursor: "pointer",
        color: copied ? c.green : c.text2,
        transition: "all 0.15s",
        whiteSpace: "nowrap",
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CopyBlock({ command }: { command: string }) {
  return (
    <div className="copy-block">
      <code>{command}</code>
      <CopyButton text={command} small />
    </div>
  );
}

function MethodBadge({ method }: { method: "GET" | "POST" }) {
  const isGet = method === "GET";

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        fontSize: 11,
        fontFamily: c.mono,
        fontWeight: 700,
        borderRadius: 6,
        background: isGet ? c.greenDim : c.accentDim,
        color: isGet ? c.green : c.accentBright,
        border: `1px solid ${isGet ? c.greenBorder : c.accentBorder}`,
        flexShrink: 0,
      }}
    >
      {method}
    </span>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="feature-pill">{children}</span>;
}

function SectionHeader({
  eyebrow,
  title,
  copy,
}: {
  eyebrow: string;
  title: string;
  copy: string;
}) {
  return (
    <header className="section-header">
      <div className="section-eyebrow">{eyebrow}</div>
      <h2>{title}</h2>
      <p>{copy}</p>
    </header>
  );
}

export default function Home() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <nav
        aria-label="Primary navigation"
        className="nav-bar"
        style={{
          borderBottom: scrolled
            ? "1px solid rgba(56,56,56,0.8)"
            : "1px solid transparent",
        }}
      >
        <a className="brand-link" href="#top" aria-label="Lido Vault Alert Agent home">
          <Image
            src="/logo.png"
            alt=""
            width={26}
            height={26}
            sizes="26px"
            style={{ borderRadius: 6, imageRendering: "pixelated" }}
          />
          <span className="nav-title">Lido Vault Alert Agent</span>
          <span className="nav-version">v1.0</span>
        </a>
        <div className="nav-actions">
          <a className="nav-open-bot primary-link" href={BOT_URL}>
            Open Bot
          </a>
          <a className="secondary-link" href={GITHUB_URL}>
            GitHub
          </a>
        </div>
      </nav>

      <main id="top">
        <section className="hero-section" aria-labelledby="hero-title">
          <Image
            src="/logo.png"
            alt="Lido Vault Alert Agent logo"
            width={122}
            height={122}
            sizes="122px"
            priority
            style={{
              borderRadius: 30,
              imageRendering: "pixelated",
              marginBottom: 24,
            }}
          />
          <h1 id="hero-title">
            Lido Earn vault
            <br />
            monitoring and alerts.
          </h1>
          <p className="hero-copy">
            Track EarnETH and EarnUSD with live APY, TVL, benchmark, wallet-position,
            and vault-health data. Get plain-language alerts in Telegram or connect
            the JSON API to an AI agent.
          </p>

          <div className="hero-actions">
            <a className="primary-link hero-primary" href={BOT_URL}>
              Start on Telegram <span aria-hidden="true">→</span>
            </a>
            <a className="secondary-link hero-secondary" href="#agent-api">
              Use with an AI agent
            </a>
          </div>

          <div className="pill-row" aria-label="Product capabilities">
            <Pill>EarnETH</Pill>
            <Pill>EarnUSD</Pill>
            <Pill>Live APY + TVL</Pill>
            <Pill>Multi-wallet</Pill>
            <Pill>Email alerts</Pill>
            <Pill>Free to use</Pill>
          </div>
        </section>

        <section id="monitoring" className="content-section">
          <SectionHeader
            eyebrow="Monitoring coverage"
            title="What the Lido vault monitor tracks"
            copy="Each signal is designed to answer a practical question: how is the vault performing, how is your position affected, and has anything changed enough to warrant attention?"
          />
          <div className="signal-grid">
            {monitoringSignals.map((signal) => (
              <article className="signal-item" key={signal.title}>
                <h3>{signal.title}</h3>
                <p>{signal.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="alerts" className="content-section">
          <SectionHeader
            eyebrow="Real alert output"
            title="Know when a Lido Earn vault needs attention"
            copy="The agent turns raw vault and wallet data into concise updates. It can flag material yield changes, benchmark underperformance, allocation shifts, queue activity, paused vaults, and claimable assets without asking you to keep another dashboard open."
          />
          <div className="proof-grid">
            <figure className="proof-item proof-item-wide">
              <Image
                src="/screenshot-email.jpg"
                alt="Example email alert showing a Lido Earn vault health update"
                width={1280}
                height={527}
                sizes="(max-width: 760px) 100vw, 824px"
              />
              <figcaption>
                Email summaries keep the recommendation, supporting data, and
                severity together.
              </figcaption>
            </figure>
            <figure className="proof-item">
              <Image
                src="/screenshot-telegram-status.jpg"
                alt="Telegram status response with Lido Earn APY, TVL, and alert details"
                width={869}
                height={1280}
                sizes="(max-width: 760px) 100vw, 330px"
              />
              <figcaption>
                Telegram provides an on-demand position and vault-health snapshot.
              </figcaption>
            </figure>
            <div className="proof-copy">
              <h3>Useful signal, less notification noise</h3>
              <p>
                Critical issues can be delivered immediately. Lower-priority
                warnings can be bundled into morning and evening digests, so routine
                changes do not compete with conditions that need a closer look.
              </p>
              <p>
                Alert sensitivity and personal yield floors can be adjusted through
                the bot. Email delivery is optional, and the same underlying data is
                available to other tools through the public API.
              </p>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="content-section">
          <SectionHeader
            eyebrow="Read-only setup"
            title="How wallet monitoring works"
            copy="The service observes public blockchain state and external vault data. It does not connect to a wallet extension, take custody of assets, or submit transactions."
          />
          <div className="steps-list">
            {setupSteps.map((step) => (
              <article className="step-item" key={step.number}>
                <span aria-hidden="true">{step.number}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="vaults" className="content-section">
          <SectionHeader
            eyebrow="Supported vaults"
            title="EarnETH and EarnUSD in one view"
            copy="The monitor currently focuses on the two Lido Earn vaults below. Benchmark comparisons provide context, but they are informational signals rather than investment recommendations."
          />
          <div className="vault-list">
            {vaults.map((vault) => (
              <article className="vault-item" key={vault.name}>
                <div className="vault-name">
                  <h3>{vault.name}</h3>
                  <span>{vault.asset}</span>
                </div>
                <p>{vault.description}</p>
                <div className="vault-benchmark">
                  Benchmark <strong>{vault.benchmark}</strong>
                </div>
              </article>
            ))}
          </div>
          <p className="source-note">
            APY and TVL are read from Mellow vault data. Allocation weights and
            wallet positions use Ethereum contract reads. Benchmark data comes from
            Lido staking statistics and DeFiLlama. When an upstream source is
            unavailable, the service may return incomplete or delayed information.
          </p>
        </section>

        <section id="agent-api" className="content-section">
          <SectionHeader
            eyebrow="Agent-ready API"
            title="Connect Lido vault data to an AI agent"
            copy="The public instruction file explains the supported questions, wallet onboarding flow, endpoint parameters, and response fields. Give the command to an agent, or call the JSON endpoints directly from your own application."
          />

          <div className="agent-card">
            <div>
              <h3>Works with any agent that can fetch a URL</h3>
              <p>
                The instructions teach the agent how to inspect vault health,
                compare yield with benchmarks, summarize alerts, and handle one or
                more public wallet addresses.
              </p>
            </div>
            <CopyBlock command={`curl -s ${BASE_URL}/agent-instructions.md`} />
          </div>

          <div className="agent-nudge">
            <span>
              Prefer a no-code setup? Subscribe directly in Telegram and add a
              wallet there.
            </span>
            <a href={BOT_URL}>@LidoVaultBot</a>
          </div>

          <div className="endpoint-list" aria-label="Public API endpoints">
            {endpoints.map((endpoint) => (
              <article className="endpoint-item" key={endpoint.path}>
                <MethodBadge method={endpoint.method} />
                <div className="endpoint-copy">
                  <div className="endpoint-title">
                    <code>{endpoint.path}</code>
                    <CopyButton text={`${BASE_URL}${endpoint.path}`} small />
                  </div>
                  <p>{endpoint.description}</p>
                  <code className="endpoint-params">{endpoint.params}</code>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="trust" className="content-section trust-section">
          <SectionHeader
            eyebrow="Trust and limitations"
            title="Open source, read-only, and independent"
            copy="Lido Vault Alert Agent is an independent open-source monitoring project maintained by mpotter2002. It is not an official Lido product and does not control, move, or manage user funds."
          />
          <div className="trust-grid">
            <div>
              <h3>What the service stores</h3>
              <p>
                Subscriptions require delivery details such as a Telegram chat ID or
                optional email address, together with the public wallet addresses and
                preferences needed to produce requested alerts.
              </p>
            </div>
            <div>
              <h3>What the service cannot guarantee</h3>
              <p>
                Blockchain, API, RPC, email, and Telegram availability can delay or
                prevent an update. Always verify important information against
                primary sources before acting.
              </p>
            </div>
            <div>
              <h3>Informational use only</h3>
              <p>
                Vault metrics, alerts, benchmarks, and recommendations are
                informational and are not financial, investment, legal, or tax
                advice.
              </p>
            </div>
          </div>
          <div className="trust-links">
            <a href={GITHUB_URL}>Review the source code</a>
            <a href={`${GITHUB_URL}/issues`}>Report an issue</a>
            <a href="https://stake.lido.fi/earn">View Lido Earn</a>
          </div>
        </section>

        <footer>
          <span>
            Live on-chain monitoring for Lido Earn vaults. Data may be delayed.
          </span>
          <span>v1.0</span>
        </footer>
      </main>
    </>
  );
}
