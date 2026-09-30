# RANKME — MASTER PAID SaaS + API ROADMAP
## Product transformation: SEO content site → paid Local SEO SaaS platform

Status: Master roadmap. Repository: Akhairkar/Rankme.
Rule: preserve existing working functionality; inspect before changing; no blind mass edits; test every phase.

## 0. PRODUCT NORTH STAR
Rankme will be a paid Local SEO / Google Business Profile management SaaS, not an AdSense-first content site.
Customer journey: Connect business → audit website + Google presence → identify issues → recommend fixes → monitor changes → report → subscription.
Content remains the acquisition layer; dashboard, automation, reports, integrations and API access are the monetization layer.

Primary customers: small local businesses, single/multi-location businesses, freelance SEOs, local SEO agencies, marketing agencies.
Principles: no guaranteed rankings; no fake data; official APIs where available; server-side secrets; caching; quotas/credits; secure billing; private outputs noindex; privacy by design; mobile-first; never market an unimplemented feature as live.

## 1. CURRENT REPOSITORY BASELINE
- Audit all 257 files and classify every file as content, tool, UI, logic, configuration, documentation or generated page.
- Map every route, form, CTA, JavaScript dependency and external request.
- Detect mock/demo data, placeholders, dead links and features documented but not actually functional.
- Create a feature truth matrix: feature, URL, UI, logic, backend, API, auth, payment, production test, limitation, next action.
- Record current sitemap, indexability, metadata, analytics, payment flow, dashboard and API configuration without exposing secrets.
Gate: finish the baseline before major API integration.

## 2. TARGET APPLICATION ARCHITECTURE
Public: homepage, guides, business/city pages where justified, free tools, pricing, product pages, docs, blog.
Application: auth, onboarding, business selector, dashboard, audits, website monitoring, GBP, Maps/local visibility, reviews, reports, growth plans, billing, settings, API/usage.
Backend: auth, business/workspace records, OAuth, API proxy, secrets, usage metering, cache, jobs, reports, billing webhooks, notifications, audit logs.
Core data entities: users, organizations, businesses, locations, websites, Google connections, reviews, audit runs/findings, keyword projects, rank snapshots, competitors, reports, growth plans, plans, subscriptions, invoices, payments, usage events, API usage, notifications, leads, consent and security logs.

## 3. AUTHENTICATION + WORKSPACES
- Signup/login, verification, password reset, sessions, logout-all, account deletion.
- Organizations/workspaces and business ownership.
- Roles: Owner, Admin, Manager, Viewer.
- Multi-user agency access.
- Server-side authorization on every private endpoint.
- Rate limiting, input validation, output escaping, CSRF protection where applicable, audit logs and secret management.

## 4. BUSINESS ONBOARDING
Flow: account → business → website → category/location → connect Google → select property/location → first audit → findings → upgrade.
- Single and multi-location support.
- Business selector, connection status, refresh, disconnect, duplicate prevention.
- First-value experience should be fast and clear.

## 5. GOOGLE BUSINESS PROFILE API
High-priority integration. Verify actual API availability, approval requirements and permitted commercial use before implementation.
- Google Cloud project and required APIs.
- OAuth consent, minimum scopes, callback, state validation, token refresh/revocation and secure token storage.
- Account/location discovery and selection.
- Retrieve supported business profile data, categories, hours, website, phone, address/service area, attributes, media, posts, reviews and supported performance data.
- Review response workflow where officially supported.
- Error handling, quota handling, retries, caching, incremental sync and disconnect cleanup.
Never call a feature live until production API testing confirms it.

## 6. GOOGLE PLACES / MAPS PLATFORM
Potential uses: place lookup, place details, business discovery, category/location research, Maps display/embed and address/location validation where appropriate.
- Restrict API keys.
- Keep sensitive operations server-side where required.
- Track SKU-level cost and quotas.
- Cache and deduplicate requests.
- Add an emergency cost/usage kill switch.
Do not expose unrestricted keys in frontend HTML/JS.

