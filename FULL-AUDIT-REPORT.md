# Lido Vault Alert Agent SEO Audit

Audit date: September 12, 2026 (America/Chicago)  
Site: https://www.lidovaultagent.app/  
Scope: One public landing page plus crawl-control files, public assets, and linked API documentation  
Business type: Free DeFi monitoring tool / developer utility

## Executive Summary

**SEO Health Score: 58/100**

The site has a sound technical base: HTTPS is enforced, the non-www domain redirects to the preferred www URL, the homepage returns a clean 200 response, its primary content is present in server-rendered HTML, and the title, description, H1, language, viewport, links, and image alt attributes pass Lighthouse's basic SEO checks.

The main constraint is not a crawlability failure. It is a lack of search context and machine-readable identity. The homepage contains only about 168 visible words, no semantic H2/H3 sections, no canonical URL, no Open Graph or Twitter metadata, no structured data, and no crawl-control files. This makes it difficult to rank for non-branded searches such as "Lido Earn vault alerts," "EarnETH monitor," or "DeFi vault APY alerts," even though the product appears directly relevant.

There are **no critical indexing blockers**. The best gains should come from adding useful explanatory content and trust signals, completing the metadata/schema layer, and fixing the mobile performance and contrast issues.

### Category Scores

| Category | Weight | Score | Weighted result |
|---|---:|---:|---:|
| Technical SEO | 22% | 72 | 15.8 |
| Content quality | 23% | 50 | 11.5 |
| On-page SEO | 20% | 70 | 14.0 |
| Schema / structured data | 10% | 20 | 2.0 |
| Performance / CWV readiness | 10% | 72 | 7.2 |
| AI search readiness | 10% | 48 | 4.8 |
| Images | 5% | 62 | 3.1 |
| **Overall** | **100%** |  | **58.4** |

## Top Priorities

1. **High: Expand the homepage around actual search intent.** Add concise sections explaining what is monitored, which alerts users receive, how wallet monitoring works, what data sources are used, and who the tool is for.
2. **High: Replace the 1.38 MB favicon source.** `/logo.png` is a 1024x1024, 1,383,812-byte PNG and is requested directly as the favicon. Use a small dedicated icon while retaining optimized variants for visible images.
3. **High: Complete metadata.** Add `metadataBase`, canonical, stronger description, Open Graph, Twitter card, and a purpose-built social image.
4. **High: Add structured identity and trust signals.** Implement `WebSite` and `SoftwareApplication`/`WebApplication` JSON-LD and visibly explain ownership, data sources, update cadence, privacy, and the non-custodial nature of wallet monitoring.
5. **Medium: Add `robots.txt` and `sitemap.xml`.** Both currently return 404. A one-page site still benefits from explicit canonical discovery and Search Console submission.

## Technical SEO

### What Works

- `https://www.lidovaultagent.app/` returns HTTP 200.
- `https://lidovaultagent.app/` redirects to the preferred www URL with HTTP 308.
- HTTP redirects to HTTPS.
- HSTS is enabled with `max-age=63072000`.
- The homepage content is included in the initial HTML, so it does not depend on client-side rendering for discovery.
- The page has one H1, a descriptive title, a meta description, `lang="en"`, and a mobile viewport.
- External links use crawlable anchor elements.
- Browser inspection found no console errors or warnings.

### Findings

#### High: No explicit canonical URL

The homepage has no `<link rel="canonical">`. Query-string variants return 200, so campaign URLs can become duplicate URL candidates. Add:

```tsx
alternates: {
  canonical: "/",
}
```

Set `metadataBase` to `https://www.lidovaultagent.app` so Next.js emits an absolute canonical.

#### Medium: Missing robots.txt

`/robots.txt` returns 404. This does not automatically block crawling, but it misses an explicit allow policy and sitemap reference. Add `app/robots.ts` and allow the homepage and public documentation. Consider disallowing operational or test API paths if they should not appear in search.

#### Medium: Missing sitemap.xml

`/sitemap.xml` returns 404. Add `app/sitemap.ts` with the homepage. Do not add API JSON routes to the XML sitemap unless they are deliberately intended as search landing pages.

#### Medium: API endpoint indexability is undefined

Public API routes return JSON and are linked only as copied strings, not internal anchors. Decide whether these are documentation resources or machine endpoints:

- If machine-only, return `X-Robots-Tag: noindex` on JSON routes.
- If they should attract developer searches, create a real HTML documentation section/page and keep raw JSON out of the index.

#### Medium: Security headers are incomplete

HSTS is present, but sampled responses did not expose a Content Security Policy, `X-Content-Type-Options`, Referrer Policy, or Permissions Policy. These are not direct ranking factors, but they strengthen user trust and deployment hygiene for a finance-adjacent product.

## On-Page SEO

### What Works

- Title: `Lido Vault Position Monitor + Alert Agent` (41 characters).
- One clear H1: `Monitor your Lido Earn vaults.`
- The primary keyword/entity, Lido Earn, appears prominently.
- CTA labels are descriptive.
- The page communicates support for EarnETH, EarnUSD, Telegram, email, multiple wallets, APY, and TVL.

