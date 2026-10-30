// Google integrations: token refresh, disconnect/status, Business Profile reviews (+ confirmed replies),
// Business Profile Performance, Search Console, and the bounded background refresh job.
// Contract: ../../docs/API-CONTRACT.md ("google"). Runs on Workers: Web APIs only, secrets via env.
import { decryptToken } from "./oauth.js";
import { normalizeGoogleReview } from "./reviews.js";
import {
  id, getGoogleLocationForBusiness, upsertGoogleReviews, upsertPerformanceMetrics, getSubscriptionEntitlements,
} from "./db.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const REVIEWS_BASE = "https://mybusiness.googleapis.com/v4/";
const PERFORMANCE_BASE = "https://businessprofileperformance.googleapis.com/v1/";
const GSC_BASE = "https://www.googleapis.com/webmasters/v3/";
const GSC_SCOPE_MARK = "webmasters";
const MAX_RETRIES = 2;
const MAX_REVIEW_PAGES = 40;
const GSC_PAGE_SIZE = 25000;
const GSC_STORE_CAP = 1000; // top rows (sorted by clicks desc by Google) stored per dimension
const JOB_MAX_BUSINESSES = 20;
const JOB_MIN_INTERVAL_MS = 20 * 3600 * 1000;
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export const POSITION_NOTE =
  "Search Console position is the average position in Google Search web results. It is not your Google Maps or local pack rank.";

const MESSAGES = {
  reconnect_required: "Your Google connection expired or was revoked. Please reconnect Google.",
  not_connected: "Google is not connected. Connect your Google account first.",
  quota_exceeded: "Google API quota was exceeded. Try again later.",
  scope_missing: "The Google connection is missing a required permission. Reconnect and approve access.",
  api_not_enabled: "The required Google API is not enabled for this project.",
  permission_denied: "Google denied access to this resource.",
  not_found: "Google could not find this resource.",
  network_error: "Could not reach Google. Try again shortly.",
  not_configured: "Google integration is not configured on the server.",
  upstream_error: "Google returned an unexpected error.",
  token_refresh_failed: "Could not refresh the Google access token.",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ymd = (d) => d.toISOString().slice(0, 10);
const dayOffset = (days) => new Date(Date.now() + days * 86400000);
const jsonBody = async (request) => { try { return await request.json(); } catch { return null; } };
const str = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// ---------- HTTP with bounded retry ----------

function retryDelay(env, res, attempt) {
  const ra = res?.headers?.get?.("retry-after");
  if (ra != null && ra !== "") {
    const secs = Number(ra);
    const ms = Number.isFinite(secs) ? secs * 1000 : Date.parse(ra) - Date.now();
    if (Number.isFinite(ms)) return Math.min(Math.max(ms, 0), 5000);
  }
  const base = Number(env.GOOGLE_RETRY_BASE_MS ?? 400);
  return Math.min(base * 2 ** attempt, 5000);
}

// Returns a Response, or null when the network failed on every attempt. Retries 429/5xx and network errors.
export async function googleFetch(env, url, init = {}) {
  for (let attempt = 0; ; attempt++) {
    let res = null;
    try { res = await fetch(url, init); } catch { res = null; }
    const retryable = res === null || res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) return res;
    await sleep(retryDelay(env, res, attempt));
  }
}

const QUOTA_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded", "dailyLimitExceeded", "RATE_LIMIT_EXCEEDED", "RESOURCE_EXHAUSTED"]);

// Maps a non-ok Google response to {ok:false,state,code,status,upstream}.
export async function classifyError(res) {
  if (res === null) return { ok: false, state: "provider_error", code: "network_error", status: 502 };
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON error body */ }
  const err = body?.error || {};
  const reason = err.errors?.[0]?.reason || err.details?.find?.((d) => d.reason)?.reason || "";
  const msg = String(err.message || "").toLowerCase();
  const upstream = res.status;
  const base = { ok: false, upstream };
  if (res.status === 429 || QUOTA_REASONS.has(reason) || err.status === "RESOURCE_EXHAUSTED") {
    return { ...base, state: "provider_error", code: "quota_exceeded", status: 429 };
  }
  if (res.status === 403 && (reason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT" || msg.includes("insufficient authentication scopes") || msg.includes("insufficient scope"))) {
    return { ...base, state: "awaiting_google_connection", code: "scope_missing", status: 409 };
  }
  if (res.status === 403 && (reason === "SERVICE_DISABLED" || msg.includes("has not been used") || msg.includes("is disabled"))) {
    return { ...base, state: "provider_error", code: "api_not_enabled", status: 502 };
  }
  if (res.status === 403) return { ...base, state: "provider_error", code: "permission_denied", status: 502 };
  if (res.status === 404) return { ...base, state: "provider_error", code: "not_found", status: 502 };
  if (res.status === 401) return { ...base, state: "provider_error", code: "unauthorized", status: 502 };
  return { ...base, state: "provider_error", code: "upstream_error", status: 502 };
}

