# LocalBoost — Google Business Profile Integration

## Verified integration contract

LocalBoost will use Google's Business Profile APIs only after the customer authorizes the Google account that manages the Business Profile. The OAuth scope is `https://www.googleapis.com/auth/business.manage`.

### Flow

1. Customer starts Google connection.
2. OAuth authorization code is returned to the Worker callback.
3. Worker exchanges the code server-side.
4. Refresh token is encrypted before D1 persistence.
5. Worker obtains an access token when synchronization is requested.
6. Discover Business Profile accounts.
7. Discover locations with the Business Information API.
8. Store only the verified location identifiers and required profile fields.
9. Link the selected Google location to the customer's LocalBoost business.
10. Use the location resource for reviews, performance and future profile audit operations.

### Google endpoints

- Business Profile account/location discovery uses the Business Information API.
- Location listing: `GET https://mybusinessbusinessinformation.googleapis.com/v1/accounts/-/locations` with an explicit `readMask`.
- Performance data uses the Business Profile Performance API.
- OAuth scope: `https://www.googleapis.com/auth/business.manage`.

## Data model mapping

Google location resource → `google_locations`:
- resource name
- account resource
- display/location name
- raw API response for the minimum required verified fields
- sync timestamp

Selected location → `business_locations`:
- LocalBoost business ID
- Google resource name
- name
- address
- latitude/longitude when supplied
- sync status
- last sync time

## Security requirements

- Never expose refresh tokens to the browser.
- Never log access tokens or refresh tokens.
- OAuth state must be single-use and expire.
- Token encryption key is a Worker secret.
- All business/location queries are scoped to the authenticated LocalBoost user.
- Do not mark a location as connected until it was returned by Google's API.
- If Google API access, OAuth credentials, quota or approval is missing, return a connection-required state instead of fabricated data.

## Current implementation boundary

The repository currently has the schema and OAuth authorization-start foundation. The secure OAuth callback/token exchange and real Google account/location synchronization remain pending because they require production credentials and secure token persistence.

No demo Google location, review, performance metric or connection should be inserted.


## Reviews sync contract
Google's Business Profile review APIs support listing reviews for a location and batch retrieval across locations. LocalBoost will call these APIs server-side only after OAuth credentials/token handling is production-ready, normalize returned review fields, upsert them into D1, and expose only user-scoped verified data.

The provider sync endpoint is guarded by GOOGLE_REVIEWS_SYNC_ENABLED; when disabled it returns an explicit pending state rather than generating review data. Review reply functionality remains a separate server-side action and requires the corresponding Google API authorization.
