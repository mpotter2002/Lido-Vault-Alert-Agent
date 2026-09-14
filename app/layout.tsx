import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const siteUrl = "https://www.lidovaultagent.app";
const title = "Lido Earn Vault Monitor & Alerts | Lido Vault Agent";
const description =
  "Monitor Lido Earn vaults with live APY, TVL, wallet-position and risk alerts for EarnETH and EarnUSD. Get updates in Telegram or via API.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  applicationName: "Lido Vault Alert Agent",
  authors: [
    {
      name: "mpotter2002",
      url: "https://github.com/mpotter2002",
    },
  ],
  creator: "mpotter2002",
  publisher: "Lido Vault Alert Agent",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "Lido Vault Alert Agent",
    title,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: `${siteUrl}/`,
        name: "Lido Vault Alert Agent",
        description,
        inLanguage: "en",
        creator: {
          "@type": "Person",
          name: "mpotter2002",
          url: "https://github.com/mpotter2002",
        },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteUrl}/#application`,
        name: "Lido Vault Alert Agent",
        alternateName: "Lido Earn Vault Monitor",
        url: `${siteUrl}/`,
        description,
        applicationCategory: "FinanceApplication",
        applicationSubCategory: "DeFi monitoring",
        operatingSystem: "Web",
        softwareVersion: "1.0",
        isAccessibleForFree: true,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
        featureList: [
          "EarnETH and EarnUSD vault monitoring",
          "Live APY and TVL tracking",
          "Wallet-position monitoring",
          "Telegram and email alerts",
          "JSON API for AI agents",
        ],
        author: {
          "@type": "Person",
          name: "mpotter2002",
          url: "https://github.com/mpotter2002",
        },
        sameAs: [
          "https://github.com/mpotter2002/Lido-Vault-Alert-Agent",
          "https://t.me/LidoVaultBot",
        ],
      },
    ],
  };

  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
          }}
        />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