function respond(ctx, r, extra = {}) {
  return ctx.json({ ...extra, state: r.state, code: r.code, error: MESSAGES[r.code] || MESSAGES.upstream_error }, r.status || 502);
}

async function authedJson(env, token, url, init = {}) {
  const headers = { authorization: "Bearer " + token, ...(init.headers || {}) };
  const res = await googleFetch(env, url, { ...init, headers });
  if (!res || !res.ok) return await classifyError(res);
  try { return { ok: true, data: await res.json() }; } catch { return { ok: false, state: "provider_error", code: "upstream_error", status: 502 }; }
}

// ---------- Tokens ----------

async function markReconnect(env, userId, code) {
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO google_connection_state (user_id,needs_reconnect,reconnect_flagged_at,last_error_code,updated_at) VALUES (?,1,?,?,?) " +
    "ON CONFLICT(user_id) DO UPDATE SET needs_reconnect=1,reconnect_flagged_at=excluded.reconnect_flagged_at,last_error_code=excluded.last_error_code,updated_at=excluded.updated_at"
  ).bind(userId, now, code, now).run();
}

async function markSynced(env, userId) {
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO google_connection_state (user_id,needs_reconnect,last_sync_at,updated_at) VALUES (?,0,?,?) " +
    "ON CONFLICT(user_id) DO UPDATE SET last_sync_at=excluded.last_sync_at,updated_at=excluded.updated_at"
  ).bind(userId, now, now).run();
}

// A reconnect (OAuth callback) bumps google_connections.updated_at past the flag, which clears it implicitly.
function flagged(conn, st) {
  return !!(st && st.needs_reconnect === 1 && Number(st.reconnect_flagged_at || 0) >= Number(conn.updated_at || 0));
}

// -> {ok:true, token, scope} | {ok:false, state, code, status}
export async function getAccessToken(env, userId) {
  if (!env.DB) return { ok: false, state: "provider_error", code: "not_configured", status: 503 };
  const conn = await env.DB.prepare("SELECT refresh_token_ciphertext,scope,updated_at FROM google_connections WHERE user_id=?").bind(userId).first();
  if (!conn) return { ok: false, state: "awaiting_google_connection", code: "not_connected", status: 409 };
  const st = await env.DB.prepare("SELECT needs_reconnect,reconnect_flagged_at FROM google_connection_state WHERE user_id=?").bind(userId).first();
  if (flagged(conn, st)) return { ok: false, state: "awaiting_google_connection", code: "reconnect_required", status: 409 };
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_TOKEN_ENCRYPTION_KEY) {
    return { ok: false, state: "provider_error", code: "not_configured", status: 503 };
  }
  let refresh;
  try { refresh = await decryptToken(env.GOOGLE_TOKEN_ENCRYPTION_KEY, conn.refresh_token_ciphertext); }
  catch { return { ok: false, state: "provider_error", code: "token_refresh_failed", status: 502 }; }
  const res = await googleFetch(env, TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refresh, grant_type: "refresh_token",
    }),
  });
  if (res === null) return { ok: false, state: "provider_error", code: "network_error", status: 502 };
  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch { /* ignore */ }
    if (body?.error === "invalid_grant") {
      await markReconnect(env, userId, "invalid_grant");
      return { ok: false, state: "awaiting_google_connection", code: "reconnect_required", status: 409 };
    }
    if (res.status === 429) return { ok: false, state: "provider_error", code: "quota_exceeded", status: 429 };
    return { ok: false, state: "provider_error", code: "token_refresh_failed", status: 502 };
  }
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  if (!data?.access_token) return { ok: false, state: "provider_error", code: "token_refresh_failed", status: 502 };
  return { ok: true, token: data.access_token, scope: conn.scope || "" };
}

// ---------- Location resolution ----------

