// Real local rank-grid tracking engine (module `rank`). See docs/API-CONTRACT.md "rank".
//
// IMPORTANT, read before changing:
//  * Google Business Profile APIs do NOT provide local rank grids. Real rank data comes ONLY from a
//    separately licensed third-party rank provider, called server-side.
//  * No provider's India coverage, pricing or terms has been verified. The adapter below is
//    provider-agnostic (generic HTTP, same contract as queryRankProvider in index.js, plus optional
//    lat/lng). Do not claim any vendor is verified.
//  * A grid point where the business is not in the provider result has position null. Missing
//    observations are NEVER filled, interpolated or estimated. A failed provider call is stored with
//    `error` set (distinct from "not found") and also has position null.
//  * This module never shares tables or code with the educational rank-grid simulator.
//
// Definitions:
//  * avg_position  = arithmetic mean of non-null positions (points where the business was found).
//  * visibility    = (# observed points with position 1..3) / (# observed points), range 0..1.
//    "Observed" = provider call succeeded (found or not found); errored points are excluded.
//    Not-found counts as not visible. null when there are no observed points.

export const GRID_SIZES = [3, 5, 7];
const EARTH_R_M = 6371008.8;
const M_PER_DEG_LAT = (Math.PI / 180) * EARTH_R_M;
const CONCURRENCY = 4;
const TIMEOUT_MS = 8000;
const MAX_ATTEMPTS = 3;
const MAX_JOBS_PER_TICK = 10;
const MAX_SCHEDULES_PER_USER = 20;
const MATERIAL_CHANGE = 1.5;

// ---------- geometry (pure) ----------
export function metersToDegrees(lat, dxMeters, dyMeters) {
  const dLat = dyMeters / M_PER_DEG_LAT;
  const dLng = dxMeters / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
  return { dLat, dLng };
}

// radius_m = distance from the centre to the outer ring along each axis. Row 0 is the northern edge,
// col 0 the western edge.
export function buildGrid(centerLat, centerLng, size, radiusM) {
  const half = (size - 1) / 2;
  const step = half === 0 ? 0 : radiusM / half;
  const pts = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const north = (half - r) * step;
      const east = (c - half) * step;
      const { dLat, dLng } = metersToDegrees(centerLat, east, north);
      pts.push({ row: r, col: c, lat: round6(centerLat + dLat), lng: round6(centerLng + dLng) });
    }
  }
  return pts;
}
const round6 = (n) => Math.round(n * 1e6) / 1e6;
const validLat = (v) => Number.isFinite(v) && Math.abs(v) <= 85;
const validLng = (v) => Number.isFinite(v) && Math.abs(v) <= 180;

// ---------- aggregates (pure) ----------
export function aggregate(points) {
  const observed = points.filter((p) => !p.error);
  const found = observed.filter((p) => p.position != null);
  const avg = found.length ? round2(found.reduce((s, p) => s + p.position, 0) / found.length) : null;
  const vis = observed.length ? round4(observed.filter((p) => p.position != null && p.position <= 3).length / observed.length) : null;
  return { avg_position: avg, visibility: vis, observed: observed.length, failed: points.length - observed.length };
}
const round2 = (n) => Math.round(n * 100) / 100;
const round4 = (n) => Math.round(n * 10000) / 10000;

// ---------- plan limits ----------
const PLAN_LIMITS = { free: { points: 9, scans: 4 }, pro: { points: 25, scans: 30 }, agency: { points: 49, scans: 200 } };
export function limitsFor(env, planCode) {
  const base = PLAN_LIMITS[planCode] || PLAN_LIMITS.pro;
  const p = Number(env?.RANK_MAX_POINTS_PER_SCAN), s = Number(env?.RANK_MAX_SCANS_PER_MONTH);
  return { points: Number.isFinite(p) && p > 0 ? p : base.points, scans: Number.isFinite(s) && s > 0 ? s : base.scans };
}

