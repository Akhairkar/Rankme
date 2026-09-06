# PROJECT ROADMAP — Local Business Growth Platform

## 1. Overview

A web platform that helps Indian small and local businesses improve their visibility on Google — covering Google Business Profile (GBP) health, local SEO, online reviews, website presence, and customer acquisition. The platform combines free educational/diagnostic tools with a paid ("Pro") tier for deeper automation and monitoring.

This document is the master architecture. It defines *what* the product is and *why*, not implementation code. No pages, APIs, or credentials are built in this session.

---

## 2. Target Users & Problems

**Primary users:**
- Local/small business owners in India (shop owners, restaurants, clinics, salons, repair services, contractors, coaching centers, etc.) — typically not technical, often mobile-first, may be more comfortable in Hindi/Hinglish than English.
- Secondary: local marketing freelancers/agencies managing several small clients.

**Core problems they face:**
- Business doesn't show up (or shows up poorly) in Google Maps / local search results.
- Google Business Profile is incomplete, unverified, or has incorrect info (hours, category, address).
- Few or no Google reviews; no consistent process to request/respond to reviews.
- No website, or a website that isn't mobile-friendly or SEO-basic.
- Don't understand *why* competitors rank higher or *what* to fix first.
- Limited time, budget, and technical knowledge to act on generic SEO advice.

---

## 3. USP & Positioning

**Positioning statement:** A guided, India-first "Google visibility health platform" for local businesses — plain-language audits and step-by-step fixes, not generic SEO jargon.

**Differentiators:**
- India-specific: Hindi/Hinglish support, India-relevant business categories and search behavior.
- Action-oriented: every diagnostic maps to a concrete, doable next step — not just a score.
- Progressive complexity: starts with free education/self-checks, only introduces automation and paid tools once the user understands the "why."
- Policy-safe by design: no scraping, no fake reviews, no guaranteed-rankings claims — built to survive Google's terms of service and policy changes.

---

## 4. Free vs Pro Features (directional, not final pricing)

**Free tier:**
- Educational content/guides (Learn stage).
- Self-guided GBP and website checklist (manual "Check" tools — user answers guided questions or connects read-only data).
- Basic visibility/health score with plain-language explanations.
- Keyword and category education relevant to the user's business type and city.

**Pro tier (future sessions, not built now):**
- Automated/recurring checks and monitoring (Monitor stage).
- Deeper AI-driven audit reports (e.g., listing completeness, review sentiment, competitor gap analysis) using official APIs where available.
- Review-management workflows (request flows, response drafting) — opt-in and policy-compliant.
- Alerts when profile/listing data changes or drifts from source-of-truth.
- Multi-location support for agencies/franchises.

---

## 5. Core User Journey

**Learn → Check → Fix → Monitor → Automate**

1. **Learn** — Plain-language education on what Google visibility means for a local business, delivered via content architecture (see Section 6).
2. **Check** — Guided self-assessment / diagnostic of GBP, reviews, and website presence (manual first; API-assisted later, see Section 7).
3. **Fix** — Prioritized, concrete action list generated from the Check stage (e.g., "add business hours," "add 3 photos," "respond to your 2 pending reviews").
4. **Monitor** — Ongoing tracking of profile health and review activity over time (Pro-leaning).
5. **Automate** — Opt-in automation for recurring tasks like review requests and periodic re-checks (Pro, policy-compliant only).

---

## 6. Technical Direction (lightweight modern web app)

- Direction only — no full stack lock-in decided yet, to be confirmed in a dedicated technical-architecture session.
- Should support: fast mobile-first rendering, a content/SEO-friendly structure (static or server-rendered pages for content and landing pages), and an interactive app-like layer for the Check/Fix/Monitor tools.
- Should be modular enough that the AI audit layer and future GBP/API integrations can be added without rearchitecting the content layer.
- Should not require the user to hand over sensitive credentials to use the free tier.
- **Confirmed as of Session 05:** content/marketing pages (homepage + pillar guides) are plain static HTML, one real `.html` file per URL, server-renderable with no JavaScript required to view the content. This is deliberate for indexing safety — every page is fully present in the initial HTML response, so search engines don't depend on JS execution to see it. Interactive tools (Check/Fix/Monitor/Automate) can be added later as a separate app layer without changing this content layer.

---

## 7. SEO / Content Architecture (direction)