// Handles both "accounts/1/locations/2" and "locations/2" (+ account_name from google_locations).
async function resolveLocation(env, userId, businessId) {
  const loc = await getGoogleLocationForBusiness(env, userId, businessId);
  const resource = loc?.google_resource_name ? String(loc.google_resource_name) : "";
  if (!resource) return null;
  let m = resource.match(/^accounts\/([^/]+)\/locations\/([^/]+)$/);
  if (m && SAFE_ID.test(m[1]) && SAFE_ID.test(m[2])) return { accountName: "accounts/" + m[1], locationId: m[2], locationName: "locations/" + m[2] };
  m = resource.match(/^locations\/([^/]+)$/);
  if (!m || !SAFE_ID.test(m[1])) return null;
  const row = await env.DB.prepare("SELECT account_name FROM google_locations WHERE user_id=? AND resource_name=?").bind(userId, resource).first();
  let account = row?.account_name ? String(row.account_name) : "";
  if (/^\d+$/.test(account)) account = "accounts/" + account;
  if (!/^accounts\/[A-Za-z0-9_-]+$/.test(account)) account = null;
  return { accountName: account, locationId: m[1], locationName: "locations/" + m[1] };
}

async function logSync(env, userId, businessId, kind, state, code, count) {
  try {
    await env.DB.prepare("INSERT INTO google_sync_log (id,user_id,business_id,kind,state,code,item_count,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(id("gsl"), userId, businessId, kind, state, code || null, count ?? null, Date.now()).run();
  } catch { /* logging must never break a sync */ }
}

// ---------- Reviews ----------

export async function fetchGoogleReviews(env, userId, businessId) {
  const loc = await resolveLocation(env, userId, businessId);
  if (!loc) return { state: "awaiting_google_location", code: "google_location_required", fetched: 0, status: 409 };
  if (!loc.accountName) return { state: "awaiting_google_location", code: "google_account_unknown", fetched: 0, status: 409 };
  const tok = await getAccessToken(env, userId);
  if (!tok.ok) return { ...tok, fetched: 0 };
  const collected = [];
  let pageToken = "", pages = 0, failure = null, totalReviewCount = null, averageRating = null;
  do {
    const q = new URLSearchParams({ pageSize: "50", orderBy: "updateTime desc" });
    if (pageToken) q.set("pageToken", pageToken);
    const r = await authedJson(env, tok.token, `${REVIEWS_BASE}${loc.accountName}/${loc.locationName}/reviews?${q}`);
    if (!r.ok) { failure = r; break; }
    for (const rv of r.data.reviews || []) collected.push(normalizeGoogleReview(rv));
    if (typeof r.data.totalReviewCount === "number") totalReviewCount = r.data.totalReviewCount;
    if (typeof r.data.averageRating === "number") averageRating = r.data.averageRating;
    pageToken = r.data.nextPageToken || "";
    pages++;
  } while (pageToken && pages < MAX_REVIEW_PAGES);
  let fetched = 0;
  if (collected.length) fetched = (await upsertGoogleReviews(env, userId, businessId, collected)).synced || 0;
  if (failure) return { ...failure, fetched, status: failure.status };
  await markSynced(env, userId);
  return { state: "verified_data", fetched, total_review_count: totalReviewCount, average_rating: averageRating, status: 200 };
}

async function planGate(ctx, feature) {
  const gate = await ctx.requireFeature(feature);
  if (gate.ok) return null;
  return ctx.json({ error: "Your plan does not include this feature.", code: "plan_upgrade_required", feature }, 403);
}

async function reviewsFetchRoute(request, ctx) {
  const denied = await planGate(ctx, "review_monitoring_enabled");
  if (denied) return denied;
  const rl = await ctx.rateLimit(`google-reviews-fetch:${ctx.userId}`, 10, 3600000);
  if (!rl.ok) return ctx.json({ error: "Too many requests", code: "rate_limited" }, 429);
  const body = await jsonBody(request);
  const businessId = str(body?.business_id);
  if (!businessId) return ctx.json({ error: "business_id is required" }, 400);
  if (!(await ctx.getUserBusiness(businessId))) return ctx.json({ error: "Business not found" }, 404);
  const r = await fetchGoogleReviews(ctx.env, ctx.userId, businessId);
  await logSync(ctx.env, ctx.userId, businessId, "reviews", r.state, r.code, r.fetched);
  if (r.state === "verified_data") return ctx.json({ state: r.state, fetched: r.fetched, total_review_count: r.total_review_count, average_rating: r.average_rating });
  return respond(ctx, r, { fetched: r.fetched || 0 });
}

// ---------- Review reply (only with explicit confirmation) ----------

async function reviewReplyRoute(request, ctx) {
  const body = await jsonBody(request);
  if (!body || typeof body !== "object") return ctx.json({ error: "Invalid JSON" }, 400);
  if (body.confirm !== true) {
    return ctx.json({ error: "Replies are posted publicly on Google. Set confirm:true after the user has reviewed the text.", code: "confirmation_required" }, 400);
  }
  const denied = await planGate(ctx, "review_monitoring_enabled");
  if (denied) return denied;
  const rl = await ctx.rateLimit(`google-review-reply:${ctx.userId}`, 30, 3600000);
  if (!rl.ok) return ctx.json({ error: "Too many requests", code: "rate_limited" }, 429);
  const businessId = str(body.business_id), reviewId = str(body.review_id), reply = str(body.reply, 4096);
  if (!businessId || !reviewId || !reply) return ctx.json({ error: "business_id, review_id and reply are required" }, 400);
  if (!(await ctx.getUserBusiness(businessId))) return ctx.json({ error: "Business not found" }, 404);
  const env = ctx.env;
  const review = await env.DB.prepare(
    "SELECT r.id,r.google_review_name FROM reviews r JOIN business_locations bl ON bl.id=r.business_location_id WHERE r.id=? AND bl.business_id=?"
  ).bind(reviewId, businessId).first();
  if (!review) return ctx.json({ error: "Review not found" }, 404);
  const name = String(review.google_review_name || "");
  if (!/^accounts\/[A-Za-z0-9_-]+\/locations\/[A-Za-z0-9_-]+\/reviews\/[A-Za-z0-9_-]+$/.test(name)) {
    return ctx.json({ error: "This review cannot be replied to through the API.", code: "review_name_invalid", state: "provider_error" }, 409);
  }
  const tok = await getAccessToken(env, ctx.userId);
  if (!tok.ok) return respond(ctx, tok);
  const now = Date.now();
  const r = await authedJson(env, tok.token, `${REVIEWS_BASE}${name}/reply`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ comment: reply }),
  });
  if (!r.ok) {
    await env.DB.prepare("INSERT INTO review_replies (id,user_id,business_id,review_id,reply_text,status,error_code,confirmed_at,created_at) VALUES (?,?,?,?,?,'failed',?,?,?)")
      .bind(id("rrp"), ctx.userId, businessId, review.id, reply, r.code, now, now).run();
    return respond(ctx, r, { reply_status: "failed" });
  }
  await env.DB.prepare("INSERT INTO review_replies (id,user_id,business_id,review_id,reply_text,status,confirmed_at,posted_at,created_at) VALUES (?,?,?,?,?,'posted',?,?,?)")
    .bind(id("rrp"), ctx.userId, businessId, review.id, reply, now, now, now).run();
  await env.DB.prepare("UPDATE reviews SET reply_status='answered' WHERE id=?").bind(review.id).run();
  return ctx.json({ ok: true, state: "posted", reply_status: "answered", review_id: review.id });
}

