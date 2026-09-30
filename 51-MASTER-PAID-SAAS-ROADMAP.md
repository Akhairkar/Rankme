# RANKME — LOCAL BUSINESS GOOGLE RANKING MASTER ROADMAP

Status: Master product roadmap.  
Repository: `Akhairkar/Rankme`

## 0. CORE PRODUCT — NON-NEGOTIABLE

**Rankme ka ek hi core purpose hai: shops aur local businesses ko Google Search aur Google Maps par apni visibility/ranking improve karne mein help karna.**

Core journey:

**Business add karo → Google data check karo → ranking/visibility problems identify karo → actionable fixes do → changes track karo → improvement report do → paid monitoring continue karo.**

Rankme Google ranking guarantee nahi karega. Google ke ranking systems ke control ke bahar jo cheezein hain unhe guarantee, fake score, fake ranking ya fabricated result ke roop mein present nahi kiya jayega.

Every feature must pass this test:

> **Kya ye local business ki Google Search/Maps visibility, local SEO, reputation, profile quality, ranking monitoring ko directly improve karta hai?**
>
> Agar nahi, feature Rankme roadmap mein nahi jayega.

AdSense business model nahi hai. Primary monetization **paid software/subscription** hai.

---

# 1. CURRENT REPOSITORY TRUTH AUDIT

Existing repository ko implementation ke hisaab se audit karna hai — documentation ko implementation nahi maana jayega.

Audit every relevant file/route and record:

- URL
- page purpose
- English/Hindi version
- UI present?
- JavaScript present?
- actual functionality?
- API call?
- external dependency?
- mock/demo data?
- form submission?
- authentication?
- payment dependency?
- indexable/noindex?
- canonical
- sitemap inclusion
- internal links
- CTA
- mobile behavior
- broken/dead links
- duplicated/generated content
- current branding
- current product relevance

Create a **Feature Truth Matrix**:

| Feature | URL | UI | Real Logic | Backend | API | Auth | Payment | Status | Next Action |
|---|---|---|---|---|---|---|---|---|---|

Do not delete working pages during the audit.

---

# 2. FINAL RANKME PRODUCT MODULES

Rankme will be built around these modules only:

1. Business onboarding
2. Google Business Profile optimization
3. Google Maps/local visibility
4. Website/local visibility audit
5. Google Search Console performance
6. Keyword/local rank tracking
7. Competitor visibility analysis
8. Google Reviews/reputation
9. AI SEO recommendations
10. Rankme visibility/health score
11. Dashboard
12. Monitoring and alerts
13. Reports
14. Paid subscriptions
15. Agency/client management — only for managing the same ranking product
16. SEO/content acquisition for selling the product

---

# 3. BUSINESS ONBOARDING

Customer flow:

**Sign up → Add business → Business category → Location → Website → Google connection → First audit → Findings → Action plan → Monitoring → Paid plan**

Business data:

- business name
- category
- address/service area
- city
- website
- phone where appropriate
- Google Business Profile connection
- target keywords
- target locations
- competitors

Support:

- single business
- multiple locations
- duplicate prevention
- business selector
- connection status
- reconnect/disconnect
- data refresh

---

# 4. GOOGLE BUSINESS PROFILE

Use official Google Business Profile APIs where access and permitted use are available. Google documents that the APIs can manage supported location information, reviews, posts, media and performance-related functionality; API access has eligibility/approval requirements. citeturn0search0turn0search1

Planned functionality:

- Google OAuth
- account discovery
- location discovery
- location selection
- profile information
- primary/secondary categories
- business hours
- website
- phone
- address/service area
- attributes
- media
- posts where supported
- reviews
- review replies where supported
- supported performance data
- profile completeness checks
- Google updates detection where available

Security:

- OAuth state validation
- secure token storage
- token refresh
- revoke/disconnect
- minimum required scopes
- server-side API calls
- quota handling
- retry/backoff
- caching
- sync logs

Google requires OAuth for requests accessing protected Business Profile data, and API access is not simply an unrestricted public API. citeturn0search3turn0search11

