# Google Business Profile OAuth Architecture Specification

## 1. Overview
Secure, policy-compliant authentication mechanism allowing Indian business owners to connect their Google Business Profile to LocalBoost without sharing passwords or sensitive account credentials.

## 2. Official Google Scopes
- `https://www.googleapis.com/auth/business.manage` (Read and manage business profile locations and reviews)
- Minimal required access only. Never request Google Drive, Gmail, or sensitive non-business scopes.

## 3. Authorization Flow
1. User clicks "Connect Google Business Profile" in the Dashboard.
2. Redirected to Google's official OAuth consent screen with `client_id`, `redirect_uri`, `scope`, `state` (CSRF token), and `access_type=offline`.
3. User reviews and grants consent on accounts.google.com.
4. Google redirects back to backend callback endpoint with single-use `code` and matching `state`.
5. Backend exchanges `code` for `access_token` (short-lived) and `refresh_token` (long-lived) server-to-server.
6. Tokens are encrypted using AES-256-GCM and stored server-side. No tokens or secrets are ever exposed to the client browser.

## 4. Token Storage & Encryption
- Master encryption keys stored in environment variables / secure KMS.
- Refresh tokens encrypted at rest in database.
- Database backups do not contain unencrypted token credentials.

## 5. Disconnect & Revocation Flow
- Users can click "Disconnect Google Account" in settings at any time.
- Backend calls `https://oauth2.googleapis.com/revoke?token={token}` to instantly revoke access on Google's servers and purges local profile cache.

## 6. Security & Policy Guardrails
- Strictly zero scraping of Google Maps or Google Search.
- Rate limiting implemented per project quota to prevent denial of service.
- Error handling cleanly displays Google API downtime or permission expiration states.