// ---------- Performance ----------

const PERF_METRICS = {
  call_clicks: ["CALL_CLICKS"],
  direction_requests: ["BUSINESS_DIRECTION_REQUESTS"],
  website_clicks: ["WEBSITE_CLICKS"],
  impressions: ["BUSINESS_IMPRESSIONS_DESKTOP_MAPS", "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", "BUSINESS_IMPRESSIONS_MOBILE_MAPS", "BUSINESS_IMPRESSIONS_MOBILE_SEARCH"],
};
const ALL_PERF = Object.values(PERF_METRICS).flat();

export async function syncPerformance(env, userId, businessId) {
  const loc = await resolveLocation(env, userId, businessId);
  if (!loc) return { state: "awaiting_google_location", code: "google_location_required", days: 0, status: 409 };
  const tok = await getAccessToken(env, userId);
  if (!tok.ok) return { ...tok, days: 0 };
  const end = dayOffset(-1), start = dayOffset(-90);
  const q = new URLSearchParams();
  for (const m of ALL_PERF) q.append("dailyMetrics", m);
  for (const [k, d] of [["dailyRange.startDate", start], ["dailyRange.endDate", end]]) {
    q.set(k + ".year", String(d.getUTCFullYear())); q.set(k + ".month", String(d.getUTCMonth() + 1)); q.set(k + ".day", String(d.getUTCDate()));
  }
  const r = await authedJson(env, tok.token, `${PERFORMANCE_BASE}${loc.locationName}:fetchMultiDailyMetricsTimeSeries?${q}`);
  if (!r.ok) return { ...r, days: 0 };
  // Only values Google actually returned are summed; a metric with no returned values stays null (never 0).
  const byMetric = {}, dates = new Set();
  for (const multi of r.data.multiDailyMetricTimeSeries || []) {
    for (const s of multi.dailyMetricTimeSeries || []) {
      const vals = [];
      for (const dv of s.timeSeries?.datedValues || []) {
        if (dv.value === undefined || dv.value === null) continue;
        const n = Number(dv.value);
        if (!Number.isFinite(n)) continue;
        const d = dv.date || {};
        const key = `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
        dates.add(key);
        vals.push([key, n]);
      }
      if (vals.length) byMetric[s.dailyMetric] = vals;
    }
  }
  if (!dates.size) return { state: "no_data", code: "no_data_returned", days: 0, status: 200 };
  const total = (names) => {
    const present = names.filter((n) => byMetric[n]);
    return present.length ? present.reduce((a, n) => a + byMetric[n].reduce((x, [, v]) => x + v, 0), 0) : null;
  };
  await upsertPerformanceMetrics(env, userId, businessId, {
    impressions: total(PERF_METRICS.impressions),
    website_clicks: total(PERF_METRICS.website_clicks),
    call_clicks: total(PERF_METRICS.call_clicks),
    direction_requests: total(PERF_METRICS.direction_requests),
    raw_reference_json: JSON.stringify({ source: "business_profile_performance_api", range: { start: ymd(start), end: ymd(end) }, daily: byMetric }),
  });
  await markSynced(env, userId);
  return { state: "verified_data", days: dates.size, status: 200 };
}

async function performanceSyncRoute(request, ctx) {
  const businessId = str(ctx.url.searchParams.get("business_id")) || str((await jsonBody(request))?.business_id);
  if (!businessId) return ctx.json({ error: "business_id is required" }, 400);
  if (!(await ctx.getUserBusiness(businessId))) return ctx.json({ error: "Business not found" }, 404);
  if (ctx.env.GOOGLE_PERFORMANCE_SYNC_ENABLED !== "true") {
    return ctx.json({ state: "awaiting_google_performance_api", code: "google_performance_pending", error: "Google Performance sync is not enabled for this deployment.", days: 0 }, 503);
  }
  const rl = await ctx.rateLimit(`google-perf-sync:${ctx.userId}`, 10, 3600000);
  if (!rl.ok) return ctx.json({ error: "Too many requests", code: "rate_limited" }, 429);
  const r = await syncPerformance(ctx.env, ctx.userId, businessId);
  await logSync(ctx.env, ctx.userId, businessId, "performance", r.state, r.code, r.days);
  if (r.state === "verified_data" || r.state === "no_data") return ctx.json({ state: r.state, days: r.days });
  return respond(ctx, r, { days: 0 });
}

// ---------- Search Console ----------

const hasGscScope = (scope) => String(scope || "").split(/\s+/).some((s) => s.includes(GSC_SCOPE_MARK));

const gscAuthNeeded = (ctx, extra = {}) => ctx.json({
  state: "awaiting_search_console_authorization", code: "search_console_scope_missing",
  error: "Connect Search Console to continue (GET /auth/google/start?scope=search_console).", ...extra,
}, 409);

async function gscToken(ctx) {
  const tok = await getAccessToken(ctx.env, ctx.userId);
  if (!tok.ok) return { res: respond(ctx, tok) };
  if (!hasGscScope(tok.scope)) return { res: gscAuthNeeded(ctx) };
  return { tok };
}

async function listSites(env, token) {
  const r = await authedJson(env, token, GSC_BASE + "sites");
  if (!r.ok) return r;
  const sites = (r.data.siteEntry || [])
    .filter((s) => s.siteUrl && s.permissionLevel !== "siteUnverifiedUser")
    .map((s) => ({ site_url: s.siteUrl, permission_level: s.permissionLevel }));
  return { ok: true, sites };
}

const gscError = (ctx, r, extra = {}) =>
  r.code === "scope_missing" ? gscAuthNeeded(ctx, extra) : respond(ctx, r, extra);

async function businessFromRequest(request, ctx, body) {
  const businessId = str(ctx.url.searchParams.get("business_id")) || str(body?.business_id);
  if (!businessId) return { res: ctx.json({ error: "business_id is required" }, 400) };
  if (!(await ctx.getUserBusiness(businessId))) return { res: ctx.json({ error: "Business not found" }, 404) };
  return { businessId };
}

async function gscPropertiesRoute(request, ctx) {
  const b = await businessFromRequest(request, ctx, null);
  if (b.res) return b.res;
  const g = await gscToken(ctx);
  if (g.res) return g.res;
  const r = await listSites(ctx.env, g.tok.token);
  if (!r.ok) return gscError(ctx, r, { properties: [] });
  const sel = await ctx.env.DB.prepare("SELECT property_url FROM search_console_properties WHERE user_id=? AND business_id=? AND status='active' LIMIT 1").bind(ctx.userId, b.businessId).first();
  return ctx.json({ properties: r.sites, selected_site_url: sel?.property_url || null, state: r.sites.length ? "verified_data" : "no_properties" });
}

async function gscSelectRoute(request, ctx) {
  const body = await jsonBody(request);
  const businessId = str(body?.business_id), siteUrl = str(body?.site_url, 2048);
  if (!businessId || !siteUrl) return ctx.json({ error: "business_id and site_url are required" }, 400);
  if (!/^(https?:\/\/\S+|sc-domain:[A-Za-z0-9.-]+)$/.test(siteUrl)) return ctx.json({ error: "site_url is not a valid Search Console property" }, 400);
  if (!(await ctx.getUserBusiness(businessId))) return ctx.json({ error: "Business not found" }, 404);
  const g = await gscToken(ctx);
  if (g.res) return g.res;
  const r = await listSites(ctx.env, g.tok.token);
  if (!r.ok) return gscError(ctx, r);
  if (!r.sites.some((s) => s.site_url === siteUrl)) return ctx.json({ error: "This property is not available to your Google account.", code: "property_not_accessible" }, 403);
  const env = ctx.env, now = Date.now();
  await env.DB.prepare("UPDATE search_console_properties SET status='inactive',updated_at=? WHERE user_id=? AND business_id=? AND property_url<>?").bind(now, ctx.userId, businessId, siteUrl).run();
  const existing = await env.DB.prepare("SELECT id FROM search_console_properties WHERE user_id=? AND business_id=? AND property_url=? LIMIT 1").bind(ctx.userId, businessId, siteUrl).first();
  if (existing) {
    await env.DB.prepare("UPDATE search_console_properties SET status='active',updated_at=? WHERE id=?").bind(now, existing.id).run();
  } else {
    await env.DB.prepare("INSERT INTO search_console_properties (id,user_id,business_id,property_url,property_type,status,created_at,updated_at) VALUES (?,?,?,?,?,'active',?,?)")
      .bind(id("gscp"), ctx.userId, businessId, siteUrl, siteUrl.startsWith("sc-domain:") ? "domain" : "url_prefix", now, now).run();
  }
  return ctx.json({ ok: true });
}

// Pages through searchAnalytics.query with startRow until a short page, or maxRows rows are collected.
export async function queryAllRows(env, token, siteUrl, payload, { pageSize = GSC_PAGE_SIZE, maxRows = Infinity } = {}) {
  const rows = [];
  for (let startRow = 0; rows.length < maxRows; startRow += pageSize) {
    const r = await authedJson(env, token, `${GSC_BASE}sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, rowLimit: pageSize, startRow }),
    });
    if (!r.ok) return { ...r, rows };
    const page = r.data.rows || [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return { ok: true, rows: rows.slice(0, maxRows) };
}

