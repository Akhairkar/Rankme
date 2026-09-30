# LocalBoost Backend Deployment Checklist

Status: **Foundation committed; deployment not yet claimed as live.**

## 1. Cloudflare
- Create a D1 database named `localboost`.
- Apply `backend/schema.sql`.
- Create the Worker from `backend/wrangler.toml`.
- Attach the D1 binding as `DB`.
- Configure the custom hostname `api.localboost.in`.

## 2. Secrets
Set only as encrypted Worker secrets:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`

Never commit these values.

## 3. Google Cloud
Enable the required Business Profile APIs and configure a Web application OAuth client.

Authorized redirect URI:
`https://api.localboost.in/auth/google/callback`

Requested scope:
`https://www.googleapis.com/auth/business.manage`

The Google web-server OAuth flow uses an authorization code and can request offline access for refresh tokens. Google also recommends protecting the OAuth state and keeping client secrets outside source control.

## 4. Production gates
Do not display a connected Google state until all of these succeed:
- OAuth consent completed.
- Authorization code exchanged successfully.
- Google identity resolved.
- Refresh token securely persisted.
- Business Profile account list request succeeds.
- Business Profile location list request succeeds.

## 5. Next implementation sequence
1. Finish Worker runtime implementation.
2. Run local OAuth integration test.
3. Test account discovery.
4. Test location discovery.
5. Connect dashboard to these verified endpoints.
6. Add Business Profile Performance API synchronization.
7. Add review synchronization.
8. Add Search Console authorization.
9. Add local rank-tracking provider.
10. Add scheduled sync jobs and monitoring.

Google documents the Account Management API for listing authenticated Business Profile accounts and the Business Information API for listing locations. The Performance API can later supply profile performance metrics such as impressions, calls, website clicks, directions and search-keyword impressions.
