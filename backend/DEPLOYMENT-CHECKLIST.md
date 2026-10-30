# LocalBoost Backend Deployment Checklist

Target: Worker `localboost-api` at `https://api.localboost.in`, D1 database `localboost`, site `https://www.localboost.in`. Run commands from `backend/` unless noted. No step is done until the real check passes; nothing is simulated.

## 1. Cloudflare resources
- [ ] `npx wrangler login`
- [ ] `npx wrangler d1 create localboost` and paste the printed `database_id` into `wrangler.toml` (replace `REPLACE_WITH_D1_DATABASE_ID`).
- [ ] `npm run schema` (builds `schema.sql` from `migrations/*.sql`)
- [ ] `npx wrangler d1 execute localboost --remote --file=schema.sql`
- [ ] Verify: `npx wrangler d1 execute localboost --remote --command "SELECT name FROM sqlite_master WHERE type='table'"` lists users, sessions, businesses, business_profile_ext, analytics_events, waitlist, rate_limits, ...

## 2. Secrets (`npx wrangler secret put NAME`, never in Git or wrangler.toml)
Required for sign-in:
- [ ] `GOOGLE_CLIENT_ID`
- [ ] `GOOGLE_CLIENT_SECRET`
- [ ] `GOOGLE_TOKEN_ENCRYPTION_KEY` (>= 32 random chars, e.g. `openssl rand -base64 48`; losing it makes stored Google tokens unreadable)

Operations / analytics:
- [ ] `ADMIN_TOKEN` (long random; enables `/api/admin/*`; leave unset to keep them 404)
- [ ] `ANALYTICS_SALT` (random; salts the daily visitor hash)

Billing (Razorpay), only when going live with payments:
- [ ] `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`

Rank tracking provider (only if enabled):
- [ ] `RANK_PROVIDER_TOKEN` (plus `RANK_PROVIDER_URL`, `RANK_PROVIDER_ENABLED` in `[vars]`)

Site checks:
- [ ] `PAGESPEED_API_KEY` (Google PageSpeed Insights key; without it `/api/pagespeed` reports `provider_not_configured`)

## 3. Feature flags (`[vars]` in wrangler.toml; default off)
`GOOGLE_REVIEWS_SYNC_ENABLED`, `GOOGLE_PERFORMANCE_SYNC_ENABLED`, `SEARCH_CONSOLE_SYNC_ENABLED`, `PAYMENT_PROVIDER_ENABLED`, `PAYMENT_PROVIDER_NAME`, `RANK_PROVIDER_ENABLED`, `RANK_PROVIDER_URL`, `RANK_COST_PER_POINT_MINOR`. Enable one at a time, only after its provider is configured and verified. See comments in `wrangler.toml`.

## 4. Google Cloud
- [ ] OAuth consent screen configured (app name LocalBoost, privacy policy and terms URLs on www.localboost.in).
- [ ] Web application OAuth client; authorized redirect URI exactly `https://api.localboost.in/auth/google/callback`; authorized JS origin `https://www.localboost.in`.
- [ ] Business Profile APIs enabled and access approved by Google (quota > 0); Search Console API enabled if used.
- [ ] Scopes: `openid email profile https://www.googleapis.com/auth/business.manage`; `webmasters.readonly` is requested only when the user starts Search Console connect.

## 5. Razorpay (when enabling payments)
- [ ] Live API keys created; webhook `https://api.localboost.in/api/billing/webhook` with the `RAZORPAY_WEBHOOK_SECRET`; payment events selected.
- [ ] Test-mode checkout verified end to end before switching to live keys.

## 6. Deploy and DNS
- [ ] `npm test` passes.
- [ ] `npx wrangler deploy`
- [ ] Attach custom domain `api.localboost.in` to the Worker (Workers > localboost-api > Settings > Domains, or `routes` in wrangler.toml); the `localboost.in` zone must be on Cloudflare so DNS and TLS are created automatically.
- [ ] Confirm the cron trigger (`0 * * * *`) is listed in the dashboard.

## 7. Smoke tests (curl)
```
curl -i https://api.localboost.in/health                                  # 200
curl -i https://api.localboost.in/api/me                                  # 401 (no cookie)
curl -i https://api.localboost.in/api/billing/plans                       # 200, provider_enabled reflects config
curl -i -X POST https://api.localboost.in/api/events \
  -H 'content-type: application/json' -d '{"event":"page_view"}'          # 204, nothing stored (no consent header)
curl -i -X POST https://api.localboost.in/api/events -H 'origin: https://www.localboost.in' \
  -H 'x-lb-consent: granted' -H 'content-type: application/json' \
  -d '{"event":"page_view","props":{"path":"/"}}'                         # 204, one row stored
curl -i -X POST https://api.localboost.in/api/waitlist -H 'origin: https://evil.example' \
  -H 'content-type: application/json' -d '{}'                             # 403 bad_origin
curl -i https://api.localboost.in/api/admin/metrics                       # 404 if ADMIN_TOKEN unset, else 401
curl -s https://api.localboost.in/api/admin/metrics -H "authorization: Bearer $ADMIN_TOKEN"   # 200 JSON
curl -i https://api.localboost.in/auth/google/start                       # 302 to accounts.google.com
```
Then sign in with a real Google account in a browser and check: session cookie is `HttpOnly; Secure; SameSite=Lax`, `GET /api/me` returns the user, a business can be created, `GET /api/account/export` downloads JSON without any token, logout clears the cookie. Delete the test data afterwards via `POST /api/account/delete`.

## 8. Frontend switch
- [ ] Only after section 7 passes: set `window.LOCALBOOST_API.enabled = true` in `assets/localboost-api-config.js` with `baseUrl` `https://api.localboost.in`, and redeploy the site.
- [ ] CORS: confirm the site origin is in `ALLOWED_ORIGINS` and the analytics header `x-lb-consent` is allowed by the preflight response.

## 9. Final production-readiness checklist
- [ ] `npm test` green; schema applied; `database_id` is real; no placeholder left in `wrangler.toml`.
- [ ] All required secrets set; `wrangler secret list` shows them; none are committed (`git grep -n "GOCSPX\|rzp_live"` is empty).
- [ ] Google OAuth consent verified/published; Business Profile API approval granted.
- [ ] Health, auth, Google connect, account/location discovery, business update/archive, export and logout verified against the deployed Worker with a real account.
- [ ] Authenticated endpoints reject missing/expired sessions; another user's business ids return 404.
- [ ] CORS and Origin checks reject non-LocalBoost origins; cookies are HttpOnly/Secure/SameSite=Lax.
- [ ] Analytics store nothing without consent; no IPs in `analytics_events`.
- [ ] Admin routes return 404/401 as expected; `ADMIN_TOKEN` stored in a password manager.
- [ ] Payments (if enabled): test payment verified, webhook signature and idempotency verified, refund/cancel path checked.
- [ ] Rank provider (if enabled): terms permit the use; unknown results shown as `null`, never filled.
- [ ] Cron jobs ran at least once (check observability logs); sessions/oauth_states/rate_limits are purging.
- [ ] Privacy policy, terms, data export/deletion and retention table (README) match actual behaviour.
- [ ] Observability enabled; an alert or routine check exists for 5xx rate; D1 export/backup taken (`wrangler d1 export`).
- [ ] No demo or sample numbers shown to users; empty states are explicit.