---

# 5. GOOGLE MAPS + LOCAL VISIBILITY

Purpose: understand how a business appears to customers searching locally.

Features:

- business/place lookup
- category validation
- location validation
- Maps data where permitted
- local search visibility
- target keyword + location
- local rank tracking
- rank history
- visibility trends
- competitor comparison
- local grid/rank map where data provider supports it

A third-party rank provider may be used only after checking:

- India coverage
- local-pack accuracy
- keyword limits
- location precision
- pricing
- commercial rights
- API limits
- data retention
- reliability
- fallback/manual mode

No fabricated rank positions.

---

# 7. GOOGLE SEARCH CONSOLE

Connect the customer's verified Search Console property through OAuth.

Use Search Console data for:

- queries
- pages
- clicks
- impressions
- CTR
- average position
- device
- country
- date trends

Identify:

- high-impression/low-CTR pages
- ranking opportunities
- declining queries
- declining pages
- pages gaining impressions
- pages with clicks but weak position
- query/page mismatches

Google's Search Console API supports Search Analytics, Sitemaps, Sites and URL Inspection functionality. citeturn0search6turn0search7

Rankme must distinguish:

**Google Search Console data** from **Rankme recommendations**.

---

# 8. KEYWORD + LOCAL RANK TRACKING

Customer selects:

- keyword
- city
- locality/area where supported
- device
- search engine/location configuration

Rankme stores:

- current position
- previous position
- position change
- visibility
- ranking URL
- date
- competitor presence

Features:

- keyword groups
- keyword history
- ranking chart
- local grid
- winners/declines
- keyword opportunities
- competitor comparison

Cost protection:

- daily/weekly limits by plan
- credits
- caching
- duplicate request prevention
- scheduled checks
- provider failure fallback

---

# 9. COMPETITOR VISIBILITY

Competitor analysis must use measurable data.

Compare:

- local visibility
- ranking keywords
- profile completeness
- review count/rating trends where legally/technically available
- Google profile optimization signals
- category coverage
- content/service coverage
- ranking changes

Never invent competitor data.

Competitor findings must say what was actually measured.

---

# 10. GOOGLE REVIEWS + REPUTATION

Features:

- review monitoring
- unanswered review detection
- review count trend
- rating trend
- review response workflow
- AI reply suggestions
- multilingual reply generation
- response history
- review issue alerts

AI replies are suggestions by default.

Never:

- generate fake reviews
- buy/manipulate reviews
- create fake customer details
- promise review-driven rankings
- publish automatically without the appropriate permission/workflow

---

# 11. AI SEO ENGINE

AI exists to make real ranking data understandable and actionable.

Allowed use cases:

- audit explanation
- priority recommendations
- title/meta suggestions
- local SEO recommendations
- GBP description suggestions
- services suggestions
- review reply drafts
- Search Console summaries
- competitor observations based on measured data
- weekly/monthly action plans
- report summaries

AI rules:

- never invent business facts
- never invent rankings
- never invent competitors
- never invent reviews
- never guarantee Google rankings
- show source/evidence when available
- human approval for publishing
- token/cost tracking
- usage limits
- PII minimization

---

# 12. RANKME VISIBILITY / HEALTH SCORE

Create one understandable score for the customer's Google visibility readiness.

Possible components:

- GBP completeness
- local profile quality
- website technical SEO
- on-page/local SEO
- Search Console performance
- review/reputation signals
- local ranking visibility
- critical technical issues

Requirements:

- publish scoring methodology
- fixed/versioned weights
- explain every score change
- show historical score
- show issues affecting score
- distinguish Rankme score from Google's actual ranking

Never call it a Google score.

---

# 13. ACTION CENTER

This is one of the most important product modules.

Instead of showing only problems, Rankme should create an ordered action list.

Example:

**Critical**
- Missing/incorrect business information

**High**
- Important local landing page has weak title/H1
- Several important pages not indexed
- Target keyword visibility declining

**Medium**
- Missing internal links
- Missing local structured data where appropriate

