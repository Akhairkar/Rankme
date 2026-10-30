// LocalBoost server-side website SEO crawler + PageSpeed proxy.
// Contract: docs/API-CONTRACT.md ("crawler"). Exports: routes, crawlSite, checkUrlSafety, analyzeHtml.
//
// SECURITY NOTES
// - SSRF: every URL (input, every redirect Location, every probed link, every sitemap URL, and the
//   URL forwarded to Google PageSpeed) passes checkUrlSafety(): http/https only, no credentials,
//   ports 80/443 only, no localhost/.local/.internal/single-label names, no IP literal in a
//   private/loopback/link-local/CGNAT/multicast/reserved range (IPv4 incl. decimal/hex/octal
//   encodings, IPv6 incl. IPv4-mapped / NAT64 / 6to4). Public IP literals are refused too: only
//   real hostnames are crawled.
// - RESIDUAL RISK (DNS rebinding): Cloudflare Workers cannot pin or inspect DNS answers, so a public
//   hostname that resolves to a private address cannot be detected here. This is mitigated because
//   Workers' fetch() cannot reach private/loopback ranges or the Cloudflare network internals, and
//   by the name-based blocks above (wildcard-DNS services such as nip.io are denied).
// - Redirects are followed manually (max 5 hops) and each hop is re-validated.
// - Errors returned to clients are fixed codes/messages; no stack traces, IPs or credentials.
//
// PLAN GATING (multi-page): ctx.requireFeature("website_crawl_enabled"). If that flag is not present in
// the entitlements object at all (unknown flag), paid-only is defined as the plan having
// rank_tracking_enabled or reports_enabled. Single page checks are free.

export const BOT_UA = "LocalBoostBot/1.0 (+https://www.localboost.in/bot)";
const MAX_BYTES = 1.5 * 1024 * 1024;
const REQ_TIMEOUT_MS = 8000;
const MAX_HOPS = 5;
const MAX_DEPTH = 3;
const HARD_MAX_PAGES = 25;
const CONCURRENCY = 3;
const LINK_CHECKS_PER_PAGE = 20;
const LINK_CHECKS_PER_CRAWL = 60;
const SITEMAP_SAMPLE = 10;

// ---------------------------------------------------------------------------------------------
// URL safety (SSRF)
// ---------------------------------------------------------------------------------------------

const BLOCKED_SUFFIXES = [
  "localhost", "local", "internal", "localdomain", "lan", "home", "corp", "intranet", "private",
  "home.arpa", "in-addr.arpa", "ip6.arpa", "onion",
  // wildcard-DNS services that map names to arbitrary (incl. private) IPs
  "nip.io", "sslip.io", "xip.io", "localtest.me", "lvh.me", "traefik.me", "vcap.me",
];

function ipv4InBlockedRange(n) {
  const a = (n >>> 24) & 255, b = (n >>> 16) & 255, c = (n >>> 8) & 255;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 192 && b === 88 && c === 99) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

const NUMERIC_PART = /^(0x[0-9a-f]*|\d+)$/i;

// inet_aton style IPv4 (1-4 parts, decimal/hex/octal). Returns a number, NaN when it looks numeric
// but is malformed, or null when the host is not numeric at all.
function parseLooseIPv4(host) {
  if (host.endsWith(".")) host = host.slice(0, -1);
  const parts = host.split(".");
  if (parts.length > 4 || !parts.every((p) => NUMERIC_PART.test(p))) {
    return NUMERIC_PART.test(parts[parts.length - 1]) ? NaN : null;
  }
  const vals = [];
  for (const p of parts) {
    let v;
    if (/^0x/i.test(p)) v = p.length === 2 ? 0 : parseInt(p.slice(2), 16);
    else if (/^0\d+$/.test(p)) v = /^[0-7]+$/.test(p) ? parseInt(p, 8) : NaN;
    else v = parseInt(p, 10);
    if (!Number.isFinite(v)) return NaN;
    vals.push(v);
  }
  const last = vals.pop();
  if (vals.some((v) => v > 255)) return NaN;
  if (last >= Math.pow(256, 4 - vals.length)) return NaN;
  let n = 0;
  vals.forEach((v, i) => { n += v * Math.pow(256, 3 - i); });
  return (n + last) >>> 0;
}

function parseIPv6(host) {
  let h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h.includes("%")) return null;
  let tail = [];
  const m = h.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (m) {
    const v4 = parseLooseIPv4(m[2]);
    if (typeof v4 !== "number" || Number.isNaN(v4)) return null;
    tail = [(v4 >>> 16) & 0xffff, v4 & 0xffff];
    h = m[1] + "0:0";
  }
  const dbl = h.split("::");
  if (dbl.length > 2) return null;
  const parse = (s) => (s === "" ? [] : s.split(":"));
  const head = parse(dbl[0]);
  const rest = dbl.length === 2 ? parse(dbl[1]) : [];
  let groups;
  if (dbl.length === 2) {
    const fill = 8 - head.length - rest.length;
    if (fill < 1) return null;
    groups = [...head, ...Array(fill).fill("0"), ...rest];
  } else groups = head;
  if (groups.length !== 8) return null;
  const out = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  if (out.some(Number.isNaN)) return null;
  if (tail.length) { out[6] = tail[0]; out[7] = tail[1]; }
  return out;
}

function ipv6Blocked(g) {
  const v4 = (hi, lo) => ((hi << 16) | lo) >>> 0;
  if (g.every((x) => x === 0)) return true; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return ipv4InBlockedRange(v4(g[6], g[7])); // mapped
  if (g.slice(0, 6).every((x) => x === 0)) return true; // IPv4-compatible (deprecated)
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return ipv4InBlockedRange(v4(g[6], g[7])); // NAT64
  if (g[0] === 0x2002) return ipv4InBlockedRange(v4(g[1], g[2])); // 6to4
  if (g[0] === 0x2001 && (g[1] === 0 || g[1] === 0xdb8)) return true; // teredo, documentation
  if ((g[0] & 0xe000) !== 0x2000) return true; // only global unicast 2000::/3 is allowed
  return false;
}

const blocked = (reason) => ({ ok: false, reason });

export function checkUrlSafety(raw) {
  if (typeof raw !== "string" || !raw.trim() || raw.length > 2048) return blocked("invalid_url");
  let s = raw.trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s) || /^[a-z0-9.-]+:\d+(\/|$)/i.test(s)) s = "https://" + s.replace(/^\/+/, "");
  let u;
  try { u = new URL(s); } catch { return blocked("invalid_url"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") return blocked("unsupported_protocol");
  if (u.username || u.password) return blocked("credentials_not_allowed");
  if (!u.hostname) return blocked("invalid_url");
  if (u.port && u.port !== "80" && u.port !== "443") return blocked("port_not_allowed");
  let host = u.hostname.toLowerCase();
  if (host.startsWith("[")) {
    const g = parseIPv6(host);
    if (!g || ipv6Blocked(g)) return blocked("private_address");
    return blocked("ip_literal_not_allowed");
  }
  while (host.endsWith(".")) host = host.slice(0, -1);
  if (!host) return blocked("invalid_url");
  const n = parseLooseIPv4(host);
  if (n !== null) {
    if (Number.isNaN(n) || ipv4InBlockedRange(n)) return blocked("private_address");
    return blocked("ip_literal_not_allowed");
  }
  if (!host.includes(".")) return blocked("internal_hostname");
  for (const suf of BLOCKED_SUFFIXES) {
    if (host === suf || host.endsWith("." + suf)) return blocked("internal_hostname");
  }
  return { ok: true, url: u };
}

// ---------------------------------------------------------------------------------------------
// URL normalisation
// ---------------------------------------------------------------------------------------------

const TRACKING = /^(utm_.*|fbclid|gclid|msclkid|dclid|yclid|igshid|mc_cid|mc_eid|_ga|_gl|ref_src)$/i;

// Resolves href against base; http(s) only; strips fragment, credentials and tracking params, sorts
// the remaining params, lowercases the host and removes default ports (the URL class does the last
// two). The trailing slash is preserved (servers may be slash sensitive); urlKey() collapses it for
// de-duplication, and also ignores a leading "www." and the scheme.
export function normalizeUrl(href, base) {
  let u;
  try { u = new URL(String(href).trim(), base); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  u.username = ""; u.password = "";
  const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k));
  params.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) : a[0] < b[0] ? -1 : 1));
  u.search = "";
  if (params.length) u.search = "?" + params.map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");
  return u.toString();
}

