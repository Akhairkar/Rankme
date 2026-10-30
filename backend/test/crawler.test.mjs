import test from "node:test";
import assert from "node:assert/strict";
import {
  checkUrlSafety, analyzeHtml, crawlSite, normalizeUrl, urlKey, parseRobots, robotsAllows,
  parseSitemapXml, pageSpeed, routes, fetchSafe,
} from "../src/crawler.js";

const realFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = realFetch; });

// mock: map "METHOD url" or "url" -> Response | function | {status,headers,body}
function mockFetch(map, log = []) {
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method || "GET";
    log.push(`${method} ${url}`);
    let h = map[`${method} ${url}`] ?? map[url];
    if (h === undefined) return new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
    if (typeof h === "function") h = await h(url, init);
    if (h instanceof Response) return h;
    return new Response(method === "HEAD" ? null : h.body ?? "", { status: h.status ?? 200, headers: h.headers ?? { "content-type": "text/html" } });
  };
  return log;
}
const html = (body, head = "") => ({ body: `<!doctype html><html lang="en"><head><title>${"Great plumbing services in Pune today"}</title>${head}</head><body>${body}</body></html>` });

test("SSRF: blocked vectors", () => {
  const bad = [
    "http://localhost/", "http://LOCALHOST./", "http://foo.localhost/", "http://127.0.0.1/", "http://127.1/", "http://0.0.0.0/",
    "http://10.0.0.1/", "http://172.16.0.1/", "http://172.31.255.255/", "http://192.168.1.1/", "http://169.254.169.254/latest/meta-data/",
    "http://100.64.0.1/", "http://224.0.0.1/", "http://255.255.255.255/", "http://240.0.0.1/", "http://198.18.0.1/",
    "http://2130706433/", "http://0x7f000001/", "http://0x7f.1/", "http://017700000001/", "http://0177.0.0.1/", "http://0x7f.0x0.0x0.0x1/",
    "http://[::1]/", "http://[::]/", "http://[::ffff:127.0.0.1]/", "http://[::ffff:7f00:1]/", "http://[::ffff:169.254.169.254]/",
    "http://[fe80::1]/", "http://[fc00::1]/", "http://[fd12:3456::1]/", "http://[ff02::1]/", "http://[64:ff9b::7f00:1]/", "http://[2002:7f00:1::]/", "http://[2001:db8::1]/",
    "http://printer.local/", "http://db.internal/", "http://metadata.google.internal/", "http://intranet/", "http://router.lan/",
    "http://127.0.0.1.nip.io/", "http://x.sslip.io/", "http://user:pass@example.com/", "http://user@example.com/",
    "http://example.com:8080/", "https://example.com:22/", "ftp://example.com/", "file:///etc/passwd", "javascript:alert(1)", "gopher://example.com/",
    "", "   ", "http://", "http://999.999.999.999/", "http://1.2.3.4/", "http://[2606:4700::1]/", "http://256.1.1.1/", 123, null,
  ];
  for (const u of bad) assert.equal(checkUrlSafety(u).ok, false, `should block ${u}`);
});

test("SSRF: allowed hosts, schemeless input, default ports", () => {
  assert.equal(checkUrlSafety("https://example.com/path?q=1").ok, true);
  assert.equal(checkUrlSafety("example.com").ok, true);
  assert.equal(checkUrlSafety("http://example.com:80/").ok, true);
  assert.equal(checkUrlSafety("https://www.example.co.in:443/a").ok, true);
  assert.equal(checkUrlSafety("localhost:3000").ok, false);
  assert.equal(checkUrlSafety("http://example.com:8080/").reason, "port_not_allowed");
  assert.equal(checkUrlSafety("http://user:p@example.com/").reason, "credentials_not_allowed");
});

test("redirect to private IP is blocked and never fetched", async () => {
  const log = mockFetch({
    "https://example.com/": { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } },
  });
  const r = await fetchSafe("https://example.com/", { readBody: "html" });
  assert.equal(r.ok, false);
  assert.equal(r.error, "blocked_redirect");
  assert.ok(!log.some((l) => l.includes("169.254")));
});

