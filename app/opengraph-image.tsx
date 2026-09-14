import { ImageResponse } from "next/og";

export const alt =
  "Lido Vault Alert Agent - live monitoring and alerts for Lido Earn vaults";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#1a1a1a",
          color: "#efefef",
          padding: "72px 78px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 58,
              height: 58,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "3px solid #0878d1",
              borderRadius: 14,
              color: "#ffffff",
              fontSize: 30,
              fontWeight: 800,
            }}
          >
            L
          </div>
          <div style={{ display: "flex", fontSize: 28, fontWeight: 700 }}>
            Lido Vault Alert Agent
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", maxWidth: 980 }}>
          <div
            style={{
              display: "flex",
              fontSize: 70,
              lineHeight: 1.08,
              fontWeight: 800,
            }}
          >
            Monitor Lido Earn vaults without constant checking.
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 28,
              color: "#a3a3a3",
              fontSize: 30,
              lineHeight: 1.4,
            }}
          >
            Live APY, TVL, wallet-position and risk alerts for EarnETH and
            EarnUSD.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {["Telegram alerts", "Email delivery", "Agent-ready API"].map(
            (label) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  padding: "10px 18px",
                  border: "1px solid #3b3b3b",
                  borderRadius: 8,
                  color: "#b8b8b8",
                  fontSize: 21,
                }}
              >
                {label}
              </div>
            ),
          )}
        </div>
      </div>
    ),
    size,
  );
}
