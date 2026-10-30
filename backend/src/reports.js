// Stored report snapshots, CSV export, expiring share links, optional white-label brand, scheduled reports.
// Snapshots are built ONLY from stored rows; a section without data is {available:false, reason} - never zeros.
// Contract: ../../docs/api/reports.md
import { id as newId, getSubscriptionEntitlements } from "./db.js";
import { sha256Hex } from "./oauth.js";
import { topCompetitors } from "./rank.js";

const DAY_MS = 86400000;
const SHARE_BASE = "https://www.localboost.in/report.html?token=";
export const KINDS = ["weekly", "monthly", "rank", "website_audit", "profile_audit", "reviews", "competitors", "search_console", "actions"];
const KIND_SECTIONS = {
  weekly: ["performance", "rank", "reviews", "search_console", "website_audit", "actions"],
  monthly: ["performance", "rank", "reviews", "search_console", "website_audit", "actions"],
  rank: ["rank"], website_audit: ["website_audit"], profile_audit: ["profile_audit"], reviews: ["reviews"],
  competitors: ["competitors"], search_console: ["search_console"], actions: ["actions"],
};
const DEFAULT_PERIOD_DAYS = { weekly: 7, monthly: 30 };
const MAX_PERIOD_DAYS = 366;
const MAX_ACTIVE_SHARES = 10;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

const clean = (v) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim() : "");
const bad = (ctx, status, code, error, extra = {}) => ctx.json({ error, code, ...extra }, status);
const notFound = (ctx) => bad(ctx, 404, "not_found", "Not found");
async function readBody(request) { try { const b = await request.json(); return b && typeof b === "object" && !Array.isArray(b) ? b : null; } catch { return null; } }
const safeJson = (s, f) => { try { return s ? JSON.parse(s) : f; } catch { return f; } };
const dayStr = (ms) => new Date(ms).toISOString().slice(0, 10);
const round2 = (n) => Math.round(n * 100) / 100;

export function csvCell(v) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // formula-injection guard
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// ---------------------------------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------------------------------
function section(sid, title, source, generatedAt, { data, latestAt = null, reason = null }) {
  const available = !reason;
  return {
    id: sid, title, source, generated_at: generatedAt, available,
    freshness: latestAt == null ? null : { latest_data_at: latestAt, age_days: Math.max(0, Math.floor((generatedAt - latestAt) / DAY_MS)) },
    ...(available ? { data } : { reason }),
  };
}
const sumOrNull = (rows, f) => { const v = rows.filter((r) => r[f] != null); return v.length ? v.reduce((a, r) => a + Number(r[f]), 0) : null; };

async function secPerformance(env, b, p, now) {
  const { results } = await env.DB.prepare("SELECT checked_at,impressions,website_clicks,call_clicks,direction_requests FROM performance_metrics WHERE business_id=? AND checked_at>=? AND checked_at<=? ORDER BY checked_at ASC").bind(b.id, p.start, p.end).all();
  const rows = results || [];
  const src = "Google Business Profile performance sync (performance_metrics)";
  if (!rows.length) return section("performance", "Profile performance", src, now, { reason: "No Google Business Profile performance data was synced for this period." });
  return section("performance", "Profile performance", src, now, {
    latestAt: rows[rows.length - 1].checked_at,
    data: { days_with_data: rows.length, impressions: sumOrNull(rows, "impressions"), website_clicks: sumOrNull(rows, "website_clicks"), call_clicks: sumOrNull(rows, "call_clicks"), direction_requests: sumOrNull(rows, "direction_requests") },
  });
}