export function urlKey(href, base) {
  const n = normalizeUrl(href, base);
  if (!n) return null;
  const u = new URL(n);
  let p = u.pathname;
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return u.hostname.replace(/^www\./, "") + p + u.search;
}

// Same-site approximation without a public-suffix list: same host ignoring a leading "www.".
export function sameSite(a, b) {
  const h = (x) => String(x).toLowerCase().replace(/^www\./, "");
  return h(a) === h(b);
}

// ---------------------------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------------------------

function patternToRegex(p) {
  const anchored = p.endsWith("$");
  const body = (anchored ? p.slice(0, -1) : p).split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp("^" + body + (anchored ? "$" : ""));
}

export function parseRobots(text) {
  const groups = [];
  const sitemaps = [];
  let cur = null;
  let lastWasAgent = false;
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase().split("/")[0]);
      lastWasAgent = true;
    } else if (key === "allow" || key === "disallow") {
      lastWasAgent = false;
      if (cur && val !== "") cur.rules.push({ allow: key === "allow", pattern: val });
    } else if (key === "sitemap") {
      if (/^https?:\/\//i.test(val)) sitemaps.push(val);
    } else lastWasAgent = false;
  }
  const mine = groups.filter((g) => g.agents.includes("localboostbot"));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  const rules = chosen.flatMap((g) => g.rules).map((r) => ({ ...r, re: patternToRegex(r.pattern) }));
  return { rules, sitemaps };
}

// Longest matching pattern wins; on a tie Allow wins. No matching rule = allowed.
export function robotsAllows(robots, urlStr) {
  if (!robots || !robots.rules || !robots.rules.length) return true;
  let u;
  try { u = new URL(urlStr); } catch { return false; }
  const path = u.pathname + u.search;
  let best = null;
  for (const r of robots.rules) {
    if (!r.re.test(path)) continue;
    if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow && !best.allow)) best = r;
  }
  return best ? best.allow : true;
}

// ---------------------------------------------------------------------------------------------
// Safe fetch
// ---------------------------------------------------------------------------------------------

async function readCapped(response, maxBytes) {
  const len = Number(response.headers.get("content-length"));
  if (Number.isFinite(len) && len > maxBytes) {
    try { await response.body?.cancel(); } catch { /* ignore */ }
    return { text: "", truncated: true, bytes: len };
  }
  const reader = response.body && response.body.getReader ? response.body.getReader() : null;
  if (!reader) {
    const t = await response.text();
    if (t.length > maxBytes) return { text: t.slice(0, maxBytes), truncated: true, bytes: t.length };
    return { text: t, truncated: false, bytes: t.length };
  }
  const dec = new TextDecoder("utf-8", { fatal: false });
  let total = 0, text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch { /* ignore */ }
      return { text, truncated: true, bytes: total };
    }
    text += dec.decode(value, { stream: true });
  }
  text += dec.decode();
  return { text, truncated: false, bytes: total };
}

const HTML_TYPE = /^(text\/html|application\/xhtml\+xml)\b/i;

// opts: method, readBody ("html" | "text" | false), accept, maxBytes, state {used,budget},
//       isAllowed(url), sameSiteWith (host: a redirect leaving the site -> error offsite_redirect).
// Returns {ok:false, error, chain} or {ok:true, status, headers, finalUrl, chain, text, truncated, notHtml}
export async function fetchSafe(rawUrl, opts = {}) {
  const { method = "GET", readBody = false, maxBytes = MAX_BYTES, state, isAllowed, sameSiteWith } = opts;
  let current = rawUrl;
  const chain = [];
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const safe = checkUrlSafety(current);
    if (!safe.ok) return { ok: false, error: hop === 0 ? "blocked_url" : "blocked_redirect", reason: safe.reason, chain };
    const target = safe.url.toString();
    if (hop > 0 && sameSiteWith && !sameSite(safe.url.hostname, sameSiteWith)) return { ok: false, error: "offsite_redirect", chain };
    if (isAllowed && !isAllowed(target)) return { ok: false, error: "robots_disallowed", chain };
    if (chain.includes(target)) return { ok: false, error: "redirect_loop", chain };
    if (state) {
      if (state.used >= state.budget) return { ok: false, error: "budget_exhausted", chain };
      state.used++;
    }
    chain.push(target);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQ_TIMEOUT_MS);
    try {
      const res = await fetch(target, {
        method,
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": BOT_UA, accept: opts.accept || "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" },
      });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get("location");
        try { await res.body?.cancel(); } catch { /* ignore */ }
        if (!loc) return { ok: true, status: res.status, headers: res.headers, finalUrl: target, chain, text: "", truncated: false };
        try { current = new URL(loc, target).toString(); } catch { return { ok: false, error: "bad_redirect", chain }; }
        continue;
      }
      const out = { ok: true, status: res.status, headers: res.headers, finalUrl: target, chain, text: "", truncated: false, notHtml: false };
      if (readBody && method !== "HEAD") {
        const ct = res.headers.get("content-type") || "";
        if (readBody === "html" && !HTML_TYPE.test(ct)) {
          out.notHtml = true;
          try { await res.body?.cancel(); } catch { /* ignore */ }
        } else {
          const r = await readCapped(res, maxBytes);
          out.text = r.text; out.truncated = r.truncated; out.bytes = r.bytes;
          if (r.truncated) controller.abort();
        }
      } else {
        try { await res.body?.cancel(); } catch { /* ignore */ }
      }
      return out;
    } catch {
      return { ok: false, error: controller.signal.aborted ? "timeout" : "network_error", chain };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, error: "too_many_redirects", chain };
}

// ---------------------------------------------------------------------------------------------
// HTML scanner (hand written; tolerant of comments, raw text elements, unclosed tags, quoting)
// ---------------------------------------------------------------------------------------------

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-", rsquo: "'", lsquo: "'" };
export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m; } catch { return m; }
    }
    const v = ENT[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}

const RAW_TEXT = new Set(["script", "style", "textarea", "title"]);
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

function* scan(html) {
  const n = html.length;
  let i = 0;
  const closeRe = /<\/([a-zA-Z][a-zA-Z0-9:-]*)[^>]*>/y;
  const openRe = /<([a-zA-Z][a-zA-Z0-9:-]*)/y;
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt === -1) { yield { t: "text", s: html.slice(i) }; return; }
    if (lt > i) yield { t: "text", s: html.slice(i, lt) };
    if (html.startsWith("<!--", lt)) {
      const e = html.indexOf("-->", lt + 4);
      if (e === -1) return; // unterminated comment swallows the rest
      i = e + 3; continue;
    }
    const c = html[lt + 1];
    if (c === "!" || c === "?") {
      const e = html.indexOf(">", lt);
      if (e === -1) return;
      i = e + 1; continue;
    }
    if (c === "/") {
      closeRe.lastIndex = lt;
      const m = closeRe.exec(html);
      if (m) { yield { t: "close", name: m[1].toLowerCase() }; i = lt + m[0].length; }
      else { yield { t: "text", s: "<" }; i = lt + 1; }
      continue;
    }
    openRe.lastIndex = lt;
    const m = openRe.exec(html);
    if (!m) { yield { t: "text", s: "<" }; i = lt + 1; continue; }
    const name = m[1].toLowerCase();
    let p = lt + m[0].length;
    const attrs = {};
    let selfClose = false, ended = false;
    while (p < n) {
      const ch = html[p];
      if (ch === ">") { p++; ended = true; break; }
      if (ch === "/") { if (html[p + 1] === ">") selfClose = true; p++; continue; }
      if (/\s/.test(ch)) { p++; continue; }
      let q = p;
      while (q < n && !/[\s=>/]/.test(html[q])) q++;
      if (q === p) { p++; continue; } // stray '='
      const an = html.slice(p, q).toLowerCase();
      p = q;
      while (p < n && /\s/.test(html[p])) p++;
      let val = "";
      if (html[p] === "=") {
        p++;
        while (p < n && /\s/.test(html[p])) p++;
        const qc = html[p];
        if (qc === '"' || qc === "'") {
          const e = html.indexOf(qc, p + 1);
          if (e === -1) { p = n; break; } // unterminated quote: tag is dropped
          val = html.slice(p + 1, e); p = e + 1;
        } else {
          let e = p;
          while (e < n && !/[\s>]/.test(html[e])) e++;
          val = html.slice(p, e); p = e;
        }
      }
      if (!(an in attrs)) attrs[an] = decodeEntities(val);
    }
    if (!ended) return; // unclosed tag at EOF is dropped
    i = p;
    if (RAW_TEXT.has(name) && !selfClose) {
      const re = new RegExp("</" + name + "[\\s/>]", "gi");
      re.lastIndex = i;
      const mm = re.exec(html);
      let content, next;
      if (mm) { content = html.slice(i, mm.index); const gt = html.indexOf(">", mm.index); next = gt === -1 ? n : gt + 1; }
      else if (name === "title") { const nx = html.indexOf("<", i); content = html.slice(i, nx === -1 ? n : nx); next = nx === -1 ? n : nx; }
      else { content = html.slice(i); next = n; }
      yield { t: "open", name, attrs, raw: content };
      yield { t: "close", name };
      i = next;
      continue;
    }
    yield { t: "open", name, attrs, selfClose: selfClose || VOID.has(name) };
  }
}

