// Platform module: business profile management, account export, first-party analytics,
// admin metrics/CSV, and data-retention jobs. Contract: ../../docs/API-CONTRACT.md ("platform").
// Workers-compatible only (WebCrypto, no Node APIs).
import { sha256Hex } from "./oauth.js";

const DAY_MS = 86400000;
const HOUR_MS = 3600000;

// ---------- small helpers ----------
const clean = (v) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim() : v);
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const dayStr = (ms) => new Date(ms).toISOString().slice(0, 10);
const safeJson = (s, fallback) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };
const noStore = { "cache-control": "no-store" };

// ---------- business validation ----------
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$|^24:00$/;
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

function str(v, min, max, label) {
  if (typeof v !== "string") return { error: `${label} must be text` };
  const s = clean(v);
  if (s.length < min) return { error: `${label} is required` };
  if (s.length > max) return { error: `${label} must be at most ${max} characters` };
  return { value: s };
}
function optStr(v, max, label) {
  if (v === null || v === "") return { value: null };
  return str(v, 1, max, label);
}
function strList(v, maxItems, maxLen, label) {
  if (v === null) return { value: [] };
  if (!Array.isArray(v)) return { error: `${label} must be a list` };
  if (v.length > maxItems) return { error: `${label} can have at most ${maxItems} items` };
  const out = [];
  for (const x of v) {
    const r = str(x, 1, maxLen, label + " item");
    if (r.error) return r;
    if (!out.some((y) => y.toLowerCase() === r.value.toLowerCase())) out.push(r.value);
  }
  return { value: out };
}
export function normalizePhone(v) {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\s().-]/g, "");
  let m = s.match(/^(?:\+91|91|0)?([6-9][0-9]{9})$/);
  if (m) return "+91" + m[1];
  if (/^\+[1-9][0-9]{7,14}$/.test(s)) return s;
  return null;
}
function validWebsite(v) {
  if (typeof v !== "string") return { error: "website must be a URL" };
  const s = clean(v);
  if (s.length > 300) return { error: "website must be at most 300 characters" };
  let u;
  try { u = new URL(s); } catch { return { error: "website must be a valid http(s) URL" }; }
  if (!["http:", "https:"].includes(u.protocol) || !u.hostname.includes(".") || u.username || u.password) {
    return { error: "website must be a valid http(s) URL" };
  }
  return { value: u.toString() };
}
export function validateHours(v) {
  if (v === null) return { value: null };
  if (!isObj(v)) return { error: "hours must be an object keyed by mon..sun" };
  const out = {};
  for (const [k, raw] of Object.entries(v)) {
    const d = k.toLowerCase();
    if (!DAYS.includes(d)) return { error: `hours has unknown day "${k.slice(0, 10)}"` };
    if (raw && raw.closed === true) { out[d] = { closed: true }; continue; }
    const periods = Array.isArray(raw) ? raw : isObj(raw) ? [raw] : null;
    if (!periods || !periods.length || periods.length > 3) return { error: `hours.${d} needs {closed:true} or 1-3 open/close periods` };
    const norm = [];
    for (const p of periods) {
      if (!isObj(p) || typeof p.open !== "string" || typeof p.close !== "string" || !TIME.test(p.open) || !TIME.test(p.close)) {
        return { error: `hours.${d} periods need open and close as HH:MM (24h)` };
      }
      if (toMin(p.close) <= toMin(p.open)) return { error: `hours.${d} close must be after open` };
      const prev = norm[norm.length - 1];
      if (prev && toMin(p.open) < toMin(prev.close)) return { error: `hours.${d} periods overlap or are out of order` };
      norm.push({ open: p.open, close: p.close });
    }
    out[d] = norm;
  }
  return { value: out };
}
function validTimezone(v) {
  if (typeof v !== "string" || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){0,2}$/.test(v) || v.length > 64) return { error: "timezone must be an IANA name such as Asia/Kolkata" };
  try { new Intl.DateTimeFormat("en", { timeZone: v }); } catch { return { error: "timezone must be an IANA name such as Asia/Kolkata" }; }
  return { value: v };
}
const num = (v, lo, hi, label) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? { value: v } : { error: `${label} must be a number between ${lo} and ${hi}` });