async function secRank(env, b, p, now) {
  const src = "Local grid rank scans (rank_scans)";
  const { results } = await env.DB.prepare("SELECT s.keyword_id,k.keyword,s.avg_position,s.visibility,s.created_at,s.state FROM rank_scans s JOIN keywords k ON k.id=s.keyword_id WHERE s.business_id=? AND s.state IN ('completed','partial') AND s.created_at>=? AND s.created_at<=? ORDER BY s.created_at ASC").bind(b.id, p.start, p.end).all();
  const rows = results || [];
  if (!rows.length) return section("rank", "Local rank", src, now, { reason: "No completed rank scans were recorded in this period." });
  const by = new Map();
  for (const r of rows) { if (!by.has(r.keyword_id)) by.set(r.keyword_id, []); by.get(r.keyword_id).push(r); }
  const keywords = [...by.values()].map((list) => {
    const first = list[0], last = list[list.length - 1];
    return {
      keyword: last.keyword, scans: list.length, latest_avg_position: last.avg_position, latest_visibility: last.visibility, latest_scan_at: last.created_at,
      first_avg_position: first.avg_position, change: list.length > 1 && first.avg_position != null && last.avg_position != null ? round2(last.avg_position - first.avg_position) : null,
    };
  }).sort((a, c) => a.keyword.localeCompare(c.keyword));
  return section("rank", "Local rank", src, now, { latestAt: rows[rows.length - 1].created_at, data: { note: "Positions are averages across the scan grid; lower is better. A null position means not found, not zero.", keywords } });
}

async function secReviews(env, b, p, now) {
  const src = "Reviews synced from Google (reviews)";
  const loc = await env.DB.prepare("SELECT COUNT(*) AS n FROM business_locations WHERE business_id=?").bind(b.id).first();
  if (!Number(loc?.n)) return section("reviews", "Reviews", src, now, { reason: "No Google location is linked to this business, so reviews cannot be read." });
  const { results } = await env.DB.prepare("SELECT r.rating,r.review_time,r.reply_status,r.synced_at FROM reviews r JOIN business_locations l ON l.id=r.business_location_id WHERE l.business_id=?").bind(b.id).all();
  const rows = results || [];
  if (!rows.length) return section("reviews", "Reviews", src, now, { reason: "No reviews have been synced for this business yet." });
  const rated = rows.filter((r) => r.rating != null);
  const inPeriod = rows.filter((r) => r.review_time != null && r.review_time >= p.start && r.review_time <= p.end);
  const ratedIn = inPeriod.filter((r) => r.rating != null);
  return section("reviews", "Reviews", src, now, {
    latestAt: Math.max(...rows.map((r) => r.synced_at || 0)) || null,
    data: {
      total_synced: rows.length, average_rating: rated.length ? round2(rated.reduce((a, r) => a + r.rating, 0) / rated.length) : null,
      new_in_period: inPeriod.length, average_rating_in_period: ratedIn.length ? round2(ratedIn.reduce((a, r) => a + r.rating, 0) / ratedIn.length) : null,
      answered: rows.filter((r) => r.reply_status === "answered").length, unanswered: rows.filter((r) => r.reply_status === "unanswered").length, reply_status_unknown: rows.filter((r) => r.reply_status === "unknown").length,
    },
  });
}

async function secSearchConsole(env, b, p, now) {
  const src = "Google Search Console sync (search_console_metrics). Search Console position is web search position, not Maps rank.";
  const { results } = await env.DB.prepare("SELECT date,clicks,impressions,position,created_at FROM search_console_metrics WHERE business_id=? AND query_text IS NULL AND page_url IS NULL AND date>=? AND date<=? ORDER BY date ASC").bind(b.id, dayStr(p.start), dayStr(p.end)).all();
  const rows = results || [];
  if (!rows.length) return section("search_console", "Search Console", src, now, { reason: "No Search Console data is stored for this period. Connect a property and sync to see it." });
  const clicks = sumOrNull(rows, "clicks"), impressions = sumOrNull(rows, "impressions");
  const weighted = rows.filter((r) => r.position != null && r.impressions > 0);
  const wImp = weighted.reduce((a, r) => a + r.impressions, 0);
  const { results: q } = await env.DB.prepare("SELECT query_text,clicks,impressions,position FROM search_console_metrics WHERE business_id=? AND query_text IS NOT NULL ORDER BY clicks DESC, impressions DESC LIMIT 5").bind(b.id).all();
  return section("search_console", "Search Console", src, now, {
    latestAt: Math.max(...rows.map((r) => r.created_at || 0)) || null,
    data: {
      days_with_data: rows.length, clicks, impressions, ctr: clicks != null && impressions > 0 ? round2((clicks / impressions) * 100) / 100 : null,
      average_position: wImp > 0 ? round2(weighted.reduce((a, r) => a + r.position * r.impressions, 0) / wImp) : null,
      top_queries_last_sync_window: (q || []).map((r) => ({ query: r.query_text, clicks: r.clicks, impressions: r.impressions, position: r.position })),
    },
  });
}