// ---------------------------------------------------------------------------------------------
// analyzeHtml
// ---------------------------------------------------------------------------------------------

const LOCAL_BUSINESS_TYPES = new Set([
  "LocalBusiness", "Restaurant", "Dentist", "Physician", "MedicalClinic", "Hospital", "Pharmacy", "Store",
  "AutoRepair", "AutoDealer", "BeautySalon", "HairSalon", "DaySpa", "HealthClub", "SportsActivityLocation",
  "Plumber", "Electrician", "HVACBusiness", "RoofingContractor", "HomeAndConstructionBusiness", "GeneralContractor", "Locksmith",
  "MovingCompany", "LegalService", "Attorney", "Notary", "AccountingService", "FinancialService", "InsuranceAgency",
  "RealEstateAgent", "TravelAgency", "Hotel", "LodgingBusiness", "BedAndBreakfast", "Motel", "Resort", "CafeOrCoffeeShop",
  "BarOrPub", "Bakery", "FastFoodRestaurant", "FoodEstablishment", "GroceryStore", "ClothingStore", "ElectronicsStore",
  "FurnitureStore", "HardwareStore", "JewelryStore", "PetStore", "Florist", "BookStore", "ShoppingCenter", "Library",
  "ChildCare", "DryCleaningOrLaundry", "EmploymentAgency", "ProfessionalService", "Optician", "VeterinaryCare",
  "AnimalShelter", "AutoBodyShop", "AutoWash", "GasStation", "ParkingFacility", "TouristInformationCenter",
  "EntertainmentBusiness", "SelfStorage", "TattooParlor", "NailSalon", "Winery", "Brewery", "Distillery", "IceCreamShop",
  "MedicalBusiness", "Dermatology", "Physiotherapy", "TireShop", "MotorcycleDealer", "AutoPartsStore", "HousePainter",
]);

function hdr(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === "function") return headers.get(name);
  const k = Object.keys(headers).find((x) => x.toLowerCase() === name.toLowerCase());
  return k ? String(headers[k]) : null;
}

