# LocalBoost — Rank Provider Integration Plan

## Purpose
Provide real Google Search/local ranking measurements for customer keywords without fabricating positions.

## Provider contract
An adapter implements search(keyword, location, device) and returns position, ranking_url, visibility, provider and checked_at, or an explicit unavailable/error state.

## Runtime boundary
The browser never calls a rank provider directly. The Cloudflare Worker calls the selected provider server-side and stores normalized results.

## Selection
Provider credentials, quota, pricing, terms and test results must be verified before activation.

## Safety
- Never accept a customer-supplied position as verified ranking data.
- Never convert missing results into a rank.
- Store provider and timestamp with every snapshot.
- Apply plan/rate limits before billable calls.
- Record provider usage/cost events.
- Retry only bounded transient failures.

## States
awaiting_rank_provider → provider_configured → measuring → verified_data
Provider failures use provider_error.


## Implemented adapter boundary
- Provider calls are server-side only.
- `RANK_PROVIDER_ENABLED` and `RANK_PROVIDER_URL` gate activation.
- Optional `RANK_PROVIDER_TOKEN` is read only as a Worker secret/variable and never sent to the browser.
- Requests have an 8-second timeout and bounded result storage.
- Provider responses are normalized to position, ranking URL, visibility, provider and timestamp.
- `/api/ranks/run` stores snapshots only after a provider returns numeric positions.
- Missing provider data remains an explicit pending/error state.

Google Places API (New) can discover places and supports Text Search/Nearby Search, but its returned ordering is not treated by LocalBoost as a definitive organic Google ranking measurement. A dedicated rank provider remains required for compliant rank tracking. citeturn0search0turn0search2turn0search3