async function latestAudit(env, b, p) {
  return env.DB.prepare("SELECT * FROM audits WHERE business_id=? AND audit_type='unified' AND created_at<=? ORDER BY created_at DESC, rowid DESC LIMIT 1").bind(b.id, p.end).first();
}
async function secAudit(env, b, p, now, sid, title, categories) {
  const src = "LocalBoost unified audit (audits, audit_issues)";
  const a = await latestAudit(env, b, p);
  if (!a) return section(sid, title, src, now, { reason: "No audit has been run for this business yet." });
  const ph = categories ? ` AND category IN (${categories.map(() => "?").join(",")})` : "";
  const { results } = await env.DB.prepare(`SELECT code,category,severity,title,status,evidence FROM audit_issues WHERE audit_id=?${ph} ORDER BY created_at ASC`).bind(a.id, ...(categories || [])).all();
  const issues = results || [];
  const open = issues.filter((i) => i.status === "open");
  const sev = { high: 0, medium: 0, low: 0 };
  for (const i of open) if (sev[i.severity] !== undefined) sev[i.severity]++;
  const prev = await env.DB.prepare("SELECT score,created_at FROM audits WHERE business_id=? AND audit_type='unified' AND created_at<? ORDER BY created_at DESC, rowid DESC LIMIT 1").bind(b.id, a.created_at).first();
  const breakdown = safeJson(a.score_breakdown_json, []).filter((s) => !categories || categories.includes(s.section));
  return section(sid, title, src, now, {
    latestAt: a.created_at,
    data: {
      audit_state: a.status, score: a.score, score_note: a.score == null ? "Not enough data was available to compute a score." : "Measures completeness and consistency of listed information; not a ranking prediction.",
      previous_score: prev?.score ?? null, score_change: a.score != null && prev?.score != null ? a.score - prev.score : null,
      open_findings: open.length, open_by_severity: sev,
      sections: breakdown.map((s) => ({ section: s.section, label: s.label, points: s.points, max: s.max, available: s.available })),
      top_findings: open.slice(0, 10).map((i) => ({ code: i.code, severity: i.severity, title: i.title, evidence: i.evidence })),
    },
  });
}

async function secCompetitors(env, b, p, now) {
  const src = "Tracked competitors (competitors) and competitors seen in the latest rank scan (rank_scan_points)";
  const { results: comps } = await env.DB.prepare("SELECT name,website_url FROM competitors WHERE business_id=? AND active=1 ORDER BY name ASC LIMIT 50").bind(b.id).all();
  const scan = await env.DB.prepare("SELECT id,created_at FROM rank_scans WHERE business_id=? AND state IN ('completed','partial') AND created_at<=? ORDER BY created_at DESC LIMIT 1").bind(b.id, p.end).first();
  let seen = null;
  if (scan) {
    const { results: pts } = await env.DB.prepare("SELECT error,competitors_json FROM rank_scan_points WHERE scan_id=?").bind(scan.id).all();
    seen = topCompetitors(pts || [], 10);
  }
  if (!(comps || []).length && !seen) return section("competitors", "Competitors", src, now, { reason: "No competitors are tracked and no rank scan returned competitor data." });
  return section("competitors", "Competitors", src, now, { latestAt: scan?.created_at ?? null, data: { tracked: comps || [], seen_in_latest_scan: seen, seen_note: seen ? null : "The rank provider did not return competitor data for the latest scan." } });
}