function collectTypes(node, out, depth = 0) {
  if (!node || depth > 8) return;
  if (Array.isArray(node)) { node.forEach((x) => collectTypes(x, out, depth + 1)); return; }
  if (typeof node !== "object") return;
  const t = node["@type"];
  const list = typeof t === "string" ? [t] : Array.isArray(t) ? t.filter((x) => typeof x === "string") : [];
  for (const x of list) out.push({ type: x.replace(/^.*[/#]/, ""), node });
  for (const k of Object.keys(node)) if (k !== "@context") collectTypes(node[k], out, depth + 1);
}

const trunc = (s, n = 120) => (String(s).length > n ? String(s).slice(0, n) + "..." : String(s));

const ADDRESS_RE = /\b\d{1,5}[A-Za-z]?(?:[-/]\d+)?,?\s+(?:[A-Za-z0-9.'-]+\s+){0,4}(?:Street|St\.?|Road|Rd\.?|Avenue|Ave\.?|Lane|Ln\.?|Drive|Dr\.?|Boulevard|Blvd\.?|Highway|Hwy|Nagar|Marg|Sector|Colony|Way|Court|Ct\.?|Place|Pl\.?)(?![A-Za-z])/;
const PHONE_RE = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,5}\)[\s.-]?|\d{2,5}[\s.-])\d{3,5}[\s.-]?\d{3,5}/;

// meta: {status=200, redirects:[urls], local:boolean (default true: emit local SEO issues)}
// returns {page, issues, internalLinks, hreflang, localSignals}
export function analyzeHtml(html, pageUrl, headers, meta = {}) {
  const status = meta.status == null ? 200 : meta.status;
  const issues = [];
  const add = (code, severity, category, message, evidence, fix) =>
    issues.push({ code, severity, category, message, evidence, fix, page_url: pageUrl });
  const local = meta.local !== false;
  let pu;
  try { pu = new URL(pageUrl); } catch { pu = null; }

  let title = null, titleSeen = false, desc = null;
  const canonicals = [];
  const robotsMeta = [];
  let viewport = null, lang = null;
  const headings = [];
  let imgTotal = 0, imgMissingAlt = 0;
  const imgMissingSrc = [];
  const og = {};
  const hreflang = [];
  const jsonld = [];
  const jsonldErrors = [];
  const internalLinks = [];
  const telLinks = [];
  const mapFrames = [];
  let contactLink = null;
  let inHead = false, skip = 0;
  const textBuf = [];
  let curHeading = null;
  let anchor = null;

  for (const tk of scan(html || "")) {
    if (tk.t === "text") {
      if (curHeading) curHeading.text += tk.s;
      if (anchor) anchor.text += tk.s;
      if (!skip && !inHead) textBuf.push(decodeEntities(tk.s));
      continue;
    }
    if (tk.t === "close") {
      if (tk.name === "head") inHead = false;
      if (["noscript", "template", "svg"].includes(tk.name) && skip > 0) skip--;
      if (/^h[1-6]$/.test(tk.name) && curHeading) { headings.push({ level: curHeading.level, text: decodeEntities(curHeading.text).replace(/\s+/g, " ").trim() }); curHeading = null; }
      if (tk.name === "a" && anchor) {
        if (!contactLink && /contact|find us|visit us|get in touch|location|reach us/i.test(anchor.text + " " + anchor.href)) contactLink = anchor.href;
        anchor = null;
      }
      continue;
    }
    const { name, attrs } = tk;
    switch (name) {
      case "html": if (attrs.lang !== undefined) lang = attrs.lang.trim(); break;
      case "head": inHead = true; break;
      case "body": inHead = false; break;
      case "title":
        if (!titleSeen) { titleSeen = true; title = decodeEntities(tk.raw || "").replace(/\s+/g, " ").trim(); }
        break;
      case "meta": {
        const nm = (attrs.name || "").toLowerCase();
        const prop = (attrs.property || "").toLowerCase();
        const content = attrs.content;
        if (nm === "description" && desc === null && content !== undefined) desc = content.replace(/\s+/g, " ").trim();
        else if (nm === "robots" || nm === "googlebot") { if (content) robotsMeta.push(content.toLowerCase()); }
        else if (nm === "viewport" && content !== undefined) viewport = content.trim();
        else if (prop.startsWith("og:") && content !== undefined && !(prop in og)) og[prop] = content.trim();
        break;
      }
      case "link": {
        const rel = (attrs.rel || "").toLowerCase().split(/\s+/);
        if (rel.includes("canonical")) canonicals.push(attrs.href === undefined ? "" : attrs.href.trim());
        if (rel.includes("alternate") && attrs.hreflang !== undefined) hreflang.push({ code: attrs.hreflang.trim(), href: (attrs.href || "").trim() });
        break;
      }
      case "script": {
        const type = (attrs.type || "").toLowerCase().split(";")[0].trim();
        if (type === "application/ld+json") {
          const raw = (tk.raw || "").trim();
          try { jsonld.push(JSON.parse(raw)); } catch { jsonldErrors.push(trunc(raw, 80)); }
        }
        break;
      }
      case "noscript": case "template": case "svg": if (!tk.selfClose) skip++; break;
      case "img":
        imgTotal++;
        if (attrs.alt === undefined) { imgMissingAlt++; if (imgMissingSrc.length < 3) imgMissingSrc.push(trunc(attrs.src || attrs["data-src"] || "(no src)", 100)); }
        break;
      case "iframe": {
        const src = attrs.src || attrs["data-src"] || "";
        if (/google\.[a-z.]+\/maps|maps\.google\.|openstreetmap\.org|bing\.com\/maps|maps\.app\.goo\.gl|mapbox\.com/i.test(src)) mapFrames.push(trunc(src, 100));
        break;
      }
      case "a": {
        const href = attrs.href;
        if (href !== undefined) {
          const h = href.trim();
          if (/^tel:/i.test(h)) telLinks.push(h);
          else if (pu && !/^(mailto:|javascript:|sms:|data:|#)/i.test(h)) {
            const abs = normalizeUrl(h, pageUrl);
            if (abs && sameSite(new URL(abs).hostname, pu.hostname)) internalLinks.push(abs);
          }
          anchor = { href: h, text: "" };
        }
        break;
      }
      default:
        if (/^h[1-6]$/.test(name)) curHeading = { level: Number(name[1]), text: "" };
    }
  }
  const bodyText = textBuf.join(" ").replace(/\s+/g, " ").trim();
  const wordCount = bodyText ? bodyText.split(" ").filter((w) => /[\p{L}\p{N}]/u.test(w)).length : 0;
  const uniqMap = new Map();
  for (const l of internalLinks) { const k = urlKey(l); if (!uniqMap.has(k)) uniqMap.set(k, l); }
  const uniqInternal = [...uniqMap.values()];

  // --- robots / indexability
  const xrobots = hdr(headers, "x-robots-tag");
  const robotsAll = [...robotsMeta, ...(xrobots ? [xrobots.toLowerCase()] : [])];
  const robotsStr = robotsAll.length ? robotsAll.join(", ") : null;
  const metaNoindex = robotsMeta.some((r) => /\b(noindex|none)\b/.test(r));
  const headerNoindex = !!xrobots && /\b(noindex|none)\b/i.test(xrobots);
  if (metaNoindex) add("noindex_meta", "high", "Indexing", "Page is blocked from indexing by a robots meta tag.", `meta robots: "${trunc(robotsMeta.join(", "))}"`, "Remove noindex from the robots meta tag (or set content=\"index, follow\") if this page should appear in Google.");
  if (headerNoindex) add("noindex_header", "high", "Indexing", "Page is blocked from indexing by an X-Robots-Tag HTTP header.", `X-Robots-Tag: ${trunc(xrobots)}`, "Remove noindex from the X-Robots-Tag header in your server/CDN configuration for this URL.");

  // --- status / https / redirects
  if (status >= 400) add("http_error_status", "high", "Technical SEO", `Page returned HTTP ${status}.`, `HTTP status ${status}`, status >= 500 ? "Fix the server error so the URL returns 200 and keep it stable." : "Restore the page, or 301-redirect the URL to the closest relevant live page and update links pointing here.");
  else if (status >= 300) add("http_redirect_status", "low", "Technical SEO", `Page responded with HTTP ${status} without a usable destination.`, `HTTP status ${status}`, "Return the content with HTTP 200, or provide a valid Location header.");
  if (pu && pu.protocol !== "https:") add("not_https", "high", "Technical SEO", "Page is served over HTTP, not HTTPS.", `URL scheme: ${pu.protocol.replace(":", "")}`, "Install a TLS certificate and 301-redirect all http:// URLs to their https:// equivalents.");
  const chain = meta.redirects || [];
  if (chain.length >= 3) add("redirect_chain", "medium", "Technical SEO", `Request passed through ${chain.length - 1} redirects before reaching the page.`, chain.map((x) => trunc(x, 100)).join(" -> "), "Redirect the original URL directly to the final destination with a single 301.");

  // --- canonical
  let canonicalAbs = null;
  if (canonicals.length === 0) add("canonical_missing", "medium", "Technical SEO", "No canonical link tag found.", "<link rel=\"canonical\"> not present", `Add <link rel="canonical" href="${pageUrl}"> in the <head>.`);
  else {
    const raw = canonicals[0];
    if (canonicals.length > 1 && new Set(canonicals).size > 1) add("canonical_multiple", "medium", "Technical SEO", "Multiple conflicting canonical tags found.", canonicals.map((c) => trunc(c, 80)).join(" | "), "Keep exactly one canonical tag per page.");
    if (!raw) add("canonical_empty", "medium", "Technical SEO", "Canonical tag has an empty href.", "<link rel=\"canonical\" href=\"\">", `Set href to the absolute preferred URL, e.g. ${pageUrl}.`);
    else {
      if (!/^https?:\/\//i.test(raw)) add("canonical_relative", "low", "Technical SEO", "Canonical URL is relative; absolute URLs are recommended.", `canonical href: "${trunc(raw)}"`, "Use a full absolute URL including https:// and the domain in the canonical tag.");
      canonicalAbs = normalizeUrl(raw, pageUrl);
      if (!canonicalAbs) add("canonical_invalid", "medium", "Technical SEO", "Canonical URL is not a valid http(s) URL.", `canonical href: "${trunc(raw)}"`, "Set the canonical to a valid absolute URL of this page.");
      else if (urlKey(canonicalAbs) !== urlKey(pageUrl)) add("canonical_points_elsewhere", "medium", "Indexing", "Canonical points to a different URL, so this page may not be indexed itself.", `page: ${trunc(pageUrl, 100)} canonical: ${trunc(canonicalAbs, 100)}`, "If this page should rank on its own, change the canonical to its own URL; otherwise confirm the canonical target is intended.");
    }
  }

  // --- title
  if (title === null || title === "") add("title_missing", "high", "On-page SEO", "Page has no <title> text.", title === null ? "<title> not present" : "<title> is empty", "Add a unique title of 30-60 characters containing the main service and city.");
  else if (title.length < 30) add("title_short", "low", "On-page SEO", "Title is short and may under-describe the page.", `${title.length} characters: "${trunc(title)}"`, "Expand the title to roughly 30-60 characters with the main service and location.");
  else if (title.length > 60) add("title_long", "low", "On-page SEO", "Title is longer than about 60 characters and may be truncated in results.", `${title.length} characters: "${trunc(title)}"`, "Shorten the title to 60 characters or fewer, putting the key terms first.");

  // --- description
  if (desc === null || desc === "") add("description_missing", "medium", "On-page SEO", "Page has no meta description.", desc === null ? "meta description not present" : "meta description is empty", "Add a unique meta description of 70-160 characters summarising the page and a call to action.");
  else if (desc.length < 70) add("description_short", "low", "On-page SEO", "Meta description is short.", `${desc.length} characters`, "Expand the meta description to 70-160 characters.");
  else if (desc.length > 160) add("description_long", "low", "On-page SEO", "Meta description is longer than about 160 characters and may be cut off.", `${desc.length} characters`, "Shorten the meta description to 160 characters or fewer.");

  // --- headings
  const h1s = headings.filter((h) => h.level === 1);
  if (h1s.length === 0) add("h1_missing", "medium", "On-page SEO", "Page has no H1 heading.", "No <h1> element found", "Add one H1 that describes the page topic, ideally including the service and city.");
  else if (h1s.length > 1) add("h1_multiple", "low", "On-page SEO", "Page has more than one H1 heading.", `${h1s.length} H1s: ` + h1s.slice(0, 3).map((h) => `"${trunc(h.text, 50)}"`).join(", "), "Keep a single H1 and demote the others to H2/H3.");
  for (let i = 1; i < headings.length; i++) {
    if (headings[i].level > headings[i - 1].level + 1) {
      add("heading_order", "low", "On-page SEO", "Heading levels skip a level.", `h${headings[i - 1].level} "${trunc(headings[i - 1].text, 40)}" is followed by h${headings[i].level} "${trunc(headings[i].text, 40)}"`, `Use h${headings[i - 1].level + 1} instead of h${headings[i].level} so headings nest without gaps.`);
      break;
    }
  }

  // --- images
  if (imgMissingAlt > 0) add("images_missing_alt", "medium", "On-page SEO", `${imgMissingAlt} of ${imgTotal} images have no alt attribute.`, imgMissingSrc.join(", "), "Add a short descriptive alt attribute to each meaningful image (use alt=\"\" for purely decorative ones).");

  // --- viewport / lang
  if (viewport === null) add("viewport_missing", "medium", "Technical SEO", "No viewport meta tag, so the page may not render correctly on mobile.", "meta viewport not present", "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> to the <head>.");
  if (!lang) add("lang_missing", "low", "Technical SEO", "The <html> element has no lang attribute.", lang === null ? "<html lang> not present" : "lang is empty", "Add lang=\"en\" (or the correct language code) to the <html> tag.");

  // --- hreflang (reciprocity is checked across crawled pages in crawlSite)
  if (hreflang.length) {
    const bad = hreflang.filter((h) => !/^(x-default|[a-z]{2,3}(-[a-z]{4})?(-([a-z]{2}|\d{3}))?)$/i.test(h.code));
    if (bad.length) add("hreflang_invalid_code", "medium", "Technical SEO", "hreflang contains invalid language/region codes.", bad.slice(0, 3).map((h) => `"${trunc(h.code, 20)}"`).join(", "), "Use ISO 639-1 language codes with optional ISO 3166-1 region (e.g. en-GB) or x-default.");
    const hrefs = hreflang.map((h) => normalizeUrl(h.href, pageUrl));
    if (hrefs.some((h) => !h)) add("hreflang_invalid_url", "medium", "Technical SEO", "An hreflang annotation has an invalid URL.", hreflang.filter((h, i) => !hrefs[i]).slice(0, 3).map((h) => `"${trunc(h.href, 60)}"`).join(", "), "Use absolute URLs in every hreflang link.");
    if (!hrefs.some((h) => h && urlKey(h) === urlKey(pageUrl))) add("hreflang_no_self", "medium", "Technical SEO", "hreflang set does not include this page itself.", `${hreflang.length} alternates, none pointing to ${trunc(pageUrl, 80)}`, "Add a self-referencing hreflang link for this page's own language/region.");
  }

  // --- JSON-LD
  const types = [];
  jsonld.forEach((j) => collectTypes(j, types));
  const schemaTypes = [...new Set(types.map((t) => t.type))];
  if (jsonldErrors.length) add("jsonld_invalid", "medium", "On-page SEO", `${jsonldErrors.length} JSON-LD block(s) contain invalid JSON.`, `Parse error in: ${jsonldErrors[0]}`, "Fix the JSON syntax (quotes, commas, braces) and validate it with Google's Rich Results Test.");
  const lb = types.filter((t) => LOCAL_BUSINESS_TYPES.has(t.type));
  if (local) {
    if (jsonld.length === 0 && jsonldErrors.length === 0) add("jsonld_missing", "low", "On-page SEO", "No JSON-LD structured data detected.", "No <script type=\"application/ld+json\"> found", "Add JSON-LD structured data describing the page (for local businesses use LocalBusiness or a subtype).");
    if (lb.length === 0) add("schema_localbusiness_not_detected", "low", "Local SEO", "No LocalBusiness structured data detected.", schemaTypes.length ? `Types found: ${schemaTypes.slice(0, 6).join(", ")}` : "No schema types found", "Add LocalBusiness (or a more specific subtype) JSON-LD with name, address, telephone and opening hours.");
    else {
      const node = lb[0].node;
      const missing = ["name", "address", "telephone"].filter((k) => !node[k]);
      if (missing.length) add("schema_localbusiness_incomplete", "low", "Local SEO", "LocalBusiness structured data is missing recommended properties.", `${lb[0].type} detected; missing: ${missing.join(", ")}`, `Add the missing ${missing.join(", ")} propert${missing.length > 1 ? "ies" : "y"} to the ${lb[0].type} JSON-LD.`);
    }
  }

  // --- Open Graph
  const ogMissing = ["og:title", "og:description", "og:image"].filter((k) => !og[k]);
  if (ogMissing.length) add("open_graph_incomplete", "low", "On-page SEO", "Open Graph tags are incomplete, so link previews may look poor.", `missing: ${ogMissing.join(", ")}`, `Add ${ogMissing.map((m) => `<meta property="${m}" content="...">`).join(", ")} in the <head>.`);

  // --- links / content
  if (uniqInternal.length === 0) add("no_internal_links", "low", "Technical SEO", "No internal links found on the page.", "0 internal <a href> links", "Link to your key service, contact and location pages from this page.");
  if (wordCount < 150 && status < 400) add("thin_content", "low", "On-page SEO", "Page has little visible text.", `${wordCount} words of visible text`, "Add useful, specific content (services, areas served, FAQs); several hundred words is typical for service pages.");

  // --- local signals: detected / not detected (evidence only, no ranking claims)
  const addrM = bodyText.match(ADDRESS_RE);
  const schemaAddr = lb.find((t) => t.node.address);
  const phoneText = bodyText.match(PHONE_RE);
  const schemaPhone = lb.find((t) => t.node.telephone);
  const localSignals = {
    phone: telLinks.length ? { detected: true, evidence: `tel: link ${trunc(telLinks[0], 40)}` }
      : schemaPhone ? { detected: true, evidence: `JSON-LD telephone ${trunc(String(schemaPhone.node.telephone), 30)}` }
      : phoneText && phoneText[0].replace(/\D/g, "").length >= 8 ? { detected: true, evidence: `phone-like text "${trunc(phoneText[0].trim(), 30)}" (no tel: link)` }
      : { detected: false, evidence: "no tel: link, JSON-LD telephone or phone-like text found" },
    address: addrM ? { detected: true, evidence: `address-like text "${trunc(addrM[0], 80)}"` }
      : schemaAddr ? { detected: true, evidence: "JSON-LD address property" }
      : { detected: false, evidence: "no street-address-like text or JSON-LD address found" },
    contact_page: contactLink ? { detected: true, evidence: `link to ${trunc(contactLink, 80)}` } : { detected: false, evidence: "no link with contact/location wording found" },
    map: mapFrames.length ? { detected: true, evidence: `embedded map iframe ${mapFrames[0]}` } : { detected: false, evidence: "no map iframe (Google Maps/OpenStreetMap/Bing/Mapbox) found" },
  };
  if (local) {
    if (!localSignals.phone.detected) add("local_phone_not_detected", "low", "Local SEO", "No phone number detected on this page.", localSignals.phone.evidence, "Show your business phone number as a clickable tel: link, matching the number on your Google Business Profile.");
    else if (!telLinks.length) add("local_phone_not_clickable", "low", "Local SEO", "A phone number was detected as text but there is no clickable tel: link.", localSignals.phone.evidence, "Wrap the phone number in <a href=\"tel:+...\"> so mobile visitors can tap to call.");
    if (!localSignals.address.detected) add("local_address_not_detected", "low", "Local SEO", "No street address detected on this page.", localSignals.address.evidence, "Show your full business address as text on the page, consistent with your Google Business Profile.");
    if (!localSignals.contact_page.detected) add("local_contact_link_not_detected", "low", "Local SEO", "No link to a contact or location page detected.", localSignals.contact_page.evidence, "Add a visible link to a Contact page with address, phone and hours.");
    if (!localSignals.map.detected) add("local_map_not_detected", "low", "Local SEO", "No embedded map detected on this page.", localSignals.map.evidence, "Embed a Google Map of your location on the contact or location page.");
  }

  const page = {
    url: pageUrl,
    status,
    title,
    description: desc,
    h1_count: h1s.length,
    canonical: canonicalAbs || (canonicals[0] ? canonicals[0] : null),
    robots: robotsStr,
    indexable: status === 200 && !metaNoindex && !headerNoindex,
    word_count: wordCount,
    images_missing_alt: imgMissingAlt,
    links_internal: uniqInternal.length,
    links_broken: null,
    schema_types: schemaTypes,
    viewport,
  };
  return { page, issues, internalLinks: uniqInternal, hreflang, localSignals };
}

// ---------------------------------------------------------------------------------------------
// Sitemap
// ---------------------------------------------------------------------------------------------

export function parseSitemapXml(text) {
  const t = String(text || "");
  const isIndex = /<sitemapindex[\s>]/i.test(t);
  const isUrlset = /<urlset[\s>]/i.test(t);
  const locs = [];
  const re = /<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(t))) locs.push(decodeEntities(m[1]));
  return { valid: isIndex || isUrlset, isIndex, locs };
}

// ---------------------------------------------------------------------------------------------
// Crawl
// ---------------------------------------------------------------------------------------------

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (idx < items.length) { const i = idx++; out[i] = await fn(items[i], i); }
  });
  await Promise.all(workers);
  return out;
}

