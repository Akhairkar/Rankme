// Unified business audit engine (module `audit.js`). Contract: docs/API-CONTRACT.md "audit".
//
// PRINCIPLES
//  - Every finding carries evidence, a source and a verification status. Nothing is invented.
//  - A check is "pass", "fail" or "unavailable". "unavailable" (data could not be read) is NOT a failure
//    and does NOT reduce the score: it is simply left out of the denominator.
//  - Scores describe the completeness/health of the listed inputs. They are NOT a prediction of Google
//    rankings and none of the criteria below are claimed to be confirmed Google ranking factors. Each
//    finding explains the practical business/customer impact instead.
//
// SCORING (see AUDIT_MODEL below, also exported for the UI "how this score is calculated" panel)
//  - Each check has a weight. Sections group checks; section weights are the sum of their check weights (total 100).
//  - section.points = sum of weights of PASSED checks, section.max = sum of weights of AVAILABLE (pass+fail) checks.
//  - Section score = points / max (only when max > 0, otherwise the section is "unavailable").
//  - Overall score = round(100 * sum(section.weight * sectionScore) / sum(section.weight of available sections)).
//  - If the available check weight is < 40% of the total (MIN_AVAILABLE_RATIO) the score is null (state "partial").
//  - state = "completed" when every check was available, otherwise "partial" (score may still be a number).
import { id as newId, getGoogleLocationForBusiness, getReviewSummary, getSubscriptionEntitlements } from "./db.js";

export const MIN_AVAILABLE_RATIO = 0.4;
export const MODEL_VERSION = "2026.1";

// Audits allowed per calendar month (UTC) per user, by plan. Free = 1 as required; paid plans are our own limits.
export const AUDIT_MONTHLY_LIMITS = { free: 1, pro: 30, agency: 100 };

// Static effort estimate per check code: 1 = quick (about 15 minutes), 2 = about an hour, 3 = half a day or more /
// may need a developer. Used only to order the 30-day plan; these are planning estimates, not measurements.
export const EFFORT = {
  profile_hours: 1, profile_primary_category: 1, profile_phone: 1, profile_website: 1, profile_address: 2,
  profile_description: 2, profile_description_length: 2, profile_secondary_categories: 1,
  nap_name: 1, nap_phone: 1, nap_address: 2,
  review_count: 3, review_unanswered: 2,
  site_https: 3, site_title: 1, site_meta_description: 1, site_h1: 1, site_viewport: 2, site_canonical: 1,
  site_noindex: 2, site_broken_links: 2, site_response_time: 3,
  local_city_in_title: 1, schema_local_business: 2,
};

const GP = "google_business_profile";
const SEVERITY_RANK = { high: 3, medium: 2, low: 1 };

// ---------------------------------------------------------------------------------------------------------
// Model definition (data only; evaluators live in EVALUATORS keyed by check code).
// ---------------------------------------------------------------------------------------------------------
const C = (code, weight, severity, title, criteria, why, action, steps) => ({ code, weight, severity, title, criteria, why_it_matters: why, recommended_action: action, instructions: steps });

