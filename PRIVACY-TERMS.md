# LocalBoost — Privacy & Terms Baseline

Last updated: 2026-10-01

## Product
LocalBoost is a paid local-SEO SaaS for shops and local businesses. It helps customers monitor and improve Google Search and Google Maps visibility using data obtained through authorized integrations.

## Google data
When a customer connects Google, LocalBoost uses only the permissions required for the enabled product features. Google account/profile data is processed to identify authorized Business Profile locations and provide the requested local-SEO features.

Customers can disconnect an integration. LocalBoost must not display a Google location as connected unless it was returned by the authorized Google integration.

## Customer data
Business details, tracked keywords, verified measurements, review records, reports, subscription records, and usage records are stored to provide the service. Access is scoped to the authenticated customer account and its businesses.

## Security
OAuth secrets and refresh tokens must remain server-side. Secrets must be stored as platform secrets, not committed to source control. Production API access must remain disabled until the Worker, D1 database, OAuth configuration, and security controls are verified.

## Payments
Paid access is granted only after server-side payment verification and subscription entitlement checks. A successful browser redirect alone is not proof of payment.

## Data deletion
Customers must be able to request account/data deletion. Production deletion should remove or anonymize customer-owned LocalBoost records according to the final retention policy and revoke/disconnect third-party integrations where applicable.

## No fabricated results
LocalBoost must never invent rankings, reviews, Google connections, performance metrics, payments, or customer data. If an external provider is unavailable, the interface must show an explicit pending or error state.

## Terms baseline
Customers are responsible for the accuracy of their business information and for having authority to connect the Google Business Profile and other third-party properties they use with LocalBoost. Google and other third-party services remain subject to their own terms and availability.

This file is an implementation baseline, not a substitute for jurisdiction-specific legal advice or the final published legal documents.