// field -> validator. Core fields live in `businesses`; the rest in business_profile_ext.
export const FIELD_VALIDATORS = {
  name: (v) => str(v, 1, 120, "name"),
  category: (v) => str(v, 1, 80, "category"),
  secondary_categories: (v) => strList(v, 9, 80, "secondary_categories"),
  address: (v) => optStr(v, 200, "address"),
  city: (v) => str(v, 1, 80, "city"),
  state: (v) => optStr(v, 60, "state"),
  pin_code: (v) => (v === null || v === "" ? { value: null } : typeof v === "string" && /^[1-9][0-9]{5}$/.test(v.trim()) ? { value: v.trim() } : { error: "pin_code must be 6 digits" }),
  country: (v) => (v === null || v === "" ? { value: null } : typeof v === "string" && clean(v).length >= 2 && clean(v).length <= 56 ? { value: clean(v) } : { error: "country must be 2-56 characters" }),
  service_areas: (v) => strList(v, 20, 80, "service_areas"),
  phone: (v) => (v === null || v === "" ? { value: null } : normalizePhone(v) ? { value: normalizePhone(v) } : { error: "phone must be a 10-digit Indian mobile or an E.164 number" }),
  website: (v) => (v === null || v === "" ? { value: null } : validWebsite(v)),
  hours: validateHours,
  description: (v) => (v === null || v === "" ? { value: null } : typeof v !== "string" ? { error: "description must be text" } : clean(v).length > 750 ? { error: "description must be at most 750 characters" } : { value: clean(v) }),
  language: (v) => (v === "en" || v === "hi" ? { value: v } : { error: "language must be en or hi" }),
  timezone: (v) => (v === null ? { value: null } : validTimezone(v)),
  lat: (v) => (v === null ? { value: null } : num(v, -90, 90, "lat")),
  lng: (v) => (v === null ? { value: null } : num(v, -180, 180, "lng")),
};
const CORE = new Set(["name", "category", "city", "phone", "website"]);

export function validateBusinessFields(body) {
  const fields = {}, errors = {};
  for (const [k, v] of Object.entries(body || {})) {
    if (k === "id") continue;
    const fn = FIELD_VALIDATORS[k];
    if (!fn) { errors[k] = "unknown field"; continue; }
    const r = fn(v);
    if (r.error) errors[k] = r.error; else fields[k] = r.value;
  }
  return { fields, errors };
}

// ---------- business data access ----------
export async function findDuplicateBusiness(env, userId, name, city, excludeId = null) {
  if (!env.DB || typeof name !== "string" || typeof city !== "string") return null;
  const n = name.trim().toLowerCase(), c = city.trim().toLowerCase();
  return env.DB.prepare(
    "SELECT id FROM businesses WHERE user_id=? AND lower(trim(name))=? AND lower(trim(city))=? AND (? IS NULL OR id<>?) AND status<>'deleted' LIMIT 1"
  ).bind(userId, n, c, excludeId, excludeId).first();
}