## 7. GOOGLE SEARCH CONSOLE API
Turn Rankme into an SEO performance monitor.
- OAuth and property selection.
- Search Analytics: queries, pages, clicks, impressions, CTR, average position, date/device/country dimensions where useful.
- Identify CTR opportunities, growing queries, declining pages and historical trends.
- Cache results and control quota usage.

## 8. GOOGLE ANALYTICS DATA API
- GA4 connection and property selection.
- Organic traffic, users, sessions, landing pages and configured conversions.
- Date comparison and dashboard trends.
- Cache data and minimize personal-data collection.

## 9. REAL WEBSITE CRAWLER + TECHNICAL SEO ENGINE
Checks: HTTP status, redirects, HTTPS, canonical, robots meta, robots.txt, sitemap, title, meta description, H1/headings, image alt, internal links, broken links, orphan pages where detectable, duplicate metadata, thin pages, noindex, schema, Open Graph, hreflang, viewport, security headers where detectable, page size/resources and sitemap coverage.
Engine: queue, robots compliance, crawl limits, timeouts, retries, URL normalization, same-domain restriction by default, snapshots, comparisons, severity, deduplication, explanations and actionable fixes.

## 10. PAGESPEED / CORE WEB VITALS
- Integrate PageSpeed Insights where useful.
- Mobile/desktop performance, Core Web Vitals, performance opportunities, accessibility/best-practice/SEO findings where provided.
- Historical snapshots and caching.

## 11. LOCAL SEO + MAPS VISIBILITY
- Target keywords, locations and grid configuration.
- Research and select a compliant SERP/local-rank data provider only after comparing coverage, accuracy, India support, pricing, rate limits, terms and commercial rights.
- Rank snapshots, history, grid visualization, competitors and visibility score.
- Clearly disclose limitations; never guarantee rankings.
- Provide a lower-cost/manual mode if automated rank checks are too expensive.

## 12. REVIEW MANAGEMENT
- Review inbox, new-review detection, rating/count trends, unanswered reviews.
- AI-assisted replies, tone/language controls, human approval by default, publishing status and history.
- Follow provider review policies.
- Never create fake reviews, incentives, review gating or fabricated customer details.

## 13. AI ENGINE
Features: audit explanations, title/meta suggestions, GBP description, services, review replies, competitor observations, Search Console summaries, 30-day plans, monthly reports and prioritization.
Controls: data-grounded prompts, no invented facts, human approval for publishing, AI labeling where appropriate, cost/token tracking, quotas, abuse protection and PII minimization.

## 14. RANKME HEALTH SCORE
Possible components: technical SEO, on-page SEO, performance, GBP completeness, reviews, local visibility, Search Console and conversion readiness.
- Publish the scoring formula and weights.
- Explain score changes.
- Show historical score and issue-to-score relationship.
- Never represent the score as a Google ranking.

## 15. CUSTOMER DASHBOARD
Overview, business selector, Google connection, website status, SEO performance, local visibility, reviews, critical issues, quick actions, trends and recent activity.
Modules: Website Audit, SEO, GBP, Maps, Reviews, Keywords, Competitors, Reports, Growth Plan, Notifications, Billing, Settings and API/Usage.

## 16. AUTOMATION ENGINE
Recurring jobs: website checks, Search Console sync, GBP refresh, review monitoring, rank checks, PageSpeed refresh, monthly reports and alerts.
Required: scheduler, queue, retries, idempotency, logs, quotas, cost protection and admin monitoring.

## 17. REPORTS
- On-demand, weekly and monthly reports.
- PDF, shareable/client-safe reports, agency branding and optional white-label reports.
- History, before/after metrics, recommendations and timestamps.
- Separate measured data from AI interpretation.

## 18. NOTIFICATIONS
Evaluate in-app, email and compliant WhatsApp Business messaging.
Alerts: new review, unanswered review, score change, technical issue, traffic/CTR change, rank movement, website down, payment issue, report ready.
Include preferences, unsubscribe and retry/failure handling.