export const AUDIT_MODEL = {
  version: MODEL_VERSION,
  min_available_ratio: MIN_AVAILABLE_RATIO,
  note: "Scores measure how complete and consistent your listed business information is. They are not a ranking prediction and the checks are not claimed to be confirmed Google ranking factors. Checks whose data could not be read are 'unavailable' and are excluded, never counted as failures.",
  sections: [
    { id: "profile_completeness", label: "Profile completeness", source: "Google Business Profile (verified) or your business record (user provided)", checks: [
      C("profile_hours", 5, "high", "Business hours are missing or incomplete", "Pass when the Google profile has regular opening hours and every period has an open and close time.",
        "Customers checking whether you are open right now may skip a listing with no hours, and wrong or missing hours lead to wasted trips.",
        "Add complete opening hours to your Google Business Profile.",
        ["Open business.google.com and select this location.", "Choose Edit profile, then Business hours.", "Set the open and close time for every day you trade and mark closed days as closed.", "Save, then add special hours for upcoming holidays."]),
      C("profile_primary_category", 5, "high", "Primary category is missing", "Pass when a primary category is present (Google profile if linked, otherwise your business record).",
        "The primary category tells Google and customers what kind of business you are, and it controls which profile attributes and features are offered.",
        "Choose the most specific primary category that describes your main service.",
        ["Open your Google Business Profile and choose Edit profile, then Business information.", "Under Business category pick the most specific primary category.", "Save and re-run this audit after the next sync."]),
      C("profile_phone", 3, "medium", "Phone number is missing", "Pass when a phone number is present (Google profile if linked, otherwise your business record).",
        "Customers who want to call you cannot do so from the listing when no number is shown.",
        "Add your main business phone number.",
        ["Open Edit profile, then Business information, then Phone.", "Enter the number customers should call, in the same format used on your website.", "Save the change."]),
      C("profile_website", 3, "medium", "Website link is missing", "Pass when a website URL is present (Google profile if linked, otherwise your business record).",
        "Without a website link, customers cannot read more about your services or book online from the listing.",
        "Add your website address to the profile.",
        ["Open Edit profile, then Business information, then Website.", "Paste the full https:// address of your main page or a local landing page.", "Save the change."]),
      C("profile_address", 3, "medium", "Address is missing", "Pass when a street/locality address is present (Google profile if linked, otherwise your business record).",
        "Customers and navigation apps need an address (or a defined service area) to find you.",
        "Add your business address, or set a service area if you do not serve customers at the premises.",
        ["Open Edit profile, then Business information, then Location.", "Enter the full address, or choose service-area-only if customers do not visit you.", "Save and complete any verification Google requests."]),
      C("profile_description", 3, "medium", "Business description is missing", "Pass when the Google profile has a description.",
        "The description is where you explain services, experience and what makes you different, in your own words.",
        "Write a clear description of your services and the area you serve.",
        ["Open Edit profile, then Business description.", "Write in plain language what you do, who you serve and where.", "Avoid promotional claims, links and phone numbers (Google guidelines)."]),
      C("profile_description_length", 2, "low", "Business description is very short", "Pass when the description is at least 100 characters (our guideline; Google allows up to 750).",
        "A one-line description leaves out information customers look for, such as services offered and areas served.",
        "Expand the description to cover your main services and service area.",
        ["Open Edit profile, then Business description.", "Expand it to at least a few sentences covering services, experience and the areas you serve.", "Stay within 750 characters."]),
      C("profile_secondary_categories", 1, "low", "No secondary categories", "Pass when at least one additional category is listed on the Google profile.",
        "Additional categories let you describe other services you genuinely offer so customers searching for them can find the right listing.",
        "Add secondary categories only for services you actually provide.",
        ["Open Edit profile, then Business information, then Business category.", "Use Add another category for services you genuinely offer.", "Do not add categories you do not serve."]),
    ] },
    { id: "consistency", label: "Information consistency", source: "Comparison of your business record (user provided) with Google Business Profile (verified)", checks: [
      C("nap_name", 5, "medium", "Business name differs between your record and Google", "Pass when the normalised business names match.",
        "Different names for the same business across listings can confuse customers and make it harder for them to be sure they have the right business.",
        "Decide on the correct business name and make both places match.",
        ["Compare the two values shown in the evidence.", "Update whichever is wrong (Google name must be your real-world name, per Google guidelines).", "Re-run the audit after the Google sync."]),
      C("nap_phone", 5, "high", "Phone number differs between your record and Google", "Pass when the last 10 digits of the phone numbers match.",
        "If different numbers are published, some customers will reach a wrong or old number.",
        "Use one main phone number everywhere.",
        ["Compare the two numbers shown in the evidence.", "Update the incorrect one in your Google profile or your business record.", "Check your website and other listings show the same number."]),
      C("nap_address", 5, "high", "Address differs between your record and Google", "Pass when postal codes match (or, if one is missing, locality names match).",
        "Inconsistent addresses send customers to the wrong place.",
        "Correct the address so it is identical everywhere.",
        ["Compare the two addresses shown in the evidence.", "Fix whichever is wrong.", "Check your website footer and other listings use the same wording."]),
    ] },
    { id: "reviews", label: "Reviews & responses", source: "Reviews synced from Google (verified)", checks: [
      C("review_count", 10, "low", "Few Google reviews", "Pass when at least 10 reviews have been synced (a guideline for a small established listing, not a Google threshold).",
        "Customers often compare businesses by looking at reviews; a listing with very few reviews gives them less to go on. This is a fact about your listing, not a ranking promise.",
        "Ask recent happy customers for an honest review using your Google review link.",
        ["Copy your review link from the Google Business Profile 'Get more reviews' option.", "Send it to customers after a completed job by SMS or email.", "Never offer payment or discounts for reviews and never review-gate (Google policy)."]),
      C("review_unanswered", 10, "medium", "Reviews without a reply", "Pass when none of the synced reviews is unanswered (reply status 'unanswered' or 'unknown').",
        "Replying shows customers (and the reviewer) that you read feedback, and gives you a chance to resolve problems publicly.",
        "Reply to the open reviews, starting with the lowest ratings.",
        ["Open the Reviews page and filter to unanswered reviews.", "Reply politely and specifically, thank positive reviewers and offer to resolve issues offline for negative ones.", "Do not include personal data in public replies."]),
    ] },
    { id: "website_technical", label: "Website technical SEO", source: "Live crawl of your website (verified, source = page URL)", checks: [
      C("site_https", 4, "high", "Website is not served over HTTPS", "Pass when the final URL after redirects starts with https://.",
        "Browsers warn visitors about non-secure pages and contact forms on them are not protected.",
        "Install an SSL certificate and redirect http:// to https://.",
        ["Ask your host or site builder to enable a free SSL certificate.", "Add a permanent (301) redirect from http:// to https://.", "Update internal links and your Google profile website link to https://."]),
      C("site_title", 4, "medium", "Home page has no title tag", "Pass when the home page has a non-empty <title>.",
        "The title is what appears in browser tabs and search results; without it visitors see a bare address.",
        "Add a descriptive title including your service and city.",
        ["Edit the home page SEO settings in your site builder or theme.", "Write a title such as 'Service in City | Business name'.", "Keep it readable and under about 60 characters."]),
      C("site_meta_description", 3, "low", "Home page has no meta description", "Pass when the home page has a non-empty meta description.",
        "The meta description is often shown under the title in search results and summarises the page for people deciding whether to click.",
        "Write a one or two sentence meta description.",
        ["Open the home page SEO settings.", "Summarise what you offer and where in about 150 characters.", "Save and publish."]),
      C("site_h1", 3, "medium", "Home page has no H1 heading", "Pass when the home page has at least one <h1>.",
        "A main heading tells visitors immediately what the page is about.",
        "Add one clear H1 heading to the page.",
        ["Edit the home page.", "Make the main headline a Heading 1 stating what you do and where.", "Use Heading 2/3 for subsections."]),
      C("site_viewport", 3, "medium", "Home page has no mobile viewport tag", "Pass when the home page declares a viewport meta tag.",
        "Without it, phones may show a shrunken desktop layout that is hard to read; many local customers browse on mobile.",
        "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">.",
        ["Ask your developer or theme to add the viewport meta tag in <head>.", "Test the page on a phone.", "Confirm text is readable without zooming."]),
      C("site_canonical", 2, "low", "Home page has no canonical link", "Pass when the home page declares a rel=canonical URL.",
        "A canonical link tells search engines which address is the main version when the same page is reachable several ways.",
        "Add a canonical link pointing to the preferred URL.",
        ["Add <link rel=\"canonical\" href=\"https://your-domain/\"> to the page head, or enable it in your SEO plugin.", "Use the https:// and preferred www/non-www version."]),
      C("site_noindex", 4, "high", "Page is marked noindex", "Pass when no crawled page is marked noindex or non-indexable.",
        "A noindex instruction asks search engines not to list the page, so customers will not find it via search. This is sometimes intentional.",
        "Remove noindex from pages you want customers to find.",
        ["Open the page evidence listed in the finding.", "Check the robots meta tag or the 'discourage search engines' setting in your CMS.", "Remove noindex for pages that should be public and re-run the audit."]),
      C("site_broken_links", 2, "medium", "Broken internal links found", "Pass when the crawl found no broken internal links.",
        "Visitors who hit a dead link leave, and broken links make the site look neglected.",
        "Fix or remove the broken links.",
        ["Open the pages listed in the evidence.", "Update each broken link to the correct page or remove it.", "Add redirects for pages you have moved."]),
      C("site_response_time", 0, "low", "Slow server response measured", "Informational (weight 0). Only evaluated when the crawler reports a measured response time; fails above 3000 ms for one request.",
        "A slow response can frustrate visitors on mobile data. This is a single-request measurement, not a Core Web Vitals result.",
        "Ask your host about caching and server speed.",
        ["Run PageSpeed Insights on the page for a fuller measurement.", "Enable caching/compression with your host or CDN.", "Compress large images."]),
    ] },
    { id: "local_landing_pages", label: "Local landing pages", source: "Live crawl of your website (verified)", checks: [
      C("local_city_in_title", 5, "low", "City not mentioned in any crawled page title", "Pass when at least one crawled page title contains the business city.",
        "Visitors from your area recognise a page that names their town, and it makes clear where you operate.",
        "Mention your city or service area in the title of your main service/location page.",
        ["Choose the page that best describes your service in this city.", "Include the city in its title and main heading, e.g. 'Plumber in City'.", "Only create separate city pages if you genuinely serve and have useful content for that city."]),
    ] },
    { id: "schema_markup", label: "Schema markup", source: "Live crawl of your website (verified)", checks: [
      C("schema_local_business", 10, "medium", "No LocalBusiness structured data found", "Pass when any crawled page declares a LocalBusiness-type schema.org type.",
        "Structured data states your name, address and phone in a machine-readable form so tools that read it do not have to guess.",
        "Add LocalBusiness JSON-LD with your real name, address, phone and hours.",
        ["Generate LocalBusiness JSON-LD using the exact name, address and phone from your Google profile.", "Paste it into the home page <head> or use your SEO plugin.", "Validate it with Google's Rich Results Test."]),
    ] },
  ],
};
for (const s of AUDIT_MODEL.sections) s.weight = s.checks.reduce((a, c) => a + c.weight, 0);
AUDIT_MODEL.total_weight = AUDIT_MODEL.sections.reduce((a, s) => a + s.weight, 0);

