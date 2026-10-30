# Reports API (`backend/src/reports.js`)

Authenticated unless stated. JSON errors `{error, code}`. Snapshots are immutable; every section is built only from stored rows.

Section shape: `{id, title, source, generated_at, available:boolean, freshness:{latest_data_at, age_days}|null, data}` or, when data is missing, `{..., available:false, reason}` with NO `data` key. Never render a missing section as 0.
Section ids: `performance, rank, reviews, search_console, website_audit, profile_audit, competitors, actions`. Kinds -> sections: `weekly|monthly` = performance, rank, reviews, search_console, website_audit, actions; the others contain the single matching section.
Snapshot: `{id, business_id, kind, period_start, period_end, generated_at, scheduled:boolean, data:{schema, kind, generated_at, period, business:{name,category,city}, sections:[...]}}`.

## POST /api/reports/generate
Body `{business_id, kind:"weekly|monthly|rank|website_audit|profile_audit|reviews|competitors|search_console|actions", period_start?, period_end?}` (YYYY-MM-DD or ms; defaults: end = now, start = 7 days (weekly) or 30 days; max 366 days, not in the future). Requires the `reports_enabled` plan feature. Rate limited (20/hour). -> `201 {snapshot}`.
Errors: `400 invalid_kind|invalid_period`, `403 upgrade_required`, `404`, `429 rate_limited`, `503 unavailable`.

## GET /api/reports/list?business_id=
`200 {snapshots:[{id,business_id,kind,period_start,period_end,generated_at,scheduled}]}` newest first (100).

## GET /api/reports/snapshot?id=
`200 {snapshot}`.

## GET /api/reports/export.csv?id=
`text/csv` attachment, columns `Section,Metric,Value,Available,Reason,Source,Data as of`. Cells starting with `= + - @ TAB CR` are prefixed with `'` (formula injection safe). Unavailable sections are one row with `Available=no` and the reason.

## POST /api/reports/share
Body `{snapshot_id, expires_in_days? (integer 1-90, default 30), brand?:{name (<=60), logo_url? (https), accent_color? (#rrggbb)}}`.
-> `201 {share_id, url:"https://www.localboost.in/report.html?token=<token>", expires_at, note}`. The token appears ONLY in this response; only its SHA-256 hash is stored. Max 10 active links per snapshot (`409 share_limit`).
`brand` (white-label) requires the Agency plan (`403 upgrade_required`, `required:"agency"`); invalid values `400 invalid_brand`. Brand is display-only and never changes data.

## POST /api/reports/share/revoke
Body `{share_id}` -> `200 {ok:true, revoked_at}` (idempotent).

## GET /api/reports/shares?snapshot_id=
`200 {shares:[{share_id, expires_at, revoked_at, created_at, view_count, last_viewed_at, white_label, status:"active"|"expired"|"revoked"}]}` (the token is never returned).

## GET /api/reports/shared?token=   (PUBLIC)
No cookie needed. Rate limited per IP (30/min; `429 rate_limited`, `503 unavailable` if the limiter is down). Unknown, malformed, expired and revoked tokens all return the identical `404 {error:"Report not found", code:"not_found"}`. Success `200 {report:{kind, period_start, period_end, generated_at, business:{name,category,city}, sections:[...]}, brand:{name,logo_url?,accent_color?}|null, expires_at}`; increments the link's `view_count`. Contains no internal ids, no email addresses, no reviewer names or review text. Headers: `cache-control: no-store`, `x-robots-tag: noindex, nofollow`.
The page `report.html` should render `brand` (if present) in the header and print stylesheet only.

## Scheduling
`POST /api/reports/schedule` `{business_id, kind:"weekly"|"monthly", active:boolean}` -> `200 {ok, business_id, kind, active}` (activating requires `reports_enabled`). `GET /api/reports/schedules?business_id=` -> `{schedules:[{kind,active}]}`.
Job `reports-scheduled` (hourly cron) creates, per opted-in business, one snapshot for the last complete UTC week (Mon-Mon) or calendar month, at most once per period (`scheduled:true` in the list).