export async function syncSearchConsole(env, userId, businessId, opts = {}) {
  const prop = await env.DB.prepare("SELECT id,property_url FROM search_console_properties WHERE user_id=? AND business_id=? AND status='active' ORDER BY updated_at DESC LIMIT 1").bind(userId, businessId).first();
  if (!prop) return { state: "awaiting_search_console_property", code: "search_console_property_required", rows: 0, status: 409 };
  const tok = await getAccessToken(env, userId);
  if (!tok.ok) return { ...tok, rows: 0 };
  if (!hasGscScope(tok.scope)) return { state: "awaiting_search_console_authorization", code: "search_console_scope_missing", rows: 0, status: 409 };
  const startDate = ymd(dayOffset(-29)), endDate = ymd(dayOffset(-2)); // Search Console data lags ~2 days
  const cap = opts.storeCap ?? GSC_STORE_CAP, pageSize = opts.pageSize ?? GSC_PAGE_SIZE;
  const daily = await queryAllRows(env, tok.token, prop.property_url, { startDate, endDate, dimensions: ["date"] }, { pageSize });
  if (!daily.ok) return { ...daily, rows: 0 };
  const queries = await queryAllRows(env, tok.token, prop.property_url, { startDate, endDate, dimensions: ["query"] }, { pageSize, maxRows: cap });
  if (!queries.ok) return { ...queries, rows: 0 };
  const pages = await queryAllRows(env, tok.token, prop.property_url, { startDate, endDate, dimensions: ["page"] }, { pageSize, maxRows: cap });
  if (!pages.ok) return { ...pages, rows: 0 };
  const total = daily.rows.length + queries.rows.length + pages.rows.length;
  if (!total) return { state: "no_data", code: "no_data_returned", rows: 0, status: 200 };

  const now = Date.now();
  const note = JSON.stringify({ metric_note: "search_console_position_is_not_maps_rank" });
  const ins = "INSERT INTO search_console_metrics (id,user_id,business_id,property_id,date,clicks,impressions,ctr,position,query_text,page_url,raw_reference_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)";
  const stmts = [
    env.DB.prepare("DELETE FROM search_console_metrics WHERE property_id=? AND (date>=? OR query_text IS NOT NULL OR page_url IS NOT NULL)").bind(prop.id, startDate),
  ];
  const add = (date, row, q, p) => stmts.push(env.DB.prepare(ins).bind(
    id("gscm"), userId, businessId, prop.id, date, row.clicks ?? null, row.impressions ?? null, row.ctr ?? null, row.position ?? null, q, p, note, now));
  for (const r of daily.rows) add(r.keys?.[0] || endDate, r, null, null);
  for (const r of queries.rows) add(endDate, r, r.keys?.[0] ?? null, null);
  for (const r of pages.rows) add(endDate, r, null, r.keys?.[0] ?? null);
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  await env.DB.prepare("UPDATE search_console_properties SET last_synced_at=?,updated_at=? WHERE id=?").bind(now, now, prop.id).run();
  await markSynced(env, userId);
  return { state: "verified_data", rows: total, property: prop.property_url, status: 200 };
}