// ---------------------------------------------------------------------------------------------------------
// Input normalisation
// ---------------------------------------------------------------------------------------------------------
const str = (v) => (typeof v === "string" ? v.trim() : "");
const pass = (evidence, source, verification) => ({ status: "pass", evidence, source, verification });
const fail = (evidence, source, verification) => ({ status: "fail", evidence, source, verification });
const na = (evidence, source) => ({ status: "unavailable", evidence, source, verification: "unavailable" });

function fmtAddress(a) {
  if (!a) return "";
  if (typeof a === "string") return a.trim();
  const parts = [...(Array.isArray(a.addressLines) ? a.addressLines : []), a.line1, a.line2, a.street, a.locality, a.city, a.administrativeArea, a.state, a.postalCode, a.postal_code, a.zip]
    .map((x) => str(x)).filter(Boolean);
  return parts.join(", ");
}
function addrParts(a) {
  if (!a) return { postal: "", city: "", text: "" };
  if (typeof a === "string") {
    const m = a.match(/\b\d{5,6}\b/);
    return { postal: m ? m[0] : "", city: "", text: a.trim() };
  }
  return { postal: str(a.postalCode || a.postal_code || a.zip), city: str(a.locality || a.city), text: fmtAddress(a) };
}
function parseJson(v) { if (v == null) return null; if (typeof v === "object") return v; try { return JSON.parse(v); } catch { return null; } }

// Reads the Google Business Profile JSON in several known shapes. Returns null when no location is linked.
export function normalizeGoogle(row) {
  if (!row) return null;
  const raw = parseJson(row.raw_json);
  if (!raw || typeof raw !== "object") return null;
  const cat = (c) => (c && typeof c === "object" ? str(c.displayName || c.name) : str(c));
  const primary = cat(raw.categories?.primaryCategory) || cat(raw.primaryCategory) || cat(raw.category);
  const additional = (raw.categories?.additionalCategories || raw.additionalCategories || []).map(cat).filter(Boolean);
  const phone = str(raw.phoneNumbers?.primaryPhone || raw.primaryPhone || raw.phone);
  const hoursSrc = raw.regularHours?.periods || (Array.isArray(raw.regularHours) ? raw.regularHours : null) || (Array.isArray(raw.hours) ? raw.hours : raw.hours?.periods) || [];
  return {
    resource_name: row.google_resource_name || null,
    name: str(raw.title || raw.name || row.name),
    primary_category: primary,
    additional_categories: additional,
    phone,
    website: str(raw.websiteUri || raw.website),
    address: raw.storefrontAddress || raw.address || raw.postalAddress || parseJson(row.address_json) || null,
    description: str(raw.profile?.description || raw.description),
    hours_periods: Array.isArray(hoursSrc) ? hoursSrc : [],
  };
}