// HEAD first, GET fallback (some servers reject HEAD).
async function probe(url, state, isAllowed) {
  let r = await fetchSafe(url, { method: "HEAD", state, isAllowed });
  if (!r.ok || [403, 405, 501].includes(r.status)) {
    if (!r.ok && ["blocked_url", "blocked_redirect", "robots_disallowed", "budget_exhausted"].includes(r.error)) return { status: null, error: r.error };
    const g = await fetchSafe(url, { method: "GET", state, isAllowed });
    if (g.ok || !r.ok) r = g;
  }
  return r.ok ? { status: r.status, error: null, finalUrl: r.finalUrl } : { status: null, error: r.error };
}

function summarize(issues, pagesChecked) {
  const s = { high: 0, medium: 0, low: 0, pages_checked: pagesChecked };
  for (const i of issues) s[i.severity]++;
  return s;
}

const FAIL_MESSAGES = {
  timeout: "The site did not respond in time.",
  network_error: "The site could not be reached.",
  too_many_redirects: "Too many redirects.",
  redirect_loop: "Redirect loop detected.",
  blocked_redirect: "The site redirected to a location that cannot be checked.",
  robots_disallowed: "A redirect target is disallowed by robots.txt.",
  bad_redirect: "Invalid redirect from the site.",
  budget_exhausted: "Request budget exhausted.",
};