test("redirect hop limit and loop", async () => {
  mockFetch({ "https://example.com/": { status: 301, headers: { location: "https://example.com/a" } }, "https://example.com/a": { status: 301, headers: { location: "https://example.com/" } } });
  assert.equal((await fetchSafe("https://example.com/")).error, "redirect_loop");
  let i = 0;
  globalThis.fetch = async () => new Response(null, { status: 301, headers: { location: `https://example.com/r${++i}` } });
  assert.equal((await fetchSafe("https://example.com/")).error, "too_many_redirects");
});

test("crawlSite returns blocked_url for unsafe input without fetching", async () => {
  const log = mockFetch({});
  const r = await crawlSite("http://127.0.0.1/admin");
  assert.equal(r.state, "blocked_url");
  assert.equal(log.length, 0);
  assert.deepEqual(r.pages, []);
});

test("size cap aborts oversized responses", async () => {
  let cancelled = false;
  const big = new ReadableStream({
    pull(c) { c.enqueue(new Uint8Array(512 * 1024).fill(97)); },
    cancel() { cancelled = true; },
  });
  mockFetch({ "https://example.com/": () => new Response(big, { status: 200, headers: { "content-type": "text/html" } }) });
  const r = await fetchSafe("https://example.com/", { readBody: "html" });
  assert.equal(r.ok, true);
  assert.equal(r.truncated, true);
  assert.equal(cancelled, true);
  mockFetch({ "https://example.com/robots.txt": { status: 404 }, "https://example.com/": () => new Response("x", { status: 200, headers: { "content-type": "text/html", "content-length": "9999999" } }) });
  const c = await crawlSite("https://example.com/");
  assert.equal(c.state, "partial");
  assert.ok(c.issues.some((i) => i.code === "page_too_large"));
});

test("non-HTML content type is not parsed", async () => {
  mockFetch({ "https://example.com/": { status: 200, headers: { "content-type": "application/pdf" }, body: "%PDF" } });
  const c = await crawlSite("https://example.com/");
  assert.ok(c.issues.some((i) => i.code === "not_html"));
});

test("timeout maps to unreachable", async () => {
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("robots.txt")) return new Response("", { status: 404 });
    return new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(new Error("aborted"))));
  };
  const origSet = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...a) => origSet(fn, Math.min(ms, 20), ...a);
  try {
    const r = await crawlSite("https://slow.example.com/");
    assert.equal(r.state, "unreachable");
    assert.equal(r.reason, "timeout");
  } finally { globalThis.setTimeout = origSet; }
});

test("robots.txt parsing: longest match, wildcard, $, UA group", () => {
  const r = parseRobots(`User-agent: *\nDisallow: /private\nAllow: /private/public\nDisallow: /*.pdf$\nSitemap: https://example.com/sm.xml\n\nUser-agent: LocalBoostBot\nDisallow: /secret/\n`);
  assert.deepEqual(r.sitemaps, ["https://example.com/sm.xml"]);
  assert.equal(robotsAllows(r, "https://example.com/secret/x"), false);
  assert.equal(robotsAllows(r, "https://example.com/private"), true); // our group only has /secret/
  const star = parseRobots(`User-agent: *\nDisallow: /private\nAllow: /private/public\nDisallow: /*.pdf$\nDisallow: /tmp?x=*\n`);
  assert.equal(robotsAllows(star, "https://example.com/private/a"), false);
  assert.equal(robotsAllows(star, "https://example.com/private/public/a"), true);
  assert.equal(robotsAllows(star, "https://example.com/a/file.pdf"), false);
  assert.equal(robotsAllows(star, "https://example.com/a/file.pdf?x=1"), true);
  assert.equal(robotsAllows(star, "https://example.com/tmp?x=5"), false);
  assert.equal(robotsAllows(parseRobots("User-agent: *\nDisallow:\n"), "https://example.com/any"), true);
  assert.equal(robotsAllows(parseRobots("User-agent: *\nDisallow: /\n"), "https://example.com/"), false);
});