async function gscSyncRoute(request, ctx) {
  const b = await businessFromRequest(request, ctx, await jsonBody(request));
  if (b.res) return b.res;
  const rl = await ctx.rateLimit(`google-gsc-sync:${ctx.userId}`, 10, 3600000);
  if (!rl.ok) return ctx.json({ error: "Too many requests", code: "rate_limited" }, 429);
  const r = await syncSearchConsole(ctx.env, ctx.userId, b.businessId);
  await logSync(ctx.env, ctx.userId, b.businessId, "search_console", r.state, r.code, r.rows);
  if (r.state === "verified_data" || r.state === "no_data") return ctx.json({ state: r.state, rows: r.rows, position_note: POSITION_NOTE });
  if (r.state === "awaiting_search_console_authorization") return gscAuthNeeded(ctx, { rows: 0 });
  if (r.state === "awaiting_search_console_property") {
    return ctx.json({ state: r.state, code: r.code, rows: 0, error: "Select a Search Console property for this business first." }, 409);
  }
  return gscError(ctx, r, { rows: 0 });
}

// ---------- Status / disconnect ----------

async function statusRoute(request, ctx) {
  const env = ctx.env;
  const conn = await env.DB.prepare("SELECT scope,updated_at FROM google_connections WHERE user_id=?").bind(ctx.userId).first();
  if (!conn) return ctx.json({ connected: false, email: null, scopes: [], last_sync_at: null, locations: 0, state: "awaiting_google_connection" });
  const [user, st, locs] = await Promise.all([
    env.DB.prepare("SELECT email FROM users WHERE id=?").bind(ctx.userId).first(),
    env.DB.prepare("SELECT needs_reconnect,reconnect_flagged_at,last_sync_at FROM google_connection_state WHERE user_id=?").bind(ctx.userId).first(),
    env.DB.prepare("SELECT COUNT(*) AS n, MAX(synced_at) AS last FROM google_locations WHERE user_id=?").bind(ctx.userId).first(),
  ]);
  const needs = flagged(conn, st);
  const times = [st?.last_sync_at, locs?.last].map(Number).filter((n) => Number.isFinite(n) && n > 0);
  const scopes = String(conn.scope || "").split(/\s+/).filter(Boolean);
  return ctx.json({
    connected: !needs, email: user?.email || null, scopes,
    last_sync_at: times.length ? Math.max(...times) : null,
    locations: Number(locs?.n || 0),
    search_console_authorized: hasGscScope(conn.scope),
    state: needs ? "reconnect_required" : "connected",
  });
}