async function secActions(env, b, p, now) {
  const src = "Action Center (action_tasks)";
  const { results } = await env.DB.prepare("SELECT priority,status,due_date,completed_at,updated_at FROM action_tasks WHERE business_id=?").bind(b.id).all();
  const rows = results || [];
  if (!rows.length) return section("actions", "Action Center", src, now, { reason: "No Action Center tasks exist for this business." });
  const counted = rows.filter((r) => r.status !== "ignored");
  const done = counted.filter((r) => r.status === "done");
  const today = dayStr(now);
  const by = {};
  for (const r of counted) { by[r.priority] ||= { total: 0, done: 0 }; by[r.priority].total++; if (r.status === "done") by[r.priority].done++; }
  return section("actions", "Action Center", src, now, {
    latestAt: Math.max(...rows.map((r) => r.updated_at || 0)) || null,
    data: {
      total: counted.length, done: done.length, percent_done: counted.length ? Math.round((done.length / counted.length) * 100) : null, by_priority: by,
      completed_in_period: done.filter((r) => r.completed_at != null && r.completed_at >= p.start && r.completed_at <= p.end).length,
      overdue: counted.filter((r) => r.status !== "done" && r.due_date && r.due_date < today).length,
    },
  });
}

const BUILDERS = {
  performance: secPerformance, rank: secRank, reviews: secReviews, search_console: secSearchConsole, competitors: secCompetitors, actions: secActions,
  website_audit: (env, b, p, now) => secAudit(env, b, p, now, "website_audit", "Website audit", ["website_technical", "local_landing_pages", "schema_markup"]),
  profile_audit: (env, b, p, now) => secAudit(env, b, p, now, "profile_audit", "Profile audit", ["profile_completeness", "consistency"]),
};

export async function buildSnapshotData(env, business, kind, period, now = Date.now()) {
  const sections = [];
  for (const sid of KIND_SECTIONS[kind]) sections.push(await BUILDERS[sid](env, business, period, now));
  return {
    schema: 1, kind, generated_at: now, period: { start: period.start, end: period.end },
    business: { name: business.name, category: business.category ?? null, city: business.city ?? null },
    sections,
  };
}

function parsePeriod(body, kind, now) {
  const parse = (v) => {
    if (v === undefined || v === null) return null;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) { const t = Date.parse(v + "T00:00:00Z"); return Number.isNaN(t) ? NaN : t; }
    return NaN;
  };
  let start = parse(body.period_start), end = parse(body.period_end);
  if (Number.isNaN(start) || Number.isNaN(end)) return { error: "period_start and period_end must be YYYY-MM-DD dates or ms timestamps" };
  if (end === null) end = now;
  if (start === null) start = end - (DEFAULT_PERIOD_DAYS[kind] || 30) * DAY_MS;
  if (start >= end) return { error: "period_start must be before period_end" };
  if (end > now + DAY_MS) return { error: "period_end cannot be in the future" };
  if (end - start > MAX_PERIOD_DAYS * DAY_MS) return { error: `period cannot exceed ${MAX_PERIOD_DAYS} days` };
  return { start, end };
}