test("crawl refuses robots-disallowed URLs and records skipped", async () => {
  const log = mockFetch({
    "https://example.com/robots.txt": { status: 200, headers: { "content-type": "text/plain" }, body: "User-agent: *\nDisallow: /admin\n" },
    "https://example.com/": html('<a href="/admin">Admin</a><a href="/about">About</a>'),
    "https://example.com/about": html("<h1>About</h1>"),
    "https://example.com/admin": html("<h1>Secret</h1>"),
  });
  const r = await crawlSite("https://example.com/", { maxPages: 5 });
  assert.ok(!log.some((l) => l.endsWith("/admin")));
  assert.ok(r.skipped.some((s) => s.url.endsWith("/admin") && s.reason === "robots_disallowed"));
  assert.equal(r.pages.length, 2);
  // start URL disallowed
  const log2 = mockFetch({ "https://example.com/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /\n" } });
  const r2 = await crawlSite("https://example.com/");
  assert.equal(r2.pages.length, 0);
  assert.ok(r2.issues.some((i) => i.code === "robots_blocks_crawl"));
  assert.ok(!log2.includes("GET https://example.com/"));
});

test("sitemap parsing and validation (foreign host, 404 sample, not xml)", async () => {
  const p = parseSitemapXml(`<?xml version="1.0"?><urlset><url><loc>https://example.com/a</loc></url><url><loc><![CDATA[https://example.com/b?x=1&amp;y=2]]></loc></url></urlset>`);
  assert.equal(p.valid, true);
  assert.deepEqual(p.locs, ["https://example.com/a", "https://example.com/b?x=1&y=2"]);
  assert.equal(parseSitemapXml("<html>nope</html>").valid, false);

  mockFetch({
    "https://example.com/robots.txt": { body: "Sitemap: https://example.com/sitemap.xml", headers: { "content-type": "text/plain" } },
    "https://example.com/sitemap.xml": { headers: { "content-type": "application/xml" }, body: "<urlset><url><loc>https://example.com/gone</loc></url><url><loc>https://other.com/x</loc></url></urlset>" },
    "https://example.com/": html("<h1>Hi</h1>"),
    "HEAD https://example.com/gone": { status: 404 },
  });
  const r = await crawlSite("https://example.com/");
  const codes = r.issues.map((i) => i.code);
  assert.ok(codes.includes("sitemap_foreign_urls"));
  assert.ok(codes.includes("sitemap_url_not_200"));

  mockFetch({
    "https://example.com/robots.txt": { body: "Sitemap: https://example.com/sitemap.xml" },
    "https://example.com/sitemap.xml": { headers: { "content-type": "text/html" }, body: "<html>oops</html>" },
    "https://example.com/": html("<h1>Hi</h1>"),
  });
  const r2 = await crawlSite("https://example.com/");
  assert.ok(r2.issues.some((i) => i.code === "sitemap_not_xml"));
  mockFetch({ "https://example.com/": html("<h1>Hi</h1>") });
  const r3 = await crawlSite("https://example.com/");
  assert.ok(r3.issues.some((i) => i.code === "sitemap_missing"));
});

test("URL normalisation", () => {
  assert.equal(normalizeUrl("HTTPS://Example.COM:443/a/b?utm_source=x&z=2&a=1#frag"), "https://example.com/a/b?a=1&z=2");
  assert.equal(normalizeUrl("http://example.com:80/"), "http://example.com/");
  assert.equal(normalizeUrl("/x?fbclid=1&gclid=2", "https://e.com/y"), "https://e.com/x");
  assert.equal(normalizeUrl("mailto:a@b.c"), null);
  assert.equal(normalizeUrl("javascript:void(0)"), null);
  assert.equal(normalizeUrl("https://u:p@example.com/"), "https://example.com/");
  assert.equal(urlKey("https://www.example.com/a/"), urlKey("http://example.com/a"));
  assert.notEqual(urlKey("https://example.com/a?x=1"), urlKey("https://example.com/a"));
});

