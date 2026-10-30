# Handoff: what is done, what is not (30 Oct 2026)

Branch: `claude/gracious-curie-49ug0a` (not merged to `main`). Backend tests: `cd backend && npm test` (132 passing). Site checks: `python3 scripts/seo_check.py`.

## Done and verified locally
- **SEO foundation:** self-canonical Hindi pages, reciprocal hreflang, sitemap regenerated on `https://www.localboost.in` (`scripts/build_sitemap.py`), robots.txt, no duplicate meta, unique titles (incl. Hindi), integrity checker, CI workflow, `_headers`, `404.html`.
- **Mobile:** no horizontal overflow on any of 209 pages at 390px; hamburger menu; compact consent banner; zero JS errors on every page (two pre-existing bugs fixed: site search was completely broken; reports page script had a syntax error).
- **Trust fixes:** misleading FAQs removed (117 pages), fake payment/contact success removed, placeholder ads/WhatsApp removed, demo data removed.
- **Waitlist funnel:** audit result -> waitlist form, `/waitlist/` pages, `POST /api/waitlist`.
- **Worker backend (modules, all unit-tested on SQLite/mocked fetch, none run against real Google/Razorpay/D1):**
  - `oauth.js` Google sign-in callback, encrypted refresh tokens, hashed sessions
  - `google.js` token refresh, reviews fetch/reply (explicit confirm), performance, Search Console, disconnect
  - `billing.js` Razorpay orders, HMAC verification, webhooks, GST invoices, expiry job
  - `audit.js` documented scoring model, evidence-based findings, compare, 30-day plan, CSV
  - `rank.js` grid scans through a provider adapter (no vendor verified), history, schedules, CSV
  - `crawler.js` SSRF-protected crawler, robots/sitemap, PageSpeed proxy
  - `platform.js` business update/archive, account export, consent-gated analytics, admin metrics, retention jobs
  - security: rate limiter fails closed, request ids, body-size limit, strict Origin check
- **Tools:** places-lookup honesty fix, review reply generator (category/sentiment/language), QR, Hindi tool pages (verified to load and generate; not fully re-tested per tool).
- **Legal drafts:** privacy, terms, disclaimer, compliance rewritten; new refund-policy and data-retention (EN+HI). **These are drafts and need a lawyer's review; the refund terms are proposals the owner must confirm.**
- **Design system:** tokens (light/dark), components, theme toggle, brand assets (logo, favicons, PWA icons, OG images), manifest, style guide at `/design-system/`. Not yet applied to existing pages.

## NOT done (needs the next session)
1. **Dashboard UI** is not wired. `wip/dashboard-app/` holds partial code only; `dashboard/*.html` are still the old pages. Nothing in the dashboard is tested against the new endpoints.
2. **Second backend wave never finished** (usage limit): workspaces/roles/invitations/audit logs, notifications + email, Action Center tasks + shareable report links, AI assistant (evidence-grounded), review analytics + Google data retention design, competitor module. No code from these was saved. Specifications are in this session's prompts; re-create from `docs/API-CONTRACT.md` plus the requirements below.
3. **Public site redesign** (homepage, pricing, about, contact, how-it-works pages, shared header/footer script) was not finished. `wip/public-shell/` has an unfinished script.
4. **Free tools:** website SEO checker UI, competitor comparison tool, keyword ideas tool, review request generator upgrade, rank-grid simulator labelling were not confirmed finished. Tool pages exist but check `tools/` for the new tool folders: none were created.
5. **Help center, features pages, changelog, status page, security page, cookie policy, bug report page** (second wave) were not created.
6. **End-to-end tests and accessibility checks** (Playwright suite, axe) are not written. CI runs backend tests and site integrity checks only.
7. Thin content expansion and new cornerstone guides (content engineer) not delivered.
8. Applying design tokens/logo to existing pages, `manifest` link tags, dark mode on legacy pages.

## Needs the owner (cannot be done in code)
- Cloudflare: D1 database, deploy Worker, `api.localboost.in`, Pages project `localboost`, secrets (`GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, `RAZORPAY_*`, `RANK_PROVIDER_*`, `PAGESPEED_API_KEY`, `ADMIN_TOKEN`), GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- Google Cloud project, Business Profile API approval and OAuth verification; check the SaaS multi-customer model against Google's API policy.
- A licensed rank-data provider (India coverage, price, terms unverified).
- Razorpay merchant approval and webhook registration; confirm refund and GST terms.
- Lawyer review of legal pages; decide invoice retention vs account deletion (GST records).
- Domain/DNS ownership for `www.localboost.in`; Search Console property and sitemap submission.
- Real WhatsApp number if wanted on the contact page.

## Known design decisions
- Production domain `www.localboost.in`, hosting Cloudflare Pages, API Cloudflare Worker + D1 (SQLite), payments Razorpay, no advertising, first-party consent-gated analytics only, Google sign-in only (no password flow).
- `account delete` currently deletes payments and invoices; revisit for tax retention.
- Performance and Search Console routes have no plan gate; review routes do.
