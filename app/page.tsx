export default function Home() {
  const endpoints = [
    {
      method: "GET",
      path: "/api/health",
      description: "Live vault health snapshot (TVL, APY, benchmarks, wallet position, alerts)",
      params: "?wallet=0x... (optional)",
    },
    {
      method: "GET",
      path: "/api/alerts",
      description: "Active alerts for all vaults",
    },
    {
      method: "GET",
      path: "/api/yield-floor",
      description: "Current APY vs benchmark for a vault",
      params: "?vault=earnETH|earnUSD",
    },
    {
      method: "POST",
      path: "/api/telegram-broadcast",
      description: "Send personalized alerts to all subscribers",
      params: '{ "dryRun": true, "onlyCritical": true }',
    },
    {
      method: "GET",
      path: "/api/telegram-register-webhook",
      description: "Register or inspect the Telegram webhook",
      params: "?info=1 | ?delete=1",
    },
  ];

  return (
    <main style={{ fontFamily: "monospace", maxWidth: 720, margin: "48px auto", padding: "0 24px" }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Lido Vault Alert Agent</h1>
      <p style={{ color: "#666", marginBottom: 32 }}>
        API agent for monitoring Lido Earn vaults (EarnETH, EarnUSD).<br />
        Telegram bot: subscribe to receive live alerts.
      </p>

      <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 1, color: "#999", marginBottom: 16 }}>
        Available Endpoints
      </h2>

      {endpoints.map((e) => (
        <div key={e.path} style={{ marginBottom: 24, paddingBottom: 24, borderBottom: "1px solid #eee" }}>
          <div style={{ marginBottom: 4 }}>
            <code style={{ background: "#f4f4f4", padding: "2px 6px", borderRadius: 4, fontSize: 13 }}>
              {e.method}
            </code>{" "}
            <code style={{ fontSize: 14 }}>{e.path}</code>
          </div>
          <div style={{ color: "#444", fontSize: 14 }}>{e.description}</div>
          {e.params && (
            <div style={{ color: "#888", fontSize: 13, marginTop: 4 }}>
              params: <code>{e.params}</code>
            </div>
          )}
        </div>
      ))}

      <p style={{ color: "#aaa", fontSize: 12, marginTop: 32 }}>
        All endpoints return JSON. Vault data is read live from on-chain (Mellow RiskManager) and Mellow API.
      </p>
    </main>
  );
}