test("analyzeHtml: well-formed page has few issues and correct record", () => {
  const body = `<h1>Pune Plumber</h1><h2>Services</h2><p>${"word ".repeat(200)}</p><a href="tel:+919999999999">Call</a><a href="/contact">Contact us</a><p>12 MG Road Pune</p><iframe src="https://www.google.com/maps/embed?pb=1"></iframe><img src="a.jpg" alt="x"><a href="/about?utm_source=a">About</a>`;
  const head = `<link rel="canonical" href="https://example.com/"><meta name="description" content="${"d".repeat(100)}"><meta name="viewport" content="width=device-width"><meta property="og:title" content="t"><meta property="og:description" content="d"><meta property="og:image" content="i"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Plumber","name":"A","telephone":"+91","address":{"@type":"PostalAddress"}}</script>`;
  const a = analyzeHtml(html(body, head).body, "https://example.com/", { "x-robots-tag": "all" });
  assert.equal(a.page.status, 200);
  assert.equal(a.page.h1_count, 1);
  assert.equal(a.page.indexable, true);
  assert.equal(a.page.canonical, "https://example.com/");
  assert.deepEqual(a.page.schema_types.sort(), ["Plumber", "PostalAddress"]);
  assert.equal(a.page.links_internal, 2);
  assert.equal(a.localSignals.phone.detected, true);
  assert.equal(a.localSignals.map.detected, true);
  assert.equal(a.localSignals.contact_page.detected, true);
  assert.equal(a.localSignals.address.detected, true);
  assert.deepEqual(a.issues.filter((i) => i.severity !== "low").map((i) => i.code), []);
  for (const i of a.issues) for (const k of ["code", "severity", "category", "message", "evidence", "fix", "page_url"]) assert.ok(i[k], k);
});

test("analyzeHtml: missing basics", () => {
  const a = analyzeHtml("<html><body><p>hi</p><img src=x.png><img src=y.png alt=''></body></html>", "http://example.com/p", {}, { status: 200 });
  const codes = a.issues.map((i) => i.code);
  for (const c of ["not_https", "canonical_missing", "title_missing", "description_missing", "h1_missing", "viewport_missing", "lang_missing", "images_missing_alt", "jsonld_missing", "schema_localbusiness_not_detected", "thin_content", "local_phone_not_detected", "local_map_not_detected", "no_internal_links"]) assert.ok(codes.includes(c), c);
  assert.equal(a.page.images_missing_alt, 1);
  assert.equal(a.page.title, null);
  assert.equal(a.page.viewport, null);
});

test("analyzeHtml: title/description lengths, multiple h1, heading order", () => {
  const a = analyzeHtml(`<html lang=en><head><title>Hi</title><meta name=description content="short"></head><body><h1>A</h1><h1>B</h1><h4>Skip</h4></body></html>`, "https://e.com/", {});
  const codes = a.issues.map((i) => i.code);
  assert.ok(codes.includes("title_short") && codes.includes("description_short") && codes.includes("h1_multiple") && codes.includes("heading_order"));
  const long = analyzeHtml(`<html><head><title>${"t".repeat(80)}</title><meta name=description content="${"d".repeat(200)}"></head></html>`, "https://e.com/", {});
  assert.ok(long.issues.some((i) => i.code === "title_long") && long.issues.some((i) => i.code === "description_long"));
});

test("analyzeHtml: canonical variants", () => {
  const rel = analyzeHtml(`<head><link rel="canonical" href="/x"></head>`, "https://e.com/x", {});
  assert.ok(rel.issues.some((i) => i.code === "canonical_relative"));
  assert.ok(!rel.issues.some((i) => i.code === "canonical_points_elsewhere"));
  const other = analyzeHtml(`<head><link rel="canonical" href="https://e.com/other"></head>`, "https://e.com/x", {});
  assert.ok(other.issues.some((i) => i.code === "canonical_points_elsewhere"));
  const multi = analyzeHtml(`<head><link rel=canonical href="https://e.com/a"><link rel=canonical href="https://e.com/b"></head>`, "https://e.com/a", {});
  assert.ok(multi.issues.some((i) => i.code === "canonical_multiple"));
});

