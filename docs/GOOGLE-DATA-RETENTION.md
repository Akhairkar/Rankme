# Google data retention design

Status: implemented in `backend/src/reviews_analysis.js` (job `google-data-retention`) with tables from `backend/migrations/100_reviews_competitors.sql`.

## Must be re-verified before launch
Google's API terms and storage/caching rules change. Before launch, re-check the current **Google API Services User Data Policy** (including Limited Use requirements), the **Business Profile API** terms, the **Search Console API** terms and the **Google Maps Platform (Places API)** terms and service-specific policies, then adjust the TTLs below. This document does not assert any specific Google time limit; every TTL is an environment variable so compliance can be changed without a deploy of code. Also confirm what the privacy policy must say about stored Google data.

## Classification
Three classes: **raw** (Google content, cached with TTL), **derived** (counts/averages/scores containing no Google content, kept), **user** (written by the user).

| Dataset | Table / columns | Class | Retention |
|---|---|---|---|
| Profile / location fields | `google_locations.raw_json` (+ `account_name`, `location_name` ids); `business_locations` mirror fields | raw | `GOOGLE_PROFILE_CACHE_TTL_DAYS` (30). For disconnected users `raw_json` is replaced by `{}` (older-than-TTL rows logged as `ttl_purge`, the rest as `disconnect_purge`). Refreshed by sync while connected. |
| Review text, reviewer name, raw payload | `reviews.review_text`, `reviewer_display_name`, `raw_reference_json` | raw | Nulled when `synced_at` is older than `GOOGLE_REVIEW_CONTENT_TTL_DAYS` (30). Every sync refreshes `synced_at`, so content of a connected account is a refreshed cache; content we can no longer refresh expires. |
| Review rating, date, reply status | `reviews.rating`, `review_time`, `reply_status` | derived inputs | Kept in a text-less row after a TTL purge (see below). |
| Review monthly aggregates | `review_monthly_aggregates` | derived | Kept (no Google content: counts, averages, 1-5 buckets, answered count). Deleted with the business. |
| Performance metrics | `performance_metrics` numeric columns | derived | Kept (numbers). `raw_reference_json` cleared on disconnect. |
| Search Console rows | `search_console_metrics` (queries, pages, clicks...) | raw | Rows with `date` older than `GOOGLE_SEARCH_CONSOLE_TTL_DAYS` (540) deleted; all rows deleted on disconnect. |
| Competitor Places data | `competitor_places_data`, `competitor_place_candidates` | raw | Candidates deleted after 24 h; Places data deleted after `GOOGLE_PROFILE_CACHE_TTL_DAYS`. `place_id` on `competitor_profiles` is an identifier and is kept; re-verify to refresh. |
| Replies the user wrote | `review_replies.reply_text` | user | Kept until the business/account is deleted (not Google-provided content). |
| Competitors the user typed | `competitor_profiles` user fields | user | Kept until removed. |
| Retention log | `data_retention_log` | derived | Counts only (dataset, action, rows, TTL, timestamp), pruned after 400 days. |

## Review rows: text-less row, not deletion (decision)
On a **TTL purge** the row stays but `review_text`, `reviewer_display_name` and `raw_reference_json` become NULL. Rating, `review_time`, `reply_status` and the opaque `google_review_name` remain so that (1) re-syncs deduplicate instead of duplicating, (2) analytics that use ratings keep working, (3) `review_replies` foreign keys stay valid. The alternative (deleting rows once rolled up) was rejected for the TTL case because a re-sync would re-insert the review and the monthly aggregate could not be reconciled with the rows.
On **disconnect**, rows are deleted outright (after the aggregates are written) except rows referenced by `review_replies`, which become text-less so reply history survives. The aggregates keep the historical trend.

## Aggregates before purge
The job first recomputes `review_monthly_aggregates` for every (business, month) that contains a row about to be purged (disconnect: all months), from all stored rows of that month, and only then purges. `GET /api/reviews/analysis` serves a month from the aggregate (`source:"aggregate"`) when it ended before the TTL cutoff, no rows remain, or rows were deleted (aggregate count larger than stored rows); recent months come from rows. Known limitation: if Google later adds a review dated in an already-aggregated old month, the aggregate is refreshed only when that month is next purged.

## Triggers
| Trigger | What happens | When |
|---|---|---|
| TTL expiry | review text/name/raw cleared (rows kept); Search Console rows past TTL deleted; Places data past TTL and candidates older than 24 h deleted | every cron run of `google-data-retention` |
| User disconnects Google (`google_connections` row gone; `/api/google/disconnect`) | aggregates written, review rows deleted (replied rows text-less), `google_locations.raw_json` cleared, Search Console rows deleted, `performance_metrics.raw_reference_json` cleared | next job run (the job runs with the hourly cron, so within one run after the disconnect) |
| Account deletion | `deleteUserAccount` deletes businesses (cascade removes reviews, aggregates, competitors, Places data) and user rows | immediately |
| Business removed | cascade | immediately |
| Competitor removed | profile, candidates and Places data deleted | immediately |

Each purge writes one `data_retention_log` row per dataset and action (`ttl_purge` or `disconnect_purge`) with `rows_affected` only, never content.

## Configuration
| Env var | Default | Controls |
|---|---|---|
| `GOOGLE_REVIEW_CONTENT_TTL_DAYS` | 30 | review text, reviewer name, raw review payload |
| `GOOGLE_PROFILE_CACHE_TTL_DAYS` | 30 | `google_locations.raw_json` (disconnected users), competitor Places data |
| `GOOGLE_SEARCH_CONSOLE_TTL_DAYS` | 540 | Search Console row age |
Invalid, non-numeric or < 1 values fall back to the default. Lower values are always safe for compliance but reduce history shown in the app.

## Open items for the launch review
- Decide with counsel whether rating/date per review (kept in text-less rows) is acceptable under the then-current terms, or whether ratings should also be removed and only aggregates kept.
- Confirm whether Places data and `lat/lng` copied to `competitor_profiles` on confirmation may be retained, and the required attribution when displaying it.
- Confirm Search Console retention and whether aggregated query data may be kept longer.
- Disclose stored Google data and these periods in the privacy policy.
