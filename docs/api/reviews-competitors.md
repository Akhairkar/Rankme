# Review analytics and competitors API

Modules: `backend/src/reviews_analysis.js`, `backend/src/competitors.js`. Migration: `backend/migrations/100_reviews_competitors.sql`.
All endpoints require a session. Errors are `{error, code}`. Review endpoints need the `review_monitoring_enabled` entitlement, competitor endpoints `competitor_tracking_enabled` (otherwise `403 plan_upgrade_required`). A `business_id` that is not the caller's returns `404 not_found`.

## Review analytics

### `GET /api/reviews/analysis?business_id=`
Rule-based and transparent: no model, no external call. Computed from stored rows plus monthly aggregates.

```
{ business_id, state: "verified_data" | "no_reviews", empty: boolean,
  method: "rating+lexicon", sentiment_rules: "<text>", ttl_days,
  coverage: { reviews_analysed, total_stored, topics_analysed, text_purged_or_missing, undated, truncated, aggregate_months },
  data_freshness: { latest_review_fetch_at, source: "google_business_profile_api" },
  rating_distribution: { counts: {1..5}, rated_total, average_rating } | null,
  monthly_trend: [{ month: "YYYY-MM", count, average_rating|null, source: "rows" | "aggregate" }],
  unanswered: { count, share, note },
  reply_latency: { value: { sample_size, median_hours, average_hours }, basis } | { value: null, reason },
  sentiment: { positive, neutral, negative, classified },
  topics: [{ topic, count, sentiment: {positive, neutral, negative}, snippets: [<=3 strings, <=140 chars] }] }
```
- **Empty state**: with no stored reviews and no aggregates, `state:"no_reviews"`, `empty:true`, a message, zero coverage and null/empty analytics (nothing is invented).
- **Aggregates**: a month is served from `review_monthly_aggregates` (`source:"aggregate"`) when it ended before the review-content TTL, when no rows remain, or when rows were deleted. Otherwise from stored rows (`source:"rows"`). See `docs/GOOGLE-DATA-RETENTION.md`.
- **Unanswered** = reviews whose `reply_status` is not `answered` (includes `unknown`).
- **Reply latency** exists only for replies posted through LocalBoost (`review_replies.posted_at - review_time`); Google's own reply time is not stored, so it is `null` with a `reason` otherwise.
- `coverage.reviews_analysed` = rows with a rating or text; `topics_analysed` = rows whose text has not been purged. Analysis reads at most 5000 newest rows (`truncated`).

#### Sentiment (`method: "rating+lexicon"`)
`score = 2*stars_base + sign(positive_hits - negative_hits)`; `stars_base` = +1 for 4-5 stars, 0 for 3 or no rating, -1 for 1-2. Label: positive if score >= 1, negative if <= -1, else neutral. Stars dominate; the lexicon decides 3-star and unrated reviews and nudges others. A term with a negator up to 2 tokens before it (`not`, `never`, `nahi`, `नहीं`, ...) or a Hindi/Hinglish negator right after it flips polarity ("accha nahi", "not bad"). Text is lowercased, nukta is stripped (ज़ = ज), repeated letters collapse ("gandaaa" = "ganda"). A review with neither rating nor text is not classified.
The lexicon is exported as `SENTIMENT_LEXICON`: English (good, excellent, rude, slow, dirty, overpriced...), Hinglish (accha, badhiya, mast, ganda, kharab, mehnga, bakwas, dhokha...), Devanagari (अच्छा, बहुत अच्छा, बढ़िया, खराब, गंदा, महंगा, बेकार...). Limits: keyword matching, no sarcasm or context understanding; treat as a triage signal.

#### Topics
`TOPIC_LEXICON` (exported): service, staff, price, cleanliness, wait_time, quality, location_parking, delivery, each with English, Hinglish and Devanagari terms. A review counts once per topic it mentions; `sentiment` is that review's sentiment. Snippets come from stored review text only (window around the first match, max 140 chars incl. ellipsis) and contain no reviewer names.

### `GET /api/reviews/reply-history?business_id=&limit=`
`{business_id, replies:[{id, review_id, reply_text, status, error_code, confirmed_at, posted_at, created_at}], state: "verified_data"|"no_replies"|"unavailable"}` from `review_replies` (created by migration 010). If the table is missing: `state:"unavailable"`, empty list. Replies are scoped to the caller. Drafting stays in the assistant module / review generator.

## Competitors
Legacy `GET|POST /api/competitors` and the `competitors` table are untouched. New data lives in `competitor_profiles`.

