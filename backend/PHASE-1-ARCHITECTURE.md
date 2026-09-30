# LocalBoost — Phase 1 Architecture

## Objective

Build the foundation of a real paid local-SEO SaaS. LocalBoost helps shops and local businesses improve and monitor visibility on Google Search and Google Maps.

## Runtime

- Public website: https://localboost.in
- API: https://api.localboost.in
- Frontend: existing static HTML/CSS/JS
- Backend: Cloudflare Worker
- Database: Cloudflare D1
- Authentication: Google OAuth + server-side sessions
- External data: official Google APIs where access and permitted use are available

## Trust boundaries

1. Browser never receives OAuth client secrets or refresh tokens.
2. Protected Google API calls happen server-side.
3. Refresh tokens are encrypted at rest.
4. Sessions are opaque and stored as hashes.
5. Every business record is authorized against the signed-in user.
6. CORS is restricted to LocalBoost production origins.
7. Secrets exist only as Worker secrets, never in Git.

## Phase 1 data model

Identity: users, sessions, oauth_states.

Google connection: google_connections, google_locations.

Next schema revision: businesses, business_locations, audits, audit_issues, action_items, keywords, rank_snapshots, competitors, reviews, reports, subscriptions, payments, usage_events.

## Route contract

Public: GET /health, GET /auth/google/start, GET /auth/google/callback.

Authenticated: POST /auth/logout, GET /api/me, GET /api/google/accounts, GET /api/google/locations?account=accounts/....

Future protected routes remain under /api and require session authorization.

## Frontend states

1. Not authenticated.
2. Authenticated but no Google Business Profile connected.
3. Connected with verified live data.

Never display demo business data, fabricated metrics, simulated payment success, fake ranking, or fake reviews as customer data.

## Phase 1 gates

- Backend runtime implemented and tested.
- D1 schema deployable.
- Worker configuration contains no secrets.
- Google credentials stored as Worker secrets.
- Production OAuth redirect URI configured.
- API hostname routes to Worker.
- /health returns a real backend response.
- OAuth state is validated.
- Callback creates or updates a real user.
- Secure session is created.
- /api/me rejects unauthenticated requests.
- Google account/location discovery uses real API responses.
- Frontend remains disabled until backend is verified.

## Current implementation note

The Worker configuration and D1 foundation are committed. The secure OAuth runtime still requires implementation through an approved secure path; no production backend is claimed until it is actually deployed and verified.

## Build sequence

1. Complete backend runtime safely.
2. Expand D1 schema for core product entities.
3. Build authentication UI.
4. Connect dashboard to authenticated API state.
5. Complete Google Business Profile connection.
6. Build the first real website/GBP audit.
7. Add score and Action Center.
8. Add ranking, reviews, Search Console and reports.
9. Add billing after the product data flow is real.
10. Production QA and launch.

## Definition of done

Phase 1 is complete only after the architecture is implemented and verified end-to-end, not merely documented.
