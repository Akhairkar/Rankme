# SEO ARCHITECTURE — Local Business Growth Platform

Documents the core SEO page architecture implemented in this session: URL structure, breadcrumbs, metadata, canonical strategy, and internal linking. Scope is intentionally limited to five pillar pages — no business-type or city pages, no mass-produced or thin content, per Session 05 constraints.

---

## 1. Stack context

The existing project is a static, framework-free site (`index.html` from Session 04 — no build system, no server-side routing). This architecture is implemented accordingly: each page is a self-contained static HTML file, and clean URLs are achieved via folder + `index.html` (works out of the box on static hosts that serve directory indexes, e.g. Netlify, Vercel, GitHub Pages, or any web server with `index` directive enabled).

---

## 2. Pillar pages created

Only the five pillars named in this session's scope were built (GBP, Google Maps SEO, Local SEO, Reviews, Business Growth). The Session 02 keyword map's other two pillars — business-type verticals and city pages — are deliberately **not** built here, since generating many permutations now would risk thin/doorway content; they're left for a future, separately-scoped session with real content for each.

| URL | File | Pillar |
|---|---|---|
| `/` | `index.html` | Homepage |
| `/google-business-profile/` | `google-business-profile/index.html` | GBP Setup & Optimization |
| `/google-maps-seo/` | `google-maps-seo/index.html` | Google Maps Ranking & Visibility |
| `/local-seo/` | `local-seo/index.html` | Local SEO Fundamentals |
| `/google-reviews/` | `google-reviews/index.html` | Reviews & Reputation |
| `/business-growth/` | `business-growth/index.html` | Getting Customers From Google |

Each page has real, substantive body content (roughly 500–700 words across multiple sections) — not a keyword-stuffed stub — and contains no invented statistics, rankings, or business facts, consistent with the Session 01 trust constraints.

---

## 3. URL structure

- Clean, keyword-matching slugs with trailing slash (`/google-business-profile/`, not `/gbp.html` or `?page=gbp`).
- No query-string or ID-based URLs for content pages.
- Flat structure (no nested `/guides/...` prefix) — kept simple since there are only five pillar pages; a `/guides/` prefix can be introduced later if the content volume grows enough to need it, with 301 redirects at that time.

---

## 4. Breadcrumbs

Implemented in two layers on every pillar page:

1. **Visible breadcrumb nav** (`Home / Guides / [Pillar]`), linking back to the homepage and to the homepage's `#guides` section.
2. **Structured data** — a `BreadcrumbList` JSON-LD block matching the visible trail, so search engines can render breadcrumb rich results.

The homepage itself has no breadcrumb (it's the root).

---

## 5. Metadata architecture

Each page defines, in `<head>`:
- Unique `<title>` (page-specific, under ~60 characters where practical)
- Unique `<meta name="description">`
- `<link rel="canonical">` pointing to its own clean URL
- Open Graph (`og:title`, `og:description`, `og:type`, `og:url`) and a basic Twitter card tag
- `Article` JSON-LD (headline, description, author/publisher as the "LocalBoost" organization, `mainEntityOfPage`)
- `BreadcrumbList` JSON-LD (see above)

The homepage additionally received a minimal, non-visual metadata update: a canonical tag and an `Organization` JSON-LD block. This was the only change made to `index.html`'s `<head>`; no visible layout or styling was touched.

**Placeholder domain note:** all canonical/OG/JSON-LD URLs use `https://www.localboost.in/` as a structural placeholder, matching the brand name chosen in Session 04. No real domain has been registered or verified — replace this domain throughout (all files) once a production domain is confirmed, before deploying.

---

## 6. Canonical strategy

- Self-referencing canonical on every page (each page canonicalizes to itself) — appropriate here since there's no duplicate-content risk yet (no filtering/sorting parameters, no city/business-type permutations).
- If city or business-type pages are added later and any near-duplicate variants are ever needed, canonical tags will need revisiting at that time — flagged here so it isn't forgotten, not solved now (out of scope).

---

## 7. Internal link structure

Follows the "internal-link destination" guidance from Session 02's `KEYWORD-MAP.md`, avoiding cannibalization by giving each pillar exactly one canonical page:

- **Homepage → pillars:** the existing "Guides" section's 3 cards now link to real pillar pages (GBP, Maps SEO, Reviews) instead of placeholder `#` links; a small text line adds the remaining 2 (Local SEO, Business Growth) so all five are reachable from the homepage without restructuring the visual layout.
- **Pillar → pillar ("Related guides"):** each pillar page links to 2–4 of the other pillars, chosen for topical relevance (e.g. the Maps SEO page links to GBP and Reviews, since both are common causes of Maps visibility issues).
- **Pillar → homepage:** every pillar page includes a CTA block linking back to the homepage's free-audit form (`/#hero-form`), and the header logo/nav link back to `/`.
- No page links to itself, and no two pages target the same primary keyword — maintaining the cannibalization guardrail from Session 02.

---

## 8. Sitemap & robots

- `sitemap.xml` — lists the homepage and all five pillar pages with `changefreq`/`priority` hints. Will need updating whenever new pages are added.
- `robots.txt` — allows all crawling and references the sitemap. No pages are disallowed at this stage.

Both use the same placeholder domain noted in Section 5.

---

## 9. Files changed / created

**Created:**
- `google-business-profile/index.html`
- `google-maps-seo/index.html`
- `local-seo/index.html`
- `google-reviews/index.html`
- `business-growth/index.html`
- `robots.txt`
- `sitemap.xml`
- `SEO-ARCHITECTURE.md` (this file)

**Modified (minimal, head/links only):**
- `index.html` — added `<link rel="canonical">` and an `Organization` JSON-LD block to `<head>`; updated the three existing guide-card `href="#"` placeholders to real pillar-page URLs; added one line of text linking the remaining two pillar pages. No visual/layout/CSS changes, no other sections touched.

**Not built (explicitly out of scope):**
- Business-type vertical pages, city pages, any audit logic, APIs, login, payments, or dashboard functionality.

---

## Status

Core SEO page architecture is in place for the five defined pillars: clean URLs, breadcrumbs (visible + structured data), full metadata per page, self-referencing canonicals, a sitemap, robots.txt, and a cannibalization-safe internal link graph. No mass content generation occurred — five pillar pages total, each with genuine, non-thin content.