const normName = (s) => str(s).toLowerCase().replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const digits = (s) => str(s).replace(/\D/g, "");

// ---------------------------------------------------------------------------------------------------------
// Evaluators. Input: { business, google, reviews, crawl, crawl_note, website_url }
// ---------------------------------------------------------------------------------------------------------
function profileField(label, googleVal, bizVal, input) {
  const g = input.google;
  if (g) {
    if (googleVal) return pass(`Google Business Profile lists ${label}: "${googleVal}"`, GP, "verified");
    return fail(`The synced Google Business Profile has no ${label}.` + (bizVal ? ` Your business record has "${bizVal}", but it is not on the Google profile.` : ""), GP, "verified");
  }
  if (bizVal) return pass(`Your business record has ${label}: "${bizVal}". No Google location is linked, so the live profile was not checked.`, "business_record", "user_provided");
  return fail(`Your business record has no ${label}. No Google location is linked, so the live profile was not checked.`, "business_record", "user_provided");
}
const noGoogle = (what) => na(`No Google Business Profile location is linked, so ${what} cannot be read.`, GP);
const noCrawl = (input) => na(input.crawl_note || "No website was crawled.", input.website_url || "website");
const home = (input) => input.crawl?.pages?.[0];
const homeUrl = (input) => home(input)?.url || input.crawl?.final_url || input.website_url;
const siteReady = (input) => !!home(input);

