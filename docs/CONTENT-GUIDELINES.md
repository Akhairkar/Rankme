# LocalBoost content guidelines

Editorial and technical rules for every public page. Read this before adding or editing a guide, business-type page, city page, legal page or blog post.

## 1. Editorial rules

**Evidence over assertion.** Say only what we can support. Facts about Google products must be accurate and, where they change, hedged ("Google says local results are based mainly on relevance, distance and prominence"). Link to Google's own help pages when you cite a policy. Avoid dated specifics ("as of 2026") unless the date matters; use it sparingly.

**No guarantees.** Never promise rankings, calls, footfall, revenue, review counts or timelines. Use "can help", "often", "may". Never write "#1", "top 3 guaranteed", "dominate", "100% accurate".

**No fabricated proof.** No invented statistics, studies, testimonials, case studies, quotes or client names. A hypothetical example is allowed only if the page labels it "illustrative" or "invented example" in the text. Percentages and multipliers need a source we can show; otherwise leave them out.

**No affiliation claims.** LocalBoost is independent of Google. Do not use Google logos, imply endorsement, or use the words "official partner". Product names (Google Business Profile, Search Console) are used descriptively.

**Compliance first.** Do not recommend review gating, incentivised reviews, fake or purchased reviews, keyword-stuffed business names, virtual-office addresses or scraping. Regulated professions (medical, legal, financial) must be told to follow their own regulator's advertising rules. No advertising or ad-network content appears on the site.

**Tone.** Plain, respectful, practical. Write for a shop owner in India, not for an SEO. Short sentences. Explain a term the first time. Prefer concrete examples: WhatsApp enquiries, Justdial, GST invoices, two-wheeler and footfall businesses, festival and wedding seasons, locality names people actually use.

**E-E-A-T.** Show experience through specific, real details (what to photograph, which question customers ask), not generic filler. State the limits of advice. Identify the organisation as the author; do not invent personal bylines or credentials. Keep the legal pages, about page and contact route easy to find.

## 2. Page checklist (every new page)

- [ ] Unique `<title>` (<= 60 characters including " | LocalBoost" where possible) and unique meta description (120 to 160 characters).
- [ ] Exactly one `<h1>`; logical `h2`/`h3` order.
- [ ] `<link rel="canonical">` to the page's own absolute URL with trailing slash (Hindi pages are self-canonical on their `/hi/...` URL).
- [ ] Reciprocal hreflang trio on both language versions: `en`, `hi`, `x-default` (x-default points at the English URL).
- [ ] `og:title`, `og:description`, `og:url`, `og:image` (`https://www.localboost.in/assets/og-image.png`), `og:type`, `twitter:card`.
- [ ] `BreadcrumbList` JSON-LD. Add `Article` and `FAQPage` JSON-LD only when the visible page really contains that content, and keep the JSON-LD text identical to the visible FAQ. Never add a generic FAQ block to unrelated pages.
- [ ] Favicon links, `assets/site.css`, `assets/consent.js` and `assets/site.js` copied from a sibling page at the same folder depth.
- [ ] Header and footer structure copied unchanged from a sibling page (a site-wide script unifies them later).
- [ ] Internal links with descriptive anchor text to the relevant tools (`/tools/...`) and 2 to 4 related guides. Link to `/check/` and `/pricing/` sparingly.
- [ ] Practical checklist, a "common mistakes" section and an honest FAQ on guides.
- [ ] Words: guides 1,200 to 1,800; business and city pages 450+; no indexable content page under 300 words.
- [ ] Mobile check at 390px width: no horizontal scroll (wrap tables in `overflow-x:auto`).

## 3. Bilingual rules

- Every indexable page has an English page at `/<section>/<slug>/` and a Hindi page at `/hi/<section>/<hindi-slug>/`.
- Hindi slugs use Hinglish transliteration in lower-case with hyphens (for example `google-reviews-kaise-mangaye`). Never change a published slug; add a new page instead.
- Hindi is written natively, in Devanagari, keeping product terms people search for in English (Google Business Profile, Search Console, WhatsApp, QR). Do not machine-translate sentence by sentence; adapt examples to Hindi-speaking readers.
- Titles, descriptions, H1, FAQ and JSON-LD on a Hindi page are in Hindi (or Hinglish where an existing slug convention demands it) and refer to the Hindi URLs.
- Relative links on a Hindi page point to Hindi pages (`../../../hi/tools/...`), not English ones.
- The language switch in the header links to the twin page.

## 4. Adding a page without breaking canonical, hreflang or the sitemap

1. Create `section/slug/index.html` (English) and `hi/section/hindi-slug/index.html` (Hindi) from a sibling page.
2. Set canonical, hreflang and `og:url` on both (see checklist). The English page's `hi` alternate is the Hindi URL; the Hindi page's `en` alternate is the English URL.
3. Add a link from the relevant hub page (for example `local-seo/index.html` and `hi/local-seo/index.html`) so the page is not orphaned.
4. Run `python3 scripts/seo_check.py`. It validates titles, descriptions, canonicals, hreflang reciprocity, broken internal links and sitemap membership.
5. Rebuild the sitemap and the site search index (`scripts/build_sitemap.py`, `scripts/build_search_index.py`) so the new URLs are listed.
6. Never change an existing URL. If a page must move, keep the old URL with a redirect handled at the hosting layer and update inbound links.

## 5. Legal pages

Privacy, terms, disclaimer, compliance, refund and data-retention pages must match the real product (Razorpay payments, first-party consent-based analytics, Google sign-in and OAuth data, Cloudflare hosting). Update them whenever a data flow, provider or price rule changes, and update the visible "Last updated" date. They are drafts until reviewed by the owner's lawyer. Do not claim certifications, data-residency locations or legal compliance that cannot be verified.

## 6. Generated pages

`generate_pages.py` renders the Business Growth guides. It writes to `./_generated` by default, builds the FAQ block and the FAQPage JSON-LD from the same list so they cannot diverge, and aborts if it sees banned phrases (ranking guarantees, ad-network names, retired brand names, the old generic FAQ). Review a diff before copying generated files into the site.