// ---------- provider adapter ----------
export function providerState(env) {
  return env?.RANK_PROVIDER_ENABLED === "true" && env?.RANK_PROVIDER_URL ? "configured" : "awaiting_rank_provider";
}
export function makeProvider(env, opts = {}) {
  return {
    url: env.RANK_PROVIDER_URL,
    token: env.RANK_PROVIDER_TOKEN || "",
    name: env.RANK_PROVIDER_NAME || "configured_provider",
    timeoutMs: opts.timeoutMs || TIMEOUT_MS,
    maxAttempts: opts.maxAttempts || MAX_ATTEMPTS,
    retryDelayMs: Number.isFinite(Number(env.RANK_RETRY_DELAY_MS)) && env.RANK_RETRY_DELAY_MS !== undefined ? Number(env.RANK_RETRY_DELAY_MS) : 300,
  };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const posInt = (v) => { const n = Number(v); return v !== null && v !== "" && v !== undefined && Number.isInteger(n) && n >= 1 ? n : null; };

function normCompetitors(list) {
  if (!Array.isArray(list)) return null;
  const out = list.filter((c) => c && typeof c.name === "string" && c.name.trim()).map((c) => ({ name: c.name.trim().slice(0, 200), position: posInt(c.position) }));
  return out.length ? out : null;
}

// scanPoint -> {position|null, ranking_url|null, visibility|null, raw_count, competitors|null, provider, error?}
// On failure: position null and `error` set (never "not found").
export async function scanPoint(provider, { keyword, lat, lng, device, businessMatch }) {
  const body = JSON.stringify({
    keyword, location: businessMatch?.location_name || "", device: device || "desktop",
    business_id: businessMatch?.business_id, business_name: businessMatch?.name, lat, lng,
  });
  let lastErr = "provider_request_failed";
  for (let attempt = 1; attempt <= provider.maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), provider.timeoutMs);
    let retryable = true;
    try {
      const res = await fetch(provider.url, {
        method: "POST", signal: controller.signal, body,
        headers: { "content-type": "application/json", authorization: provider.token ? "Bearer " + provider.token : "" },
      });
      if (!res.ok) {
        lastErr = "provider_http_" + res.status;
        retryable = res.status === 429 || res.status >= 500;
      } else {
        const data = await res.json().catch(() => null);
        if (!data || !Array.isArray(data.results)) { lastErr = "provider_bad_response"; retryable = false; }
        else {
          const first = data.results.find((x) => x && posInt(x.position) != null) || null;
          const vis = first && Number.isFinite(Number(first.visibility)) && first.visibility !== null ? Number(first.visibility) : null;
          return {
            position: first ? posInt(first.position) : null,
            ranking_url: first && typeof first.ranking_url === "string" ? first.ranking_url : null,
            visibility: vis,
            raw_count: data.results.length,
            competitors: normCompetitors(data.competitors) || normCompetitors(data.results[0]?.competitors),
            provider: (typeof data.provider === "string" && data.provider) || (typeof data.results[0]?.provider === "string" && data.results[0].provider) || provider.name,
          };
        }
      }
    } catch (e) {
      lastErr = e?.name === "AbortError" ? "timeout" : "provider_request_failed";
    } finally { clearTimeout(timer); }
    if (!retryable || attempt === provider.maxAttempts) break;
    await sleep(provider.retryDelayMs * attempt);
  }
  return { position: null, ranking_url: null, visibility: null, raw_count: 0, competitors: null, provider: provider.name, error: lastErr };
}

async function pool(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const item = items[i++]; await fn(item); }
  });
  await Promise.all(workers);
}

// ---------- centre resolution ----------
export async function resolveCenter(env, business) {
  const DB = env.DB;
  const ok = (la, ln, source) => { la = Number(la); ln = Number(ln); return validLat(la) && validLng(ln) ? { lat: la, lng: ln, source } : null; };
  try {
    const bl = await DB.prepare("SELECT latitude,longitude,google_resource_name FROM business_locations WHERE business_id=? ORDER BY updated_at DESC LIMIT 1").bind(business.id).first();
    if (bl) {
      if (bl.latitude != null && bl.longitude != null) { const c = ok(bl.latitude, bl.longitude, "google_location"); if (c) return c; }
      if (bl.google_resource_name) {
        const gl = await DB.prepare("SELECT raw_json FROM google_locations WHERE user_id=? AND resource_name=?").bind(business.user_id, bl.google_resource_name).first();
        if (gl?.raw_json) {
          try { const ll = JSON.parse(gl.raw_json)?.latlng; const c = ll && ok(ll.latitude, ll.longitude, "google_location"); if (c) return c; } catch {}
        }
      }
    }
  } catch {}
  try { // user-supplied columns, if the platform module added them
    const r = await DB.prepare("SELECT lat,lng FROM businesses WHERE id=?").bind(business.id).first();
    const c = r && r.lat != null && r.lng != null && ok(r.lat, r.lng, "user_supplied"); if (c) return c;
  } catch {}
  try { // user-supplied lat/lng inside address_json
    const a = JSON.parse(business.address_json || "null");
    if (a) { const c = ok(a.lat ?? a.latitude, a.lng ?? a.longitude, "user_supplied"); if (c) return c; }
  } catch {}
  return null;
}