export function mergeBusiness(b, ext) {
  const e = ext || {};
  return {
    id: b.id, name: b.name, category: b.category || null, city: b.city || null,
    phone: b.phone || null, website: b.website_url || null, website_url: b.website_url || null,
    status: b.status, archived: b.status === "archived",
    address: e.address ?? null, state: e.state ?? null, pin_code: e.pin_code ?? null, country: e.country ?? null,
    secondary_categories: safeJson(e.secondary_categories_json, []),
    service_areas: safeJson(e.service_areas_json, []),
    hours: safeJson(e.hours_json, null),
    description: e.description ?? null, language: e.language ?? null, timezone: e.timezone ?? null,
    lat: e.lat ?? null, lng: e.lng ?? null,
    created_at: b.created_at, updated_at: Math.max(b.updated_at || 0, e.updated_at || 0),
  };
}
async function loadExt(env, id) {
  try { return await env.DB.prepare("SELECT * FROM business_profile_ext WHERE business_id=?").bind(id).first(); } catch { return null; }
}
async function saveExt(env, id, e, now) {
  await env.DB.prepare(
    "INSERT INTO business_profile_ext (business_id,address,state,pin_code,country,secondary_categories_json,service_areas_json,hours_json,description,language,timezone,lat,lng,archived_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) " +
    "ON CONFLICT(business_id) DO UPDATE SET address=excluded.address,state=excluded.state,pin_code=excluded.pin_code,country=excluded.country,secondary_categories_json=excluded.secondary_categories_json,service_areas_json=excluded.service_areas_json,hours_json=excluded.hours_json,description=excluded.description,language=excluded.language,timezone=excluded.timezone,lat=excluded.lat,lng=excluded.lng,archived_at=excluded.archived_at,updated_at=excluded.updated_at"
  ).bind(id, e.address ?? null, e.state ?? null, e.pin_code ?? null, e.country ?? null, e.secondary_categories_json ?? null, e.service_areas_json ?? null, e.hours_json ?? null, e.description ?? null, e.language ?? null, e.timezone ?? null, e.lat ?? null, e.lng ?? null, e.archived_at ?? null, now).run();
}

const bad = (ctx, error, code, status = 400, extra = {}) => ctx.json({ error, code, ...extra }, status);

async function readBody(request, max = 20000) {
  const text = await request.text().catch(() => "");
  if (!text || text.length > max) return null;
  try { const b = JSON.parse(text); return isObj(b) ? b : null; } catch { return null; }
}

async function updateBusiness(request, ctx) {
  const body = await readBody(request);
  if (!body || typeof body.id !== "string" || !body.id) return bad(ctx, "id is required", "invalid_request");
  const rl = await ctx.rateLimit("biz_update:" + ctx.userId, 120, HOUR_MS);
  if (!rl.ok) return bad(ctx, "Too many updates. Try again later.", "rate_limited", 429);
  const business = await ctx.getUserBusiness(body.id);
  if (!business) return bad(ctx, "Business not found", "not_found", 404);
  const { fields, errors } = validateBusinessFields(body);
  if (!Object.keys(fields).length && !Object.keys(errors).length) return bad(ctx, "No fields to update", "invalid_request");
  const ext = (await loadExt(ctx.env, business.id)) || {};
  const next = { ...ext };
  if (("lat" in fields || "lng" in fields) && !errors.lat && !errors.lng) {
    const lat = "lat" in fields ? fields.lat : ext.lat ?? null;
    const lng = "lng" in fields ? fields.lng : ext.lng ?? null;
    if ((lat === null) !== (lng === null)) errors.lat = "lat and lng must be provided together";
  }
  if (Object.keys(errors).length) return bad(ctx, "Some fields are invalid", "validation_failed", 400, { fields: errors });
  const name = fields.name ?? business.name, city = fields.city ?? business.city;
  if (("name" in fields || "city" in fields) && (await findDuplicateBusiness(ctx.env, ctx.userId, name, city, business.id))) {
    return bad(ctx, "You already have a business with this name in this city", "duplicate_business", 409);
  }
  const now = ctx.now();
  const core = { name, category: fields.category ?? business.category, city, phone: "phone" in fields ? fields.phone : business.phone, website_url: "website" in fields ? fields.website : business.website_url };
  await ctx.env.DB.prepare("UPDATE businesses SET name=?,category=?,city=?,phone=?,website_url=?,updated_at=? WHERE id=? AND user_id=?")
    .bind(core.name, core.category, core.city, core.phone, core.website_url, now, business.id, ctx.userId).run();
  const extFields = Object.keys(fields).filter((k) => !CORE.has(k));
  if (extFields.length) {
    for (const k of extFields) {
      if (k === "secondary_categories") next.secondary_categories_json = JSON.stringify(fields[k]);
      else if (k === "service_areas") next.service_areas_json = JSON.stringify(fields[k]);
      else if (k === "hours") next.hours_json = fields[k] === null ? null : JSON.stringify(fields[k]);
      else next[k] = fields[k];
    }
    await saveExt(ctx.env, business.id, next, now);
  }
  const fresh = await ctx.getUserBusiness(business.id);
  return ctx.json({ business: mergeBusiness(fresh, await loadExt(ctx.env, business.id)) });
}

