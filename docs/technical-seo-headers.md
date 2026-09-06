# LocalBoost Technical SEO & Security Headers Specification

## 1. HTTP Security Headers
- `Content-Security-Policy`: `default-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:;`
- `X-Content-Type-Options`: `nosniff`
- `X-Frame-Options`: `SAMEORIGIN`
- `Referrer-Policy`: `strict-origin-when-cross-origin`
- `Permissions-Policy`: `geolocation=(self), microphone=(), camera=()`

## 2. Caching & Compression
- HTML documents: `Cache-Control: public, max-age=3600, must-revalidate`
- Static CSS / JS / Fonts: `Cache-Control: public, max-age=31536000, immutable`
- Brotli / Gzip compression enabled for all text/html and JSON payloads.

## 3. URL Canonicalization & Trailing Slash Policy
- All clean URLs strictly end with a trailing slash `/`.
- HTTPS forced via 301 permanent redirect.
- Non-www to www (or vice versa) canonically unified to `https://www.localboost.in`.
