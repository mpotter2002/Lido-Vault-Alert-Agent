import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lido Vault Position Monitor + Alert Agent",
  description: "Live on-chain monitoring and personalised alerts for Lido Earn vaults (EarnETH, EarnUSD)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}<Analytics /></body>
    </html>
  );
}