## 19. BILLING + PAID PLANS
Suggested structure:
Free: basic audit and limited tools.
Starter: one business, scheduled monitoring, Search Console, basic GBP/review monitoring and reports.
Growth: multiple data sources, Maps/rank tracking, competitors, AI and automated reports.
Agency: multiple businesses, team access, white-label reports and higher quotas.
Billing requirements: plans, monthly/yearly pricing, checkout, subscriptions, success/failure, signed webhooks, idempotency, renewal, cancellation, upgrade/downgrade, refunds, invoices, entitlements, grace period and failed-payment recovery.
Paid access must be controlled server-side, not by frontend success screens.

## 20. CREDIT / USAGE METERING
Meter API calls, crawl pages, rank checks, AI generations, reports, connected businesses, keywords and competitors.
- Usage ledger, allowance, consumption, remaining balance, limits, warnings, admin override, per-operation cost and internal cost dashboard.

## 21. PUBLIC API / DEVELOPER PRODUCT
Later-stage product: audit, SEO score, page analysis, permitted business/review data, local visibility and reports.
- API keys, scopes, revocation, rate limits, usage billing, versioning, documentation, errors, webhooks and logs.
- Only expose/resell functionality allowed by upstream provider terms.

## 22. PRODUCT-LED SALES
Search/content/tool → free audit → result preview → signup → first report → paid monitoring.
- Free audit landing pages.
- Tool-specific landing pages.
- Locked premium findings with clear value explanation.
- Agency lead flow and demo/contact flow.
- Shareable business audit.
- No dark patterns.

## 23. HIGH-CTR SEO UPGRADE
Use SEO to acquire SaaS customers, not as the monetization model.
For important indexable pages: unique title, accurate compelling description, search-intent match, strong H1, useful first screen, internal links, relevant product CTA, breadcrumbs, canonical, hreflang, valid schema and OG metadata.
GSC workflow: identify high-impression/low-CTR pages → change small batches → record old/new metadata → monitor clicks/CTR/position → retain or revert based on evidence.
No mass title/meta rewrite without baseline data. No clickbait, keyword stuffing or thin permutations.

## 24. CONTENT → PRODUCT FUNNEL
Clusters: GBP problems, Maps visibility, Local SEO, Reviews, website audits, Search Console/CTR, business growth and genuinely useful industry/city content.
Every useful page should connect the journey: Learn → Check → Audit → Fix → Monitor → Upgrade.

## 25. AGENCY MODE
- Agency workspace, clients, multiple businesses, invites, permissions, client dashboards, white-label reports, bulk audit/report/monitoring and agency billing.

## 26. SECURITY
- No secrets in GitHub/frontend.
- Restricted API keys, secure OAuth, encrypted/secure token storage, auth/API rate limits, validation, XSS/CSRF/injection defenses, SSRF protection for URL crawler, upload validation if needed.
- Payment webhook verification, replay/idempotency protection, authorization and account-isolation tests.
- Secure errors, logging, rotation, retention and deletion strategy.

## 27. PRIVACY + COMPLIANCE
- Privacy policy, terms, refunds/cancellation, consent/cookie behavior where required.
- Explain Google OAuth and third-party API data use.
- Account/data deletion and export where appropriate.
- Minimum data collection.
- Separate transactional and marketing communication.
- Review provider/API terms before launch.

## 28. PERFORMANCE + INFRASTRUCTURE
- Keep public pages lightweight.
- Cache APIs; background long jobs; DB indexes; compression/CDN/assets optimization.
- Error tracking, uptime monitoring, backups, recovery and migration strategy.

## 29. PRODUCT ANALYTICS
Track audit start/completion, signup, business added, Google connection, first dashboard visit, paid-feature use, checkout, payment, active subscription, churn, cancellation, feature usage, API/AI cost and report generation.
KPIs: activation, free-to-paid conversion, MRR, ARPA, churn, LTV, API cost/customer, gross margin and support burden.
Do not optimize CTR while ignoring paid conversion.

## 30. ADMIN PANEL
Private admin: users, organizations, businesses, subscriptions, payments, API usage/errors, AI cost, crawl/scheduled jobs, OAuth health, failed webhooks, system health, feature flags, entitlements, audit logs and support notes.
Admin/private pages must not be indexable.

