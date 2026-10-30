# Public pages: features, help, trust and status sections

Added in the second wave. Every page exists in English at `/<path>/` and Hindi at `/hi/<path>/` (except `report.html`, English only). Header and footer are the shared shell (`scripts/public-shell/apply_shell.py`); the page bodies were generated from content kept outside the repo, so edit the HTML directly from now on.

## Pages
| Section | URL | Purpose |
|---|---|---|
| Features | `/features/` | Overview of all features with honest status labels |
| | `/features/website-audit/`, `local-rank-tracking`, `competitor-analysis`, `review-management`, `ai-recommendations`, `google-business-profile-audit`, `reports-and-monitoring`, `agency` | One page per feature: what it does, data used, measured vs estimated, limits, plan availability, link to the free tool or guide, `/pricing/`, and the waitlist component (`data-source="feature-..."`) |
| Help Center | `/help/` | Client-side searchable list (inline JSON, no-JS fallback list) |
| | `/help/getting-started/`, `connect-google-business-profile`, `website-audit-guide`, `rank-tracking-guide`, `understanding-your-audit-score`, `billing-and-gst-faq`, `privacy-faq`, `troubleshooting-google-connection`, `team-and-permissions`, `data-export-and-deletion` | Articles written against the backend code and `docs/api/*.md`; unlaunched behaviour is flagged "available when the production API is online" |
| Changelog | `/changelog/` | Dated Added / Changed / Fixed taken from `git log`; no version numbers |
| Status | `/status/` | Calls `GET {baseUrl}/health` only when `LOCALBOOST_API.enabled`; otherwise says the API is not connected. No uptime figures |
| Security | `/security/` | Controls that exist in the code, what is not done (no pen test, no certifications), responsible disclosure |
| | `/.well-known/security.txt` | RFC 9116 file (Expires 2027-10-30: renew yearly) |
| Cookie policy | `/cookie-policy/` | Matches `assets/consent.js`, `theme.js`, `analytics.js`; no Consent Mode claim |
| Bug report | `/bug-report/` | Form builds a `mailto:` report (primary). If the API is enabled and the user gives email + consent it also posts to `POST /api/waitlist` with `source: "bug-report"` (only email + 120-char summary can be stored) |
| Shared report | `/report.html?token=...` | noindex viewer for `GET /api/reports/shared`; generic section renderer (`data` objects, tables, `available:false` reasons), brand name/logo/accent, print CSS |

## How they fit the site
- Features pages link to matching free tools (`/tools/...`), help guides and `/pricing/`; help articles link back to features; the footer/search can link to `/features/`, `/help/`, `/status/`, `/security/`, `/cookie-policy/`, `/changelog/`.
- Hindi pages are self-canonical with reciprocal hreflang; `report.html` has no hreflang.
- Plan limits are not repeated in prose (pricing page is the source of truth) except seat/competitor caps taken from backend constants.

## Maintenance notes
- Keep the cookie policy in step with any new `localStorage` key or third party.
- Update the changelog when work is committed or goes live.
- The status page and shared-report viewer need `assets/localboost-api-config.js` `enabled: true` and CORS for the www origin on `/health` and `/api/reports/shared`.