const EVALUATORS = {
  profile_hours(i) {
    if (!i.google) return noGoogle("opening hours");
    const p = i.google.hours_periods;
    if (!p.length) return fail("The synced Google Business Profile has no regular opening hours.", GP, "verified");
    const bad = p.filter((x) => !x || (!x.openTime && x.openTime !== 0) || (!x.closeTime && x.closeTime !== 0) || !(x.openDay || x.day));
    if (bad.length) return fail(`${bad.length} of ${p.length} opening-hour periods on the Google profile lack a day, open time or close time.`, GP, "verified");
    const days = new Set(p.map((x) => x.openDay || x.day));
    return pass(`Google profile lists ${p.length} opening-hour periods covering ${days.size} day(s). Days not listed are shown as closed.`, GP, "verified");
  },
  profile_primary_category: (i) => profileField("a primary category", i.google?.primary_category, str(i.business.category), i),
  profile_phone: (i) => profileField("a phone number", i.google?.phone, str(i.business.phone), i),
  profile_website: (i) => profileField("a website", i.google?.website, str(i.business.website_url), i),
  profile_address(i) {
    const biz = fmtAddress(parseJson(i.business.address_json) || i.business.address_json) || str(i.business.city);
    return profileField("an address", fmtAddress(i.google?.address), biz, i);
  },
  profile_description(i) {
    if (!i.google) return noGoogle("the description");
    return i.google.description ? pass(`Google profile has a description of ${i.google.description.length} characters.`, GP, "verified")
      : fail("The synced Google Business Profile has no description.", GP, "verified");
  },
  profile_description_length(i) {
    if (!i.google) return noGoogle("the description length");
    const n = i.google.description.length;
    if (!n) return na("No description to measure (see the missing-description check).", GP);
    return n >= 100 ? pass(`Description is ${n} characters.`, GP, "verified") : fail(`Description is only ${n} characters (guideline: at least 100; Google allows 750).`, GP, "verified");
  },
  profile_secondary_categories(i) {
    if (!i.google) return noGoogle("additional categories");
    const a = i.google.additional_categories;
    return a.length ? pass(`Google profile lists ${a.length} additional categor${a.length === 1 ? "y" : "ies"}: ${a.join(", ")}.`, GP, "verified")
      : fail("The synced Google Business Profile lists no additional categories.", GP, "verified");
  },
  nap_name(i) {
    const b = str(i.business.name);
    if (!i.google || !i.google.name) return noGoogle("the business name for comparison");
    if (!b) return na("Your business record has no name to compare.", "business_record");
    return normName(b) === normName(i.google.name) ? pass(`Names match: "${b}".`, `${GP} vs business_record`, "verified")
      : fail(`Business record (user provided): "${b}". Google Business Profile (verified): "${i.google.name}".`, `${GP} vs business_record`, "verified");
  },
  nap_phone(i) {
    const b = digits(i.business.phone), g = digits(i.google?.phone);
    if (!i.google) return noGoogle("the phone number for comparison");
    if (!b || !g) return na(!g ? "The Google profile has no phone number to compare." : "Your business record has no phone number to compare.", `${GP} vs business_record`);
    return b.slice(-10) === g.slice(-10) ? pass(`Phone numbers match: ${i.business.phone}.`, `${GP} vs business_record`, "verified")
      : fail(`Business record (user provided): "${i.business.phone}". Google Business Profile (verified): "${i.google.phone}".`, `${GP} vs business_record`, "verified");
  },
  nap_address(i) {
    if (!i.google) return noGoogle("the address for comparison");
    const bRaw = parseJson(i.business.address_json) || i.business.address_json;
    const b = addrParts(bRaw), g = addrParts(i.google.address);
    if (!b.city) b.city = str(i.business.city);
    const bText = b.text || b.city, gText = g.text;
    if (!bText || !gText) return na(!gText ? "The Google profile has no address to compare." : "Your business record has no address to compare.", `${GP} vs business_record`);
    const ev = `Business record (user provided): "${bText}". Google Business Profile (verified): "${gText}".`;
    let mismatch = null;
    if (b.postal && g.postal) mismatch = b.postal.replace(/\s/g, "") !== g.postal.replace(/\s/g, "");
    else if (b.city && g.city) mismatch = normName(b.city) !== normName(g.city) && !normName(gText).includes(normName(b.city));
    if (mismatch === null) return na(`Not enough comparable address parts (need a postal code or city on both sides). ${ev}`, `${GP} vs business_record`);
    return mismatch ? fail(ev, `${GP} vs business_record`, "verified") : pass(`Addresses are consistent. ${ev}`, `${GP} vs business_record`, "verified");
  },
  review_count(i) {
    const r = i.reviews;
    if (!r || !r.count) return na("No reviews have been synced from Google yet, so the review count cannot be stated.", "google_reviews_sync");
    const avg = r.average_rating == null ? "" : `, average rating ${r.average_rating.toFixed(1)}`;
    return r.count >= 10 ? pass(`${r.count} reviews synced from Google${avg}.`, "google_reviews_sync", "verified")
      : fail(`${r.count} review${r.count === 1 ? "" : "s"} synced from Google${avg}.`, "google_reviews_sync", "verified");
  },
  review_unanswered(i) {
    const r = i.reviews;
    if (!r || !r.count) return na("No reviews have been synced from Google yet.", "google_reviews_sync");
    return r.unanswered > 0 ? fail(`${r.unanswered} of ${r.count} synced reviews have no reply recorded (reply status unanswered or unknown).`, "google_reviews_sync", "verified")
      : pass(`All ${r.count} synced reviews have a reply recorded.`, "google_reviews_sync", "verified");
  },
  site_https(i) {
    if (!siteReady(i)) return noCrawl(i);
    const u = i.crawl.final_url || home(i).url;
    return /^https:\/\//i.test(u) ? pass(`Final URL after redirects is ${u}.`, u, "verified") : fail(`Final URL after redirects is ${u}, which is not HTTPS.`, u, "verified");
  },
  site_title(i) {
    if (!siteReady(i)) return noCrawl(i);
    const p = home(i);
    return str(p.title) ? pass(`Title: "${str(p.title)}".`, p.url, "verified") : fail("The home page has no <title> text.", p.url, "verified");
  },
  site_meta_description(i) {
    if (!siteReady(i)) return noCrawl(i);
    const p = home(i);
    return str(p.description) ? pass(`Meta description present (${str(p.description).length} characters).`, p.url, "verified") : fail("The home page has no meta description.", p.url, "verified");
  },
  site_h1(i) {
    if (!siteReady(i)) return noCrawl(i);
    const p = home(i);
    return Number(p.h1_count) > 0 ? pass(`Home page has ${p.h1_count} H1 heading(s).`, p.url, "verified") : fail("The home page has no H1 heading.", p.url, "verified");
  },
  site_viewport(i) {
    if (!siteReady(i)) return noCrawl(i);
    const p = home(i);
    return p.viewport ? pass(`Viewport meta tag present: ${typeof p.viewport === "string" ? p.viewport : "yes"}.`, p.url, "verified") : fail("The home page has no viewport meta tag.", p.url, "verified");
  },
  site_canonical(i) {
    if (!siteReady(i)) return noCrawl(i);
    const p = home(i);
    return str(p.canonical) ? pass(`Canonical: ${str(p.canonical)}.`, p.url, "verified") : fail("The home page has no canonical link.", p.url, "verified");
  },
  site_noindex(i) {
    if (!siteReady(i)) return noCrawl(i);
    const bad = i.crawl.pages.filter((p) => p.indexable === false || /noindex/i.test(str(p.robots)));
    return bad.length ? fail(`${bad.length} of ${i.crawl.pages.length} crawled page(s) are noindex/non-indexable: ${bad.slice(0, 5).map((p) => p.url).join(", ")}.`, bad[0].url, "verified")
      : pass(`None of the ${i.crawl.pages.length} crawled page(s) is marked noindex.`, homeUrl(i), "verified");
  },
  site_broken_links(i) {
    if (!siteReady(i)) return noCrawl(i);
    const pages = i.crawl.pages;
    if (!pages.some((p) => typeof p.links_broken === "number")) return na("The crawler did not report broken-link counts.", homeUrl(i));
    const bad = pages.filter((p) => Number(p.links_broken) > 0);
    const total = bad.reduce((a, p) => a + Number(p.links_broken), 0);
    return bad.length ? fail(`${total} broken internal link(s) on ${bad.length} page(s): ${bad.slice(0, 5).map((p) => `${p.url} (${p.links_broken})`).join(", ")}.`, bad[0].url, "verified")
      : pass(`No broken internal links found across ${pages.length} crawled page(s).`, homeUrl(i), "verified");
  },
  site_response_time(i) {
    if (!siteReady(i)) return noCrawl(i);
    const ms = home(i).response_ms;
    if (typeof ms !== "number") return na("Response time was not measured by the crawler.", homeUrl(i));
    return ms > 3000 ? fail(`Home page responded in ${ms} ms in one measured request.`, home(i).url, "verified") : pass(`Home page responded in ${ms} ms in one measured request.`, home(i).url, "verified");
  },
  local_city_in_title(i) {
    const city = str(i.business.city);
    if (!siteReady(i)) return noCrawl(i);
    if (!city) return na("Your business record has no city to look for.", "business_record");
    const hit = i.crawl.pages.find((p) => str(p.title).toLowerCase().includes(city.toLowerCase()));
    return hit ? pass(`"${city}" appears in the title of ${hit.url}: "${str(hit.title)}".`, hit.url, "verified")
      : fail(`"${city}" does not appear in any of the ${i.crawl.pages.length} crawled page title(s).`, homeUrl(i), "verified");
  },
  schema_local_business(i) {
    if (!siteReady(i)) return noCrawl(i);
    const re = /LocalBusiness|Store|Restaurant|Dentist|Physician|LegalService|AutoRepair|HealthAndBeautyBusiness|HomeAndConstructionBusiness|ProfessionalService|MedicalBusiness|FoodEstablishment|LodgingBusiness|BeautySalon|HairSalon|Plumber|Electrician|Locksmith|RealEstateAgent/;
    const all = i.crawl.pages.flatMap((p) => (p.schema_types || []).map((t) => ({ t: String(t), url: p.url })));
    const hit = all.find((x) => re.test(x.t));
    return hit ? pass(`Schema type "${hit.t}" found on ${hit.url}.`, hit.url, "verified")
      : fail(`No LocalBusiness-type schema found on ${i.crawl.pages.length} crawled page(s).` + (all.length ? ` Types found: ${[...new Set(all.map((x) => x.t))].join(", ")}.` : " No structured data types found."), homeUrl(i), "verified");
  },
};