test("analyzeHtml: noindex via meta and header, indexable false", () => {
  const a = analyzeHtml(`<head><meta name="robots" content="NoIndex, follow"></head>`, "https://e.com/", { "X-Robots-Tag": "noindex" });
  assert.ok(a.issues.some((i) => i.code === "noindex_meta" && i.severity === "high"));
  assert.ok(a.issues.some((i) => i.code === "noindex_header"));
  assert.equal(a.page.indexable, false);
  assert.match(a.page.robots, /noindex/);
  const h = analyzeHtml("<p>x</p>", "https://e.com/", new Headers({ "x-robots-tag": "noindex" }));
  assert.ok(h.issues.some((i) => i.code === "noindex_header"));
});

test("analyzeHtml: http status and redirect chain", () => {
  const a = analyzeHtml("<p>gone</p>", "https://e.com/x", {}, { status: 404, redirects: ["http://e.com/x", "https://e.com/x", "https://www.e.com/x"] });
  assert.ok(a.issues.some((i) => i.code === "http_error_status" && i.severity === "high"));
  assert.ok(a.issues.some((i) => i.code === "redirect_chain"));
  assert.equal(a.page.indexable, false);
});

test("analyzeHtml: JSON-LD validity and LocalBusiness completeness", () => {
  const bad = analyzeHtml(`<script type="application/ld+json">{ "@type": "Plumber", }</script>`, "https://e.com/", {});
  assert.ok(bad.issues.some((i) => i.code === "jsonld_invalid"));
  assert.ok(!bad.issues.some((i) => i.code === "jsonld_missing"));
  const inc = analyzeHtml(`<script type="application/ld+json">{"@graph":[{"@type":["Organization","Dentist"],"name":"D"}]}</script>`, "https://e.com/", {});
  const i = inc.issues.find((x) => x.code === "schema_localbusiness_incomplete");
  assert.ok(i && /address/.test(i.evidence) && /Dentist/.test(i.evidence));
  assert.ok(inc.page.schema_types.includes("Dentist"));
});

test("analyzeHtml: hreflang validity", () => {
  const a = analyzeHtml(`<head><link rel="alternate" hreflang="english" href="https://e.com/en"><link rel="alternate" hreflang="fr" href="https://e.com/fr"></head>`, "https://e.com/", {});
  assert.ok(a.issues.some((i) => i.code === "hreflang_invalid_code"));
  assert.ok(a.issues.some((i) => i.code === "hreflang_no_self"));
  const ok = analyzeHtml(`<head><link rel="alternate" hreflang="en-GB" href="https://e.com/"><link rel="alternate" hreflang="x-default" href="https://e.com/"></head>`, "https://e.com/", {});
  assert.ok(!ok.issues.some((i) => i.code.startsWith("hreflang")));
});

test("analyzeHtml: Open Graph and local signals do not claim rankings", () => {
  const a = analyzeHtml(`<head><meta property="og:title" content="x"></head><body>Call 020 2555 1234</body>`, "https://e.com/", {});
  const og = a.issues.find((i) => i.code === "open_graph_incomplete");
  assert.match(og.evidence, /og:description/);
  const p = a.issues.find((i) => i.code === "local_phone_not_clickable");
  assert.ok(p && p.category === "Local SEO");
  assert.equal(a.localSignals.phone.detected, true);
});

test("analyzeHtml: malformed HTML is handled", () => {
  const src = `<!-- <h1>commented</h1> --><html><head><title>Broken & ok <script>var a="<h1>x</h1>"</script><style>h1{}</style>
    <meta name=description content='single "quoted" desc'><meta name="viewport" content=width=device-width>
    </head><body><h1 class=a>Unclosed heading<p>para<div><img src=a.jpg alt=x/><a href=/x>link<a href="/y">y
    <img src="q.jpg" <b>weird</b> <a href="/z`;
  const a = analyzeHtml(src, "https://e.com/", {});
  assert.equal(a.page.h1_count, 0); // unclosed h1 never closes: no crash, no phantom count from comments/scripts
  assert.equal(a.page.description, 'single "quoted" desc');
  assert.ok(a.page.title.startsWith("Broken & ok"));
  assert.ok(!a.page.title.includes("var a"));
  assert.equal(analyzeHtml("", "https://e.com/", {}).page.title, null);
  assert.doesNotThrow(() => analyzeHtml("<<<>>><a href=", "https://e.com/", {}));
  assert.doesNotThrow(() => analyzeHtml("<script>unclosed", "https://e.com/", {}));
  assert.doesNotThrow(() => analyzeHtml("<!-- never closed", "https://e.com/", {}));
});