async function archiveBusiness(request, ctx) {
  const body = await readBody(request);
  if (!body || typeof body.id !== "string" || typeof body.archived !== "boolean") return bad(ctx, "id and archived (boolean) are required", "invalid_request");
  const business = await ctx.getUserBusiness(body.id);
  if (!business) return bad(ctx, "Business not found", "not_found", 404);
  if (!body.archived && business.status === "archived" && (await findDuplicateBusiness(ctx.env, ctx.userId, business.name, business.city, business.id))) {
    return bad(ctx, "An active business with this name and city already exists", "duplicate_business", 409);
  }
  const now = ctx.now();
  await ctx.env.DB.prepare("UPDATE businesses SET status=?,updated_at=? WHERE id=? AND user_id=?").bind(body.archived ? "archived" : "active", now, business.id, ctx.userId).run();
  const ext = (await loadExt(ctx.env, business.id)) || {};
  await saveExt(ctx.env, business.id, { ...ext, archived_at: body.archived ? now : null }, now);
  const fresh = await ctx.getUserBusiness(business.id);
  return ctx.json({ business: mergeBusiness(fresh, await loadExt(ctx.env, business.id)) });
}

async function getProfile(request, ctx) {
  const id = ctx.url.searchParams.get("id");
  if (!id) return bad(ctx, "id is required", "invalid_request");
  const business = await ctx.getUserBusiness(id);
  if (!business) return bad(ctx, "Business not found", "not_found", 404);
  return ctx.json({ business: mergeBusiness(business, await loadExt(ctx.env, business.id)) });
}

// ---------- account export ----------
const SENSITIVE_COL = /token|secret|ciphertext|password|signature|ip_hash|api_key/i;
const EXPORT_ROW_CAP = 10000;
const scrub = (row) => { const o = {}; for (const [k, v] of Object.entries(row)) if (!SENSITIVE_COL.test(k)) o[k] = v; return o; };
const SKIP_TABLES = new Set(["sessions", "oauth_states", "rate_limits", "analytics_events", "analytics_daily", "waitlist", "users", "plan_entitlements"]);
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

// [table, SQL selecting rows for a user (bound once with userId)]
const DIRECT = [
  ["businesses", "SELECT * FROM businesses WHERE user_id=?"],
  ["google_connections", "SELECT user_id, scope, updated_at FROM google_connections WHERE user_id=?"], // metadata only, never the token
  ["google_locations", "SELECT * FROM google_locations WHERE user_id=?"],
  ["subscriptions", "SELECT * FROM subscriptions WHERE user_id=?"],
  ["payments", "SELECT * FROM payments WHERE user_id=?"],
  ["subscription_events", "SELECT * FROM subscription_events WHERE user_id=?"],
  ["usage_events", "SELECT * FROM usage_events WHERE user_id=?"],
  ["performance_metrics", "SELECT * FROM performance_metrics WHERE user_id=?"],
  ["monitoring_events", "SELECT * FROM monitoring_events WHERE user_id=?"],
  ["search_console_properties", "SELECT * FROM search_console_properties WHERE user_id=?"],
  ["search_console_metrics", "SELECT * FROM search_console_metrics WHERE user_id=?"],
];
const VIA_BUSINESS = [
  ["business_profile_ext", "business_id"], ["business_locations", "business_id"], ["audits", "business_id"],
  ["action_items", "business_id"], ["keywords", "business_id"], ["competitors", "business_id"], ["reports", "business_id"],
];
const VIA_PARENT = [ // [table, fk column, parent table]
  ["audit_issues", "audit_id", "audits"], ["rank_snapshots", "keyword_id", "keywords"], ["reviews", "business_location_id", "business_locations"],
];

