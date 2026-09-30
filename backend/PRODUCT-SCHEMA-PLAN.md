# LocalBoost — Product Data Model Plan

This document defines the database entities needed after identity and Google connection foundations. It is a design contract; production migration must be tested before applying it.

## Core relationships

users -> businesses -> business_locations

businesses -> audits -> audit_issues
businesses -> action_items
businesses -> keywords -> rank_snapshots
businesses -> competitors
business_locations -> reviews
businesses -> reports
users -> subscriptions -> payments
users -> usage_events

## businesses

id, user_id, name, category, website_url, phone, address_json, city, status, created_at, updated_at.

## business_locations

id, business_id, google_resource_name, name, address_json, latitude, longitude, sync_status, last_synced_at, created_at, updated_at.

## audits

id, business_id, audit_type, status, score, source_url, started_at, completed_at, created_at.

## audit_issues

id, audit_id, code, category, severity, title, explanation, evidence_json, recommended_fix, status, created_at, resolved_at.

## action_items

id, business_id, issue_id, priority, title, instructions, status, completed_at, created_at, updated_at.

## keywords

id, business_id, keyword, location_name, device, active, created_at, updated_at.

## rank_snapshots

id, keyword_id, checked_at, position, visibility, ranking_url, provider, raw_reference_json.

## competitors

id, business_id, name, place_reference, website_url, active, created_at, updated_at.

## reviews

id, business_location_id, google_review_name, reviewer_display_name, rating, review_text, review_time, reply_status, raw_reference_json, synced_at.

## reports

id, business_id, report_type, period_start, period_end, status, storage_reference, created_at.

## subscriptions

id, user_id, plan_code, status, provider_customer_id, provider_subscription_id, current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at.

## payments

id, user_id, subscription_id, provider_payment_id, amount_minor, currency, status, verified_at, raw_reference_json, created_at.

## usage_events

id, user_id, business_id, event_type, provider, units, estimated_cost_minor, metadata_json, created_at.

## Security rules

- Every business query must be scoped to the authenticated user.
- Raw provider payloads should be minimized and retained only where needed.
- Provider IDs are references, not authorization.
- Payment entitlement is server-side only.
- Sensitive Google tokens never belong in these product tables.
- Rank provider raw data must follow provider terms and retention limits.

## Migration rule

Do not apply this as an untested destructive migration. Add tables/indexes incrementally and verify foreign keys, ownership queries, retention and indexes before production.