Each action:

- priority
- evidence
- explanation
- exact fix
- status
- completed date
- before/after result

Statuses:

- New
- In progress
- Completed
- Monitoring
- Ignored

---

# 14. CUSTOMER DASHBOARD

Main dashboard:

- Google visibility overview
- Rankme score
- Google Business Profile status
- Maps visibility
- Google profile optimization health
- Search Console performance
- keyword rankings
- reviews
- competitors
- open actions
- recent changes
- trend history

Navigation:

- Overview
- Audit
- Actions
- Google Profile
- Maps
- SEO
- Keywords
- Competitors
- Reviews
- Reports
- Monitoring
- Billing
- Settings

Only show modules that actually work.

---

# 15. MONITORING

Recurring monitoring:

- website health
- technical SEO
- Search Console
- GBP changes
- reviews
- keyword positions
- local visibility
- competitors
- score changes

Alerts:

- major ranking drop
- website down
- important SEO issue
- new review
- unanswered review
- Search Console traffic/CTR change
- GBP information change
- major visibility change

Must have:

- scheduler
- queue
- retries
- idempotency
- logs
- quota protection
- cost protection

---

# 16. REPORTS

Generate:

### Business report
- current visibility
- score
- ranking
- Google profile
- SEO
- reviews
- critical issues

### Progress report
- previous vs current
- ranking changes
- traffic changes
- visibility changes
- completed actions
- remaining issues

### Monthly report
- summary
- wins
- losses
- priority actions
- next-month plan

Keep:

**Measured data ≠ AI interpretation.**

Report timestamps and data periods must be visible.

---

# 17. PAID PRODUCT

Rankme earns from subscriptions, not advertisements.

Possible plans will be finalized only after actual API/infrastructure cost calculations.

### Free
- limited audit
- limited recommendations
- basic visibility check

### Starter
- one business
- monitoring
- Search Console
- basic GBP/review monitoring
- reports

### Growth
- rank tracking
- Maps visibility
- competitors
- AI recommendations
- deeper monitoring
- reports

### Agency
- multiple businesses
- team access
- client management
- bulk monitoring
- white-label reports

Do not finalize pricing before unit economics are known.

---

# 18. BILLING

Payment system must support:

- checkout
- subscription creation
- payment verification
- signed webhooks
- webhook idempotency
- renewal
- cancellation
- upgrade
- downgrade
- failed payment
- grace period
- refund
- invoice
- entitlement enforcement

Critical rule:

**Frontend payment success is never sufficient to unlock paid features.**

Paid entitlement must be verified server-side.

---

# 19. API STRATEGY

Priority APIs:

### Tier 1
1. Google Business Profile APIs
2. Google Search Console API
3. Google Maps/Places Platform

### Tier 2
4. PageSpeed Insights
5. Google Analytics Data API

### Tier 3
6. Local SERP/rank provider
7. AI API
8. Email/WhatsApp alerts
9. Payment subscription API

For every API record:

- official documentation
- exact endpoint
- approval requirements
- OAuth/API-key requirements
- commercial-use terms
- pricing
- quota
- India support
- expected calls/customer
- estimated monthly cost
- caching rules
- fallback
- security requirements

Do not integrate an API merely because it exists.

---

# 20. COST CONTROL

Every expensive operation must be metered:

- GBP API calls
- Maps/Places requests
- rank checks
- website crawls
- PageSpeed requests
- Search Console requests
- AI requests
- reports

Track:

**cost per customer → revenue per customer → contribution margin**

Add:

- plan limits
- credits
- cache
- deduplication
- request throttling
- emergency API kill switch
- admin usage dashboard

---

# 21. AUTH + DATA SECURITY

Required:

- secure signup/login
- sessions
- password reset
- account deletion
- authorization
- business ownership
- workspace roles
- OAuth state protection
- encrypted/secure token storage
- token revocation
- rate limiting
- input validation
- output escaping
- SSRF protection for crawler
- payment webhook verification
- replay protection
- audit logs