function emptyPage(url, status, extra = {}) {
  return { url, status, title: null, description: null, h1_count: 0, canonical: null, robots: null, indexable: false, word_count: 0, images_missing_alt: 0, links_internal: 0, links_broken: null, schema_types: [], viewport: null, ...extra };
}

export async function crawlSite(inputUrl, opts = {}) {
  const now = opts.now || (() => Date.now());
  const checkedAt = () => new Date(now()).toISOString();
  const base = { state: "blocked_url", url: "", final_url: null, pages: [], issues: [], summary: summarize([], 0), checked_at: checkedAt() };
  const safe = checkUrlSafety(inputUrl);
  if (!safe.ok) return { ...base, message: "This URL cannot be checked.", reason: safe.reason };
  const startUrl = normalizeUrl(safe.url.toString());
  base.url = startUrl;
  const maxPages = Math.max(1, Math.min(HARD_MAX_PAGES, Math.floor(Number(opts.maxPages) || 1)));
  const state = { used: 0, budget: opts.fetchBudget || (maxPages > 1 ? 160 : 45) };
  const siteIssues = [];
  const skipped = [];
  let partial = false;
  const addSite = (code, severity, category, message, evidence, fix, page_url = startUrl) => siteIssues.push({ code, severity, category, message, evidence, fix, page_url });

  // robots.txt: fetched once per crawl. 404/other 4xx = no restrictions; 5xx/unreachable = unknown (treated as no rules).
  const origin = new URL(startUrl).origin;
  let robots = { rules: [], sitemaps: [] };
  let robotsState = "not_found";
  {
    const r = await fetchSafe(origin + "/robots.txt", { readBody: "text", maxBytes: 512 * 1024, state, accept: "text/plain,*/*;q=0.5" });
    if (r.ok && r.status === 200) { robots = parseRobots(r.text); robotsState = "found"; }
    else if (!r.ok || r.status >= 500) robotsState = "unavailable";
  }
  const isAllowed = (u) => robotsAllows(robots, u);
  if (!isAllowed(startUrl)) {
    skipped.push({ url: startUrl, reason: "robots_disallowed" });
    addSite("robots_blocks_crawl", "high", "Indexing", "robots.txt disallows this URL for our crawler, so it was not fetched.", `robots.txt rule matches ${new URL(startUrl).pathname}`, "If this page should be crawled and indexed, remove the matching Disallow rule from robots.txt.");
    return { ...base, state: "completed", issues: siteIssues, summary: summarize(siteIssues, 0), skipped, robots: { state: robotsState }, message: "Not fetched: disallowed by robots.txt." };
  }

  const first = await fetchSafe(startUrl, { readBody: "html", state, isAllowed });
  if (!first.ok) {
    const msg = FAIL_MESSAGES[first.error] || "The site could not be checked.";
    const issue = { code: "site_unreachable", severity: "high", category: "Technical SEO", message: msg, evidence: `fetch error: ${first.error}`, fix: "Make sure the site is online, loads within 8 seconds, and does not redirect in loops.", page_url: startUrl };
    return { ...base, state: first.error === "blocked_url" ? "blocked_url" : "unreachable", message: msg, reason: first.error, issues: [issue], summary: summarize([issue], 0), robots: { state: robotsState } };
  }
  const siteHost = new URL(first.finalUrl).hostname;
  const pages = [];
  const seen = new Set();

  const record = (res, requested, isStart) => {
    const finalUrl = res.finalUrl;
    if (res.notHtml) {
      const ct = res.headers.get("content-type") || "unknown";
      const issues = [{ code: "not_html", severity: "medium", category: "Technical SEO", message: "URL did not return an HTML page.", evidence: `HTTP ${res.status}, content-type: ${trunc(ct, 60)}`, fix: "Link to an HTML page, or ignore this URL if it is a file download.", page_url: finalUrl }];
      if (res.status >= 400) issues.unshift({ code: "http_error_status", severity: "high", category: "Technical SEO", message: `Page returned HTTP ${res.status}.`, evidence: `HTTP status ${res.status}`, fix: "Restore the page, or 301-redirect the URL to the closest relevant live page.", page_url: finalUrl });
      return { page: emptyPage(finalUrl, res.status), issues, internalLinks: [], hreflang: [], key: urlKey(finalUrl), requested };
    }
    if (res.truncated) {
      partial = true;
      return { page: emptyPage(finalUrl, res.status, { indexable: res.status === 200 }), issues: [{ code: "page_too_large", severity: "medium", category: "Performance", message: "HTML exceeds the 1.5 MB analysis limit, so the page was not analyzed.", evidence: `response larger than ${MAX_BYTES} bytes`, fix: "Reduce the HTML size (inline scripts/styles, huge inline data, very long lists) to under 1.5 MB.", page_url: finalUrl }], internalLinks: [], hreflang: [], key: urlKey(finalUrl), requested, truncated: true };
    }
    const a = analyzeHtml(res.text, finalUrl, res.headers, { status: res.status, redirects: res.chain, local: isStart });
    return { ...a, key: urlKey(finalUrl), requested };
  };

  const firstRec = record(first, startUrl, true);
  seen.add(urlKey(startUrl));
  seen.add(firstRec.key);
  pages.push(firstRec);

  // sitemap(s)
  const sitemapInfo = { checked: false, urls: 0, sampled: 0 };
  const sitemapUrls = [];
  {
    const declared = robots.sitemaps.slice(0, 2);
    const candidates = declared.length ? declared : [origin + "/sitemap.xml"];
    for (const sm of candidates) {
      const r = await fetchSafe(sm, { readBody: "text", maxBytes: MAX_BYTES, state, accept: "application/xml,text/xml,*/*;q=0.5" });
      if (!r.ok) {
        if (declared.length) addSite("sitemap_unreachable", "medium", "Indexing", "A sitemap declared in robots.txt could not be fetched.", `${trunc(sm, 100)}: ${r.error}`, "Make the sitemap URL reachable (HTTP 200) or remove it from robots.txt.", sm);
        continue;
      }
      sitemapInfo.checked = true;
      if (r.status === 404 || r.status === 410) {
        if (declared.length) addSite("sitemap_not_found", "medium", "Indexing", "A sitemap declared in robots.txt returns 404.", `${trunc(sm, 100)} -> HTTP ${r.status}`, "Publish the sitemap at this URL or fix the Sitemap: line in robots.txt.", sm);
        else addSite("sitemap_missing", "low", "Indexing", "No sitemap found at /sitemap.xml and none is declared in robots.txt.", `${trunc(sm, 100)} -> HTTP ${r.status}`, "Generate an XML sitemap, publish it at /sitemap.xml and add a Sitemap: line to robots.txt.", sm);
        continue;
      }
      if (r.status !== 200) { addSite("sitemap_http_error", "medium", "Indexing", "Sitemap returned a non-200 status.", `${trunc(sm, 100)} -> HTTP ${r.status}`, "Make the sitemap return HTTP 200.", sm); continue; }
      let parsed = parseSitemapXml(r.text);
      if (!parsed.valid) { addSite("sitemap_not_xml", "medium", "Indexing", "Sitemap is not valid sitemap XML.", `${trunc(sm, 100)} did not contain <urlset> or <sitemapindex>`, "Serve a valid XML sitemap (urlset or sitemapindex) with content-type application/xml.", sm); continue; }
      if (r.truncated) addSite("sitemap_too_large", "low", "Indexing", "Sitemap exceeds the 1.5 MB validation limit; only the beginning was read.", trunc(sm, 100), "Split the sitemap into several files listed in a sitemap index.", sm);
      if (parsed.isIndex) {
        const child = parsed.locs.find((l) => checkUrlSafety(l).ok && sameSite(new URL(l).hostname, siteHost));
        if (!child) { addSite("sitemap_empty", "low", "Indexing", "Sitemap index lists no usable child sitemaps.", trunc(sm, 100), "List child sitemaps on your own domain.", sm); continue; }
        const cr = await fetchSafe(child, { readBody: "text", state, accept: "application/xml,text/xml,*/*;q=0.5" });
        if (!cr.ok || cr.status !== 200) { addSite("sitemap_http_error", "medium", "Indexing", "A child sitemap could not be fetched.", `${trunc(child, 100)} -> ${cr.ok ? "HTTP " + cr.status : cr.error}`, "Make every child sitemap return HTTP 200.", child); continue; }
        parsed = parseSitemapXml(cr.text);
        if (!parsed.valid) { addSite("sitemap_not_xml", "medium", "Indexing", "Child sitemap is not valid sitemap XML.", trunc(child, 100), "Serve valid sitemap XML.", child); continue; }
      }
      if (parsed.locs.length === 0) { addSite("sitemap_empty", "low", "Indexing", "Sitemap contains no URLs.", trunc(sm, 100), "Add your important page URLs to the sitemap.", sm); continue; }
      sitemapInfo.urls += parsed.locs.length;
      const foreign = parsed.locs.filter((l) => { try { return !sameSite(new URL(l).hostname, siteHost); } catch { return true; } });
      if (foreign.length) addSite("sitemap_foreign_urls", "medium", "Indexing", "Sitemap lists URLs on a different host.", `${foreign.length} of ${parsed.locs.length}, e.g. ${trunc(foreign[0], 100)}`, "Only list URLs from the same host as the sitemap; remove or correct the others.", sm);
      for (const l of parsed.locs) if (!foreign.includes(l)) sitemapUrls.push(l);
      break;
    }
    const sample = sitemapUrls.slice(0, SITEMAP_SAMPLE);
    const results = await pool(sample, CONCURRENCY, async (u) => ({ u, r: await probe(u, state, isAllowed) }));
    sitemapInfo.sampled = results.length;
    for (const { u, r } of results) {
      if (r.error === "robots_disallowed") addSite("sitemap_url_blocked_by_robots", "medium", "Indexing", "A sitemap URL is disallowed by robots.txt.", trunc(u, 120), "Remove the URL from the sitemap or allow it in robots.txt.", u);
      else if (r.status !== null && r.status >= 400) addSite("sitemap_url_not_200", "medium", "Indexing", "A sitemap URL does not return HTTP 200.", `${trunc(u, 100)} -> HTTP ${r.status}`, "Remove broken URLs from the sitemap or fix the pages.", u);
      else if (r.status !== null && r.finalUrl && urlKey(r.finalUrl) !== urlKey(u)) addSite("sitemap_url_redirects", "low", "Indexing", "A sitemap URL redirects elsewhere.", `${trunc(u, 100)} -> ${trunc(r.finalUrl, 100)}`, "List the final destination URL in the sitemap instead.", u);
    }
  }

  // BFS over same-site internal links
  if (maxPages > 1) {
    const frontier = [];
    const enqueue = (u, depth) => {
      const k = urlKey(u);
      if (!k || seen.has(k)) return;
      let host; try { host = new URL(u).hostname; } catch { return; }
      if (!sameSite(host, siteHost)) return;
      seen.add(k);
      frontier.push({ url: u, depth });
    };
    firstRec.internalLinks.forEach((l) => enqueue(l, 1));
    sitemapUrls.forEach((l) => { const n = normalizeUrl(l); if (n) enqueue(n, 1); });
    while (frontier.length && pages.length < maxPages) {
      const batch = frontier.splice(0, Math.min(CONCURRENCY, maxPages - pages.length));
      const results = await pool(batch, CONCURRENCY, async (item) => {
        if (!isAllowed(item.url)) { skipped.push({ url: item.url, reason: "robots_disallowed" }); return null; }
        const r = await fetchSafe(item.url, { readBody: "html", state, isAllowed, sameSiteWith: siteHost });
        if (!r.ok) {
          skipped.push({ url: item.url, reason: r.error });
          if (!["robots_disallowed", "offsite_redirect"].includes(r.error)) partial = true;
          return null;
        }
        return { item, r };
      });
      for (const res of results) {
        if (!res) continue;
        const k = urlKey(res.r.finalUrl);
        if (pages.some((p) => p.key === k)) continue;
        seen.add(k);
        const rec = record(res.r, res.item.url, false);
        pages.push(rec);
        if (res.item.depth < MAX_DEPTH) rec.internalLinks.forEach((l) => enqueue(l, res.item.depth + 1));
      }
    }
    for (const f of frontier) skipped.push({ url: f.url, reason: "max_pages_reached" });
  }

  // broken internal link checks (HEAD then GET fallback): 20/page and 60/crawl
  const statusByKey = new Map(pages.map((p) => [p.key, p.page.status]));
  const checked = new Map();
  const jobs = [];
  for (const p of pages) {
    p.linkJobs = [];
    for (const l of p.internalLinks) {
      if (p.linkJobs.length >= LINK_CHECKS_PER_PAGE) break;
      const k = urlKey(l);
      if (k === p.key) continue;
      p.linkJobs.push({ url: l, key: k });
      if (!statusByKey.has(k) && !checked.has(k) && jobs.length < LINK_CHECKS_PER_CRAWL) {
        checked.set(k, null);
        jobs.push({ url: l, key: k });
      }
    }
  }
  await pool(jobs, CONCURRENCY, async (j) => {
    if (!isAllowed(j.url)) { checked.set(j.key, { skipped: "robots_disallowed" }); return; }
    checked.set(j.key, await probe(j.url, state, isAllowed));
  });
  for (const p of pages) {
    if (p.truncated || p.page.links_internal === 0) { p.page.links_broken = p.truncated ? null : 0; continue; }
    let evaluated = 0, broken = 0;
    for (const j of p.linkJobs) {
      const st = statusByKey.has(j.key) ? { status: statusByKey.get(j.key), error: null } : checked.get(j.key);
      if (!st || st.skipped || st.error === "budget_exhausted") continue;
      evaluated++;
      if (st.error || (st.status !== null && st.status >= 400)) {
        broken++;
        p.issues.push({ code: "broken_internal_link", severity: "medium", category: "Technical SEO", message: "Internal link points to a page that does not load.", evidence: `${trunc(j.url, 120)} -> ${st.error ? "unreachable (" + st.error + ")" : "HTTP " + st.status}`, fix: `Update or remove the link to ${trunc(j.url, 100)} on this page, or restore/redirect the target page.`, page_url: p.page.url });
      }
    }
    p.page.links_broken = evaluated > 0 || p.linkJobs.length === 0 ? broken : null;
    if (p.linkJobs.length < p.internalLinks.length) p.issues.push({ code: "link_check_limited", severity: "low", category: "Technical SEO", message: "Not all internal links were checked for errors.", evidence: `checked ${p.linkJobs.length} of ${p.internalLinks.length} internal links (limit ${LINK_CHECKS_PER_PAGE} per page)`, fix: "Run additional checks on other sections of the site for the remaining links.", page_url: p.page.url });
  }

  // cross-page checks: duplicate titles/descriptions and reciprocal hreflang (crawled pages only)
  const ok200 = pages.filter((p) => p.page.status === 200 && !p.truncated);
  for (const [field, code, label, fix] of [
    ["title", "duplicate_title", "title", "Give every page a unique title describing that page."],
    ["description", "duplicate_description", "meta description", "Write a unique meta description for each page."],
  ]) {
    const groups = new Map();
    for (const p of ok200) {
      const v = p.page[field];
      if (!v) continue;
      const k = v.trim().toLowerCase();
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    }
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      for (const p of g) p.issues.push({ code, severity: "medium", category: "On-page SEO", message: `Same ${label} is used on ${g.length} crawled pages.`, evidence: `"${trunc(p.page[field], 70)}" also on: ` + g.filter((x) => x !== p).slice(0, 3).map((x) => trunc(x.page.url, 80)).join(", "), fix, page_url: p.page.url });
    }
  }
  const byKey = new Map(pages.map((p) => [p.key, p]));
  for (const p of pages) {
    for (const h of p.hreflang || []) {
      const target = normalizeUrl(h.href, p.page.url);
      if (!target) continue;
      const k = urlKey(target);
      if (k === p.key) continue;
      const other = byKey.get(k);
      if (!other) continue;
      const back = (other.hreflang || []).some((x) => { const t = normalizeUrl(x.href, other.page.url); return t && urlKey(t) === p.key; });
      if (!back) p.issues.push({ code: "hreflang_no_return_tag", severity: "medium", category: "Technical SEO", message: "hreflang alternate does not link back to this page.", evidence: `${trunc(other.page.url, 100)} (${h.code}) has no hreflang pointing to ${trunc(p.page.url, 80)}`, fix: "Add the reciprocal hreflang link on the alternate page.", page_url: p.page.url });
    }
  }

  const issues = [...pages.flatMap((p) => p.issues), ...siteIssues];
  const sev = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => sev[a.severity] - sev[b.severity]);
  return {
    state: partial ? "partial" : "completed",
    url: startUrl,
    final_url: first.finalUrl,
    pages: pages.map((p) => p.page),
    issues,
    summary: summarize(issues, pages.length),
    checked_at: checkedAt(),
    skipped,
    robots: { state: robotsState },
    sitemap: sitemapInfo,
  };
}

