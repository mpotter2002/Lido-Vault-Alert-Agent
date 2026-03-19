import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lido Vault Alert Agent",
  description: "API agent for monitoring Lido Earn vaults (EarnETH, EarnUSD)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
