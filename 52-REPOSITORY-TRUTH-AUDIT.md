# LocalBoost — Repository Truth Audit

Date: 2026-09-30
Repository: `Akhairkar/Rankme`
Customer-facing website/product: **LocalBoost**

## Naming rule

- `Rankme` = GitHub repository/project identifier.
- `LocalBoost` = public website/product brand.
- `localboost.in` = intended production domain and is **not** a branding error.
- LocalBoost branding and domain must be preserved.

## Confirmed findings from the inspected implementation

| Area | Current truth | Priority | Action |
|---|---|---:|---|
| Branding/domain | LocalBoost branding and `localboost.in` appear consistently on the inspected core pages | OK | Preserve |
| Generated FAQ content | Several pages contain generic generated FAQ blocks that mention RankMe, generic “top rankings” language, business-growth claims, and AdSense-policy questions unrelated to the actual page intent | HIGH | Replace with factual LocalBoost-specific FAQs |
| Checkout | Checkout contains a client-side simulated success flow: `Payment Simulated Successfully` | BLOCKER | Do not treat as real payment; build verified payment flow before accepting customers |
| Demo business data | Checkout/audit UI contains sample business placeholders such as `Royal Sweets & Bakery` | HIGH | Clearly label demo data or replace with user-entered/customer data |
| Google API presentation | Pages advertise Google Profile API access, but a production OAuth/API backend was not verified in this audit pass | BLOCKER for live integration | Implement and test real OAuth/backend before showing a connected state |
| Authentication | No production customer account/session architecture was verified in the inspected static pages | BLOCKER for SaaS | Add secure auth/session layer before persistent customer data |
| Search Console | Roadmap includes Search Console, but production OAuth/data retrieval was not verified in this pass | NOT BUILT | Implement after auth foundation |
| Rank tracking | Roadmap requires real local rank tracking, but a verified provider-backed production implementation was not found in this pass | NOT BUILT | Select provider and implement server-side tracking |
| Review sync | Review UI/content exists, but live customer-specific Google review synchronization was not verified | NOT BUILT | Connect through supported GBP API |
| Monitoring/jobs | Recurring production sync/report jobs were not verified | NOT BUILT | Add scheduler, retries and idempotency |
| Billing state | Pricing UI exists, but the inspected checkout is simulated | NOT BUILT | Add real payment gateway + webhook verification + subscription state |
| AI layer | AI-related product concepts exist, but a verified production data pipeline was not found in this pass | NOT BUILT | Build AI on top of verified customer evidence |

## Important correction

The previous version of this audit incorrectly classified **LocalBoost branding** and **localboost.in** as blockers. That was wrong because LocalBoost is the actual website/product name and Rankme is the repository name.

Those findings are now explicitly corrected.

## Product architecture conclusion

The repository currently has a substantial static product/UI layer, but the inspected implementation does not yet prove a complete production SaaS backend.

The build sequence should therefore be:

1. Clean generated/irrelevant FAQ and claim content.
2. Build backend + database + authentication.
3. Implement real Google OAuth and Business Profile connection.
4. Sync verified Business Profile data.
5. Build website/local SEO audit pipeline.
6. Connect Search Console.
7. Add real local rank tracking.
8. Add review monitoring.
9. Build Action Center + evidence-based score.
10. Add recurring monitoring and reports.
11. Replace simulated checkout with verified billing.
12. Add AI recommendations using verified customer data.
13. Run security, privacy, cost and end-to-end QA.

## Google integration requirement

Google documents `https://www.googleapis.com/auth/business.manage` as the Business Profile API OAuth scope. Business Profile API operations on protected business data require user authorization. Google also documents server-side OAuth flows for securely storing authorization state/tokens. citeturn0search0turn0search4

Google's Business Profile Performance API can provide metrics such as website clicks, call clicks, direction requests and search-keyword impressions, which fits the LocalBoost monitoring product. citeturn0search2

LocalBoost must never show a fake “Google connected” state or claim live synchronization until the backend has actually completed OAuth and successfully retrieved the customer's authorized data.

## Immediate implementation rule

Do not rewrite the entire repository.

Next change set should be limited to:

- remove irrelevant/generated FAQ claims;
- remove AdSense positioning from customer-facing SaaS pages;
- remove/disable simulated payment success;
- make demo/sample data unmistakably demo-only;
- preserve LocalBoost branding and `localboost.in`;
- then re-audit the changed files.

**Inspect → Change only confirmed issues → Test → Self-audit → Verify diff → Deploy.**