async function disconnectRoute(request, ctx) {
  const env = ctx.env;
  const conn = await env.DB.prepare("SELECT refresh_token_ciphertext FROM google_connections WHERE user_id=?").bind(ctx.userId).first();
  let revoked = false;
  if (conn && env.GOOGLE_TOKEN_ENCRYPTION_KEY) {
    try {
      const refresh = await decryptToken(env.GOOGLE_TOKEN_ENCRYPTION_KEY, conn.refresh_token_ciphertext);
      const res = await googleFetch(env, REVOKE_URL, {
        method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: refresh }),
      });
      revoked = !!res && res.ok;
    } catch { /* still disconnect locally; the token is deleted below */ }
  }
  await env.DB.prepare("DELETE FROM google_connections WHERE user_id=?").bind(ctx.userId).run();
  await env.DB.prepare("DELETE FROM google_connection_state WHERE user_id=?").bind(ctx.userId).run();
  return ctx.json({ ok: true, revoked });
}

// ---------- Background job ----------

export async function runGoogleSyncJob(env) {
  const perfOn = env.GOOGLE_PERFORMANCE_SYNC_ENABLED === "true", revOn = env.GOOGLE_REVIEWS_SYNC_ENABLED === "true";
  if (!env.DB || (!perfOn && !revOn)) return { skipped: true };
  const cutoff = Date.now() - JOB_MIN_INTERVAL_MS;
  const { results } = await env.DB.prepare(
    "SELECT b.id AS business_id, b.user_id AS user_id FROM businesses b " +
    "JOIN google_connections gc ON gc.user_id=b.user_id " +
    "LEFT JOIN google_connection_state s ON s.user_id=b.user_id " +
    "WHERE b.status='active' AND EXISTS (SELECT 1 FROM business_locations bl WHERE bl.business_id=b.id AND bl.google_resource_name IS NOT NULL) " +
    "AND (s.needs_reconnect IS NULL OR s.needs_reconnect=0 OR s.reconnect_flagged_at<gc.updated_at) " +
    "AND COALESCE((SELECT MAX(l.created_at) FROM google_sync_log l WHERE l.business_id=b.id AND l.state IN ('verified_data','no_data')),0)<? " +
    "ORDER BY COALESCE((SELECT MAX(l.created_at) FROM google_sync_log l WHERE l.business_id=b.id),0) ASC LIMIT ?"
  ).bind(cutoff, JOB_MAX_BUSINESSES).all();
  const summary = { businesses: 0, errors: 0 };
  for (const row of results || []) {
    summary.businesses++;
    try {
      const ent = await getSubscriptionEntitlements(env, row.user_id);
      if (perfOn && ent?.reports_enabled === 1) {
        const r = await syncPerformance(env, row.user_id, row.business_id);
        await logSync(env, row.user_id, row.business_id, "performance", r.state, r.code, r.days);
        if (r.state === "provider_error") summary.errors++;
      }
      if (revOn && ent?.review_monitoring_enabled === 1) {
        const r = await fetchGoogleReviews(env, row.user_id, row.business_id);
        await logSync(env, row.user_id, row.business_id, "reviews", r.state, r.code, r.fetched);
        if (r.state === "provider_error") summary.errors++;
      }
    } catch {
      summary.errors++;
      await logSync(env, row.user_id, row.business_id, "job", "provider_error", "job_exception", null);
    }
  }
  return summary;
}

export const jobs = [{ name: "google_sync", run: runGoogleSyncJob }];

export const routes = [
  { method: "POST", path: "/api/google/disconnect", auth: "session", handler: disconnectRoute },
  { method: "GET", path: "/api/google/status", auth: "session", handler: statusRoute },
  { method: "POST", path: "/api/reviews/google-fetch", auth: "session", handler: reviewsFetchRoute },
  { method: "POST", path: "/api/reviews/reply", auth: "session", handler: reviewReplyRoute },
  { method: "POST", path: "/api/performance/sync", auth: "session", handler: performanceSyncRoute },
  { method: "GET", path: "/api/search-console/properties", auth: "session", handler: gscPropertiesRoute },
  { method: "POST", path: "/api/search-console/select", auth: "session", handler: gscSelectRoute },
  { method: "POST", path: "/api/search-console/sync", auth: "session", handler: gscSyncRoute },
];
