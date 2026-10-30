# LocalBoost API

Cloudflare Worker + D1 backend for LocalBoost (https://www.localboost.in). The static site is the UI; this Worker is the server-side trust boundary (auth, Google tokens, billing, plan limits, data).

## Layout

- `src/index.js` - entry point: CORS, Origin check, session lookup, legacy routes, cron `scheduled` handler.
- `src/router.js`, `src/routes.js` - module router. A feature module exports `routes = [{method, path, auth: "public"|"session", handler(request, ctx)}]` and optionally `jobs = [{name, run(env)}]`. `ctx` = `{env, url, userId, ip, json, now, getUserBusiness, requireFeature, rateLimit}`.
- Modules: `oauth.js` (Google sign-in, token encryption, sessions), `google.js`, `billing.js` (Razorpay), `audit.js`, `rank.js`, `crawler.js`, `waitlist.js`, `platform.js` (business profile, account export, analytics, admin, retention).
- `migrations/*.sql` - source of truth for the schema. `schema.sql` is generated.
- `test/*.test.mjs` - `node:test` suites. API shapes: `../docs/API-CONTRACT.md`.

## Local checks

```
cd backend
npm test                       # node --test test/*.test.mjs
node --check src/platform.js
```

The platform tests run the real migrations on `node:sqlite` (Node 22+).

## Database and migrations

```
npm run schema                 # builds schema.sql from migrations/*.sql in filename order
npx wrangler d1 execute localboost --remote --file=schema.sql   # first-time setup
```

All migrations use `CREATE ... IF NOT EXISTS`, so applying `schema.sql` repeatedly is safe. SQLite cannot `ADD COLUMN IF NOT EXISTS`; new optional columns therefore go in side tables (e.g. `business_profile_ext`).

Applying a single new migration to an existing database (do not re-run the whole schema if you only added one file):

```
npx wrangler d1 execute localboost --remote --file=migrations/0NN_name.sql
npm run schema                 # keep schema.sql in sync, then commit it
```

Add `--local` instead of `--remote` to try it against the local D1 emulator first. Take an export first for destructive changes: `npx wrangler d1 export localboost --remote --output=backup.sql`.

## Configuration

Non-secret variables are documented in `wrangler.toml`. Secrets are set with `wrangler secret put` and listed in `DEPLOYMENT-CHECKLIST.md`. Features whose provider is not configured respond with an explicit state (`provider_not_configured`, `awaiting_*`), never with simulated data.

## Platform module (`src/platform.js`)

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/businesses/update` | session | Validated partial update of a business profile. 400 `validation_failed` with per-field `fields`; 409 `duplicate_business`. |
| `POST /api/businesses/archive` | session | `{id, archived:boolean}`; archived businesses are kept, not deleted. |
| `GET /api/businesses/profile?id=` | session | Merged profile (core columns + `business_profile_ext`). |
| `GET /api/account/export` | session | Full JSON download of the user's rows, 3/hour/user. Token ciphertext and secret-like columns are never included. |
| `POST /api/events` | public | First-party analytics, consent header required. |
| `GET /api/admin/metrics`, `GET /api/admin/waitlist.csv` | Bearer `ADMIN_TOKEN` | Operator metrics and waitlist CSV. 404 if `ADMIN_TOKEN` is unset. |

`findDuplicateBusiness(env, userId, name, city, excludeId)` is exported; the legacy `POST /api/businesses` create route in `index.js` should call it too.

### Analytics (privacy-first)

- Only sent when the browser sends `x-lb-consent: granted` (the cookie-choice banner); otherwise the Worker answers 204 and stores nothing.
- Fixed event whitelist and prop whitelist (`tool`, `path` without query/hash, `lang`, `plan`); anything else is dropped. No user id, IP, user agent, or free text is stored.
- Uniques use `sha256(ip + user-agent + UTC date + secret)`; the hash changes every day so visitors cannot be followed across days. Secret = `ANALYTICS_SALT` (recommended) or falls back to `GOOGLE_TOKEN_ENCRYPTION_KEY`; with neither, events are counted but without a visitor hash.
- Rate limit 120 events/hour/IP.

## Data retention

| Data | Kept | Job |
|---|---|---|
| Sessions | until `expires_at` | `platform-retention` deletes expired rows hourly |
| `oauth_states` | 1 hour | `platform-retention` |
| `rate_limits` | 1 day | `platform-retention` |
| Raw `analytics_events` | 90 days | `platform-analytics-rollup` aggregates into `analytics_daily` (counts only), then deletes raw rows |
| `analytics_daily` | indefinitely (aggregate counts, no identifiers) | - |
| Customer data (businesses, audits, reviews, billing...) | until the user deletes the account (`POST /api/account/delete`) | none - jobs never delete customer data |
| Waitlist | until removed on request | none |

Archiving a business keeps its data. Billing/payment records may need to be retained longer for tax purposes; account deletion currently removes them, so review with your accountant before launch.

## SECURITY

- **Session cookie**: `lb_session`, random value, only its SHA-256 is stored in `sessions`; `HttpOnly; Secure; SameSite=Lax; Path=/`; expiry enforced server-side and expired rows are purged.
- **CSRF / Origin**: state-changing requests are cookie-authenticated, so `index.js` rejects any non-GET/HEAD request whose `Origin` header is present and not in `ALLOWED_ORIGINS` (403 `bad_origin`); `SameSite=Lax` blocks cross-site POST cookies as a second layer. Mutations are JSON `POST`s, never `GET`. The Razorpay webhook is exempt from the Origin check and is authenticated by HMAC signature instead. Note: a missing `Origin` header is allowed (non-browser clients such as curl cannot ride on a victim's cookie).
- **CORS**: `access-control-allow-origin` echoes only origins in `ALLOWED_ORIGINS`, with credentials. Custom headers must be listed in `access-control-allow-headers` (analytics needs `x-lb-consent`).
- **Rate limits** (D1-backed `ctx.rateLimit`, fail-open on infrastructure error): events 120/h/IP, export 3/h/user, business update 120/h/user, admin 30/min/IP, plus module-specific limits (site check 10/h/IP, waitlist 8/h/IP).
- **Secrets**: only as Worker secrets; never in `wrangler.toml`, Git, logs or API responses. Admin token is compared in constant time (SHA-256 digests XOR-compared) and the admin routes return 404 when `ADMIN_TOKEN` is unset.
- **Token encryption**: Google refresh tokens are AES-GCM encrypted with `GOOGLE_TOKEN_ENCRYPTION_KEY` before storage; ciphertext is excluded from the account export and all API responses; revoking at Google happens on `POST /api/google/disconnect`.
- **Data isolation**: every session route resolves ownership with `user_id` in the SQL (`getUserBusiness`, `WHERE user_id=?`); other users' resources return 404, not 403. `test/platform.test.mjs` asserts that every `auth: "session"` platform route returns nothing of another user's and leaves their rows unchanged.
- **Injection**: all SQL uses bound parameters (table names in the export are taken from `sqlite_master` and identifier-checked). Waitlist CSV cells are quoted and prefixed with `'` when they start with `= + - @ TAB CR`. Stored text is returned as JSON and must be HTML-escaped by the frontend.
- **Privacy**: analytics are consent-gated and personal-data-free; account export and deletion are self-service.
