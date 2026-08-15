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

## 10. Bilingual (Hindi) pages & hreflang — added in Session 06

Real Hindi versions of the homepage and all five pillar pages now exist as separate, fully translated static HTML files, not a JS-based language toggle:

| English URL | Hindi URL |
|---|---|
| `/` | `/hi/` |
| `/google-business-profile/` | `/hi/google-business-profile/` |
| `/google-maps-seo/` | `/hi/google-maps-seo/` |
| `/local-seo/` | `/hi/local-seo/` |
| `/google-reviews/` | `/hi/google-reviews/` |
| `/business-growth/` | `/hi/business-growth/` |

Each Hindi page has its own `<title>`, meta description, canonical URL, and Article/BreadcrumbList JSON-LD written in Hindi (`inLanguage: "hi"`), and `lang="hi"` set on the `<html>` element.

**hreflang implementation:** every English page and its Hindi counterpart carry `<link rel="alternate" hreflang="...">` tags pointing to each other (`en`, `hi`) plus an `x-default` pointing at the English version. The same alternate-language annotations are duplicated in `sitemap.xml` using the `xhtml:link` extension, which is the pattern Google explicitly supports for hreflang-in-sitemap.

**Language switch link:** the EN/हिं control in the header (and footer, on the homepage) is now a real `<a>` link to the matching-language version of the *same page* — not a JS toggle that swaps visible text on one URL. This was a deliberate correction from the Session 05 output, where the button existed but did nothing; client-side toggles also don't give search engines two indexable, language-distinct URLs, which defeats the point of bilingual SEO.

**Translation approach:** primarily standard Hindi (Devanagari script) rather than Roman-script Hinglish, since `hreflang="hi"` and the Devanagari font stack (`Noto Sans Devanagari`) both expect Devanagari; proper nouns and widely-used English terms (Google, SEO, Business Profile) are kept as-is, matching how Indian users actually search and read, per the Hinglish keyword entries in `KEYWORD-MAP.md`.

**Not done in this pass:** Hindi versions of business-type/city pages (none of those exist in either language yet — out of scope, see Section 2), and no `hi-IN` region-specific variant was added (a plain `hi` tag was judged sufficient at this stage).

---

## 11. Check tool — added in Session 07

`/check/` and `/hi/check/` are the first interactive (non-content) pages on the site. They're deliberately handled differently from the pillar guides:

- **`<meta name="robots" content="noindex, follow">`** on both — this tool's output is a self-reported, personalized quiz result, not evergreen content meant to rank; indexing it would add no search value and risks looking like thin/duplicate content across visits. `follow` is kept so link equity still flows through its outbound links to the pillar guides.
- **Not included in `sitemap.xml`**, consistent with the noindex directive — sitemaps should only list pages meant to be indexed.
- **hreflang tags are still present** on the page itself (even though noindexed) so that if this decision is revisited later, the language relationship is already correctly declared.
- Each result item links to the relevant pillar guide (`/google-business-profile/`, `/google-reviews/`, `/local-seo/` and their `/hi/` equivalents), so the tool still contributes internal link flow to the indexable content pages.

---

## Status

Core SEO page architecture is in place for the five defined pillars in both English and Hindi: clean URLs, breadcrumbs (visible + structured data), full metadata per page, self-referencing canonicals, hreflang-linked language pairs, a sitemap covering both languages, robots.txt, and a cannibalization-safe internal link graph. The Check tool adds a real interactive page in both languages, intentionally excluded from indexing but linking back into the indexed guide content. No mass content generation occurred — five pillar pages per language (ten total) plus one tool page per language, each with genuine, non-thin, independently written content.