// ---------------------------------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------------------------------
function flatten(prefix, v, out) {
  if (v === null || v === undefined || typeof v !== "object") { out.push([prefix, v]); return; }
  if (Array.isArray(v)) { if (!v.length) out.push([prefix, ""]); v.forEach((x, i) => flatten(`${prefix}[${i + 1}]`, x, out)); return; }
  for (const [k, x] of Object.entries(v)) flatten(prefix ? `${prefix}.${k}` : k, x, out);
}
export function snapshotToCsv(data) {
  const rows = [["Section", "Metric", "Value", "Available", "Reason", "Source", "Data as of"]];
  rows.push(["report", "kind", data.kind, "", "", "", ""]);
  rows.push(["report", "business", data.business?.name, "", "", "", ""]);
  rows.push(["report", "period", `${dayStr(data.period.start)} to ${dayStr(data.period.end)}`, "", "", "", ""]);
  for (const s of data.sections) {
    const asOf = s.freshness ? new Date(s.freshness.latest_data_at).toISOString() : "";
    if (!s.available) { rows.push([s.id, "", "", "no", s.reason, s.source, asOf]); continue; }
    const flat = []; flatten("", s.data, flat);
    for (const [m, v] of flat) rows.push([s.id, m, v, "yes", "", s.source, asOf]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------------------------------
// Public view helpers
// ---------------------------------------------------------------------------------------------------
// Defence in depth: nothing that looks like an internal id, user reference or email is ever served publicly.
export function stripSensitive(v) {
  if (Array.isArray(v)) return v.map(stripSensitive);
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, x] of Object.entries(v)) { if (/(^|_)ids?$|email|user/i.test(k)) continue; o[k] = stripSensitive(x); }
    return o;
  }
  if (typeof v === "string") return v.replace(/[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/g, "[email removed]");
  return v;
}

export function validateBrand(b) {
  if (b === undefined || b === null) return { value: null };
  if (typeof b !== "object" || Array.isArray(b)) return { error: "brand must be an object" };
  const out = {};
  const name = clean(b.name);
  if (!name || name.length > 60) return { error: "brand.name is required (max 60 characters)" };
  out.name = name;
  if (b.logo_url !== undefined && b.logo_url !== null && b.logo_url !== "") {
    let u;
    try { u = new URL(String(b.logo_url)); } catch { return { error: "brand.logo_url must be an https URL" }; }
    if (u.protocol !== "https:" || u.username || u.password || String(b.logo_url).length > 500) return { error: "brand.logo_url must be an https URL" };
    out.logo_url = u.toString();
  }
  if (b.accent_color !== undefined && b.accent_color !== null && b.accent_color !== "") {
    if (typeof b.accent_color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(b.accent_color)) return { error: "brand.accent_color must be a hex colour like #1a73e8" };
    out.accent_color = b.accent_color.toLowerCase();
  }
  return { value: out };
}

function randomToken() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------------------------------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------------------------------
async function loadSnapshot(ctx, snapshotId) {
  if (typeof snapshotId !== "string" || !snapshotId || snapshotId.length > 80) return null;
  const snap = await ctx.env.DB.prepare("SELECT * FROM report_snapshots WHERE id=? LIMIT 1").bind(snapshotId).first();
  if (!snap) return null;
  const business = await ctx.getUserBusiness(snap.business_id);
  return business ? { snap, business } : null;
}
const snapMeta = (s) => ({ id: s.id, business_id: s.business_id, kind: s.kind, period_start: s.period_start, period_end: s.period_end, generated_at: s.generated_at, scheduled: s.generated_by === "system:schedule" });

async function generateRoute(request, ctx) {
  if (!ctx.env.DB) return bad(ctx, 503, "unavailable", "Database unavailable");
  const b = await readBody(request);
  if (!b) return bad(ctx, 400, "invalid_json", "JSON body required");
  if (!KINDS.includes(b.kind)) return bad(ctx, 400, "invalid_kind", "kind must be one of " + KINDS.join(", "));
  const business = typeof b.business_id === "string" ? await ctx.getUserBusiness(b.business_id) : null;
  if (!business) return notFound(ctx);
  const gate = await ctx.requireFeature("reports_enabled");
  if (!gate.ok) return bad(ctx, 403, "upgrade_required", "Reports are not included in your plan", { required: "pro" });
  const period = parsePeriod(b, b.kind, ctx.now());
  if (period.error) return bad(ctx, 400, "invalid_period", period.error);
  const rl = await ctx.rateLimit("report-generate:" + ctx.userId, 20, 3600000);
  if (!rl.ok) return bad(ctx, rl.unavailable ? 503 : 429, rl.unavailable ? "unavailable" : "rate_limited", "Too many reports, try again later");
  const now = ctx.now();
  const data = await buildSnapshotData(ctx.env, business, b.kind, period, now);
  const sid = newId("rpt");
  await ctx.env.DB.prepare("INSERT INTO report_snapshots (id,business_id,kind,period_start,period_end,data_json,generated_at,generated_by) VALUES (?,?,?,?,?,?,?,?)").bind(sid, business.id, b.kind, period.start, period.end, JSON.stringify(data), now, ctx.userId).run();
  return ctx.json({ snapshot: { ...snapMeta({ id: sid, business_id: business.id, kind: b.kind, period_start: period.start, period_end: period.end, generated_at: now, generated_by: ctx.userId }), data } }, 201);
}

async function listRoute(request, ctx) {
  if (!ctx.env.DB) return bad(ctx, 503, "unavailable", "Database unavailable");
  const bid = ctx.url.searchParams.get("business_id");
  if (!bid) return bad(ctx, 400, "business_id_required", "business_id is required");
  if (!(await ctx.getUserBusiness(bid))) return notFound(ctx);
  const { results } = await ctx.env.DB.prepare("SELECT id,business_id,kind,period_start,period_end,generated_at,generated_by FROM report_snapshots WHERE business_id=? ORDER BY generated_at DESC, rowid DESC LIMIT 100").bind(bid).all();
  return ctx.json({ snapshots: (results || []).map(snapMeta) });
}

async function snapshotRoute(request, ctx) {
  if (!ctx.env.DB) return bad(ctx, 503, "unavailable", "Database unavailable");
  const l = await loadSnapshot(ctx, ctx.url.searchParams.get("id"));
  if (!l) return notFound(ctx);
  return ctx.json({ snapshot: { ...snapMeta(l.snap), data: safeJson(l.snap.data_json, null) } });
}

async function csvRoute(request, ctx) {
  if (!ctx.env.DB) return bad(ctx, 503, "unavailable", "Database unavailable");
  const l = await loadSnapshot(ctx, ctx.url.searchParams.get("id"));
  if (!l) return notFound(ctx);
  const data = safeJson(l.snap.data_json, null);
  if (!data) return bad(ctx, 500, "corrupt_snapshot", "Snapshot data unreadable");
  return new Response(snapshotToCsv(data), { status: 200, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="localboost-report-${l.snap.kind}-${dayStr(l.snap.period_end)}.csv"`, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

async function shareRoute(request, ctx) {
  if (!ctx.env.DB) return bad(ctx, 503, "unavailable", "Database unavailable");
  const b = await readBody(request);
  if (!b) return bad(ctx, 400, "invalid_json", "JSON body required");
  const l = await loadSnapshot(ctx, b.snapshot_id);
  if (!l) return notFound(ctx);
  let days = 30;
  if (b.expires_in_days !== undefined) { days = b.expires_in_days; if (!Number.isInteger(days) || days < 1 || days > 90) return bad(ctx, 400, "invalid_expiry", "expires_in_days must be an integer from 1 to 90"); }
  let brand = null;
  if (b.brand !== undefined && b.brand !== null) {
    const ent = await getSubscriptionEntitlements(ctx.env, ctx.userId);
    if (ent.plan_code !== "agency") return bad(ctx, 403, "upgrade_required", "White-label branding is available on the Agency plan", { required: "agency" });
    const v = validateBrand(b.brand);
    if (v.error) return bad(ctx, 400, "invalid_brand", v.error);
    brand = v.value;
  }
  const now = ctx.now();
  const active = await ctx.env.DB.prepare("SELECT COUNT(*) AS n FROM report_shares WHERE snapshot_id=? AND revoked_at IS NULL AND expires_at>?").bind(l.snap.id, now).first();
  if (Number(active?.n || 0) >= MAX_ACTIVE_SHARES) return bad(ctx, 409, "share_limit", `At most ${MAX_ACTIVE_SHARES} active links per report; revoke one first`);
  const token = randomToken();
  const shareId = newId("shr"), expiresAt = now + days * DAY_MS;
  await ctx.env.DB.prepare("INSERT INTO report_shares (id,snapshot_id,token_hash,expires_at,created_by,created_at,view_count,brand_json) VALUES (?,?,?,?,?,?,0,?)")
    .bind(shareId, l.snap.id, await sha256Hex(token), expiresAt, ctx.userId, now, brand ? JSON.stringify(brand) : null).run();
  return ctx.json({ share_id: shareId, url: SHARE_BASE + token, expires_at: expiresAt, note: "This link is shown once. Only a hash is stored, so it cannot be recovered; create a new link if lost." }, 201);
}

async function loadShare(ctx, shareId) {
  if (typeof shareId !== "string" || !shareId || shareId.length > 80) return null;
  const share = await ctx.env.DB.prepare("SELECT * FROM report_shares WHERE id=? LIMIT 1").bind(shareId).first();
  if (!share) return null;
  const l = await loadSnapshot(ctx, share.snapshot_id);
  return l ? { share, ...l } : null;
}

async function revokeRoute(request, ctx) {
  if (!ctx.env.DB) return bad(ctx, 503, "unavailable", "Database unavailable");
  const b = await readBody(request);
  if (!b) return bad(ctx, 400, "invalid_json", "JSON body required");
  const l = await loadShare(ctx, b.share_id);
  if (!l) return notFound(ctx);
  const now = ctx.now();
  await ctx.env.DB.prepare("UPDATE report_shares SET revoked_at=COALESCE(revoked_at,?) WHERE id=?").bind(now, l.share.id).run();
  return ctx.json({ ok: true, revoked_at: l.share.revoked_at ?? now });
}

async function sharesRoute(request, ctx) {
  if (!ctx.env.DB) return bad(ctx, 503, "unavailable", "Database unavailable");
  const l = await loadSnapshot(ctx, ctx.url.searchParams.get("snapshot_id"));
  if (!l) return notFound(ctx);
  const { results } = await ctx.env.DB.prepare("SELECT id,expires_at,revoked_at,created_at,view_count,last_viewed_at,brand_json FROM report_shares WHERE snapshot_id=? ORDER BY created_at DESC LIMIT 50").bind(l.snap.id).all();
  const now = ctx.now();
  return ctx.json({ shares: (results || []).map((s) => ({ share_id: s.id, expires_at: s.expires_at, revoked_at: s.revoked_at, created_at: s.created_at, view_count: s.view_count, last_viewed_at: s.last_viewed_at, white_label: !!s.brand_json, status: s.revoked_at ? "revoked" : s.expires_at <= now ? "expired" : "active" })) });
}

const NOT_FOUND_PUBLIC = { error: "Report not found", code: "not_found" };
async function sharedRoute(request, ctx) {
  const headers = { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer" };
  const rl = await ctx.rateLimit("report-shared:" + ctx.ip, 30, 60000);
  if (!rl.ok) return Response.json({ error: rl.unavailable ? "Service unavailable" : "Too many requests", code: rl.unavailable ? "unavailable" : "rate_limited" }, { status: rl.unavailable ? 503 : 429, headers });
  const miss = () => Response.json(NOT_FOUND_PUBLIC, { status: 404, headers });
  const token = ctx.url.searchParams.get("token");
  if (!ctx.env.DB || typeof token !== "string" || !TOKEN_RE.test(token)) return miss();
  const now = ctx.now();
  const row = await ctx.env.DB.prepare("SELECT s.id AS share_id, s.expires_at, s.revoked_at, s.brand_json, r.data_json, r.kind, r.period_start, r.period_end, r.generated_at FROM report_shares s JOIN report_snapshots r ON r.id=s.snapshot_id WHERE s.token_hash=? LIMIT 1").bind(await sha256Hex(token)).first();
  if (!row || row.revoked_at != null || row.expires_at <= now) return miss();
  await ctx.env.DB.prepare("UPDATE report_shares SET view_count=view_count+1,last_viewed_at=? WHERE id=?").bind(now, row.share_id).run();
  const data = safeJson(row.data_json, null);
  if (!data) return miss();
  return Response.json({
    report: stripSensitive({ kind: row.kind, period_start: row.period_start, period_end: row.period_end, generated_at: row.generated_at, business: data.business, sections: data.sections }),
    brand: row.brand_json ? safeJson(row.brand_json, null) : null,
    expires_at: row.expires_at,
  }, { headers });
}

async function scheduleRoute(request, ctx) {
  if (!ctx.env.DB) return bad(ctx, 503, "unavailable", "Database unavailable");
  const b = await readBody(request);
  if (!b) return bad(ctx, 400, "invalid_json", "JSON body required");
  if (!["weekly", "monthly"].includes(b.kind)) return bad(ctx, 400, "invalid_kind", "kind must be weekly or monthly");
  if (typeof b.active !== "boolean") return bad(ctx, 400, "invalid_active", "active must be true or false");
  const business = typeof b.business_id === "string" ? await ctx.getUserBusiness(b.business_id) : null;
  if (!business) return notFound(ctx);
  if (b.active) { const gate = await ctx.requireFeature("reports_enabled"); if (!gate.ok) return bad(ctx, 403, "upgrade_required", "Scheduled reports are not included in your plan", { required: "pro" }); }
  const now = ctx.now();
  await ctx.env.DB.prepare("INSERT INTO report_schedules (id,business_id,user_id,kind,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(business_id,kind) DO UPDATE SET active=excluded.active,user_id=excluded.user_id,updated_at=excluded.updated_at")
    .bind(newId("rsc"), business.id, ctx.userId, b.kind, +b.active, now, now).run();
  return ctx.json({ ok: true, business_id: business.id, kind: b.kind, active: b.active });
}

async function schedulesRoute(request, ctx) {
  if (!ctx.env.DB) return bad(ctx, 503, "unavailable", "Database unavailable");
  const bid = ctx.url.searchParams.get("business_id");
  if (!bid) return bad(ctx, 400, "business_id_required", "business_id is required");
  if (!(await ctx.getUserBusiness(bid))) return notFound(ctx);
  const { results } = await ctx.env.DB.prepare("SELECT kind,active FROM report_schedules WHERE business_id=? ORDER BY kind").bind(bid).all();
  return ctx.json({ schedules: (results || []).map((r) => ({ kind: r.kind, active: !!r.active })) });
}

// ---------------------------------------------------------------------------------------------------
// Scheduled job: last completed UTC week / calendar month, once per business+kind+period.
// ---------------------------------------------------------------------------------------------------
export function schedulePeriod(kind, now) {
  const d = new Date(now);
  if (kind === "weekly") {
    const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const end = midnight - ((d.getUTCDay() + 6) % 7) * DAY_MS; // this week's Monday 00:00 UTC
    return { start: end - 7 * DAY_MS, end };
  }
  return { start: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1), end: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) };
}

export async function runScheduledReports(env, now = Date.now()) {
  const stats = { created: 0, existing: 0, skipped: 0 };
  if (!env?.DB) return stats;
  const { results } = await env.DB.prepare("SELECT s.id,s.business_id,s.kind,s.user_id FROM report_schedules s JOIN businesses b ON b.id=s.business_id WHERE s.active=1 AND b.status='active' AND b.user_id=s.user_id LIMIT 100").all();
  for (const s of results || []) {
    const period = schedulePeriod(s.kind, now);
    const exists = await env.DB.prepare("SELECT id FROM report_snapshots WHERE business_id=? AND kind=? AND period_start=? AND period_end=? AND generated_by='system:schedule' LIMIT 1").bind(s.business_id, s.kind, period.start, period.end).first();
    if (exists) { stats.existing++; continue; }
    const ent = await getSubscriptionEntitlements(env, s.user_id);
    if (!ent.reports_enabled) { stats.skipped++; continue; }
    const business = await env.DB.prepare("SELECT * FROM businesses WHERE id=?").bind(s.business_id).first();
    const data = await buildSnapshotData(env, business, s.kind, period, now);
    const sid = newId("rpt");
    const r = await env.DB.prepare("INSERT OR IGNORE INTO report_snapshots (id,business_id,kind,period_start,period_end,data_json,generated_at,generated_by) VALUES (?,?,?,?,?,?,?,'system:schedule')").bind(sid, s.business_id, s.kind, period.start, period.end, JSON.stringify(data), now).run();
    if (r.meta?.changes) { stats.created++; await env.DB.prepare("UPDATE report_schedules SET last_snapshot_id=?,updated_at=? WHERE id=?").bind(sid, now, s.id).run(); } else stats.existing++;
  }
  return stats;
}

export const routes = [
  { method: "POST", path: "/api/reports/generate", auth: "session", handler: generateRoute },
  { method: "GET", path: "/api/reports/list", auth: "session", handler: listRoute },
  { method: "GET", path: "/api/reports/snapshot", auth: "session", handler: snapshotRoute },
  { method: "GET", path: "/api/reports/export.csv", auth: "session", handler: csvRoute },
  { method: "POST", path: "/api/reports/share", auth: "session", handler: shareRoute },
  { method: "POST", path: "/api/reports/share/revoke", auth: "session", handler: revokeRoute },
  { method: "GET", path: "/api/reports/shares", auth: "session", handler: sharesRoute },
  { method: "GET", path: "/api/reports/shared", auth: "public", handler: sharedRoute },
  { method: "POST", path: "/api/reports/schedule", auth: "session", handler: scheduleRoute },
  { method: "GET", path: "/api/reports/schedules", auth: "session", handler: schedulesRoute },
];
export const jobs = [{ name: "reports-scheduled", run: (env) => runScheduledReports(env) }];