// ---------------------------------------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------------------------------------
export function evaluateAudit(input, now = Date.now()) {
  const checkedAt = new Date(now).toISOString();
  const checks = [], findings = [], breakdown = [];
  let availableWeight = 0, weightedNum = 0, weightedDen = 0;
  for (const s of AUDIT_MODEL.sections) {
    let points = 0, max = 0;
    for (const def of s.checks) {
      let r;
      try { r = EVALUATORS[def.code](input); } catch (e) { r = na("Check could not be evaluated: " + String(e.message || e).slice(0, 120), "audit_engine"); }
      checks.push({ code: def.code, section: s.id, weight: def.weight, status: r.status, evidence: r.evidence, source: r.source, verification: r.verification });
      if (r.status === "unavailable") continue;
      max += def.weight;
      if (r.status === "pass") points += def.weight;
      else findings.push({
        code: def.code, key: `${def.code}|${r.source}`, category: s.id, severity: def.severity, title: def.title,
        evidence: r.evidence, source: r.source, verification: r.verification, why_it_matters: def.why_it_matters,
        recommended_action: def.recommended_action, instructions: def.instructions, status: "open", checked_at: checkedAt, effort: EFFORT[def.code] || 2,
      });
    }
    availableWeight += max;
    if (max > 0) { weightedNum += s.weight * (points / max); weightedDen += s.weight; }
    breakdown.push({ section: s.id, label: s.label, weight: s.weight, points, max, available: max > 0 });
  }
  const enough = availableWeight >= MIN_AVAILABLE_RATIO * AUDIT_MODEL.total_weight && weightedDen > 0;
  const score = enough ? Math.round((100 * weightedNum) / weightedDen) : null;
  const unavailable = checks.some((c) => c.status === "unavailable" && c.weight > 0);
  return { score, state: score === null || unavailable ? "partial" : "completed", findings, checks, breakdown, available_weight: availableWeight };
}

// ---------------------------------------------------------------------------------------------------------
// 30-day plan. Findings (open only) are ordered by severity (high first), then effort (quick first), then code.
// They are packed into weeks with a capacity of PLAN_WEEK_CAPACITY effort points (1/2/3 per item); anything that
// does not fit spills into week 4. Effort values are static estimates (EFFORT above).
// ---------------------------------------------------------------------------------------------------------
export const PLAN_WEEK_CAPACITY = 6;
export function buildActionPlan(findings) {
  const open = (findings || []).filter((f) => !f.status || f.status === "open");
  const sorted = [...open].sort((a, b) =>
    (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0) ||
    (EFFORT[a.code] || a.effort || 2) - (EFFORT[b.code] || b.effort || 2) ||
    String(a.code).localeCompare(String(b.code)));
  const weeks = [1, 2, 3, 4].map((week) => ({ week, items: [] }));
  const used = [0, 0, 0, 0];
  for (const f of sorted) {
    const effort = EFFORT[f.code] || f.effort || 2;
    let w = used.findIndex((u) => u + effort <= PLAN_WEEK_CAPACITY);
    if (w === -1) w = 3;
    used[w] += effort;
    weeks[w].items.push({ ...f, effort });
  }
  return { weeks };
}

