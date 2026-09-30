# Rankme — Repository Truth Audit

Date: 2026-09-30
Repository: `Akhairkar/Rankme`
Default branch: `main`

## Audit scope

This pass compares the current implementation against `51-MASTER-PAID-SAAS-API-ROADMAP.md`. The repository documentation is not treated as proof of working functionality.

## Confirmed findings

| Area | Current truth | Status | Required action |
|---|---|---|---|
| Product branding | Many current pages still display **LocalBoost** / **LocalBoost Pro** instead of Rankme | BLOCKER | Replace product branding consistently |
| Canonical/domain | Key pages still canonicalize to `https://www.localboost.in/` | BLOCKER | Confirm Rankme production domain, then update canonical/OG/hreflang/schema/sitemap references |
| FAQ contamination | Multiple pages contain generated FAQ text referring to RankMe while the visible product is LocalBoost; some answers contain unsupported ranking/growth claims | HIGH | Remove generic generated FAQ blocks and replace with page-specific factual FAQs |
| AdSense references | Checkout, dashboard, tools, pro and guide pages contain explicit Google AdSense references | HIGH | Remove AdSense positioning; Rankme is a paid SaaS product |
| Demo/mock payment | Checkout contains `Payment Simulated Successfully` and redirects to the dashboard demo | BLOCKER | Replace simulated checkout with real payment verification before selling |
| Demo dashboard data | Dashboard visibly contains a sample business, location, review count, rating and score | HIGH | Keep only as clearly labelled demo UI or replace with real authenticated data |
| Google API claims | UI/docs refer to Google Profile API access, but no production OAuth/API backend was verified in this audit pass | BLOCKER for live integration | Build and verify backend OAuth/API integration before presenting it as connected functionality |
| Authentication | No production customer authentication flow was verified in the inspected pages | BLOCKER for SaaS | Implement secure account/session architecture before customer data is stored |
| Search Console | Roadmap supports Search Console, but no verified production OAuth/data flow was found in this pass | NOT BUILT | Implement after auth/backend foundation |
| Rank tracking | Roadmap specifies real rank tracking, but no verified provider-backed production tracking flow was found in this pass | NOT BUILT | Select provider and implement cost-controlled backend |
| Reviews | Static review-management UI/content exists, but live customer-specific review sync was not verified | NOT BUILT | Connect to supported Google Business Profile API flow |
| Monitoring | Dashboard/report concepts exist, but recurring production jobs/queues were not verified | NOT BUILT | Add scheduler, queue, retry and idempotency layer |
| Billing | Pricing UI exists, but checkout is simulated | NOT BUILT | Implement real billing, webhook verification and subscription state |
| AI | UI/content references AI recommendations, but no verified production AI backend/data pipeline was found in this pass | NOT BUILT | Add evidence-based AI service after data layer exists |

## Important architectural conclusion

The repository currently contains a substantial **static product shell/demo**, but it is not yet a production SaaS implementation.

The correct build order is therefore:

1. Product/domain/branding cleanup
2. Backend + database + authentication foundation
3. Real Google OAuth connection
4. Real Business Profile data sync
5. Real website audit pipeline
6. Search Console integration
7. Real rank-tracking provider
8. Reviews/monitoring
9. Action Center + score
10. Reports
11. Real billing
12. AI layer using verified customer data
13. Production QA/security/cost audit

## Google API constraint

Google Business Profile access uses OAuth and the `business.manage` scope for protected business data. Google also documents eligibility/approval requirements for Business Profile API access. Rankme must not expose a fake "connected" state or promise API functionality until the OAuth/API backend is actually configured and tested.

Google Search Console provides programmatic access to Search Analytics, Sitemaps, Sites and URL Inspection APIs. This should be implemented server-side after customer authentication and consent are established.

## Immediate next change set

Do **not** rewrite the whole repository yet.

First change only the confirmed product-contamination layer:

- Rankme branding
- remove AdSense positioning
- remove unsupported generated FAQ claims
- remove simulated-payment success behavior
- clearly label demo data
- preserve existing layouts and working static content

Then run another repository-wide truth audit before adding new SaaS functionality.

## Rule

**Inspect → Change only confirmed issues → Test → Self-audit → Verify diff → Deploy.**