// ---------------------------------------------------------------------------------------------
// PageSpeed
// ---------------------------------------------------------------------------------------------

export async function pageSpeed(rawUrl, strategy, env, now = Date.now) {
  const stamp = () => new Date(now()).toISOString();
  const empty = () => ({ lcp_ms: null, inp_ms: null, cls: null, performance_score: null, source: "pagespeed_insights", measured_at: stamp(), field_data: false });
  const safe = checkUrlSafety(rawUrl);
  if (!safe.ok) return { status: 400, body: { ...empty(), state: "blocked_url", message: "This URL cannot be checked." } };
  if (!env || !env.PAGESPEED_API_KEY) return { status: 200, body: { ...empty(), state: "provider_not_configured" } };
  const strat = strategy === "desktop" ? "desktop" : "mobile";
  const api = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?" + new URLSearchParams({ url: safe.url.toString(), strategy: strat, category: "performance", key: env.PAGESPEED_API_KEY }).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(api, { signal: controller.signal, headers: { accept: "application/json" } });
    if (!res.ok) {
      try { await res.body?.cancel(); } catch { /* ignore */ }
      return { status: 200, body: { ...empty(), state: "provider_error", provider_status: res.status } };
    }
    const data = await res.json();
    const audits = data?.lighthouseResult?.audits || {};
    const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const round3 = (v) => (v === null ? null : Math.round(v * 1000) / 1000);
    const rnd = (v) => (v === null ? null : Math.round(v));
    const labLcp = num(audits["largest-contentful-paint"]?.numericValue);
    const labCls = num(audits["cumulative-layout-shift"]?.numericValue);
    const labTbt = num(audits["total-blocking-time"]?.numericValue);
    const scoreRaw = num(data?.lighthouseResult?.categories?.performance?.score);
    const fm = data?.loadingExperience?.metrics || {};
    const fLcp = num(fm.LARGEST_CONTENTFUL_PAINT_MS?.percentile);
    const fInp = num(fm.INTERACTION_TO_NEXT_PAINT?.percentile);
    const fClsRaw = num(fm.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile);
    const fCls = fClsRaw === null ? null : fClsRaw / 100; // CrUX reports CLS multiplied by 100
    const field = fLcp !== null || fInp !== null || fCls !== null;
    if (!field && labLcp === null && labCls === null && scoreRaw === null) return { status: 200, body: { ...empty(), state: "provider_error", provider_status: 200 } };
    return {
      status: 200,
      body: {
        state: "verified_data",
        // Top level uses field (CrUX) values when field_data is true, otherwise lab values. INP exists only in field data.
        lcp_ms: field && fLcp !== null ? rnd(fLcp) : rnd(labLcp),
        inp_ms: rnd(fInp),
        cls: field && fCls !== null ? fCls : round3(labCls),
        performance_score: scoreRaw === null ? null : Math.round(scoreRaw * 100),
        source: "pagespeed_insights",
        measured_at: stamp(),
        field_data: field,
        strategy: strat,
        lab: { lcp_ms: rnd(labLcp), cls: round3(labCls), tbt_ms: rnd(labTbt), performance_score: scoreRaw === null ? null : Math.round(scoreRaw * 100) },
        field: field ? { lcp_ms: fLcp, inp_ms: fInp, cls: fCls } : null,
      },
    };
  } catch {
    return { status: 200, body: { ...empty(), state: "provider_error", provider_status: null } };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------------------------

async function readJson(request) {
  try { const b = await request.json(); return b && typeof b === "object" ? b : null; } catch { return null; }
}

export async function crawlAllowed(ctx) {
  try {
    const f = await ctx.requireFeature("website_crawl_enabled");
    if (f && f.ok) return true;
    const e = (f && f.entitlements) || {};
    if (e.website_crawl_enabled === undefined) return e.rank_tracking_enabled === 1 || e.reports_enabled === 1;
    return false;
  } catch { return false; }
}

export const routes = [
  {
    method: "POST", path: "/api/site-check", auth: "public",
    async handler(request, ctx) {
      const body = await readJson(request);
      if (!body || typeof body.url !== "string") return ctx.json({ error: "url is required", code: "invalid_request" }, 400);
      if (body.max_pages !== undefined && Number(body.max_pages) > 1) return ctx.json({ error: "Multi-page checks need a signed-in paid account. Use POST /api/site-check/crawl.", code: "crawl_requires_session" }, 403);
      const rl = await ctx.rateLimit("sitecheck:" + ctx.ip, 10, 3600000);
      if (!rl.ok) return ctx.json({ error: "Too many checks. Try again later.", code: "rate_limited" }, 429);
      return ctx.json(await crawlSite(body.url, { maxPages: 1, env: ctx.env, now: ctx.now }), 200);
    },
  },
  {
    method: "POST", path: "/api/site-check/crawl", auth: "session",
    async handler(request, ctx) {
      const body = await readJson(request);
      if (!body || typeof body.url !== "string") return ctx.json({ error: "url is required", code: "invalid_request" }, 400);
      const requested = body.max_pages === undefined ? 5 : Math.floor(Number(body.max_pages));
      if (!Number.isFinite(requested) || requested < 1) return ctx.json({ error: "max_pages must be a positive integer", code: "invalid_request" }, 400);
      const maxPages = Math.min(requested, HARD_MAX_PAGES);
      if (maxPages > 1 && !(await crawlAllowed(ctx))) return ctx.json({ error: "Multi-page crawling is available on paid plans.", code: "plan_required" }, 403);
      const rl = await ctx.rateLimit("sitecrawl:" + ctx.userId, 5, 3600000);
      if (!rl.ok) return ctx.json({ error: "Too many crawls. Try again later.", code: "rate_limited" }, 429);
      return ctx.json(await crawlSite(body.url, { maxPages, env: ctx.env, now: ctx.now }), 200);
    },
  },
  {
    method: "GET", path: "/api/pagespeed", auth: "public",
    async handler(request, ctx) {
      const url = ctx.url.searchParams.get("url") || "";
      const strategy = ctx.url.searchParams.get("strategy") || "mobile";
      if (!url) return ctx.json({ error: "url is required", code: "invalid_request" }, 400);
      const rl = await ctx.rateLimit("pagespeed:" + ctx.ip, 20, 3600000);
      if (!rl.ok) return ctx.json({ error: "Too many requests. Try again later.", code: "rate_limited" }, 429);
      const r = await pageSpeed(url, strategy, ctx.env, ctx.now);
      return ctx.json(r.body, r.status);
    },
  },
];