- Content organized around the **Learn** stage: guides, explainers, and city/business-type-relevant pages.
- Structure to be detailed fully in the dedicated Keyword Architecture session (pillar pages, clusters, long-tail, Hindi/Hinglish variants).
- No doorway pages; no fabricated statistics, rankings, or case studies.
- Content should stay evergreen and policy-safe (i.e., not dependent on any single Google algorithm quirk).
- **Bilingual status (as of Session 06):** real Hindi page versions now exist at distinct URLs (e.g. `/hi/google-business-profile/`), linked to their English counterparts via `hreflang` tags — not a client-side toggle. The header/footer language link now points to the actual translated page. See `SEO-ARCHITECTURE.md` for the hreflang implementation.

---

## 8. Future Google Business Profile / API Integration (direction only)

- Any future integration must use **official Google APIs** (e.g., Google Business Profile API) — no scraping of Google Maps or Search results.
- Read access should be minimized to what's needed for the audit; write actions (like posting updates) must be explicit and user-initiated.
- OAuth-based auth only; no storage of Google account passwords.
- This is a placeholder for a future dedicated integration-architecture session — not designed in detail here.

---

## 9. AI Audit & AI Review-Management Architecture (direction only)

**AI Audit (future):**
- Takes structured, user-provided or API-sourced data (not scraped) about the business's GBP/website state.
- Produces a plain-language explanation of gaps and a prioritized fix list.
- Must not fabricate data it doesn't have (e.g., must not invent star ratings or competitor names) — outputs should be traceable to real inputs.

