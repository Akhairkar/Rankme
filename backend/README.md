# LocalBoost API

Production backend foundation for the LocalBoost paid local-SEO platform.

## Scope

This service is intentionally limited to LocalBoost's core product:

- customer authentication;
- Google OAuth authorization;
- Google Business Profile connection;
- verified Business Profile account/location discovery;
- secure token persistence;
- later synchronization of GBP, Performance API, reviews, Search Console and rank-tracking data.

The public site remains the customer-facing UI. This Worker is the server-side trust boundary.

## Required Cloudflare resources

1. Cloudflare Worker
2. Cloudflare D1 database
3. Custom API hostname: `api.localboost.in`
4. Google Cloud OAuth web application credentials
5. Google Business Profile APIs enabled for the Google Cloud project

## Secrets

Set these as Worker secrets, never in Git:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`

The encryption key should be a high-entropy random secret.

## Database

Apply `schema.sql` to the D1 database before enabling customer OAuth.

## OAuth redirect URI

Google Cloud must contain exactly:

`https://api.localboost.in/auth/google/callback`

The redirect URI must match the Worker configuration exactly.

## Initial API routes

- `GET /health`
- `GET /auth/google/start`
- `GET /auth/google/callback`
- `POST /auth/logout`
- `GET /api/me`
- `GET /api/google/accounts`
- `GET /api/google/locations?account=accounts/...`

The Worker never shows a connected state until Google authorization succeeds and a real API request succeeds.

## Important

Google Business Profile API access/quota/approval is a deployment prerequisite. Code in this repository does not claim that LocalBoost already has production API approval.

Do not log access tokens, refresh tokens, client secrets, authorization codes or full customer payloads.
