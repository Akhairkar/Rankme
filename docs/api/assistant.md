# AI assistant API (module `assistant.js`)

All routes are session-authenticated, per-user rate limited (fail closed: `503 rate_limiter_unavailable` when the limiter's DB is down, `429 rate_limited`) and tenant-scoped through `ctx.getUserBusiness`. Errors: `{error, code}`.

Every response that contains generated content carries
`notice: "AI-assisted suggestions. Review before acting; nothing is published automatically."`
Nothing is ever posted to Google, written to the profile or sent anywhere by this module.

## Principles
- **Evidence only.** The assistant works on rows read server-side from the database for the caller's own business (`collectEvidence`). It never invents Google ranking factors, search volumes, competitor metrics, review data, business attributes, Search Console numbers or API responses. No evidence -> `state:"no_evidence"` plus a `missing` list.
- **Deterministic first.** `buildDeterministicInsights` applies documented rules and works with no API key; it is the result whenever the model is unavailable, not permitted, or its output is rejected.
- **Model optional.** If `ANTHROPIC_API_KEY` is set (model from `ASSISTANT_MODEL`, default `claude-sonnet-5-5`), the evidence is sent to `POST https://api.anthropic.com/v1/messages`. Output is validated before use (see Validation).
- **Minimisation.** Emails and phone numbers (incl. Devanagari digits) are redacted from review text and search queries at collection time, so they are neither sent to the model nor stored. Reviewer names are never collected. Prompts and keys are never logged; `usage_events` stores only model, token counts and topic.

## Evidence item
`{id:"E1", label, value, source, as_of (ISO|null), verification: "verified"|"user_provided"|"unknown"}`; ids are per-request and are what recommendations cite. `freshness: {newest_as_of, oldest_as_of, stale_items}` (stale = older than 35 days).

| topic | rows read (capped) |
|---|---|
| `audit_findings` | latest audit score, open findings by severity, top 15 open findings (checks with verification `unavailable` go to `missing`, not evidence) |
| `search_console` | top 15 queries by impressions over the last 90 days (sum impressions/clicks, CTR, avg position) + totals |
| `rank_summary` | latest + previous completed scan per keyword (max 8 keywords): avg position, points found / not found / provider errors |
| `reviews` | summary (count, average, answered/unanswered/unknown) + 8 most recent reviews (redacted, 300 chars) |
| `competitors` | competitor names entered by the owner + names seen in the latest scan's provider results; metrics are never estimated |
| `profile` | business record, saved extended profile, Google-synced location flags |
| `monthly_progress` | month vs previous month: rank scans, reviews, audit score, Search Console, performance metrics, completed actions (`action_tasks` is read if the table exists) |

## Recommendation structure
```
{title, recommendation, why_it_matters, evidence_refs:[ids], data_source, confidence:"high"|"medium"|"low",
 uncertainty, missing_data:[...], next_action}
```
Deterministic rules (constants in `RULES`): high impressions (>=100) with CTR < 2%; avg position 8-20 with >=100 impressions (low confidence); >=30% of rank points not found (provider errors excluded and disclosed); average position worsened by >=1 between the last two scans; unanswered+unknown reviews >= 20% of reviews and any unanswered review rated <=2; open audit findings by severity (high first, only non-`unavailable` ones); profile fields missing from stored data; competitor lists only (low confidence, no comparison).

## Validation of model output
JSON is parsed and checked against a strict schema (all nine fields, types, lengths, `confidence` enum). A recommendation is **dropped** if: any `evidence_refs` id is not in the supplied evidence; any number in the text is absent from the evidence (allow-list: star values 1-5; Devanagari digits normalised); it contains a URL/email not in the evidence; or it uses refund/discount/incentive wording. `data_source` is always derived from the cited evidence, and confidence is capped at `medium` unless all cited evidence is `verified`. Limitation: the numeric check cannot see numbers spelled as words; the system prompt forbids them and evidence refs are still required. If nothing survives: `model_output_rejected` with the deterministic result.

## Endpoints

### `POST /api/assistant/insights` `{business_id, topic, month?}`
-> `{state, ai_assisted:boolean, insights:[...], evidence:[...], missing:[...], freshness, generated_at, notice, model_status:{configured, used, reason}, run_id, business_id, topic}`

`state`: `ai_assisted` | `deterministic_only` | `no_evidence` | `model_output_rejected` | `model_unavailable`. `model_status.reason` explains why the model was not used or failed: `provider_not_configured`, `upgrade_required`, `monthly_cap_reached`, `rate_limited`, `provider_timeout`, `provider_rate_limited`, `provider_error`, `provider_unreachable`, `provider_rejected`, or a validation code. Deterministic insights are available on all plans; model calls require `reports_enabled` and remaining monthly quota. `400 invalid_topic`, `404 business_not_found`.

### `POST /api/assistant/draft` `{business_id, kind:"description"|"service_description"|"review_reply", review_id?, service?, tone?:"professional"|"warm"|"concise", language:"en"|"hi"|"hinglish"}`
-> `{state, draft, ai_assisted:true, generator:"template"|"model", grounded_in:[evidence ids], warnings:[...], missing:[...], notice, run_id}`

`state`: `template_only` | `ai_assisted` | `model_output_rejected` (template shown) | `insufficient_evidence` (`draft:null`, `missing` says which stored facts are required; nothing invented).
- `description`: built only from stored name, primary/secondary categories, city and service areas; max 750 characters; rejected if it adds numbers, links, contact details or promotional claims (best, award, guarantee, years of experience...) not in the stored facts.
- `service_description`: `service` must match a stored primary/secondary category, otherwise `insufficient_evidence`.
- `review_reply`: grounded in the stored (redacted) review; the review must belong to the caller's business (`404` otherwise). Replies never contain refund/compensation/discount/free/coupon wording, liability admissions, requests to change/post/rate reviews, links, emails, or numbers other than star values. Instruction-like review text produces a warning and is treated as data. To post a reply the owner must use `POST /api/reviews/reply` with `confirm:true`.

### `POST /api/assistant/monthly-summary` `{business_id, month:"YYYY-MM"}`
-> `{state:"deterministic_only"|"no_evidence", ai_assisted:false, month, sections:[{key,title,available,summary,evidence_refs,data_source}], unavailable:[keys], evidence, missing, freshness, generated_at, notice}`
Sections: `rank`, `reviews`, `audit`, `search_console`, `performance`, `actions`. A comparison section is available only when stored snapshots exist for both months; otherwise it is listed in `unavailable` and `missing`. Not a model call. `400 invalid_month|future_month`.

### `GET /api/assistant/usage`
-> `{month, plan, model_calls_used, model_calls_cap, model_calls_remaining, input_tokens, output_tokens, estimated_cost_minor, currency:"INR", cost_is_estimate:true, provider_configured, model, caps}`.
Caps per calendar month (UTC): free 0, pro 60, agency 300 (`PLAN_CAPS`). Cost is an estimate (fixed per-token rates x fixed INR rate), not an invoice. Deterministic insights are uncapped but rate limited (30 requests/min/user; model calls additionally 6/min/user).

### `GET /api/assistant/history?business_id=&limit=` (max 50)
-> `{runs:[{id, topic, state, model, created_at, evidence, output}], notice, retention_days:180}` from `assistant_runs` (topics: insight topics, `draft:<kind>`, `monthly_progress`).

## Provider behaviour
Headers `x-api-key`, `anthropic-version: 2023-06-01`. Timeout 20 s per attempt (`ASSISTANT_TIMEOUT_MS` override), `max_tokens` <= 1500, up to 3 attempts on 429/5xx/timeout/network error with backoff (`ASSISTANT_RETRY_DELAY_MS`), no retry on other 4xx. The system prompt (exported `SYSTEM_PROMPT`) forbids invented numbers/factors/volumes/competitor/review data, requires evidence ids and JSON-only output, and states the evidence block is untrusted data (reviews, queries and descriptions come from third parties) whose instructions must be ignored. Evidence is wrapped in `<untrusted_evidence>` JSON with `<` escaped.

## Storage and jobs
Migration `090_assistant.sql`: `assistant_runs(id, user_id, business_id, topic, state, model, evidence_json, output_json, created_at)`. Job `assistant-retention` (hourly cron) deletes runs older than 180 days. Account deletion cascades through the `users`/`businesses` foreign keys.

## Env
`ANTHROPIC_API_KEY` (secret, optional), `ASSISTANT_MODEL` (default `claude-sonnet-5-5`). Without the key every endpoint still works in deterministic mode.