**AI Review-Management (future):**
- Opt-in only. Assists with drafting review *requests* (compliant with Google's policy against incentivized/fake reviews) and drafting *responses* to existing reviews.
- Never auto-posts without explicit user review/approval in early versions.
- Must not generate fake reviews or incentivize reviews in violation of Google policy.

---

## 10. Trust, Privacy & Google-Policy Considerations

- No scraping of Google Maps, Search, or any Google property.
- No guarantees of ranking position or "#1 on Google" type claims — rankings are outside anyone's control.
- Any review-related feature must be opt-in and comply with Google's review policies (no incentivized, fake, or review-gating practices).
- API keys, OAuth tokens, and any secrets are handled server-side only, never exposed to the client or committed to the repo.
- Business data provided by users is used only for the stated diagnostic/automation purpose — no reselling of business data.
- Clear disclosure to users about what data is read, stored, and why, especially before any Google account connection.

---

## Status

This document defines architecture and direction. Original scope (Session 01) covered planning only; the entries below track what's actually been implemented in later sessions, so this roadmap stays accurate instead of describing only the original plan.

**Implementation log:**
- Session 02 — Keyword architecture (`KEYWORD-MAP.md`) defined.
- Session 03 — Design system (`DESIGN-SYSTEM.md`) defined.
- Session 04 — Homepage built as static HTML (`index.html`), following the Session 03 design tokens.
- Session 05 — SEO architecture implemented: 5 pillar guide pages built as static HTML at clean URLs, each with breadcrumbs, canonical tags, and structured data; `sitemap.xml` and `robots.txt` added; homepage `<head>` updated with canonical + Organization schema and its guide-card links pointed at the real pillar pages. Bilingual (Hindi) pages and the EN/हिं toggle are **not yet built** — see Section 7.
- Session 06 — Bilingual (Hindi) pages built: real translated pages at `/hi/` + `/hi/[pillar]/` for the homepage and all 5 pillars, each with its own `<title>`/description/canonical/JSON-LD in Hindi. `hreflang` alternate tags (en/hi/x-default) added to every English and Hindi page and to `sitemap.xml`. The header/footer language link on every page now points to the real counterpart page instead of being a non-functional placeholder.
- Session 07 — **Check tool built** (the first real interactive tool from the Learn→Check→Fix→Monitor→Automate journey, Section 5). A self-guided, 8-question client-side quiz at `/check/` and `/hi/check/` covering GBP setup, reviews, and website/local SEO basics. Runs fully in the browser — no backend, no data storage, no account — consistent with the free-tier and privacy principles in Sections 4 and 10. Produces a 0–100 score and a prioritized, plain-language fix list, each item linking to the matching pillar guide. The homepage hero form now actually submits to this tool (previously just an alert placeholder) and a "Free Check" link was added to the homepage nav in both languages.
- Session 08 — **Business Growth content cluster** built: 6 bilingual cluster guides (12 total pages) covering problem-based searches for local customer acquisition and online visibility.
- Session 09 — **Google Reviews content cluster** built: 6 high-authority, deep-dive bilingual guides (12 total pages) covering how reviews work, compliant review generation, response templates, crisis handling for 1-star reviews, official fake review removal process, and avoiding Google policy violations. Pillar pages and `sitemap.xml` updated, verified with master audit.
- Session 10 — **Business Type Template** built: Reusable vertical architecture template defined in `_templates/business-type-template.html`. Built comprehensive Salon & Beauty Parlour vertical guide (`/businesses/salon/` & `/hi/businesses/salon/`) and vertical hub (`/businesses/`) featuring specific categories, services, photo rules, mirror QR review strategy, interactive checklist, and FAQPage schema. Verified with master audit.
- Session 11 — **First 10 Business Verticals** built: 9 additional industry-specific local SEO guide pages in English and Hindi (18 total pages): Restaurants, Doctors, Dental Clinics, Gyms, Hotels, Kirana Stores, Mobile Repair Shops, Plumbers, and Electricians. Updated bilingual hubs (`/businesses/` & `/hi/businesses/`) and synchronized `sitemap.xml`. Verified with master audit (60 total pages, 0 errors).
- Session 12 — **More Business Types** built: 8 additional high-intent industry verticals in English and Hindi (16 total pages): Coaching Institutes, Car Repair Garages, Real Estate Agents, Chartered Accountants, Bakeries, Hardware Stores, Photographers, and Pest Control Services. Total 18 business verticals published across both languages, complete with category guidance, photos rules, review workflows, interactive checklists, and FAQPage schemas. Verified with master audit (76 total pages, 0 errors).
- Sessions 13–15 — **Business Audit UI, Crawler Engine & AI Analysis** built: Deterministic local SEO & website diagnostic analysis tool at `/audit/` and `/hi/audit/` providing overall visibility scores, review velocity checks, priority issues, and heuristic action plans without server credentials.
- Sessions 16–20 — **Master Interactive Generators** built: Full suite of tools at `/tools/` and `/hi/tools/`: Local SEO Interactive Checklist (`/tools/local-seo-checklist/`), Business Description Generator (`/tools/description-generator/`), Services Catalog Generator (`/tools/services-generator/`), Review Reply Generator (`/tools/review-reply-generator/`), and Review Request Generator (`/tools/review-request-generator/`).
- Sessions 21–22 — **Google Maps Embed & Places Lookup** built: Responsive iframe Maps embed generator (`/tools/maps-embed/`) and official Place ID & direct review lookup tool (`/tools/places-lookup/`) in English and Hindi. Verified with master audit (94 total pages, 0 errors).
- Session 23 — **OAuth Architecture** specified: Documented enterprise OAuth 2.0 flow (`docs/oauth-architecture.md`) with official Google Business Profile management scopes, CSRF state protection, server-to-server token refresh, AES-256 encryption, and 1-click revocation.
- Sessions 25–26 & 28–30 — **Pro User Dashboard & Review Manager Suite** built: Integrated authenticated dashboard suites at `/dashboard/` and `/hi/dashboard/`, including real-time health scores, Review Manager with AI draft replies (`/dashboard/reviews/`), Configurable Auto-Reply & Negative Escalation Rules (`/dashboard/auto-reply/`), 30-Day Growth Plan sprint calendar (`/dashboard/growth-plan/`), and PDF-printable Monthly Performance Reports (`/dashboard/reports/`).
- Session 27 — **Pro Tier UI** built: Transparent pricing and conversion landing pages at `/pro/` and `/hi/pro/` detailing Free vs. Pro feature comparisons, WhatsApp alerts, and Google API compliance.
- Sessions 33–34 — **City Local SEO Architecture & Major Metros** built: Universal city SEO template (`_templates/city-template.html`), bilingual hubs at `/cities/` and `/hi/cities/`, and 6 comprehensive metro ranking guides: Delhi NCR, Mumbai, Bengaluru, Pune, Hyderabad, and Jaipur in English and Hindi. Verified with master audit (120 total pages, 0 errors, 0 warnings).

Not yet built: Technical SEO, Schema graphs, Site Search, Blog System & Monetization (Sessions 35–42), Compliance & Final Audits (Sessions 43–50).
