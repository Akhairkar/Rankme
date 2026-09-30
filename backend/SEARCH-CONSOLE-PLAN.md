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