Never put secrets in frontend or GitHub.

---

# 22. PRIVACY + GOOGLE COMPLIANCE

Need:

- privacy policy
- terms
- refund/cancellation policy
- Google OAuth explanation
- third-party API disclosure
- data deletion
- disconnect Google account
- minimum data collection
- retention policy
- marketing consent where required

Google Business Profile API access requires a legitimate business reason and Google approval/eligibility; Rankme must verify current requirements before implementation. citeturn0search2turn0search5

---

# 23. SEO ACQUISITION — ONLY TO SELL RANKME

Public SEO remains important, but it is an acquisition channel.

Core topics:

- Google Maps ranking
- Google Business Profile optimization
- local SEO
- local ranking problems
- Google review management
- local Google profile optimization
- Search Console/CTR problems
- ranking drops
- local business SEO audits
- business-type + local SEO where genuinely useful
- city + local SEO only where content is unique and useful

Every content page should lead naturally:

**Learn → Check → Audit → Fix → Monitor → Paid**

No:

- thin city pages
- keyword stuffing
- fake local facts
- mass AI pages
- fake rankings
- guaranteed-result claims

---

# 24. HIGH-CTR ACQUISITION

For important public pages:

- accurate title
- compelling but truthful description
- exact search intent
- strong H1
- useful first screen
- clear audit CTA
- internal links
- canonical
- hreflang where applicable
- valid structured data
- Open Graph

Use controlled experiments:

**Baseline → small batch → monitor CTR/clicks/position → keep/revert**

Do not mass-change all metadata at once.

---

# 25. EXISTING TOOLS — RECLASSIFICATION

Existing tools must be classified by direct ranking value.

### Keep / integrate
- Local SEO Checklist
- Citation Checker
- Description Generator
- Services Generator
- Review Reply Generator
- Review Request Generator
- Rank Grid Simulator
- Places Lookup
- Maps Embed
- Review Dispute Generator where policy-compliant

### Integrate into the main product
Standalone tools should eventually feed the Business Audit / Action Center instead of remaining disconnected utilities.

### Review before keeping
Any tool whose only purpose is generic content generation or unrelated business promotion.

No tool survives simply because it already exists.

---

# 26. BUSINESS-TYPE + CITY CONTENT

Business-type and city pages are allowed only when they provide real local-search value.

Examples:

**Dental clinic + city → local SEO/ranking guidance**

**Restaurant + city → Google Maps/local visibility guidance**

Not allowed:

Thousands of near-identical pages with only:

- business name
- city name
- keyword substitutions

Each indexable page must have:

- unique intent
- useful local information
- genuine examples
- strong internal linking
- clear product relevance

---

# 27. AGENCY MODE

Agency mode is not a separate product.

It is the same Rankme ranking product with:

- multiple businesses
- clients
- permissions
- bulk audits
- bulk monitoring
- client reports
- white-label reports
- agency billing

Every feature must still serve Google Search/Maps visibility.

---

# 28. PUBLIC API — LATER ONLY

A developer API is not an initial priority.

Possible future endpoints:

- business audit
- SEO audit
- Rankme score
- local visibility
- rank data
- reports
- permitted Google data

Only expose data/functionality allowed by upstream provider terms.

---

# 29. ADMIN

Private admin panel:

- users
- businesses
- subscriptions
- payments
- API usage
- API failures
- crawler jobs
- rank jobs
- Google connections
- webhook failures
- AI usage/cost
- system health
- feature flags
- audit logs

Admin pages must be private and noindex.

---

# 30. TESTING

Test:

### Public
- every important route
- links
- mobile
- forms
- tools
- SEO metadata
- sitemap
- robots

### Application
- signup
- login
- business creation
- Google OAuth
- disconnect
- audit
- dashboard
- permissions

### APIs
- success
- invalid credentials
- quota
- timeout
- provider failure
- retry
- duplicate request

### Billing
- successful payment
- failed payment
- duplicate webhook
- renewal
- cancellation
- expired subscription
- refund
- entitlement removal

