# LocalBoost API contract (frontend <-> Worker)

Base URL: `window.LOCALBOOST_API.baseUrl` (enabled only when `enabled === true`). All requests use `credentials: "include"`, JSON bodies, and send/expect `content-type: application/json` unless stated. Auth = HttpOnly session cookie `lb_session`. Errors: `{ "error": "message", "code": "snake_case" }` with a correct HTTP status. States are explicit strings, never silent empties: `awaiting_*`, `provider_error`, `upgrade_required`, `verified_data`.

Module routes are registered in `backend/src/routes.js` (see `router.js` for `ctx`). Public routes are IP rate-limited by their module via `ctx.rateLimit`.

## Existing (unchanged)
`GET /health`, `GET /api/me`, `GET|POST /api/businesses`, `GET|POST /api/keywords`, `GET|POST /api/ranks`, `POST /api/ranks/run`, `GET /api/score`, `GET /api/profile-audit`, `GET /api/profile-actions`, `GET /api/action-center`, `GET /api/entitlements`, `GET /api/billing/status`, `GET /api/reports/overview`, `GET /api/performance`, `GET /api/performance/history`, `GET|POST /api/competitors`, `GET /api/reviews`, `POST /api/reviews/sync`, `GET /api/google/accounts|locations`, `POST /api/google/select-location`, `POST /api/google/sync`, `GET /api/monitoring`, `POST /api/monitoring/events`, `GET /api/recommendations`, `POST /api/account/delete`, `POST /api/waitlist`, `GET /auth/google/start`, `GET /auth/google/callback`, `POST /auth/logout`.

## New: google (module `google.js`)
- `POST /api/google/disconnect` -> `{ok:true}` revokes the refresh token at Google, deletes `google_connections`, keeps businesses.
- `GET /api/google/status` -> `{connected:boolean, email, scopes:[...], last_sync_at, locations:number, state}`
- `POST /api/reviews/google-fetch` `{business_id}` -> `{state:"verified_data"|"awaiting_google_location"|"provider_error", fetched:number}` (stores into `reviews`)
- `POST /api/reviews/reply` `{business_id, review_id, reply, confirm:true}` posts to Google only when `confirm===true`, else `400 confirmation_required`.
- `POST /api/performance/sync?business_id=` -> `{state, days:number}`
- `GET /api/search-console/properties?business_id=` -> `{properties:[{site_url,permission_level}], state}`
- `POST /api/search-console/select` `{business_id, site_url}` -> `{ok:true}`
- `POST /api/search-console/sync?business_id=` -> `{state, rows:number}`
- OAuth scopes requested (incremental): `openid email profile business.manage`; Search Console adds `https://www.googleapis.com/auth/webmasters.readonly` only when the user starts the Search Console connect (`GET /auth/google/start?scope=search_console`).

## New: billing (module `billing.js`) — provider Razorpay
- `GET /api/billing/plans` (public) -> `{provider_enabled:boolean, plans:[{code:"free"|"pro"|"agency", name, price_minor, currency:"INR", interval:"month"|"year", limits:{businesses, keywords, ...}}]}`
- `POST /api/billing/checkout` `{plan_code, interval}` -> `{order:{id, amount, currency, key_id}}` or `503 provider_not_configured`
- `POST /api/billing/verify` `{razorpay_order_id, razorpay_payment_id, razorpay_signature}` -> `{ok:true, subscription}` (server HMAC check)
- `POST /api/billing/webhook` (public, `X-Razorpay-Signature` verified, idempotent by event id)
- `POST /api/billing/cancel` -> `{ok:true, ends_at}`
- `GET /api/billing/invoices` -> `{invoices:[{id, number, amount_minor, currency, status, issued_at, pdf_url|null}]}`

## New: audit (module `audit.js`)
- `POST /api/audits/run` `{business_id, website_url?}` -> `{audit_id, state:"completed"|"partial", score:number|null, findings_count}`; never invents a score from missing data (`score:null`).
- `GET /api/audits?business_id=` -> `{audits:[{id, created_at, score, state, summary:{high,medium,low,fixed}}]}`
- `GET /api/audits/detail?id=` -> `{audit, findings:[Finding], score_breakdown:[{section, weight, points, max, available:boolean}]}`
- `POST /api/audits/finding-status` `{finding_id, status:"open"|"fixed"|"ignored"}` -> `{ok:true}`
- `GET /api/audits/compare?a=&b=` -> `{new:[Finding], fixed:[Finding], unchanged:number, score_delta:number|null}`
- `GET /api/audits/export.csv?id=` -> `text/csv`
- Finding: `{id, category, severity:"high"|"medium"|"low", title, evidence, source, verification:"verified"|"user_provided"|"unavailable", why_it_matters, recommended_action, instructions, status, checked_at}`

## New: rank (module `rank.js`)
- `POST /api/rank/scans` `{business_id, keyword_id, grid_size:3|5|7, radius_m}` -> `{scan_id, state:"completed"|"awaiting_rank_provider"|"provider_error"|"partial", points:number}`
- `GET /api/rank/scans?business_id=&keyword_id=` -> `{scans:[{id, created_at, grid_size, radius_m, avg_position|null, visibility|null, state}]}`
- `GET /api/rank/scans/detail?id=` -> `{scan, points:[{row, col, lat, lng, position|null, observed_at, provider}], avg_position|null, visibility|null}` (`position:null` = not found in results, never filled)
- `GET /api/rank/history?business_id=&keyword_id=` -> `{history:[{date, avg_position|null, visibility|null}]}`
- `GET /api/rank/export.csv?scan_id=` -> `text/csv`

## New: crawler (module `crawler.js`)
- `POST /api/site-check` (public, 10/hour/IP; `max_pages` > 1 requires a session and a paid plan) `{url, max_pages?}` -> `{state:"completed"|"blocked_url"|"unreachable"|"partial", url, final_url, pages:[{url, status, title, description, h1_count, canonical, robots, indexable, word_count, images_missing_alt, links_internal, links_broken, schema_types:[...], viewport}], issues:[{code, severity, category, message, evidence, fix, page_url}], summary:{high,medium,low,pages_checked}, checked_at}`
- `GET /api/pagespeed?url=&strategy=mobile|desktop` (public, rate-limited) -> `{state:"verified_data"|"provider_not_configured"|"provider_error", lcp_ms, inp_ms, cls, performance_score, source:"pagespeed_insights", measured_at, field_data:boolean}`

## New: platform (module `platform.js`)
- `POST /api/businesses/update` `{id, ...fields}`; `POST /api/businesses/archive` `{id, archived:boolean}`
- `GET /api/account/export` -> JSON download with all rows owned by the user
- `POST /api/events` (public, consent required) `{event, props?}` -> `204`; allowed events are a fixed whitelist
- `GET /api/admin/metrics`, `GET /api/admin/waitlist.csv` (Bearer `ADMIN_TOKEN` secret; 404 when unset)