### Findings

#### High: Thin search-facing content

The rendered page contains about **168 visible words**, well below the skill's 500-word homepage quality gate. Word count is not a ranking target by itself, but here it reflects genuinely missing information.

Add useful, skimmable sections rather than filler:

- **What the monitor watches:** APY, TVL, benchmark spread, allocation changes, pauses, queues, and wallet position.
- **Alerts you can receive:** yield drops, health degradation, withdrawal/deposit status, benchmark underperformance, and allocation changes.
- **How it works:** read-only wallet address, on-chain data, Telegram/email delivery, no custody and no transaction signing.
- **Supported vaults:** EarnETH and EarnUSD, with links to the official vault information.
- **For AI agents and developers:** brief API examples and a link to the full instruction file.
- **Data and limitations:** source attribution, refresh cadence, and a clear statement that this is monitoring information rather than financial advice.

Aim for roughly 500-800 genuinely useful words across the full page.

#### High: Search intent is split without enough explanation

The page targets both retail users and AI-agent developers, but the hero and body do not clearly separate those journeys. Keep the main intent focused on monitoring Lido Earn vaults, then present two clear paths:

- "Get alerts in Telegram"
- "Connect an AI agent / use the API"

#### Medium: Meta description is short

The description is 88 characters. Expand it to roughly 120-155 characters and include the main benefit plus action:

> Monitor Lido Earn vaults with live APY, TVL, wallet-position and risk alerts for EarnETH and EarnUSD. Get updates in Telegram or via API.

#### Medium: Weak semantic section structure

The page has one H1 and no H2 or H3 elements. The visible section labels are generic `<div>` elements. Use descriptive H2s such as:

- `Lido Earn vault alerts`
- `What the monitor tracks`
- `Connect the API to an AI agent`
- `Supported Lido vaults`

#### Medium: No internal links

For a true one-page site, anchor links can provide structure and improve navigation. Link the navigation or hero to `#alerts`, `#how-it-works`, and `#api`. If content grows substantially, a dedicated `/docs` page is the first additional page worth creating.

## Content Quality and E-E-A-T

This is a finance-adjacent product, so accuracy, provenance, and limitations deserve unusually clear treatment.

### Strengths

- The project links to public source code.
- The page identifies Mellow RiskManager as an on-chain data source.
- The product has a narrow, understandable function.
- The public agent instruction file provides more implementation detail than the homepage.

### Findings

#### High: Trust and ownership are underspecified

The page does not identify who built or maintains the service, how to report issues, or whether it is affiliated with Lido. Add a compact trust/footer area with:

- Maintainer or organization name.
- GitHub and issue-report links.
- "Independent tool" or official-affiliation wording, as accurate.
- Privacy details for wallet addresses, Telegram identifiers, and email subscriptions.
- Non-custodial/read-only explanation.

#### High: Data methodology is too terse

Explain which values come from Lido, Mellow, DefiLlama, or on-chain contracts; how often they update; and what happens when a source is unavailable. This supports both user confidence and AI citation quality.

#### Medium: No limitations or financial-information disclaimer

State clearly that alerts may be delayed, data may be unavailable, and the service does not provide financial advice or execute transactions.

#### Medium: No visible freshness signal

Display a meaningful version or "data updated" status rather than only a static `v1.0`. Avoid inventing a date that is not tied to real data or release state.

## Schema and Social Metadata

### Current State

- JSON-LD blocks: 0
- Open Graph tags: 0
- Twitter card tags: 0
- Canonical tags: 0

### Recommendations

#### High: Add WebSite and software schema

Use a graph containing:

- `WebSite` with name, URL, description, and publisher/creator.
- `SoftwareApplication` or `WebApplication` with application category, operating system `Web`, URL, description, and a free offer when accurate.

Only include claims that are visible or verifiable. Do not add review ratings, users, or organizational relationships without evidence.

#### High: Add social previews

Add Open Graph and Twitter metadata using a dedicated 1200x630 image. The existing `cover.jpg` is 1280x872 and is not referenced by metadata. Crop or create a social-specific composition that remains legible in link previews.

#### Low: Do not add FAQ schema solely for rich results

FAQ rich-result eligibility is restricted for most commercial sites. A visible FAQ can still help users and AI systems, but it does not need FAQ schema for Google benefit.

## Performance and Core Web Vitals Readiness

These are Lighthouse lab results, not CrUX field data. Google PageSpeed API data could not be retrieved because the shared API quota returned HTTP 429, and no Search Console/CrUX credentials were available.

| Metric | Mobile lab | Desktop lab |
|---|---:|---:|
| Performance score | 75 | 96 |
| FCP | 0.9 s | 0.3 s |
| LCP | 8.3 s | 1.5 s |
| Speed Index | 2.7 s | 0.4 s |
| Total Blocking Time | 40 ms | 0 ms |
| CLS | 0 | 0 |
| TTI | 8.3 s | 1.5 s |

### Findings

#### High: Mobile LCP is poor in the lab run