### Data
- business isolation
- account deletion
- token deletion
- report access

---

# 31. LAUNCH GATES

Rankme cannot be called production-ready until:

- real business can be added
- real audit works
- real findings are shown
- Google integration works where approved
- paid entitlement works server-side
- API costs are measurable
- dashboard works
- monitoring works
- reports work
- errors are handled
- secrets are protected
- private data is isolated
- deletion/disconnect works
- mobile UX works
- no fake/demo data is presented as live
- no ranking guarantees are made

---

# 32. BUILD ORDER

## PHASE A — TRUTH
1. Full repository audit
2. Feature Truth Matrix
3. Route/link audit
4. Existing API/backend audit
5. Existing payment audit
6. Existing dashboard audit
7. Existing tools audit

## PHASE B — CORE PRODUCT
8. Final business data model
9. Authentication
10. Business onboarding
11. First real audit
12. Action Center
13. Rankme score
14. Dashboard

## PHASE C — GOOGLE DATA
15. Google Search Console
16. Google Business Profile
17. Google Maps/Places

## PHASE D — RANKING ENGINE
18. Keywords
19. Local rank provider research
20. Rank tracking
21. Local grid
22. Competitors
23. Visibility history

## PHASE E — REPUTATION
24. Reviews
25. Review monitoring
26. AI reply suggestions
27. Reputation actions

## PHASE F — AI
28. Audit explanations
29. Recommendations
30. SEO suggestions
31. Competitor analysis
32. Reports
33. Action plans

## PHASE G — RETENTION
34. Scheduled monitoring
35. Alerts
36. History
37. Monthly reports
38. Progress tracking

## PHASE H — MONEY
39. Final unit economics
40. Pricing
41. Subscription billing
42. Entitlements
43. Usage limits

## PHASE I — AGENCY
44. Multiple clients
45. Team permissions
46. Bulk monitoring
47. White-label reports

## PHASE J — SCALE
48. Cost optimization
49. Security hardening
50. Reliability
51. API product
52. Advanced automation

---

# 33. IMMEDIATE NEXT ACTIONS

1. Finish actual repository audit.
2. Create Feature Truth Matrix.
3. Identify what is genuinely functional today.
4. Audit homepage/product positioning.
5. Audit audit/check engine.
6. Audit dashboard.
7. Audit payment/pro pages.
8. Audit existing tools.
9. Audit all external requests/API-like code.
10. Identify current mock/demo functionality.
11. Identify obsolete AdSense/content-site elements.
12. Identify LocalBoost vs Rankme branding conflicts.
13. Identify canonical/domain inconsistencies.
14. Identify pages that belong to the ranking product.
15. Define the smallest real paid MVP.
16. Research first production APIs.
17. Build only after the above truth audit.

---

# 34. EXPLICITLY OUT OF SCOPE

Rankme will NOT become:

- AdSense content site
- generic business-growth website
- generic lead-generation marketplace
- government-service portal
- e-commerce platform
- generic business directory
- unrelated calculator/tool website
- generic AI writing platform
- generic developer API platform
- social network
- unrelated marketing automation platform

Only ranking/visibility-related features may be added.

---

# 35. CHANGE CONTROL RULE

Every development session:

**Inspect → Decide → Change only required files → Test → Self-audit → Verify diff → Deploy**

Rules:

- no blind mass edits
- no deleting working functionality without reason
- no invented APIs
- no invented credentials
- no fake data
- no fake rankings
- no guaranteed results
- no frontend-only security
- no untested integrations
- no unrelated features

---

# 36. FINAL PRODUCT DEFINITION

**Rankme is a paid local SEO/ranking platform for shops and local businesses.**

A customer should ultimately be able to:

**Add business → connect Google → audit Google presence → discover ranking problems → receive exact actions → track Google visibility → monitor reviews → monitor rankings → measure Search Console performance → see progress → receive reports → pay for continuous monitoring.**

That is the product.

Everything else is secondary.

**If a future feature does not directly support this product definition, it does not enter the roadmap.**