// ---------------------------------------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------------------------------------
export function csvCell(v) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // CSV/formula injection guard
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function findingsToCsv(findings) {
  const head = ["Severity", "Category", "Title", "Status", "Evidence", "Source", "Verification", "Why it matters", "Recommended action", "Instructions", "Checked at"];
  const rows = findings.map((f) => [f.severity, f.category, f.title, f.status, f.evidence, f.source, f.verification, f.why_it_matters, f.recommended_action,
    (f.instructions || []).map((s, n) => `${n + 1}. ${s}`).join(" "), f.checked_at]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------------------------------------
// Persistence + routes
// ---------------------------------------------------------------------------------------------------------
const iso = (ms) => (ms == null ? null : new Date(Number(ms)).toISOString());
function rowToFinding(r) {
  return {
    id: r.id, audit_id: r.audit_id, code: r.code, key: r.finding_key || `${r.code}|${r.source || ""}`, category: r.category, severity: r.severity, title: r.title,
    evidence: r.evidence ?? "", source: r.source ?? "", verification: r.verification || "unavailable", why_it_matters: r.explanation || "",
    recommended_action: r.recommended_fix || "", instructions: parseJson(r.instructions_json) || [], status: r.status, checked_at: iso(r.checked_at || r.created_at),
    effort: EFFORT[r.code] || 2,
  };
}
async function loadFindings(env, auditId) {
  const { results } = await env.DB.prepare("SELECT * FROM audit_issues WHERE audit_id=? ORDER BY created_at, rowid").bind(auditId).all();
  return (results || []).map(rowToFinding).sort((a, b) => (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0));
}
// Returns the audit row only if it belongs to a business the current user owns (404-style null otherwise).
async function getOwnedAudit(env, ctx, auditId) {
  if (!auditId) return null;
  const a = await env.DB.prepare("SELECT * FROM audits WHERE id=? AND audit_type='unified'").bind(auditId).first();
  if (!a) return null;
  const biz = await ctx.getUserBusiness(a.business_id);
  return biz ? a : null;
}
function auditView(a, findings) {
  const sev = { high: 0, medium: 0, low: 0, fixed: 0 };
  for (const f of findings || []) { if (f.status === "fixed") sev.fixed++; else if (f.status === "open" && sev[f.severity] !== undefined) sev[f.severity]++; }
  return { id: a.id, business_id: a.business_id, created_at: iso(a.created_at), score: a.score ?? null, state: a.status, source_url: a.source_url || null,
    findings_count: a.findings_count ?? (findings || []).length, model_version: a.model_version || null, summary: sev };
}
function validUrl(u) {
  try { const x = new URL(u); return x.protocol === "http:" || x.protocol === "https:" ? x.toString() : null; } catch { return null; }
}
let crawlerOverride = null;
export function __setCrawlerForTests(fn) { crawlerOverride = fn; } // test hook only
async function runCrawl(env, url) {
  try {
    const mod = crawlerOverride ? { crawlSite: crawlerOverride } : await import("./crawler.js");
    if (typeof mod.crawlSite !== "function") return { crawl: null, note: "Website crawler is not available, so website checks were skipped." };
    const res = await mod.crawlSite(url, { maxPages: 5, env });
    if (!res || !["completed", "partial"].includes(res.state) || !Array.isArray(res.pages) || !res.pages.length)
      return { crawl: null, note: `Website could not be crawled (${res?.state || "no result"}), so website checks were skipped.` };
    return { crawl: res, note: null };
  } catch {
    return { crawl: null, note: "Website crawl failed, so website checks were skipped." };
  }
}
const monthStart = (now) => { const d = new Date(now); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };

async function readBody(request) { try { const b = await request.json(); return b && typeof b === "object" ? b : null; } catch { return null; } }
const notFound = (ctx) => ctx.json({ error: "Not found", code: "not_found" }, 404);

async function runAudit(request, ctx) {
  const env = ctx.env;
  if (!env.DB) return ctx.json({ error: "Database unavailable" }, 503);
  const body = await readBody(request);
  if (!body?.business_id || typeof body.business_id !== "string") return ctx.json({ error: "business_id is required" }, 400);
  const business = await ctx.getUserBusiness(body.business_id);
  if (!business) return notFound(ctx);
  let websiteUrl = business.website_url ? validUrl(String(business.website_url).includes("://") ? business.website_url : "https://" + business.website_url) : null;
  if (body.website_url != null && body.website_url !== "") {
    websiteUrl = validUrl(String(body.website_url));
    if (!websiteUrl) return ctx.json({ error: "website_url must be a valid http(s) URL", code: "invalid_url" }, 400);
  }
  const rl = await ctx.rateLimit("audit-run:" + ctx.userId, 10, 3600000);
  if (!rl.ok) return ctx.json({ error: "Too many audits, try again later", code: "rate_limited" }, 429);

  const now = ctx.now();
  const ent = await getSubscriptionEntitlements(env, ctx.userId);
  const plan = AUDIT_MONTHLY_LIMITS[ent.plan_code] !== undefined ? ent.plan_code : "free";
  const limit = AUDIT_MONTHLY_LIMITS[plan];
  const used = await env.DB.prepare("SELECT COUNT(*) AS n FROM audits a JOIN businesses b ON b.id=a.business_id WHERE b.user_id=? AND a.audit_type='unified' AND a.created_at>=?").bind(ctx.userId, monthStart(now)).first();
  if (Number(used?.n || 0) >= limit) return ctx.json({ error: "Monthly audit limit reached", code: "audit_limit_reached", plan, limit, used: Number(used.n), required: plan === "free" ? "pro" : "agency" }, 403);

  const [googleRow, reviews] = await Promise.all([getGoogleLocationForBusiness(env, ctx.userId, business.id), getReviewSummary(env, ctx.userId, business.id)]);
  const google = normalizeGoogle(googleRow);
  let crawl = null, crawlNote = "No website URL is set for this business, so website checks were skipped.";
  if (websiteUrl) ({ crawl, note: crawlNote } = await runCrawl(env, websiteUrl));
  const result = evaluateAudit({ business, google, reviews, crawl, crawl_note: crawlNote, website_url: websiteUrl }, now);

  // carry-forward: previous unified audit of the same business
  const prev = await env.DB.prepare("SELECT id FROM audits WHERE business_id=? AND audit_type='unified' ORDER BY created_at DESC, rowid DESC LIMIT 1").bind(business.id).first();
  const prevMap = new Map();
  if (prev) for (const f of await loadFindings(env, prev.id)) prevMap.set(f.key, f);

  const auditId = newId("audit");
  await env.DB.prepare("INSERT INTO audits (id,business_id,audit_type,status,score,source_url,started_at,completed_at,created_at,score_breakdown_json,checks_json,findings_count,model_version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(auditId, business.id, "unified", result.state, result.score, websiteUrl, now, now, now, JSON.stringify(result.breakdown), JSON.stringify(result.checks), result.findings.length, MODEL_VERSION).run();
  for (const f of result.findings) {
    const old = prevMap.get(f.key);
    const status = old && (old.status === "fixed" || old.status === "ignored") && old.evidence === f.evidence ? old.status : "open";
    await env.DB.prepare("INSERT INTO audit_issues (id,audit_id,code,category,severity,title,explanation,evidence_json,recommended_fix,status,created_at,resolved_at,finding_key,source,verification,evidence,instructions_json,checked_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(newId("fnd"), auditId, f.code, f.category, f.severity, f.title, f.why_it_matters, JSON.stringify({ evidence: f.evidence, source: f.source }), f.recommended_action, status, now, status === "fixed" ? now : null, f.key, f.source, f.verification, f.evidence, JSON.stringify(f.instructions), now).run();
  }
  return ctx.json({ audit_id: auditId, state: result.state, score: result.score, findings_count: result.findings.length });
}

async function listAudits(request, ctx) {
  const env = ctx.env;
  if (!env.DB) return ctx.json({ error: "Database unavailable" }, 503);
  const businessId = ctx.url.searchParams.get("business_id");
  if (!businessId) return ctx.json({ error: "business_id is required" }, 400);
  if (!(await ctx.getUserBusiness(businessId))) return notFound(ctx);
  const { results } = await env.DB.prepare("SELECT * FROM audits WHERE business_id=? AND audit_type='unified' ORDER BY created_at DESC, rowid DESC LIMIT 50").bind(businessId).all();
  const { results: agg } = await env.DB.prepare("SELECT i.audit_id AS audit_id, i.severity AS severity, i.status AS status, COUNT(*) AS n FROM audit_issues i JOIN audits a ON a.id=i.audit_id WHERE a.business_id=? AND a.audit_type='unified' GROUP BY i.audit_id, i.severity, i.status").bind(businessId).all();
  const audits = (results || []).map((a) => {
    const summary = { high: 0, medium: 0, low: 0, fixed: 0 };
    for (const r of agg || []) if (r.audit_id === a.id) { if (r.status === "fixed") summary.fixed += r.n; else if (r.status === "open" && summary[r.severity] !== undefined) summary[r.severity] += r.n; }
    return { id: a.id, created_at: iso(a.created_at), score: a.score ?? null, state: a.status, summary };
  });
  return ctx.json({ audits });
}

async function auditDetail(request, ctx) {
  if (!ctx.env.DB) return ctx.json({ error: "Database unavailable" }, 503);
  const a = await getOwnedAudit(ctx.env, ctx, ctx.url.searchParams.get("id"));
  if (!a) return notFound(ctx);
  const findings = await loadFindings(ctx.env, a.id);
  const view = auditView(a, findings);
  view.checks = parseJson(a.checks_json) || [];
  return ctx.json({ audit: view, findings, score_breakdown: parseJson(a.score_breakdown_json) || [], model: { version: MODEL_VERSION, min_available_ratio: MIN_AVAILABLE_RATIO } });
}

async function findingStatus(request, ctx) {
  if (!ctx.env.DB) return ctx.json({ error: "Database unavailable" }, 503);
  const body = await readBody(request);
  if (!body?.finding_id || !["open", "fixed", "ignored"].includes(body.status)) return ctx.json({ error: "finding_id and status (open|fixed|ignored) are required" }, 400);
  const row = await ctx.env.DB.prepare("SELECT i.id AS id, a.business_id AS business_id FROM audit_issues i JOIN audits a ON a.id=i.audit_id WHERE i.id=? AND a.audit_type='unified'").bind(String(body.finding_id)).first();
  if (!row || !(await ctx.getUserBusiness(row.business_id))) return notFound(ctx);
  await ctx.env.DB.prepare("UPDATE audit_issues SET status=?, resolved_at=? WHERE id=?").bind(body.status, body.status === "fixed" ? ctx.now() : null, row.id).run();
  return ctx.json({ ok: true });
}

async function compareAudits(request, ctx) {
  if (!ctx.env.DB) return ctx.json({ error: "Database unavailable" }, 503);
  const a = await getOwnedAudit(ctx.env, ctx, ctx.url.searchParams.get("a"));
  const b = await getOwnedAudit(ctx.env, ctx, ctx.url.searchParams.get("b"));
  if (!a || !b) return notFound(ctx);
  if (a.business_id !== b.business_id) return ctx.json({ error: "Audits belong to different businesses", code: "business_mismatch" }, 400);
  const fa = await loadFindings(ctx.env, a.id), fb = await loadFindings(ctx.env, b.id);
  const ka = new Set(fa.map((f) => f.key)), kb = new Set(fb.map((f) => f.key));
  return ctx.json({
    new: fb.filter((f) => !ka.has(f.key)),
    fixed: fa.filter((f) => !kb.has(f.key)),
    unchanged: fb.filter((f) => ka.has(f.key)).length,
    score_delta: a.score == null || b.score == null ? null : b.score - a.score,
  });
}

async function exportCsv(request, ctx) {
  if (!ctx.env.DB) return ctx.json({ error: "Database unavailable" }, 503);
  const a = await getOwnedAudit(ctx.env, ctx, ctx.url.searchParams.get("id"));
  if (!a) return notFound(ctx);
  const body = findingsToCsv(await loadFindings(ctx.env, a.id));
  return new Response(body, { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="audit-${a.id.replace(/[^\w-]/g, "")}.csv"`, "Cache-Control": "no-store" } });
}

async function planRoute(request, ctx) {
  if (!ctx.env.DB) return ctx.json({ error: "Database unavailable" }, 503);
  const a = await getOwnedAudit(ctx.env, ctx, ctx.url.searchParams.get("id"));
  if (!a) return notFound(ctx);
  return ctx.json(buildActionPlan(await loadFindings(ctx.env, a.id)));
}

export const routes = [
  { method: "POST", path: "/api/audits/run", auth: "session", handler: runAudit },
  { method: "GET", path: "/api/audits", auth: "session", handler: listAudits },
  { method: "GET", path: "/api/audits/detail", auth: "session", handler: auditDetail },
  { method: "POST", path: "/api/audits/finding-status", auth: "session", handler: findingStatus },
  { method: "GET", path: "/api/audits/compare", auth: "session", handler: compareAudits },
  { method: "GET", path: "/api/audits/export.csv", auth: "session", handler: exportCsv },
  { method: "GET", path: "/api/audits/plan", auth: "session", handler: planRoute },
];