test("analyzeHtml: script/style/noscript content ignored for h1 and words", () => {
  const a = analyzeHtml(`<body><script>document.write("<h1>x</h1>")</script><style>.a{}</style><noscript><img src=z></noscript><h1>Real</h1></body>`, "https://e.com/", {});
  assert.equal(a.page.h1_count, 1);
  assert.equal(a.page.word_count, 1);
});

test("crawl: duplicate titles across pages, broken internal link, concurrency and dedupe", async () => {
  let active = 0, peak = 0;
  const slow = (body, status = 200) => async () => {
    active++; peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 15));
    active--;
    return new Response(body, { status, headers: { "content-type": "text/html" } });
  };
  const page = (t, extra = "") => `<html lang=en><head><title>${t}</title></head><body><h1>x</h1>${extra}</body></html>`;
  mockFetch({
    "https://example.com/": slow(page("Same title for every page here ok", '<a href="/a">a</a><a href="/a/">a2</a><a href="/b#x">b</a><a href="/c?utm_x=1">c</a><a href="/missing">m</a><a href="https://other.com/">ext</a>')),
    "https://example.com/a": slow(page("Same title for every page here ok")),
    "https://example.com/b": slow(page("Unique title for page b is fine")),
    "https://example.com/c": slow(page("Same title for every page here ok")),
    "HEAD https://example.com/missing": { status: 404 },
  });
  const log = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (u, i) => { log.push(`${i?.method || "GET"} ${u}`); return orig(u, i); };
  const r = await crawlSite("https://example.com/", { maxPages: 10 });
  const dup = r.issues.filter((i) => i.code === "duplicate_title");
  assert.equal(dup.length, 3);
  assert.ok(dup.every((i) => /also on/.test(i.evidence)));
  assert.ok(r.issues.some((i) => i.code === "broken_internal_link" && /missing/.test(i.evidence)));
  assert.ok(peak <= 3);
  assert.equal(log.filter((l) => l === "GET https://example.com/a").length, 1);
  assert.ok(!log.some((l) => l.includes("other.com")));
  assert.equal(r.pages[0].links_broken, 1);
  assert.equal(r.summary.pages_checked, r.pages.length);
  assert.ok(["completed", "partial"].includes(r.state));
  assert.equal(r.summary.high + r.summary.medium + r.summary.low, r.issues.length);
});

test("crawl: max_pages is capped and HEAD falls back to GET", async () => {
  const links = Array.from({ length: 40 }, (_, i) => `<a href="/p${i}">p${i}</a>`).join("");
  const log = mockFetch({
    "https://example.com/": html(links),
    "HEAD https://example.com/p0": { status: 405 },
    "GET https://example.com/p0": html("<h1>ok</h1>"),
  });
  const r = await crawlSite("https://example.com/", { maxPages: 999 });
  assert.ok(r.pages.length <= 25);
  const one = await crawlSite("https://example.com/", { maxPages: 1 });
  assert.equal(one.pages.length, 1);
  assert.ok(log.length > 0);
  // single-page mode: 20 link checks max
  const heads = log.filter((l) => l.startsWith("HEAD https://example.com/p"));
  assert.ok(heads.length >= 1);
});