Competitor object: `{id, business_id, name, website, address_text, place_id|null, lat, lng, source: "user_entered"|"places_api"|"rank_provider", verification_state: "unverified"|"verified"|"failed", verified_at, data_label, places_data|null, created_at, updated_at}`.
- Manually entered details are `source:"user_entered"`, `verification_state:"unverified"`, `data_label:"user_entered_not_verified_by_google"`. They never become "verified" by themselves.
- `places_data` = `{display_name, formatted_address, website_uri, rating, user_rating_count, source:"places_api", fetched_at}`, always separate from the user fields.

| Endpoint | Body / query | Notes |
|---|---|---|
| `GET /api/competitors/list?business_id=` | | `{competitors, legacy_competitors (read-only rows from the old table not yet re-added), cap:{limit, used, plan, source}}` |
| `POST /api/competitors/add` | `{business_id, name, website?, address_text?, lat?, lng?}` | 201. `400 validation_failed {fields}`, `409 duplicate_competitor`, `403 competitor_limit_reached {limit, used, plan}`. `place_id`/`source` are rejected as unknown fields. |
| `POST /api/competitors/update` | `{id, name?, website?, address_text?, lat?, lng?}` | Changing identity fields of a Google-confirmed competitor drops the match and its Places data (`verification_reset:true`). |
| `POST /api/competitors/remove` | `{id}` | Deletes the profile, candidates and stored Places data: `{removed:{profile, places_data, place_candidates}}`. |
| `POST /api/competitors/verify` | `{id}` | Places API (New) Text Search. 20/hour/user. |
| `POST /api/competitors/confirm-place` | `{id, place_id}` | Stores place_id, location and Places data only for a candidate returned by the latest verify (valid 24 h); else `409 candidate_not_found`. `409 duplicate_place`. |
| `GET /api/competitors/compare?business_id=&keyword_id=` | `keyword_id` optional | See below. |

Validation: name 1-160 chars; website http(s) URL with a dotted host and no credentials; address_text <= 300; lat in [-90,90] and lng in [-180,180], both or neither.
Caps: from `plan_entitlements.max_competitors` when it is a positive number, else constants free 0, pro 5, agency 25 (counted per business, including un-migrated legacy rows).

### Verify flow
1. `verify` calls `POST https://places.googleapis.com/v1/places:searchText` with `X-Goog-Api-Key: env.GOOGLE_MAPS_API_KEY` and `X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri,places.rating,places.userRatingCount`; query = name + address (or the business city), with a 5 km location bias when coordinates were entered.
2. Response: `{competitor_id, state:"awaiting_confirmation"|"no_candidates", candidates:[{place_id, display_name, formatted_address, lat, lng, website_uri, rating, user_rating_count, source:"places_api", fetched_at}]}`. Candidates are held server-side; nothing is applied to the competitor.
3. The user picks one; `confirm-place` sets `place_id`, `lat/lng`, `source:"places_api"`, `verification_state:"verified"`, `verified_at`, and writes `competitor_places_data`.
- No `GOOGLE_MAPS_API_KEY`: `503 {code:"provider_not_configured", state:"provider_not_configured"}`; no request is made.
- Provider failure: `502 provider_error` (no provider message is echoed). Zero results: `state:"no_candidates"` and `verification_state:"failed"`.
- Places data is cached for `GOOGLE_PROFILE_CACHE_TTL_DAYS` (default 30) and then deleted by the retention job; re-run verify to refresh. Verify that your use of Places data (caching, attribution/display requirements) matches the current Google Maps Platform terms before launch.

### Compare
Compares only data that exists. Each cell is `{value, source, as_of}` or `{value:null, reason}`.
- `you.rating`, `you.review_count`: from the business's own stored, authorised reviews (`reason:"no_stored_reviews"` otherwise). `review_count_caveat`: stored count may be lower than Google's live count.
- `you.grid_visibility`, `competitors[].cells.grid_visibility`: from `rank_scan_points.competitors_json` of the latest completed/partial scan for the keyword, source `rank_provider:<provider>`; only points where the provider returned a competitor list are compared, and competitors are matched by normalised name. Reasons: `keyword_id_not_provided`, `no_completed_scan`, `provider_returned_no_competitor_data`, `not_in_provider_results`.
- `cells.rating`, `cells.review_count`: only from `competitor_places_data` (source `places_api`, `as_of` = fetch time). Reasons: `not_verified_with_google_places`, `places_data_missing_or_expired`.
- `cells.website_facts`: `reason:"no_crawler_result_stored"` (no competitor crawl is stored today).
- `gaps` (each with `rule`, `text`, `evidence` incl. timestamps; created only when both numbers exist and the competitor is ahead):
  - `grid_top3_gap`: competitor top-3 points > your top-3 points over the same compared points.
  - `rating_gap`: competitor Places rating > your stored-review average.
  - `review_count_gap`: competitor Places review count > your stored review count (carries the caveat above).
