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
