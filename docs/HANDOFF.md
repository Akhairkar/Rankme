# Handoff: what is done, what is not (30 Oct 2026, end of build session)

Branch: `claude/gracious-curie-49ug0a` (not merged to `main`, no PR opened).
Checks: `cd backend && npm test` (233 passing) · `python3 scripts/seo_check.py` (303 pages, 254 sitemap URLs) · `python3 scripts/public-shell/apply_shell.py --check` · `python3 scripts/build_sitemap.py --check` · `python3 scripts/build_search_index.py --check`. All run in CI (`.github/workflows/ci.yml`).

## Built and verified locally (Playwright at 390px/1280px: 304 pages, 0 overflow, 0 JS errors; backend on SQLite and mocked fetch)
- **Public site:** 304 pages EN+HI, one shared header/footer (script-enforced), design tokens with dark mode, brand assets, honest home/pricing/about/contact, how-it-works, features (9), help center (11 articles), changelog, status, security, cookie policy, bug report, shared report viewer (`report.html`), refund and data-retention pages, 8 new cornerstone guides, expanded thin pages, invented statistics removed.
- **SEO foundation:** self-canonical Hindi pages, reciprocal hreflang, sitemap and search index generated from the pages, robots.txt on `https://www.localboost.in`, `_headers`, `404.html`, `security.txt`.
- **Free tools (14):** including new keyword ideas, website SEO checker and competitor comparison; real QR codes; honest simulator labelling.
- **Dashboard (20 pages EN+HI)** in `dashboard/`, `hi/dashboard/`, `assets/app/`: honest states for every condition, explicit-confirm review replies, Razorpay verify-before-success. Tested only against a mocked API.
- **Worker backend (20+ routes per module):** oauth, google, billing (Razorpay), audit, rank, crawler (SSRF-safe), platform (analytics, export, admin), workspaces/roles/invitations/audit log, notifications, Action Center, shareable reports, AI assistant (evidence-grounded), review analytics + retention jobs, competitors. Security: rate limiter fails closed, request ids, body limit, Origin check, reauth for sensitive actions.
- CI + deploy workflows (deploy skips cleanly without Cloudflare secrets).

## NOT verified / not done
1. **Nothing has run against real Google, Razorpay, Resend, Places, a rank provider, or a real D1.** All backend verification is mocked or on local SQLite.
2. **Dashboard pages missing:** Team, Notifications, Assistant, report sharing UI, keyword archive/delete (no endpoint), scheduled-rank-scan UI, auto-reply rules (disabled honestly). Endpoint docs: `docs/api/*.md`.
3. **Read-only roles (analyst/client)** cannot use the older read endpoints yet (`/api/score`, `/api/ranks`, `/api/keywords`, etc.): they still use `getUserBusiness`. Migrate to `getBusinessAccess`.
4. `/api/businesses` create ignores `pin_code`/`address` (the dashboard sends them; the update route stores them).
5. `/api/bug-report` endpoint does not exist; the bug form uses mailto and, when the API is on, `/api/waitlist`.
6. No end-to-end browser test suite and no automated accessibility (axe) run; keyboard navigation and screen readers untested. Print/PDF layouts and CSV downloads in dashboards untested.
7. Legacy design: older pages still use their inline styles; dark mode covers shared components only.
8. Hindi copy was written by the AI and needs native proofreading.

## Needs the owner (cannot be done in code)
- Cloudflare: D1 database, `npm run schema` + apply `schema.sql`, deploy Worker, `api.localboost.in`, Pages project `localboost`, GitHub secrets `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`, Worker secrets (`GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, `RAZORPAY_KEY_ID/KEY_SECRET/WEBHOOK_SECRET`, `RANK_PROVIDER_*`, `PAGESPEED_API_KEY`, `GOOGLE_MAPS_API_KEY`, `RESEND_API_KEY`+`EMAIL_FROM`, `ANTHROPIC_API_KEY` (optional), `ADMIN_TOKEN`), then set `enabled: true` in `assets/localboost-api-config.js`.
- Google Cloud: Business Profile API approval, OAuth verification, Search Console and Places APIs; confirm the multi-customer SaaS model is allowed.
- A licensed rank-data provider (India coverage, price, terms unverified).
- Razorpay merchant approval; register the webhook `/api/billing/webhook`; confirm refund and GST terms.
- **Lawyer review** of privacy, terms, disclaimer, compliance, refund-policy, data-retention, cookie-policy and the security page wording (disclosure and response times are drafts).
- Re-verify Google data retention TTLs (`docs/GOOGLE-DATA-RETENTION.md`) against current Google policy.
- Decide invoice/payment retention vs account deletion (India GST records); today deletion removes them.
- Domain/DNS for `www.localboost.in`, Search Console property, sitemap submission.
- The QR library (`tools/qr-generator/qrcode-generator.js`, MIT) was copied from another repo in this account; replace from the official source if preferred.

## Decisions taken
Domain `www.localboost.in`; hosting Cloudflare Pages; API Cloudflare Worker + D1; payments Razorpay; no advertising; first-party consent-gated analytics only; Google sign-in only.