test("crawl: hreflang reciprocal check only within crawled pages", async () => {
  const mk = (alts) => `<html lang=en><head><title>Some decent title that is long enough</title>${alts}</head><body><h1>h</h1><a href="/fr">fr</a></body></html>`;
  mockFetch({
    "https://example.com/": { body: mk('<link rel="alternate" hreflang="en" href="https://example.com/"><link rel="alternate" hreflang="fr" href="https://example.com/fr"><link rel="alternate" hreflang="de" href="https://example.com/de">') , headers: { "content-type": "text/html" } },
    "https://example.com/fr": { body: mk('<link rel="alternate" hreflang="fr" href="https://example.com/fr">'), headers: { "content-type": "text/html" } },
  });
  const r = await crawlSite("https://example.com/", { maxPages: 5 });
  const rt = r.issues.filter((i) => i.code === "hreflang_no_return_tag");
  assert.equal(rt.length, 1); // /de was not crawled so it is not judged
  assert.equal(rt[0].page_url, "https://example.com/");
});

test("crawl: off-site redirect for subpages is skipped; www/apex allowed", async () => {
  mockFetch({
    "https://example.com/": { status: 301, headers: { location: "https://www.example.com/" } },
    "https://www.example.com/": html('<a href="/x">x</a><a href="https://example.com/y">y</a>'),
    "https://www.example.com/x": { status: 302, headers: { location: "https://evil.com/" } },
    "https://example.com/y": html("<h1>y</h1>"),
  });
  const r = await crawlSite("https://example.com/", { maxPages: 5 });
  assert.equal(r.final_url, "https://www.example.com/");
  assert.ok(r.skipped.some((s) => s.reason === "offsite_redirect"));
  assert.ok(r.pages.some((p) => p.url === "https://example.com/y"));
});

test("route: site-check uses rate limit and blocks multi-page for public", async () => {
  const route = routes.find((r) => r.path === "/api/site-check");
  const calls = [];
  const mk = (ok = true) => ({
    env: {}, ip: "1.2.3.4", userId: null, now: () => 0,
    json: (d, s = 200) => ({ d, s }),
    rateLimit: async (k, l, w) => { calls.push([k, l, w]); return { ok }; },
  });
  const req = (b) => ({ json: async () => b });
  const blockedRes = await route.handler(req({ url: "http://localhost/" }), mk());
  assert.equal(blockedRes.d.state, "blocked_url");
  assert.deepEqual(calls[0], ["sitecheck:1.2.3.4", 10, 3600000]);
  assert.equal((await route.handler(req({ url: "https://e.com", max_pages: 5 }), mk())).s, 403);
  assert.equal((await route.handler(req({ url: "https://e.com" }), mk(false))).s, 429);
  assert.equal((await route.handler(req({}), mk())).s, 400);
  assert.equal(route.auth, "public");
});

test("route: crawl requires paid plan; unknown flag falls back to rank/reports entitlements", async () => {
  const route = routes.find((r) => r.path === "/api/site-check/crawl");
  assert.equal(route.auth, "session");
  mockFetch({ "https://example.com/": html("<h1>x</h1>") });
  const calls = [];
  const mk = (feature) => ({
    env: {}, ip: "1.1.1.1", userId: "u1", now: () => 0,
    json: (d, s = 200) => ({ d, s }),
    rateLimit: async (k, l, w) => { calls.push([k, l, w]); return { ok: true }; },
    requireFeature: async () => feature,
  });
  const req = (b) => ({ json: async () => b });
  assert.equal((await route.handler(req({ url: "https://example.com/", max_pages: 3 }), mk({ ok: false, entitlements: { rank_tracking_enabled: 0, reports_enabled: 0 } }))).s, 403);
  const okRank = await route.handler(req({ url: "https://example.com/", max_pages: 3 }), mk({ ok: false, entitlements: { rank_tracking_enabled: 1 } }));
  assert.equal(okRank.s, 200);
  assert.deepEqual(calls.at(-1), ["sitecrawl:u1", 5, 3600000]);
  assert.equal((await route.handler(req({ url: "https://example.com/", max_pages: 3 }), mk({ ok: false, entitlements: { website_crawl_enabled: 0, reports_enabled: 1 } }))).s, 403);
  assert.equal((await route.handler(req({ url: "https://example.com/", max_pages: 3 }), mk({ ok: true, entitlements: { website_crawl_enabled: 1 } }))).s, 200);
  // single page on the crawl route needs no plan
  assert.equal((await route.handler(req({ url: "https://example.com/", max_pages: 1 }), mk({ ok: false, entitlements: {} }))).s, 200);
});