## 31. TESTING / QA
Automated: HTML/link checks, JS errors, API, auth, authorization, OAuth, billing webhooks, entitlements, metering, crawler, AI fallback and API-failure tests.
Manual: mobile/desktop, slow network, logged-out/new/existing user, free/paid/expired plan, failed payment, Google disconnect, quota exceeded, invalid URL, unavailable website and large website.

## 32. LAUNCH GATES
Product: real audit, dashboard and complete customer journey.
API: required access approved/configured, quotas protected, costs measurable.
Billing: complete subscription lifecycle and verified webhooks.
Security: no exposed secrets and verified authorization/payment replay protection.
Data: account isolation and deletion/disconnect.
SEO: sitemap, robots, canonical, hreflang, schema and private-page noindex.
UX: mobile dashboard, transparent pricing and no fake/demo data presented as real.

## 33. BUILD ORDER
Stage A Foundation: repository audit → feature matrix → backend architecture → database → auth → business/workspace → secrets.
Stage B First paid value: crawler → real audit → health score → dashboard → report → pricing → subscription billing.
Stage C Google: Search Console → Analytics → GBP → reviews → Places/Maps.
Stage D Local SaaS: keywords → rank/grid → competitors → review monitoring → alerts.
Stage E AI: explanations → recommendations → replies → growth plans → reports.
Stage F Retention: scheduled monitoring → notifications → monthly reports → history → automation.
Stage G Agency: multi-client → white-label → bulk operations → agency billing.
Stage H Developer: API → keys → usage billing → webhooks → docs.
Stage I Scale: cost optimization → reliability → security hardening → analytics → support → growth.

## 34. API SELECTION CHECKLIST
For every provider document: official docs, exact product/endpoint, approval, auth model, commercial-use rights, data restrictions, rate limits, pricing/SKU, free allowance, India availability, accuracy, terms, expected calls/customer/month, estimated cost/customer/month, fallback, cache duration and security requirements.
Candidate categories: GBP, Places/Maps, Search Console, Analytics, PageSpeed, AI, SERP/rank tracking, email, WhatsApp Business and payments.
An API is not selected until this checklist is complete.

## 35. UNIT ECONOMICS
For every paid feature calculate: revenue per customer minus API cost minus infrastructure minus payment fees minus AI cost minus support cost = contribution margin.
Track cost per audit, crawl, rank check, Maps lookup, GBP sync, AI request, report and notification.
Plan limits must follow actual cost data.

## 36. CHANGE CONTROL
Every implementation session: inspect → change only intended files → preserve functionality → self-audit → test links/routes → inspect diff → document changes and limitations → deploy only after verification.
For risky changes: branch → test → compare → PR → merge after audit.

## 37. EXPLICITLY OUT OF SCOPE / PROHIBITED
No AdSense-first strategy. No fake reviews/ratings/data. No guaranteed ranking claims. No fabricated competitors. No prohibited scraping. No unrestricted API keys. No frontend-only payment unlock. No mass thin city pages. No keyword stuffing. No unnecessary personal-data collection. No exposed OAuth tokens. No claiming integrations are live before testing. No deletion of existing functionality just to simplify development.

## 38. FINAL PRODUCT DEFINITION
Rankme should let a customer sign up → add business → connect permitted data → run a real audit → see real findings → receive a useful report → activate a paid plan → return later and see updated data.
Production-ready means secure authentication, server-side entitlements, measured API usage, error handling, privacy controls, cancellation and reliable recurring monitoring.

## 39. IMMEDIATE NEXT 10 ACTIONS
1. Complete the 257-file repository truth audit.
2. Produce the feature truth matrix.
3. Identify existing API-like functionality that is actually working.
4. Inspect dashboard, audit, checkout and payment implementations.
5. Define minimum production backend/data model.
6. Define the first paid MVP.
7. Research/select the first 2–3 APIs using the API checklist.
8. Build authentication + business/workspace foundation.
9. Convert the existing audit into a real server-backed product.
10. Connect billing only after the core paid value works.

## SESSION RULE
Future work must select one bounded module from this roadmap, inspect current implementation first, implement only that module, test it, record the result, and then move to the next module.