The mobile simulated LCP was 8.3 seconds, above the 4-second poor threshold. The LCP element was hero copy, and Lighthouse attributed most observed LCP timing to element render delay rather than server response. Validate after each deployment with multiple runs and confirm with CrUX/Search Console once sufficient traffic exists.

#### High: The favicon source dominates transferred bytes

The page transferred about 1.47 MB in Lighthouse, of which approximately 1.38 MB was the direct `/logo.png` request. The visible Next.js image variants were efficiently served as small WebP files, but the metadata icon points browsers at the full original PNG.

Create dedicated icon assets, for example:

- 32x32 and 48x48 PNG/favicon assets.
- 180x180 Apple touch icon.
- 192x192 and 512x512 PWA icons only if needed.

#### Medium: The page is entirely a client component

`app/page.tsx` uses `"use client"` for a scroll-state border and copy buttons, making the whole page hydrate. Consider a server-rendered page with small client components for the interactive controls. Current main-thread work is low, so this is an optimization rather than an urgent defect.

#### Low: Small legacy JavaScript opportunity

Lighthouse estimated about 11 KiB of avoidable legacy JavaScript. This is minor compared with the favicon and mobile LCP work.

## Accessibility and Visual Search Experience

### Strengths

- Desktop and mobile layouts are coherent and readable.
- The mobile viewport does not show obvious horizontal overflow.
- The primary CTA is visually prominent.
- Images have explicit dimensions, avoiding layout shift.
- Lighthouse accessibility score: 95.

### Findings

#### Medium: Color contrast failures

Lighthouse reported insufficient contrast for:

- White text on the blue primary CTA: measured 2.79:1, below the required 4.5:1 for normal text.
- Gray pill text on dark surfaces: 4.48:1, narrowly below 4.5:1.
- Uppercase section labels using `#555555` on `#1a1a1a`: 2.33:1.

Darken the CTA background or use darker text, and brighten secondary/tertiary text tokens. Re-run contrast checks across all small labels and endpoint details.

#### Medium: The mobile top navigation hides the primary bot CTA

On mobile, the top "Open Bot" action is hidden and only GitHub remains. The hero CTA is still visible, so conversion is not blocked, but the navigation prioritization is counterintuitive. Keep a compact bot icon/action in the nav or remove both secondary actions there.

#### Medium: Product proof is absent from the landing page

Existing screenshots in `public/` show the website, email, status, and Telegram flows, but none appear on the homepage. One or two real screenshots would demonstrate the alert output and reduce uncertainty more effectively than additional feature pills.

## Images

### Strengths

- Both rendered images have alt text and fixed width/height.
- Next.js serves appropriately sized WebP variants for visible logo instances.
- Existing screenshots are reasonably compressed JPEGs.

### Findings

- **High:** The source logo is far too large for favicon use.
- **Medium:** Both logo instances use the same generic alt text. The nav image can be decorative with `alt=""`; the hero alt can remain descriptive.
- **Medium:** No social share image is configured.
- **Low:** Product screenshots are available but unused, limiting visual proof and image-search context.

## AI Search / GEO Readiness

### Strengths

- `/agent-instructions.md` is a useful, crawlable Markdown resource.
- API capabilities are listed in plain language.
- The product exposes structured JSON endpoints that agents can consume.
- GitHub provides source-level verification.

### Findings

#### High: The homepage is not very citable

It lacks concise factual sections answering what the tool is, what it monitors, where data comes from, what vaults are supported, and what limitations apply. Add short answer-first paragraphs and descriptive headings.

#### Medium: No machine-readable entity schema

JSON-LD would help systems connect the product name, URL, software type, creator, and GitHub identity.

#### Low: llms.txt is absent

`/llms.txt` returns 404. This file is experimental and is not a Google ranking requirement. It can be a useful convenience after the core content, metadata, and schema work is complete. Point it to the homepage, agent instructions, GitHub repository, and any future HTML documentation.

## Recommended One-Page Information Architecture

1. Hero: one-sentence product definition and two distinct CTAs.
2. Live product proof: a real Telegram or alert screenshot.
3. What the monitor tracks.
4. Alerts users receive.
5. How read-only wallet monitoring works.
6. Supported Lido Earn vaults and data sources.
7. AI-agent/API integration.
8. Trust, privacy, limitations, maintainer, and source links.

This can remain a one-page site. Add `/docs` only when API examples, authentication, response fields, and error behavior become too large for a focused homepage.

## Measurement Limitations

- The Google PageSpeed API returned a quota-exceeded response, so no CrUX field data was available.
- Google Search Console and GA4 data were not connected, so index coverage, impressions, queries, and conversions were not audited.
- Backlink API credentials were unavailable; no domain-authority or referring-domain score is included.
- Parallel specialist agents were attempted per the SEO skill, but they stopped on an account usage limit. The report was completed from direct HTTP inspection, source review, Playwright, and Lighthouse evidence.
- Lighthouse is a point-in-time lab test. Performance values should be confirmed with repeated runs and field data.

## Audit Artifacts

- `output/lighthouse-mobile.json`
- `output/lighthouse-desktop.json`
- `output/playwright/lido-desktop.png`
- `output/playwright/lido-mobile.png`

