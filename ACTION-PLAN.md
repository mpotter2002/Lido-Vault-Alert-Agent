# Lido Vault Alert Agent SEO Action Plan

Implementation status: priorities 1-5 completed on September 13, 2026.

## Phase 1: Highest Impact

### 1. Complete the metadata layer - Completed

Files: `app/layout.tsx`, new social image asset

- Add `metadataBase`.
- Add canonical `/`.
- Expand the meta description to 120-155 useful characters.
- Add Open Graph and Twitter card metadata.
- Replace the favicon reference with a small dedicated icon.

Effort: 1-2 hours  
Impact: High

### 2. Expand the homepage with useful search content - Completed

File: `app/page.tsx`

- Add semantic H2 sections for alerts, tracked metrics, how it works, supported vaults, data sources, and AI/API use.
- Separate Telegram-user and developer/agent journeys.
- Add approximately 350-600 words of specific, non-repetitive content.
- Add a visible data/limitations statement and privacy/trust links.
- Use one or two existing product screenshots as proof.

Effort: 4-8 hours  
Impact: High

### 3. Fix the mobile performance outlier - Completed

Files: icon assets, `app/layout.tsx`, optionally `app/page.tsx`

- Create lightweight favicon and touch-icon assets.
- Re-run Lighthouse at least three times on mobile after deployment.
- If LCP remains poor, split the page into a server component plus small client islands.

Effort: 2-4 hours  
Impact: High

### 4. Add structured data - Completed

Files: `app/layout.tsx` or a small schema component

- Add `WebSite` JSON-LD.
- Add `SoftwareApplication` or `WebApplication` JSON-LD.
- Include only verifiable properties that match visible page content.

Effort: 1-2 hours  
Impact: High

## Phase 2: Technical Completeness

### 5. Add crawl-control files - Completed

Files: new `app/robots.ts`, new `app/sitemap.ts`

- Allow the public site.
- Reference the sitemap from robots.txt.
- Include only the canonical homepage in the sitemap for now.
- Decide whether raw API routes should return `X-Robots-Tag: noindex`.

Effort: 1 hour  
Impact: Medium

### 6. Resolve contrast failures - Completed

Files: `app/page.tsx`, `app/globals.css`

- Darken the blue CTA or use dark CTA text.
- Brighten `text2` and `text3` where used for small text.
- Re-test the CTA, pills, labels, endpoint parameters, and footer.

Effort: 1-2 hours  
Impact: Medium

### 7. Clarify trust and ownership - Completed

File: `app/page.tsx`

- Identify the maintainer.
- Explain whether the project is independent or officially affiliated.
- Add contact/issue-report, privacy, read-only wallet, and non-custodial details.
- Explain data sources, refresh behavior, and service limitations.

Effort: 2-3 hours  
Impact: Medium to high

## Phase 3: Measurement and Growth

### 8. Connect search measurement

- Verify the domain in Google Search Console and Bing Webmaster Tools.
- Submit `sitemap.xml`.
- Track the Telegram CTA, agent-instructions copy, GitHub click, and API-doc interactions.
- Review branded vs. non-branded queries after 4-8 weeks.

Effort: 1-2 hours plus observation time  
Impact: Medium

### 9. Add a focused documentation page only when warranted

Potential route: `/docs`

Create this when there is enough material for response examples, field definitions, rate limits, errors, and agent setup. Do not add thin pages simply to increase page count.

Effort: 1-2 days  
Impact: Medium

### 10. Optional AI-discovery file

Potential file: `public/llms.txt`

Add only after the core page and documentation are complete. Treat it as a navigation aid for AI systems, not a ranking shortcut.

Effort: 30 minutes  
Impact: Low

## Suggested Success Criteria

- Mobile Lighthouse performance consistently above 90 in three runs.
- Lighthouse accessibility at 100 with no contrast failures.
- Canonical, Open Graph, Twitter, and valid JSON-LD present.
- `robots.txt` and `sitemap.xml` return HTTP 200.
- Homepage contains clear, useful sections covering product, alerts, methodology, trust, and limitations.
- Search Console begins recording impressions for non-branded Lido Earn monitoring and alert terms.
