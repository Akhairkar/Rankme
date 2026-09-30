# LocalBoost Backend Deployment Checklist

Status: **Phase 1 build in progress.**

## 1. Cloudflare infrastructure
- [ ] Create a D1 database named `localboost`.
- [ ] Apply `backend/schema.sql` and verify foreign keys/indexes.
- [ ] Create the Worker from `backend/wrangler.toml`.
- [ ] Attach D1 binding as `DB`.
- [ ] Configure custom hostname `api.localboost.in`.
- [ ] Verify `GET /health` after runtime deployment.

## 2. Worker secrets
Set only as encrypted Worker secrets:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`

Never commit these values or expose them to browser JavaScript.

## 3. Google Cloud
- [ ] Enable the required Business Profile APIs.
- [ ] Configure a Web application OAuth client.
- [ ] Configure authorized redirect URI:
  `https://api.localboost.in/auth/google/callback`
- [ ] Use the required Business Profile scope:
  `https://www.googleapis.com/auth/business.manage`
- [ ] Verify OAuth consent and redirect configuration in a real integration test.

## 4. Production security gates
Do not display a connected Google state until all succeed:
- [ ] OAuth state generated and validated.
- [ ] Authorization code exchanged successfully.
- [ ] Google identity resolved.
- [ ] Refresh token securely encrypted and persisted.
- [ ] Session created securely.
- [ ] Account list request succeeds.
- [ ] Location list request succeeds.
- [ ] Authenticated endpoints reject missing/expired sessions.
- [ ] User/business ownership checks pass.
- [ ] CORS accepts only LocalBoost origins.
- [ ] No secret/token logging.

## 5. Phase 1 frontend gates
- [ ] Login entry point exists.
- [ ] Authenticated dashboard state exists.
- [ ] No-business-connected state exists.
- [ ] Connected state is data-driven.
- [ ] Existing demo/sample metrics remain removed.
- [ ] API client remains disabled until production API verification.

## 6. Next implementation sequence
1. Finish secure Worker runtime implementation.
2. Run local OAuth integration test.
3. Test account discovery.
4. Test location discovery.
5. Connect dashboard to verified endpoints.
6. Add first real GBP audit.
7. Add score and Action Center.
8. Add Performance API synchronization.
9. Add review synchronization.
10. Add Search Console authorization.
11. Add compliant local rank-tracking provider.
12. Add scheduled sync jobs and monitoring.
13. Add verified billing.

## Definition of production readiness

LocalBoost backend is not considered live until the health endpoint, authentication, Google connection, account discovery, location discovery, authorization checks and frontend integration have all been tested against the deployed runtime.

No simulated success is acceptable.