// ---------- scan execution ----------
const dayStr = (t) => new Date(t).toISOString().slice(0, 10);
const monthStart = (t) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };
const newId = (p) => p + "_" + crypto.randomUUID();

async function monthlyScanCount(env, userId, now) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM rank_scans WHERE user_id=? AND created_at>=?").bind(userId, monthStart(now)).first();
  return Number(r?.n || 0);
}

// Returns {status, body}. Used by the endpoint and the cron job.
export async function executeScan(env, { userId, business, keyword, gridSize, radiusM, planCode, limits, scheduleId = null, now = Date.now(), skipCapCheck = false }) {
  if (providerState(env) !== "configured") return { status: 200, body: { scan_id: null, state: "awaiting_rank_provider", points: 0 } };
  const center = await resolveCenter(env, business);
  if (!center) return { status: 200, body: { scan_id: null, state: "awaiting_location", points: 0 } };
  const lim = limits || limitsFor(env, planCode);
  const total = gridSize * gridSize;
  if (total > lim.points) return { status: 403, body: { error: "Grid exceeds plan limit", code: "plan_points_limit", max_points: lim.points } };
  if (!skipCapCheck && (await monthlyScanCount(env, userId, now)) >= lim.scans) {
    return { status: 403, body: { error: "Monthly scan limit reached", code: "scan_cap_reached", max_scans: lim.scans } };
  }
  const provider = makeProvider(env);
  const grid = buildGrid(center.lat, center.lng, gridSize, radiusM);
  const scanId = newId("scan");
  const DB = env.DB;
  await DB.prepare("INSERT INTO rank_scans (id,user_id,business_id,keyword_id,grid_size,radius_m,center_lat,center_lng,center_source,state,points_total,schedule_id,scan_date,created_at) VALUES (?,?,?,?,?,?,?,?,?,'running',?,?,?,?)")
    .bind(scanId, userId, business.id, keyword.id, gridSize, radiusM, center.lat, center.lng, center.source, total, scheduleId, dayStr(now), now).run();
  const results = [];
  let providerName = null, attempted = 0;
  try {
    await pool(grid, CONCURRENCY, async (pt) => {
      attempted++;
      const r = await scanPoint(provider, {
        keyword: keyword.keyword, lat: pt.lat, lng: pt.lng, device: keyword.device,
        businessMatch: { business_id: business.id, name: business.name, location_name: keyword.location_name },
      });
      const observedAt = Date.now();
      if (!r.error && !providerName) providerName = r.provider;
      results.push({ position: r.position, error: r.error || null });
      await DB.prepare("INSERT INTO rank_scan_points (id,scan_id,grid_row,grid_col,lat,lng,position,ranking_url,visibility,raw_count,error,competitors_json,provider,observed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(newId("pt"), scanId, pt.row, pt.col, pt.lat, pt.lng, r.position, r.ranking_url, r.visibility, r.raw_count, r.error || null, r.competitors ? JSON.stringify(r.competitors) : null, r.provider, observedAt).run();
    });
  } catch {
    await DB.prepare("UPDATE rank_scans SET state='provider_error',provider=?,completed_at=? WHERE id=?").bind(providerName || provider.name, Date.now(), scanId).run();
    return { status: 200, body: { scan_id: scanId, state: "provider_error", points: results.length } };
  }
  const agg = aggregate(results);
  const state = agg.observed === 0 ? "provider_error" : agg.failed > 0 ? "partial" : "completed";
  await DB.prepare("UPDATE rank_scans SET state=?,provider=?,points_ok=?,points_failed=?,avg_position=?,visibility=?,completed_at=? WHERE id=?")
    .bind(state, providerName || provider.name, agg.observed, agg.failed, agg.avg_position, agg.visibility, Date.now(), scanId).run();
  // usage: units = points sent to the provider, so cost can be tracked.
  const unitCost = Number(env.RANK_COST_PER_POINT_MINOR);
  await DB.prepare("INSERT INTO usage_events (id,user_id,business_id,event_type,provider,units,estimated_cost_minor,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(newId("use"), userId, business.id, "rank_scan_points", providerName || provider.name, attempted, Number.isFinite(unitCost) && env.RANK_COST_PER_POINT_MINOR !== undefined ? Math.round(unitCost * attempted) : null, JSON.stringify({ scan_id: scanId, failed: agg.failed }), Date.now()).run();
  if (state === "completed") await maybeRecordChange(env, { userId, business, keyword, scanId, gridSize, radiusM, avg: agg.avg_position, createdAt: now });
  return { status: 200, body: { scan_id: scanId, state, points: total } };
}

// Monitoring event only when two consecutive completed scans (same keyword/grid/radius) both have real averages.
async function maybeRecordChange(env, { userId, business, keyword, scanId, gridSize, radiusM, avg, createdAt }) {
  if (avg == null) return;
  const prev = await env.DB.prepare("SELECT id,avg_position FROM rank_scans WHERE business_id=? AND keyword_id=? AND grid_size=? AND radius_m=? AND state='completed' AND id<>? AND created_at<=? ORDER BY created_at DESC, completed_at DESC LIMIT 1")
    .bind(business.id, keyword.id, gridSize, radiusM, scanId, createdAt).first();
  if (!prev || prev.avg_position == null) return;
  const delta = round2(avg - prev.avg_position); // positive = worse (higher number)
  if (Math.abs(delta) < MATERIAL_CHANGE) return;
  const better = delta < 0;
  await env.DB.prepare("INSERT INTO monitoring_events (id,user_id,business_id,event_type,severity,title,detail,reference_json,detected_at,status) VALUES (?,?,?,?,?,?,?,?,?,'open')")
    .bind(newId("evt"), userId, business.id, "rank_change", better ? "info" : "warning",
      `Local rank ${better ? "improved" : "dropped"} for "${keyword.keyword}"`,
      `Average grid position moved from ${prev.avg_position} to ${avg} (${delta > 0 ? "+" : ""}${delta}).`,
      JSON.stringify({ scan_id: scanId, previous_scan_id: prev.id, keyword_id: keyword.id, delta }), Date.now()).run();
}

// ---------- helpers for handlers ----------
const bad = (ctx, msg, code, status = 400) => ctx.json({ error: msg, code }, status);
async function readBody(request) { try { return await request.json(); } catch { return null; } }
function validGrid(body) {
  const gridSize = Number(body?.grid_size), radiusM = Number(body?.radius_m);
  if (!GRID_SIZES.includes(gridSize)) return { err: "grid_size must be 3, 5 or 7" };
  if (!Number.isInteger(radiusM) || radiusM < 100 || radiusM > 50000) return { err: "radius_m must be an integer between 100 and 50000" };
  return { gridSize, radiusM };
}
async function getKeyword(ctx, businessId, keywordId) {
  return ctx.env.DB.prepare("SELECT id,keyword,location_name,device FROM keywords WHERE id=? AND business_id=?").bind(keywordId, businessId).first();
}
const planOf = (gate) => gate?.entitlements?.plan_code || gate?.entitlements?.plan || null;
async function gated(ctx) {
  const gate = await ctx.requireFeature("rank_tracking_enabled");
  if (!gate?.ok) return { deny: ctx.json({ error: "Rank tracking is not available on your plan", code: "feature_not_available", feature: "rank_tracking_enabled" }, 403) };
  return { gate };
}

// ---------- handlers ----------
async function createScan(request, ctx) {
  const { gate, deny } = await gated(ctx); if (deny) return deny;
  const body = await readBody(request);
  const g = validGrid(body); if (g.err) return bad(ctx, g.err, "invalid_input");
  const business = body?.business_id ? await ctx.getUserBusiness(body.business_id) : null;
  if (!business) return bad(ctx, "Business not found", "not_found", 404);
  const keyword = body?.keyword_id ? await getKeyword(ctx, business.id, body.keyword_id) : null;
  if (!keyword) return bad(ctx, "Keyword not found", "not_found", 404);
  const rl = await ctx.rateLimit("rank:scan:" + ctx.userId, 10, 3600000);
  if (!rl.ok) return bad(ctx, "Too many scans, try later", "rate_limited", 429);
  const r = await executeScan(ctx.env, { userId: ctx.userId, business: { ...business, user_id: ctx.userId }, keyword, gridSize: g.gridSize, radiusM: g.radiusM, planCode: planOf(gate), now: ctx.now() });
  return ctx.json(r.body, r.status);
}

async function listScans(request, ctx) {
  const business = await ctx.getUserBusiness(ctx.url.searchParams.get("business_id"));
  if (!business) return bad(ctx, "Business not found", "not_found", 404);
  const kw = ctx.url.searchParams.get("keyword_id");
  const q = kw
    ? ctx.env.DB.prepare("SELECT id,created_at,grid_size,radius_m,avg_position,visibility,state,provider FROM rank_scans WHERE user_id=? AND business_id=? AND keyword_id=? ORDER BY created_at DESC LIMIT 100").bind(ctx.userId, business.id, kw)
    : ctx.env.DB.prepare("SELECT id,created_at,grid_size,radius_m,avg_position,visibility,state,provider,keyword_id FROM rank_scans WHERE user_id=? AND business_id=? ORDER BY created_at DESC LIMIT 100").bind(ctx.userId, business.id);
  const { results } = await q.all();
  return ctx.json({ scans: results || [] });
}

async function loadScan(ctx, id) {
  if (!id) return null;
  return ctx.env.DB.prepare("SELECT s.*, k.keyword AS keyword FROM rank_scans s JOIN keywords k ON k.id=s.keyword_id JOIN businesses b ON b.id=s.business_id WHERE s.id=? AND s.user_id=? AND b.user_id=?").bind(id, ctx.userId, ctx.userId).first();
}
async function loadPoints(ctx, scanId) {
  const { results } = await ctx.env.DB.prepare("SELECT grid_row,grid_col,lat,lng,position,ranking_url,error,competitors_json,provider,observed_at FROM rank_scan_points WHERE scan_id=? ORDER BY grid_row,grid_col").bind(scanId).all();
  return results || [];
}

export function topCompetitors(points, limit = 10) {
  const observed = points.filter((p) => !p.error);
  const m = new Map();
  let any = false;
  for (const p of observed) {
    let list = null;
    try { list = p.competitors_json ? JSON.parse(p.competitors_json) : null; } catch {}
    if (!list) continue;
    any = true;
    for (const c of list) {
      const e = m.get(c.name) || { name: c.name, points_top3: 0, points_listed: 0, sum: 0, n: 0 };
      e.points_listed++;
      if (c.position != null) { e.sum += c.position; e.n++; if (c.position <= 3) e.points_top3++; }
      m.set(c.name, e);
    }
  }
  if (!any) return null; // absent from provider -> omitted, never synthesised
  return [...m.values()].map((e) => ({ name: e.name, share: round4(e.points_top3 / observed.length), points_top3: e.points_top3, points_listed: e.points_listed, avg_position: e.n ? round2(e.sum / e.n) : null }))
    .sort((a, b) => b.share - a.share || a.name.localeCompare(b.name)).slice(0, limit);
}

async function scanDetail(request, ctx) {
  const scan = await loadScan(ctx, ctx.url.searchParams.get("id"));
  if (!scan) return bad(ctx, "Scan not found", "not_found", 404);
  const pts = await loadPoints(ctx, scan.id);
  const points = pts.map((p) => ({ row: p.grid_row, col: p.grid_col, lat: p.lat, lng: p.lng, position: p.position, observed_at: p.observed_at, provider: p.provider, ranking_url: p.ranking_url, error: p.error || undefined }));
  const out = {
    scan: { id: scan.id, created_at: scan.created_at, grid_size: scan.grid_size, radius_m: scan.radius_m, state: scan.state, provider: scan.provider, keyword_id: scan.keyword_id, keyword: scan.keyword, center: { lat: scan.center_lat, lng: scan.center_lng, source: scan.center_source }, points_failed: scan.points_failed },
    points, avg_position: scan.avg_position, visibility: scan.visibility,
  };
  const comp = topCompetitors(pts);
  if (comp) out.top_competitors = comp;
  return ctx.json(out);
}

async function history(request, ctx) {
  const business = await ctx.getUserBusiness(ctx.url.searchParams.get("business_id"));
  if (!business) return bad(ctx, "Business not found", "not_found", 404);
  const kw = ctx.url.searchParams.get("keyword_id");
  const { results } = await ctx.env.DB.prepare("SELECT scan_date,avg_position,visibility,created_at FROM rank_scans WHERE user_id=? AND business_id=? AND keyword_id=? AND state IN ('completed','partial') ORDER BY created_at ASC").bind(ctx.userId, business.id, kw).all();
  const byDate = new Map(); // latest scan of the day wins
  for (const r of results || []) byDate.set(r.scan_date, { date: r.scan_date, avg_position: r.avg_position, visibility: r.visibility });
  return ctx.json({ history: [...byDate.values()] });
}

export function csvCell(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // CSV/formula injection guard (strings only; numbers stay numeric)
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function exportCsv(request, ctx) {
  const scan = await loadScan(ctx, ctx.url.searchParams.get("scan_id"));
  if (!scan) return bad(ctx, "Scan not found", "not_found", 404);
  const pts = await loadPoints(ctx, scan.id);
  const head = ["scan_id", "keyword", "provider", "observed_at", "row", "col", "lat", "lng", "position", "status", "ranking_url"];
  const lines = [head.join(",")];
  for (const p of pts) {
    const status = p.error ? "error" : p.position == null ? "not_found" : "found";
    lines.push([scan.id, scan.keyword, p.provider, new Date(p.observed_at).toISOString(), p.grid_row, p.grid_col, p.lat, p.lng, p.position, status, p.ranking_url].map(csvCell).join(","));
  }
  return new Response(lines.join("\r\n") + "\r\n", { status: 200, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="rank-scan-${scan.id}.csv"`, "cache-control": "no-store" } });
}

const nextRun = (from, freq) => {
  if (freq === "weekly") return from + 7 * 86400000;
  const d = new Date(from); d.setUTCMonth(d.getUTCMonth() + 1); return d.getTime();
};

async function upsertSchedule(request, ctx) {
  const { gate, deny } = await gated(ctx); if (deny) return deny;
  const body = await readBody(request);
  const g = validGrid(body); if (g.err) return bad(ctx, g.err, "invalid_input");
  if (!["weekly", "monthly"].includes(body?.frequency)) return bad(ctx, "frequency must be weekly or monthly", "invalid_input");
  const business = body?.business_id ? await ctx.getUserBusiness(body.business_id) : null;
  if (!business) return bad(ctx, "Business not found", "not_found", 404);
  const keyword = body?.keyword_id ? await getKeyword(ctx, business.id, body.keyword_id) : null;
  if (!keyword) return bad(ctx, "Keyword not found", "not_found", 404);
  const plan = planOf(gate);
  const lim = limitsFor(ctx.env, plan);
  if (g.gridSize * g.gridSize > lim.points) return ctx.json({ error: "Grid exceeds plan limit", code: "plan_points_limit", max_points: lim.points }, 403);
  const DB = ctx.env.DB, now = ctx.now();
  const active = body.active === false ? 0 : 1;
  const existing = await DB.prepare("SELECT id,active FROM scan_schedules WHERE business_id=? AND keyword_id=? AND user_id=?").bind(business.id, keyword.id, ctx.userId).first();
  if (existing) {
    await DB.prepare("UPDATE scan_schedules SET grid_size=?,radius_m=?,frequency=?,plan_code=?,active=?,next_run_at=CASE WHEN ?=1 AND active=0 THEN ? ELSE next_run_at END,updated_at=? WHERE id=? AND user_id=?")
      .bind(g.gridSize, g.radiusM, body.frequency, plan, active, active, now, now, existing.id, ctx.userId).run();
    return ctx.json({ ok: true, id: existing.id });
  }
  const c = await DB.prepare("SELECT COUNT(*) AS n FROM scan_schedules WHERE user_id=?").bind(ctx.userId).first();
  if (Number(c?.n || 0) >= MAX_SCHEDULES_PER_USER) return ctx.json({ error: "Schedule limit reached", code: "schedule_cap_reached" }, 403);
  const id = newId("sch");
  await DB.prepare("INSERT INTO scan_schedules (id,user_id,business_id,keyword_id,grid_size,radius_m,frequency,plan_code,next_run_at,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id, ctx.userId, business.id, keyword.id, g.gridSize, g.radiusM, body.frequency, plan, now, active, now, now).run();
  return ctx.json({ ok: true, id }, 201);
}

async function listSchedules(request, ctx) {
  const business = await ctx.getUserBusiness(ctx.url.searchParams.get("business_id"));
  if (!business) return bad(ctx, "Business not found", "not_found", 404);
  const { results } = await ctx.env.DB.prepare("SELECT id,keyword_id,grid_size,radius_m,frequency,next_run_at,active,last_run_at,last_scan_id FROM scan_schedules WHERE user_id=? AND business_id=? ORDER BY created_at").bind(ctx.userId, business.id).all();
  return ctx.json({ schedules: (results || []).map((s) => ({ ...s, active: !!s.active })) });
}

export const routes = [
  { method: "POST", path: "/api/rank/scans", auth: "session", handler: createScan },
  { method: "GET", path: "/api/rank/scans", auth: "session", handler: listScans },
  { method: "GET", path: "/api/rank/scans/detail", auth: "session", handler: scanDetail },
  { method: "GET", path: "/api/rank/history", auth: "session", handler: history },
  { method: "GET", path: "/api/rank/export.csv", auth: "session", handler: exportCsv },
  { method: "POST", path: "/api/rank/schedules", auth: "session", handler: upsertSchedule },
  { method: "GET", path: "/api/rank/schedules", auth: "session", handler: listSchedules },
];

// ---------- scheduled scans ----------
// Each due schedule is claimed with a compare-and-set on next_run_at, so a double-fired cron cannot scan twice.
export async function runDueSchedules(env, now = Date.now()) {
  if (!env?.DB || providerState(env) !== "configured") return { ran: 0, skipped: "awaiting_rank_provider" };
  const { results } = await env.DB.prepare("SELECT * FROM scan_schedules WHERE active=1 AND next_run_at<=? ORDER BY next_run_at ASC LIMIT ?").bind(now, MAX_JOBS_PER_TICK).all();
  let ran = 0;
  for (const s of results || []) {
    const claim = await env.DB.prepare("UPDATE scan_schedules SET next_run_at=?,last_run_at=?,updated_at=? WHERE id=? AND next_run_at=? AND active=1")
      .bind(nextRun(now, s.frequency), now, now, s.id, s.next_run_at).run();
    if (Number(claim?.meta?.changes ?? claim?.changes ?? 0) !== 1) continue;
    try {
      const business = await env.DB.prepare("SELECT * FROM businesses WHERE id=? AND user_id=? AND status='active'").bind(s.business_id, s.user_id).first();
      const keyword = business && (await env.DB.prepare("SELECT id,keyword,location_name,device FROM keywords WHERE id=? AND business_id=? AND active=1").bind(s.keyword_id, s.business_id).first());
      if (!business || !keyword) continue;
      const r = await executeScan(env, { userId: s.user_id, business, keyword, gridSize: s.grid_size, radiusM: s.radius_m, planCode: s.plan_code, scheduleId: s.id, now });
      if (r.body.scan_id) { ran++; await env.DB.prepare("UPDATE scan_schedules SET last_scan_id=? WHERE id=?").bind(r.body.scan_id, s.id).run(); }
    } catch { /* one failing schedule must not stop the others */ }
  }
  return { ran };
}
export const jobs = [{ name: "rank-scheduled-scans", run: (env) => runDueSchedules(env) }];