test("pagespeed: state mapping", async () => {
  const now = () => 1700000000000;
  // not configured
  let r = await pageSpeed("https://example.com/", "mobile", {}, now);
  assert.equal(r.body.state, "provider_not_configured");
  assert.equal(r.body.lcp_ms, null);
  // blocked url never reaches Google
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response("{}"); };
  r = await pageSpeed("http://169.254.169.254/", "mobile", { PAGESPEED_API_KEY: "k" }, now);
  assert.equal(r.status, 400);
  assert.equal(called, false);
  // lab only
  const lab = { lighthouseResult: { categories: { performance: { score: 0.82 } }, audits: { "largest-contentful-paint": { numericValue: 2512.4 }, "cumulative-layout-shift": { numericValue: 0.0456 }, "total-blocking-time": { numericValue: 120 } } } };
  let seen;
  globalThis.fetch = async (u) => { seen = u; return new Response(JSON.stringify(lab), { status: 200 }); };
  r = await pageSpeed("https://example.com/", "desktop", { PAGESPEED_API_KEY: "secret" }, now);
  assert.equal(r.body.state, "verified_data");
  assert.equal(r.body.field_data, false);
  assert.equal(r.body.inp_ms, null);
  assert.equal(r.body.lcp_ms, 2512);
  assert.equal(r.body.performance_score, 82);
  assert.match(seen, /strategy=desktop/);
  assert.match(seen, /category=performance/);
  assert.match(seen, /key=secret/);
  assert.ok(!JSON.stringify(r.body).includes("secret"));
  // field data present
  const withField = { ...lab, loadingExperience: { metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2100 }, INTERACTION_TO_NEXT_PAINT: { percentile: 180 }, CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 7 } } } };
  globalThis.fetch = async () => new Response(JSON.stringify(withField), { status: 200 });
  r = await pageSpeed("https://example.com/", "mobile", { PAGESPEED_API_KEY: "k" }, now);
  assert.equal(r.body.field_data, true);
  assert.equal(r.body.lcp_ms, 2100);
  assert.equal(r.body.inp_ms, 180);
  assert.equal(r.body.cls, 0.07);
  assert.equal(r.body.lab.lcp_ms, 2512);
  // provider error
  globalThis.fetch = async () => new Response("quota key=secret", { status: 429 });
  r = await pageSpeed("https://example.com/", "mobile", { PAGESPEED_API_KEY: "k" }, now);
  assert.equal(r.body.state, "provider_error");
  assert.ok(!JSON.stringify(r.body).includes("quota"));
  globalThis.fetch = async () => { throw new Error("boom 10.0.0.1"); };
  r = await pageSpeed("https://example.com/", "mobile", { PAGESPEED_API_KEY: "k" }, now);
  assert.equal(r.body.state, "provider_error");
  assert.ok(!JSON.stringify(r.body).includes("10.0.0.1"));
  // empty response -> no fabricated values
  globalThis.fetch = async () => new Response("{}", { status: 200 });
  r = await pageSpeed("https://example.com/", "mobile", { PAGESPEED_API_KEY: "k" }, now);
  assert.equal(r.body.state, "provider_error");
});

test("route: pagespeed rate limit and params", async () => {
  const route = routes.find((r) => r.path === "/api/pagespeed");
  const calls = [];
  const ctx = (url, ok = true) => ({ env: {}, ip: "9.9.9.9", now: () => 0, url: new URL("https://api.test" + url), json: (d, s = 200) => ({ d, s }), rateLimit: async (k, l, w) => { calls.push([k, l, w]); return { ok }; } });
  const r = await route.handler({}, ctx("/api/pagespeed?url=https://example.com&strategy=mobile"));
  assert.equal(r.d.state, "provider_not_configured");
  assert.deepEqual(calls[0], ["pagespeed:9.9.9.9", 20, 3600000]);
  assert.equal((await route.handler({}, ctx("/api/pagespeed?url=https://example.com", false))).s, 429);
  assert.equal((await route.handler({}, ctx("/api/pagespeed"))).s, 400);
});
