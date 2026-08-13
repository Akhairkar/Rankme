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

- Direction only — no stack lock-in decided yet, to be confirmed in a dedicated technical-architecture session.
- Should support: fast mobile-first rendering, a content/SEO-friendly structure (static or server-rendered pages for content and landing pages), and an interactive app-like layer for the Check/Fix/Monitor tools.
- Should be modular enough that the AI audit layer and future GBP/API integrations can be added without rearchitecting the content layer.
- Should not require the user to hand over sensitive credentials to use the free tier.

---

## 7. SEO / Content Architecture (direction)

- Content organized around the **Learn** stage: guides, explainers, and city/business-type-relevant pages.
- Structure to be detailed fully in the dedicated Keyword Architecture session (pillar pages, clusters, long-tail, Hindi/Hinglish variants).
- No doorway pages; no fabricated statistics, rankings, or case studies.
- Content should stay evergreen and policy-safe (i.e., not dependent on any single Google algorithm quirk).

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

This document defines architecture and direction only. No pages, code, APIs, or credentials have been created in this session. Future sessions will build out: keyword architecture, design system, technical stack decisions, the actual Check tools, GBP API integration, AI audit engine, review-management automation, security hardening, performance work, and final QA — each as its own scoped session per the roadmap pack's workflow.
