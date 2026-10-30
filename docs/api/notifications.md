# Notifications API (`backend/src/notifications.js`)

All endpoints: `auth: session`, JSON, errors `{error, code}`. Everything is scoped to the signed-in user; another user's ids behave as if absent.

## GET /api/notifications
Query: `unread=1|true` (optional), `limit` (1-100, default 30), `before` (a `created_at` ms value from `next_before`).
Response `200`: `{notifications:[{id, business_id|null, kind, severity:"info"|"warning"|"critical", title, body|null, link|null, read:boolean, read_at|null, created_at}], next_before:number|null}`
Newest first. `link` is an app-relative path (or https URL) hint. Errors: `400 invalid_limit|invalid_before`.

## GET /api/notifications/unread-count
`200 {unread:number}`

## POST /api/notifications/read
Body `{ids:[string] (1-100)}` or `{all:true}`. Response `200 {updated:number}` (only the caller's own unread rows count). Errors: `400 invalid_json|invalid_ids`.

## GET /api/notifications/preferences
`200 {preferences:[{kind, in_app, email, digest, locked, customised}], email_delivery:"configured"|"awaiting_email_provider", email_address_on_file:boolean}`
One entry for each kind: `google_connection_expired, review_new, review_needs_response, website_issue_detected, rank_changed, competitor_changed, search_console_decline, job_failed, subscription_renewal_soon, credits_low, security_alert, team_invite`.
Defaults: in_app on, digest on, email off except `google_connection_expired, subscription_renewal_soon, security_alert, team_invite`. `security_alert` is `locked` (always delivered in-app and by email).
Show a notice in the UI when `email_delivery` is `awaiting_email_provider`: email is queued but not sent until the provider is configured.

## POST /api/notifications/preferences
Body `{preferences:[{kind, in_app?:bool, email?:bool, digest?:bool}]}` (1-40 items; `kind:"*"` applies to every unlocked kind, e.g. `{kind:"*", digest:false}` turns the weekly digest off). Returns the same body as GET.
Errors: `400 unknown_kind|invalid_preferences|locked_kind`.

## Behaviour notes
- A notification with the same user + `dedupe_key` inside 24h is suppressed. If a kind has in_app and email both off, nothing is stored.
- Email provider: `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` + `EMAIL_FROM` (Worker secrets/vars). Without them rows stay `pending` in `email_outbox` and nothing is claimed as delivered.
- Jobs (hourly cron): `notification-fanout` (real `monitoring_events`, Google reconnect flag, subscription ending within 7 days, monthly audit/rank-scan allowance at 80% and 100%), `notification-digest` (Mondays from 03:30 UTC, only if there is real content), `notification-email` (batches of 20, 3 attempts, 5 min then 10 min backoff).
- Other server code can call `createNotification(env, {userId, businessId, kind, severity, title, body, link, dedupeKey})` (exported).