async function allRows(env, sql, binds) {
  const r = await env.DB.prepare(sql + ` LIMIT ${EXPORT_ROW_CAP}`).bind(...binds).all();
  return r.results || [];
}
async function tryRows(env, sql, binds) { try { return await allRows(env, sql, binds); } catch { return null; } }

export async function buildExport(env, userId, now = Date.now()) {
  const user = await env.DB.prepare("SELECT id,email,name,picture_url,created_at,updated_at FROM users WHERE id=?").bind(userId).first();
  const data = {}, ids = {}, notes = [];
  const put = (t, rows) => { data[t] = rows.map(scrub); ids[t] = rows.map((r) => r.id).filter((x) => x != null); if (rows.length >= EXPORT_ROW_CAP) notes.push(t + " truncated at " + EXPORT_ROW_CAP + " rows"); };
  for (const [t, sql] of DIRECT) { const rows = await tryRows(env, sql, [userId]); if (rows) put(t, rows); }
  for (const [t, col] of VIA_BUSINESS) {
    const rows = await tryRows(env, `SELECT x.* FROM ${t} x JOIN businesses b ON b.id=x.${col} WHERE b.user_id=?`, [userId]);
    if (rows) put(t, rows);
  }
  const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
  async function viaParent(t, col, parentIds) {
    let rows = [];
    for (const c of chunk(parentIds, 50)) {
      const r = await tryRows(env, `SELECT * FROM ${t} WHERE ${col} IN (${c.map(() => "?").join(",")})`, c);
      if (r === null) return null;
      rows = rows.concat(r);
    }
    return rows;
  }
  for (const [t, col, parent] of VIA_PARENT) { const rows = await viaParent(t, col, ids[parent] || []); if (rows) put(t, rows); }

  // Tables added by other modules: discover via user_id / business_id columns and foreign keys.
  try {
    const names = ((await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'").all()).results || []).map((r) => r.name).filter((n) => IDENT.test(n));
    const todo = names.filter((n) => !(n in data) && !SKIP_TABLES.has(n));
    const colsOf = {}, fksOf = {};
    for (const n of todo) {
      colsOf[n] = ((await env.DB.prepare("SELECT name FROM pragma_table_info(?)").bind(n).all()).results || []).map((r) => r.name);
      fksOf[n] = (await env.DB.prepare("SELECT \"from\" AS col, \"table\" AS parent FROM pragma_foreign_key_list(?)").bind(n).all()).results || [];
    }
    for (let pass = 0; pass < 3; pass++) {
      for (const n of todo) {
        if (n in data) continue;
        let rows = null;
        if (colsOf[n].includes("user_id")) rows = await tryRows(env, `SELECT * FROM ${n} WHERE user_id=?`, [userId]);
        else if (colsOf[n].includes("business_id")) rows = await tryRows(env, `SELECT x.* FROM ${n} x JOIN businesses b ON b.id=x.business_id WHERE b.user_id=?`, [userId]);
        else {
          const fk = fksOf[n].find((f) => IDENT.test(f.col) && f.parent in ids && ids[f.parent]);
          if (fk) rows = await viaParent(n, fk.col, ids[fk.parent]);
        }
        if (rows) put(n, rows);
      }
    }
  } catch { notes.push("dynamic table discovery unavailable"); }

  // Waitlist rows are keyed by the contact the user gave, so match on the account email only.
  let waitlist = [];
  if (user?.email) waitlist = ((await tryRows(env, "SELECT email,phone,name,business_name,city,source,score,lang,created_at,updated_at FROM waitlist WHERE email=?", [String(user.email).toLowerCase()])) || []);
  return {
    export_version: 1, exported_at: new Date(now).toISOString(), user: user || null,
    notes: ["Google OAuth tokens and session secrets are never included.", ...notes],
    waitlist_entries: waitlist, data,
  };
}

async function exportAccount(request, ctx) {
  const rl = await ctx.rateLimit("export:" + ctx.userId, 3, HOUR_MS);
  if (!rl.ok) return bad(ctx, "Export limit reached (3 per hour). Try again later.", "rate_limited", 429);
  const payload = await buildExport(ctx.env, ctx.userId, ctx.now());
  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="localboost-export-${dayStr(ctx.now())}.json"`, ...noStore },
  });
}

// ---------- first-party analytics ----------
export const EVENT_WHITELIST = new Set(["page_view", "tool_used", "audit_started", "audit_completed", "signup_started", "google_connect_clicked", "waitlist_submitted", "pricing_viewed", "checkout_started", "checkout_completed"]);
const PROP_RULES = {
  tool: (v) => (typeof v === "string" && /^[a-z0-9][a-z0-9_-]{0,39}$/.test(v) ? v : null),
  path: (v) => {
    if (typeof v !== "string") return null;
    const p = v.split(/[?#]/)[0];
    return /^\/[A-Za-z0-9/_.-]{0,99}$/.test(p) ? p : null;
  },
  lang: (v) => (v === "en" || v === "hi" ? v : null),
  plan: (v) => (typeof v === "string" && /^[a-z][a-z0-9_]{0,19}$/.test(v) ? v : null),
};
export function sanitizeEvent(body) {
  if (!isObj(body) || typeof body.event !== "string" || !EVENT_WHITELIST.has(body.event)) return null;
  const props = isObj(body.props) ? body.props : {};
  const out = { event: body.event };
  for (const [k, fn] of Object.entries(PROP_RULES)) out[k] = k in props ? fn(props[k]) : null; // unknown/invalid props are dropped
  return out;
}
async function visitorHash(env, ip, ua, day) {
  const secret = env.ANALYTICS_SALT || env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!secret) return null; // without a secret we cannot hash safely; count events but not uniques
  return sha256Hex([ip, ua, day, secret].join("|"));
}
async function recordEvent(request, ctx) {
  if (request.headers.get("x-lb-consent") !== "granted") return new Response(null, { status: 204, headers: noStore });
  if (!ctx.env.DB) return new Response(null, { status: 204, headers: noStore });
  const rl = await ctx.rateLimit("evt:" + ctx.ip, 120, HOUR_MS);
  if (!rl.ok) return new Response(null, { status: 429, headers: { ...noStore, "retry-after": "3600" } });
  const body = await readBody(request, 2000);
  const ev = sanitizeEvent(body);
  if (!ev) return bad(ctx, "Unknown event", "invalid_event");
  const now = ctx.now(), day = dayStr(now);
  const vh = await visitorHash(ctx.env, ctx.ip, (request.headers.get("user-agent") || "").slice(0, 200), day);
  await ctx.env.DB.prepare("INSERT INTO analytics_events (day,event,tool,path,lang,plan,visitor_hash,created_at) VALUES (?,?,?,?,?,?,?,?)")
    .bind(day, ev.event, ev.tool, ev.path, ev.lang, ev.plan, vh, now).run();
  return new Response(null, { status: 204, headers: noStore });
}

// ---------- admin ----------
async function timingSafeEqual(a, b) {
  const [ha, hb] = await Promise.all([sha256Hex(String(a)), sha256Hex(String(b))]);
  let d = ha.length ^ hb.length;
  for (let i = 0; i < ha.length; i++) d |= ha.charCodeAt(i) ^ (hb.charCodeAt(i) || 0);
  return d === 0;
}
// Returns null when authorised, else a Response.
export async function adminGate(request, ctx) {
  if (!ctx.env.ADMIN_TOKEN) return ctx.json({ error: "Not found", code: "not_found" }, 404);
  const rl = await ctx.rateLimit("admin:" + ctx.ip, 30, 60000);
  if (!rl.ok) return bad(ctx, "Too many requests", "rate_limited", 429);
  const m = (request.headers.get("authorization") || "").match(/^Bearer (.+)$/i);
  if (!m || !(await timingSafeEqual(m[1], ctx.env.ADMIN_TOKEN))) {
    return new Response(JSON.stringify({ error: "Unauthorized", code: "unauthorized" }), { status: 401, headers: { "content-type": "application/json", "www-authenticate": "Bearer", ...noStore } });
  }
  return null;
}

const FUNNEL = ["signup_started", "audit_completed", "checkout_completed"];

async function adminMetrics(request, ctx) {
  const denied = await adminGate(request, ctx);
  if (denied) return denied;
  const db = ctx.env.DB, now = ctx.now();
  const days = Math.min(365, Math.max(1, parseInt(ctx.url.searchParams.get("days") || "30", 10) || 30));
  const since = dayStr(now - (days - 1) * DAY_MS);
  const rawCutoff = dayStr(now - 90 * DAY_MS); // days before this exist only in the rollup
  const all = async (sql, ...b) => (await db.prepare(sql).bind(...b).all()).results || [];
  const one = async (sql, ...b) => (await db.prepare(sql).bind(...b).first()) || {};

  const rawEv = await all("SELECT day,event,tool,COUNT(*) AS events,COUNT(DISTINCT visitor_hash) AS visitors FROM analytics_events WHERE day>=? GROUP BY day,event,tool", since);
  const rolled = await all("SELECT day,event,tool,SUM(events) AS events,SUM(visitors) AS visitors FROM analytics_daily WHERE day>=? AND day<? GROUP BY day,event,tool", since, rawCutoff);
  const byDay = {}, tools = {}, funnelAcc = Object.fromEntries(FUNNEL.map((e) => [e, { events: 0, visitor_days: 0 }]));
  const dayRow = (d) => (byDay[d] ||= { day: d, events: 0, visitors: 0 });
  for (const r of rawEv) { dayRow(r.day).events += r.events; if (r.tool && r.event === "tool_used") tools[r.tool] = (tools[r.tool] || 0) + r.events; if (funnelAcc[r.event]) { funnelAcc[r.event].events += r.events; funnelAcc[r.event].visitor_days += r.visitors; } }
  for (const r of rawEv.length ? await all("SELECT day,COUNT(DISTINCT visitor_hash) AS v FROM analytics_events WHERE day>=? GROUP BY day", since) : []) dayRow(r.day).visitors = r.v;
  for (const r of rolled) {
    if (r.event === "*") { dayRow(r.day).visitors = r.visitors; continue; }
    dayRow(r.day).events += r.events;
    if (r.tool && r.event === "tool_used") tools[r.tool] = (tools[r.tool] || 0) + r.events;
    if (funnelAcc[r.event]) { funnelAcc[r.event].events += r.events; funnelAcc[r.event].visitor_days += r.visitors; }
  }
  const users = await one("SELECT COUNT(*) AS c FROM users");
  const paid = await one("SELECT COUNT(*) AS c FROM subscriptions WHERE status='active' AND plan_code<>'free'");
  const payments = await one("SELECT COUNT(*) AS c FROM payments WHERE verified_at IS NOT NULL");
  const wl = await one("SELECT COUNT(*) AS c FROM waitlist");
  const sinceMs = now - days * DAY_MS;
  const usage = await all("SELECT event_type,provider,COUNT(*) AS rows_count,SUM(units) AS units,SUM(estimated_cost_minor) AS estimated_cost_minor FROM usage_events WHERE created_at>=? GROUP BY event_type,provider ORDER BY units DESC", sinceMs);
  const withCost = usage.filter((u) => u.estimated_cost_minor != null);
  return new Response(JSON.stringify({
    generated_at: new Date(now).toISOString(), range: { days, since },
    analytics: {
      note: "Consent-only first-party events. Visitors are unique daily hashes, not people; visitor_days sums them across days.",
      by_day: Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day)),
      tool_usage: Object.entries(tools).map(([tool, events]) => ({ tool, events })).sort((a, b) => b.events - a.events),
      funnel: FUNNEL.map((e) => ({ step: e, ...funnelAcc[e] })),
    },
    registered_users: users.c || 0,
    paid_subscriptions: paid.c || 0,
    verified_payments: payments.c || 0,
    waitlist: wl.c || 0,
    api_usage: {
      note: "estimated_cost_minor is the sum of recorded usage_events.estimated_cost_minor (minor currency units as written by the recording module); null when nothing recorded a cost.",
      by_type: usage,
      total_units: usage.reduce((s, u) => s + (u.units || 0), 0),
      estimated_cost_minor: withCost.length ? withCost.reduce((s, u) => s + u.estimated_cost_minor, 0) : null,
    },
  }), { status: 200, headers: { "content-type": "application/json; charset=utf-8", ...noStore } });
}

export function csvCell(v) {
  if (v === null || v === undefined) return '""';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise spreadsheet formula injection
  return '"' + s.replace(/"/g, '""') + '"';
}
async function waitlistCsv(request, ctx) {
  const denied = await adminGate(request, ctx);
  if (denied) return denied;
  const rows = (await ctx.env.DB.prepare("SELECT id,email,phone,name,business_name,city,source,score,lang,created_at FROM waitlist ORDER BY created_at DESC LIMIT 50000").all()).results || [];
  const head = ["id", "email", "phone", "name", "business_name", "city", "source", "score", "lang", "created_at"];
  const lines = [head.map(csvCell).join(",")];
  for (const r of rows) lines.push(head.map((h) => csvCell(h === "created_at" ? new Date(r.created_at).toISOString() : r[h])).join(","));
  return new Response(lines.join("\r\n") + "\r\n", { status: 200, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="waitlist.csv"', ...noStore } });
}

export const routes = [
  { method: "POST", path: "/api/businesses/update", auth: "session", handler: updateBusiness },
  { method: "POST", path: "/api/businesses/archive", auth: "session", handler: archiveBusiness },
  { method: "GET", path: "/api/businesses/profile", auth: "session", handler: getProfile },
  { method: "GET", path: "/api/account/export", auth: "session", handler: exportAccount },
  { method: "POST", path: "/api/events", auth: "public", handler: recordEvent },
  { method: "GET", path: "/api/admin/metrics", auth: "public", handler: adminMetrics },
  { method: "GET", path: "/api/admin/waitlist.csv", auth: "public", handler: waitlistCsv },
];

// ---------- jobs ----------
export const RETENTION = { analyticsRawDays: 90, rateLimitMs: DAY_MS, oauthStateMs: HOUR_MS };

export async function rollupAnalytics(env, now = Date.now()) {
  if (!env.DB) return { rolled: 0 };
  const cutoff = dayStr(now - RETENTION.analyticsRawDays * DAY_MS);
  await env.DB.prepare(
    "INSERT OR REPLACE INTO analytics_daily (day,event,tool,plan,events,visitors) SELECT day,event,COALESCE(tool,''),COALESCE(plan,''),COUNT(*),COUNT(DISTINCT visitor_hash) FROM analytics_events WHERE day<? GROUP BY day,event,COALESCE(tool,''),COALESCE(plan,'')"
  ).bind(cutoff).run();
  await env.DB.prepare(
    "INSERT OR REPLACE INTO analytics_daily (day,event,tool,plan,events,visitors) SELECT day,'*','','',COUNT(*),COUNT(DISTINCT visitor_hash) FROM analytics_events WHERE day<? GROUP BY day"
  ).bind(cutoff).run();
  const r = await env.DB.prepare("DELETE FROM analytics_events WHERE day<?").bind(cutoff).run();
  return { rolled: r?.meta?.changes ?? 0 };
}

// Technical tables only. Customer business data is never deleted by a job.
export async function retentionCleanup(env, now = Date.now()) {
  if (!env.DB) return {};
  const run = async (sql, ...b) => (await env.DB.prepare(sql).bind(...b).run())?.meta?.changes ?? 0;
  return {
    sessions: await run("DELETE FROM sessions WHERE expires_at<?", now),
    oauth_states: await run("DELETE FROM oauth_states WHERE created_at<?", now - RETENTION.oauthStateMs),
    rate_limits: await run("DELETE FROM rate_limits WHERE window_start<?", now - RETENTION.rateLimitMs),
  };
}

export const jobs = [
  { name: "platform-retention", run: (env) => retentionCleanup(env) },
  { name: "platform-analytics-rollup", run: (env) => rollupAnalytics(env) },
];
