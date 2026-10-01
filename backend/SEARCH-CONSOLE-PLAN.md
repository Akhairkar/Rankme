# LocalBoost — Google Search Console Integration Plan

## Purpose
Use verified Search Console data to explain organic-search visibility for a connected business website.

## Flow
1. Secure Google authorization.
2. Discover Search Console properties available to the authorized account.
3. Customer selects a property.
4. Store the selected property against the business.
5. Server-side scheduled queries retrieve performance data.
6. Dashboard displays verified clicks, impressions, CTR and average position.

## Rules
- A website URL does not prove Search Console ownership.
- Property selection must come from Google.
- Data remains scoped to the authenticated user/business.
- Missing API access or property access produces a pending/error state, never zero metrics.

## States
awaiting_search_console_connection
awaiting_property_selection
connected
verified_data
provider_error

Production prerequisites remain secure OAuth callback/token persistence, API access, credentials and scheduled ingestion.


## Implemented foundation
- Search Console property and metric D1 tables are defined.
- Authenticated read path exposes user-scoped properties and verified metrics.
- States are `awaiting_search_console_connection`, `connected`, and `verified_data`.
- Live Google authorization, property discovery, and metric ingestion remain gated on secure OAuth token handling and production Google configuration.

Google Search Analytics requires authorization and exposes clicks, impressions, CTR and average position; LocalBoost will request these only for a property selected from the customer's Google-authorized account. citeturn0search0turn0search3


## Sync endpoint foundation

`POST /api/search-console/sync?business_id=...` is now a guarded server-side contract. Production sync remains disabled until secure Google OAuth token exchange/persistence and Search Console API access are configured. The endpoint returns an explicit pending/provider-not-ready state and never fabricates Search Console metrics.
