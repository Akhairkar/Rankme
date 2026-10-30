// Competitor module (new paths; the legacy GET/POST /api/competitors routes and `competitors` table are untouched).
// Docs: docs/api/reviews-competitors.md. Data honesty rules:
//  - Manually entered details are source:"user_entered", verification_state:"unverified" and never shown as verified.
//  - Google Places data (rating, review count) lives in competitor_places_data with {source:"places_api", fetched_at}.
//  - A Places match is only stored after the user confirms one of the server-held candidates (no auto-select).
//  - No scraping of Google Maps/Search. Only Places API (New) Text Search with env.GOOGLE_MAPS_API_KEY.
import { getSubscriptionEntitlements } from "./db.js";
import { analyzeBusiness, profileTtlDays } from "./reviews_analysis.js";

export const PLACES_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
export const PLACES_FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri,places.rating,places.userRatingCount";
export const PLAN_COMPETITOR_CAPS = { free: 0, pro: 5, agency: 25 };
const DAY = 86400000;
const CANDIDATE_TTL_MS = DAY;
const newId = (p) => p + "_" + crypto.randomUUID().replaceAll("-", "");

// ---------------------------------------------------------------- validation
function validWebsite(v) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s.length > 500) return null;
  try {
    const u = new URL(s);
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
    if (!u.hostname.includes(".") || u.hostname.endsWith(".")) return null;
    return u.toString();
  } catch { return null; }
}
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** Returns {values, fields}; `partial` = only validate keys present (update). */
export function validateCompetitorInput(body, { partial = false } = {}) {
  const fields = {}, values = {};
  const allowed = new Set(["business_id", "id", "name", "website", "address_text", "lat", "lng"]);
  for (const k of Object.keys(body || {})) if (!allowed.has(k)) fields[k] = "unknown_field";
  if (!partial || "name" in body) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 160) fields.name = "required_1_to_160_chars";
    else values.name = body.name.trim();
  }
  if ("website" in body && body.website !== null && body.website !== "") {
    const w = validWebsite(body.website);
    if (!w) fields.website = "must_be_http_or_https_url"; else values.website = w;
  } else if ("website" in body) values.website = null;
  if ("address_text" in body && body.address_text !== null && body.address_text !== "") {
    if (typeof body.address_text !== "string" || body.address_text.trim().length > 300) fields.address_text = "max_300_chars";
    else values.address_text = body.address_text.trim();
  } else if ("address_text" in body) values.address_text = null;
  const hasLat = "lat" in body && body.lat !== null, hasLng = "lng" in body && body.lng !== null;
  if (hasLat || hasLng) {
    if (!isNum(body.lat) || body.lat < -90 || body.lat > 90) fields.lat = "number_between_-90_and_90";
    if (!isNum(body.lng) || body.lng < -180 || body.lng > 180) fields.lng = "number_between_-180_and_180";
    if (!fields.lat && !fields.lng) { values.lat = body.lat; values.lng = body.lng; }
  } else if ("lat" in body || "lng" in body) { values.lat = null; values.lng = null; }
  return { values, fields };
}

// ---------------------------------------------------------------- data access
async function userCompetitor(env, userId, id) {
  if (typeof id !== "string" || !id) return null;
  return env.DB.prepare("SELECT c.* FROM competitor_profiles c JOIN businesses b ON b.id=c.business_id WHERE c.id=? AND b.user_id=? LIMIT 1").bind(id, userId).first();
}
async function placesData(env, competitorId) {
  return env.DB.prepare("SELECT * FROM competitor_places_data WHERE competitor_id=?").bind(competitorId).first();
}
async function legacyRows(env, userId, businessId) {
  try {
    return (await env.DB.prepare("SELECT c.id,c.name,c.place_reference,c.website_url FROM competitors c JOIN businesses b ON b.id=c.business_id WHERE c.business_id=? AND b.user_id=? AND c.active=1 ORDER BY c.name LIMIT 50").bind(businessId, userId).all()).results || [];
  } catch { return []; }
}
const norm = (s) => String(s || "").toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export async function competitorCap(env, userId) {
  const ent = await getSubscriptionEntitlements(env, userId);
  const plan = PLAN_COMPETITOR_CAPS[ent.plan_code] !== undefined ? ent.plan_code : "free";
  let cap = PLAN_COMPETITOR_CAPS[plan], from = "constants";
  try {
    const row = await env.DB.prepare("SELECT max_competitors FROM plan_entitlements WHERE plan_code=?").bind(plan).first();
    // A positive stored value is authoritative; 0 is the column default for unsynced rows, so constants apply then.
    if (row && Number.isInteger(row.max_competitors) && row.max_competitors > 0) { cap = row.max_competitors; from = "plan_entitlements"; }
  } catch { /* column/table missing: constants */ }
  return { plan, cap, from };
}

function present(row, places) {
  const userEntered = row.source === "user_entered";
  return {
    id: row.id, business_id: row.business_id, name: row.name, website: row.website, address_text: row.address_text,
    place_id: row.place_id, lat: row.lat, lng: row.lng,
    source: row.source, verification_state: row.verification_state, verified_at: row.verified_at,
    data_label: userEntered ? "user_entered_not_verified_by_google" : "confirmed_google_place",
    places_data: places ? {
      display_name: places.display_name, formatted_address: places.formatted_address, website_uri: places.website_uri,
      rating: places.rating, user_rating_count: places.user_rating_count, source: "places_api", fetched_at: places.fetched_at,
    } : null,
    created_at: row.created_at, updated_at: row.updated_at,
  };
}

// ---------------------------------------------------------------- shared handler plumbing
async function body(request) { try { return await request.json(); } catch { return null; } }
async function pre(ctx, { limit = 120, windowMs = 60000, key = "competitors" } = {}) {
  if (!ctx.env.DB) return ctx.json({ error: "Database unavailable", code: "database_unavailable" }, 503);
  const g = await ctx.requireFeature("competitor_tracking_enabled");
  if (!g.ok) return ctx.json({ error: "Your plan does not include competitor tracking.", code: "plan_upgrade_required", feature: "competitor_tracking_enabled" }, 403);
  const rl = await ctx.rateLimit(`${key}:${ctx.userId}`, limit, windowMs);
  if (!rl.ok) return ctx.json({ error: "Too many requests", code: "rate_limited" }, 429);
  return null;
}
const bad = (ctx, fields) => ctx.json({ error: "Validation failed", code: "validation_failed", fields }, 400);
const notFound = (ctx) => ctx.json({ error: "Not found", code: "not_found" }, 404);

// ---------------------------------------------------------------- endpoints
async function listRoute(request, ctx) {
  const d = await pre(ctx); if (d) return d;
  const businessId = (ctx.url.searchParams.get("business_id") || "").trim();
  if (!businessId) return bad(ctx, { business_id: "required" });
  if (!(await ctx.getUserBusiness(businessId))) return notFound(ctx);
  const { results } = await ctx.env.DB.prepare("SELECT * FROM competitor_profiles WHERE business_id=? ORDER BY name").bind(businessId).all();
  const out = [];
  for (const r of results || []) out.push(present(r, await placesData(ctx.env, r.id)));
  const names = new Set(out.map((c) => norm(c.name)));
  const legacy = (await legacyRows(ctx.env, ctx.userId, businessId)).filter((l) => !names.has(norm(l.name)))
    .map((l) => ({ id: l.id, name: l.name, website: l.website_url, place_reference: l.place_reference, source: "user_entered", verification_state: "unverified", legacy: true, read_only: true }));
  const cap = await competitorCap(ctx.env, ctx.userId);
  return ctx.json({ business_id: businessId, competitors: out, legacy_competitors: legacy, cap: { limit: cap.cap, used: out.length + legacy.length, plan: cap.plan, source: cap.from }, state: out.length ? "has_competitors" : "no_competitors" });
}

async function addRoute(request, ctx) {
  const d = await pre(ctx); if (d) return d;
  const b = await body(request);
  if (!b || typeof b !== "object") return ctx.json({ error: "Invalid JSON", code: "invalid_json" }, 400);
  const businessId = typeof b.business_id === "string" ? b.business_id.trim() : "";
  if (!businessId) return bad(ctx, { business_id: "required" });
  const { values, fields } = validateCompetitorInput(b);
  if (Object.keys(fields).length) return bad(ctx, fields);
  if (!(await ctx.getUserBusiness(businessId))) return notFound(ctx);
  const env = ctx.env;
  const { results } = await env.DB.prepare("SELECT name FROM competitor_profiles WHERE business_id=?").bind(businessId).all();
  const legacy = await legacyRows(env, ctx.userId, businessId);
  const names = new Set([...(results || []).map((r) => norm(r.name))]);
  if (names.has(norm(values.name))) return ctx.json({ error: "Competitor already exists", code: "duplicate_competitor" }, 409);
  const used = names.size + legacy.filter((l) => !names.has(norm(l.name))).length;
  const cap = await competitorCap(env, ctx.userId);
  if (used >= cap.cap) return ctx.json({ error: `Your ${cap.plan} plan allows ${cap.cap} competitors.`, code: "competitor_limit_reached", limit: cap.cap, used, plan: cap.plan }, 403);
  const now = ctx.now(), id = newId("cp");
  await env.DB.prepare(
    "INSERT INTO competitor_profiles (id,business_id,name,website,address_text,place_id,lat,lng,source,verified_at,verification_state,created_at,updated_at) VALUES (?,?,?,?,?,NULL,?,?,'user_entered',NULL,'unverified',?,?)"
  ).bind(id, businessId, values.name, values.website ?? null, values.address_text ?? null, values.lat ?? null, values.lng ?? null, now, now).run();
  return ctx.json({ competitor: present(await userCompetitor(env, ctx.userId, id), null), state: "unverified" }, 201);
}

async function updateRoute(request, ctx) {
  const d = await pre(ctx); if (d) return d;
  const b = await body(request);
  if (!b || typeof b !== "object") return ctx.json({ error: "Invalid JSON", code: "invalid_json" }, 400);
  const { values, fields } = validateCompetitorInput(b, { partial: true });
  if ("business_id" in b) fields.business_id = "unknown_field";
  if (typeof b.id !== "string" || !b.id) fields.id = "required";
  if (Object.keys(fields).length) return bad(ctx, fields);
  const env = ctx.env;
  const cur = await userCompetitor(env, ctx.userId, b.id);
  if (!cur) return notFound(ctx);
  if (!Object.keys(values).length) return bad(ctx, { _: "no_updatable_fields" });
  if (values.name && norm(values.name) !== norm(cur.name)) {
    const rows = (await env.DB.prepare("SELECT id,name FROM competitor_profiles WHERE business_id=? AND id<>?").bind(cur.business_id, cur.id).all()).results || [];
    if (rows.some((r) => norm(r.name) === norm(values.name))) return ctx.json({ error: "Competitor already exists", code: "duplicate_competitor" }, 409);
  }
  const merged = { ...cur, ...values };
  const identityChanged = ["name", "website", "address_text", "lat", "lng"].some((k) => k in values && values[k] !== cur[k]);
  const now = ctx.now();
  let reset = false;
  if (identityChanged && cur.place_id) {
    // Edited details no longer correspond to the confirmed Google place: drop the match and its Places data.
    reset = true;
    await env.DB.prepare("DELETE FROM competitor_places_data WHERE competitor_id=?").bind(cur.id).run();
    await env.DB.prepare("DELETE FROM competitor_place_candidates WHERE competitor_id=?").bind(cur.id).run();
    await env.DB.prepare("UPDATE competitor_profiles SET name=?,website=?,address_text=?,lat=?,lng=?,place_id=NULL,source='user_entered',verified_at=NULL,verification_state='unverified',updated_at=? WHERE id=?")
      .bind(merged.name, merged.website, merged.address_text, merged.lat, merged.lng, now, cur.id).run();
  } else {
    await env.DB.prepare("UPDATE competitor_profiles SET name=?,website=?,address_text=?,lat=?,lng=?,updated_at=? WHERE id=?")
      .bind(merged.name, merged.website, merged.address_text, merged.lat, merged.lng, now, cur.id).run();
  }
  const row = await userCompetitor(env, ctx.userId, cur.id);
  return ctx.json({ competitor: present(row, await placesData(env, cur.id)), verification_reset: reset });
}

async function removeRoute(request, ctx) {
  const d = await pre(ctx); if (d) return d;
  const b = await body(request);
  if (!b || typeof b.id !== "string" || !b.id) return bad(ctx, { id: "required" });
  const env = ctx.env;
  const cur = await userCompetitor(env, ctx.userId, b.id);
  if (!cur) return notFound(ctx);
  // Explicit deletes (do not rely on FK cascade being enabled).
  const p = await env.DB.prepare("DELETE FROM competitor_places_data WHERE competitor_id=?").bind(cur.id).run();
  const c = await env.DB.prepare("DELETE FROM competitor_place_candidates WHERE competitor_id=?").bind(cur.id).run();
  await env.DB.prepare("DELETE FROM competitor_profiles WHERE id=?").bind(cur.id).run();
  return ctx.json({ ok: true, removed: { profile: 1, places_data: p.meta?.changes ?? 0, place_candidates: c.meta?.changes ?? 0 } });
}

export function normalizePlace(p) {
  if (!p || typeof p.id !== "string") return null;
  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    place_id: p.id,
    display_name: typeof p.displayName?.text === "string" ? p.displayName.text : null,
    formatted_address: typeof p.formattedAddress === "string" ? p.formattedAddress : null,
    lat: num(p.location?.latitude), lng: num(p.location?.longitude),
    website_uri: typeof p.websiteUri === "string" ? p.websiteUri : null,
    rating: num(p.rating), user_rating_count: Number.isInteger(p.userRatingCount) ? p.userRatingCount : null,
  };
}

async function verifyRoute(request, ctx) {
  const d = await pre(ctx, { limit: 20, windowMs: 3600000, key: "competitors-verify" }); if (d) return d;
  const b = await body(request);
  if (!b || typeof b.id !== "string" || !b.id) return bad(ctx, { id: "required" });
  const env = ctx.env;
  const cur = await userCompetitor(env, ctx.userId, b.id);
  if (!cur) return notFound(ctx);
  if (!env.GOOGLE_MAPS_API_KEY) {
    return ctx.json({ error: "Google Places lookup is not configured on this server.", code: "provider_not_configured", state: "provider_not_configured", competitor_id: cur.id }, 503);
  }
  const biz = await ctx.getUserBusiness(cur.business_id);
  const textQuery = [cur.name, cur.address_text || biz?.city || ""].filter(Boolean).join(" ").slice(0, 300);
  const reqBody = { textQuery, maxResultCount: 5 };
  if (isNum(cur.lat) && isNum(cur.lng)) reqBody.locationBias = { circle: { center: { latitude: cur.lat, longitude: cur.lng }, radius: 5000 } };
  const ac = new AbortController(), timer = setTimeout(() => ac.abort(), 8000);
  let res, data;
  try {
    res = await fetch(PLACES_SEARCH_URL, {
      method: "POST", signal: ac.signal,
      headers: { "content-type": "application/json", "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY, "X-Goog-FieldMask": PLACES_FIELD_MASK },
      body: JSON.stringify(reqBody),
    });
    data = res.ok ? await res.json().catch(() => null) : null;
  } catch {
    return ctx.json({ error: "Places lookup failed", code: "provider_error", state: "provider_error" }, 502);
  } finally { clearTimeout(timer); }
  if (!res.ok || !data) return ctx.json({ error: "Places lookup failed", code: "provider_error", state: "provider_error", provider_status: res.status }, 502);
  const fetchedAt = ctx.now();
  const cands = (Array.isArray(data.places) ? data.places : []).map(normalizePlace).filter(Boolean).slice(0, 5);
  await env.DB.prepare("DELETE FROM competitor_place_candidates WHERE competitor_id=?").bind(cur.id).run();
  for (const c of cands) {
    await env.DB.prepare("INSERT INTO competitor_place_candidates (competitor_id,place_id,data_json,fetched_at) VALUES (?,?,?,?)").bind(cur.id, c.place_id, JSON.stringify(c), fetchedAt).run();
  }
  if (!cands.length && !cur.place_id) {
    await env.DB.prepare("UPDATE competitor_profiles SET verification_state='failed',updated_at=? WHERE id=?").bind(fetchedAt, cur.id).run();
  }
  return ctx.json({
    competitor_id: cur.id,
    state: cands.length ? "awaiting_confirmation" : "no_candidates",
    candidates: cands.map((c) => ({ ...c, source: "places_api", fetched_at: fetchedAt })),
    message: cands.length ? "Choose the matching business and send POST /api/competitors/confirm-place {id, place_id}. LocalBoost never selects a match automatically." : "Google Places returned no match. Check the name/address or add coordinates and retry.",
  });
}

async function confirmRoute(request, ctx) {
  const d = await pre(ctx); if (d) return d;
  const b = await body(request);
  const fields = {};
  if (!b || typeof b.id !== "string" || !b.id) fields.id = "required";
  if (!b || typeof b.place_id !== "string" || !b.place_id || b.place_id.length > 300) fields.place_id = "required";
  if (Object.keys(fields).length) return bad(ctx, fields);
  const env = ctx.env;
  const cur = await userCompetitor(env, ctx.userId, b.id);
  if (!cur) return notFound(ctx);
  const cand = await env.DB.prepare("SELECT data_json,fetched_at FROM competitor_place_candidates WHERE competitor_id=? AND place_id=?").bind(cur.id, b.place_id).first();
  if (!cand || cand.fetched_at < ctx.now() - CANDIDATE_TTL_MS) {
    return ctx.json({ error: "place_id is not one of the candidates returned by /api/competitors/verify (or they expired). Run verify again.", code: "candidate_not_found" }, 409);
  }
  const dupe = await env.DB.prepare("SELECT id FROM competitor_profiles WHERE business_id=? AND place_id=? AND id<>?").bind(cur.business_id, b.place_id, cur.id).first();
  if (dupe) return ctx.json({ error: "This place is already linked to another competitor.", code: "duplicate_place" }, 409);
  let c; try { c = JSON.parse(cand.data_json); } catch { return ctx.json({ error: "Stored candidate is unreadable. Run verify again.", code: "candidate_not_found" }, 409); }
  const now = ctx.now();
  await env.DB.prepare("UPDATE competitor_profiles SET place_id=?,lat=?,lng=?,source='places_api',verified_at=?,verification_state='verified',updated_at=? WHERE id=?")
    .bind(c.place_id, c.lat ?? cur.lat, c.lng ?? cur.lng, now, now, cur.id).run();
  await env.DB.prepare(
    "INSERT INTO competitor_places_data (competitor_id,place_id,display_name,formatted_address,website_uri,rating,user_rating_count,source,fetched_at) VALUES (?,?,?,?,?,?,?,'places_api',?) " +
    "ON CONFLICT(competitor_id) DO UPDATE SET place_id=excluded.place_id,display_name=excluded.display_name,formatted_address=excluded.formatted_address,website_uri=excluded.website_uri,rating=excluded.rating,user_rating_count=excluded.user_rating_count,source='places_api',fetched_at=excluded.fetched_at"
  ).bind(cur.id, c.place_id, c.display_name, c.formatted_address, c.website_uri, c.rating, c.user_rating_count, cand.fetched_at).run();
  await env.DB.prepare("DELETE FROM competitor_place_candidates WHERE competitor_id=?").bind(cur.id).run();
  return ctx.json({ competitor: present(await userCompetitor(env, ctx.userId, cur.id), await placesData(env, cur.id)), state: "verified" });
}

// ---------------------------------------------------------------- compare
const cell = (value, source, as_of) => ({ value, source, as_of });
const nullCell = (reason) => ({ value: null, reason });

function gridStats(points, matchName) {
  // Only points where the provider returned a competitor list are comparable.
  const comparable = points.filter((p) => Array.isArray(p.list));
  let present = 0, top3 = 0, best = null, sum = 0, withPos = 0;
  for (const p of comparable) {
    const hit = matchName ? p.list.find((c) => norm(c.name) === matchName) : null;
    if (!hit) continue;
    present++;
    if (hit.position != null) {
      withPos++; sum += hit.position; best = best == null ? hit.position : Math.min(best, hit.position);
      if (hit.position <= 3) top3++;
    }
  }
  return { comparable: comparable.length, present, top3, best, avg: withPos ? Math.round((sum / withPos) * 100) / 100 : null };
}
function ownGrid(points) {
  const comparable = points.filter((p) => Array.isArray(p.list));
  let top3 = 0, found = 0;
  for (const p of comparable) if (p.position != null) { found++; if (p.position <= 3) top3++; }
  return { comparable: comparable.length, found, top3 };
}

async function compareRoute(request, ctx) {
  const d = await pre(ctx); if (d) return d;
  const q = ctx.url.searchParams, env = ctx.env;
  const businessId = (q.get("business_id") || "").trim(), keywordId = (q.get("keyword_id") || "").trim();
  if (!businessId) return bad(ctx, { business_id: "required" });
  if (!(await ctx.getUserBusiness(businessId))) return notFound(ctx);
  let keyword = null;
  if (keywordId) {
    keyword = await env.DB.prepare("SELECT id,keyword FROM keywords WHERE id=? AND business_id=?").bind(keywordId, businessId).first();
    if (!keyword) return notFound(ctx);
  }
  const { results: comps } = await env.DB.prepare("SELECT * FROM competitor_profiles WHERE business_id=? ORDER BY name").bind(businessId).all();

  // Own review facts: only the business's own authorised, stored reviews.
  const an = await analyzeBusiness(env, businessId, ctx.now());
  const hasOwn = !an.empty && an.rating_distribution && an.rating_distribution.rated_total > 0;
  const asOfOwn = an.data_freshness?.latest_review_fetch_at ?? null;
  const you = {
    rating: hasOwn ? cell(an.rating_distribution.average_rating, "google_business_profile_api (stored reviews)", asOfOwn) : nullCell("no_stored_reviews"),
    review_count: hasOwn ? cell(an.rating_distribution.rated_total, "google_business_profile_api (stored reviews)", asOfOwn) : nullCell("no_stored_reviews"),
    review_count_caveat: "Counts only reviews stored by LocalBoost; the live Google count can be higher.",
    grid_visibility: nullCell(keyword ? "no_completed_scan" : "keyword_id_not_provided"),
  };

  // Latest usable scan for this keyword.
  let scan = null, points = [];
  if (keyword) {
    scan = await env.DB.prepare("SELECT * FROM rank_scans WHERE business_id=? AND keyword_id=? AND user_id=? AND state IN ('completed','partial') ORDER BY created_at DESC LIMIT 1").bind(businessId, keywordId, ctx.userId).first();
    if (scan) {
      const rows = (await env.DB.prepare("SELECT position,competitors_json,provider,observed_at,error FROM rank_scan_points WHERE scan_id=?").bind(scan.id).all()).results || [];
      points = rows.filter((r) => !r.error).map((r) => {
        let list = null; try { list = r.competitors_json ? JSON.parse(r.competitors_json) : null; } catch { list = null; }
        return { position: r.position, list: Array.isArray(list) ? list : null, provider: r.provider, observed_at: r.observed_at };
      });
    }
  }
  const scanAsOf = scan?.completed_at ?? scan?.created_at ?? null;
  const own = ownGrid(points);
  if (scan) {
    you.grid_visibility = own.comparable
      ? cell({ points_with_competitor_data: own.comparable, points_found: own.found, points_top3: own.top3, basis: "points where the rank provider returned a competitor list" }, `rank_provider:${scan.provider || "unknown"}`, scanAsOf)
      : nullCell("provider_returned_no_competitor_data");
  }

  const gaps = [];
  const out = [];
  for (const c of comps || []) {
    const places = await placesData(env, c.id);
    const cells = {};
    // grid visibility
    if (!keyword) cells.grid_visibility = nullCell("keyword_id_not_provided");
    else if (!scan) cells.grid_visibility = nullCell("no_completed_scan");
    else if (!own.comparable) cells.grid_visibility = nullCell("provider_returned_no_competitor_data");
    else {
      const g = gridStats(points, norm(c.name));
      cells.grid_visibility = g.present
        ? cell({ points_with_competitor_data: g.comparable, points_present: g.present, points_top3: g.top3, best_position: g.best, average_position: g.avg, matched_by: "name_match" }, `rank_provider:${scan.provider || "unknown"}`, scanAsOf)
        : nullCell("not_in_provider_results");
      if (g.present && g.top3 > own.top3) {
        gaps.push({ rule: "grid_top3_gap", competitor_id: c.id, competitor: c.name, text: `${c.name} appears in the top 3 at ${g.top3 - own.top3} more grid points than you (${g.top3} vs ${own.top3} of ${own.comparable} points with competitor data).`, evidence: { competitor_top3: g.top3, your_top3: own.top3, points_compared: own.comparable, as_of: scanAsOf } });
      }
    }
    // rating / review count (Google Places only, only for user-confirmed matches)
    if (places && places.rating != null) {
      cells.rating = cell(places.rating, "places_api", places.fetched_at);
      if (hasOwn && places.rating > you.rating.value) {
        gaps.push({ rule: "rating_gap", competitor_id: c.id, competitor: c.name, text: `${c.name}'s Google rating (${places.rating}) is ${Math.round((places.rating - you.rating.value) * 100) / 100} higher than your stored-review average (${you.rating.value}).`, evidence: { competitor_rating: places.rating, competitor_as_of: places.fetched_at, your_rating: you.rating.value, your_as_of: asOfOwn } });
      }
    } else cells.rating = nullCell(c.place_id ? "places_data_missing_or_expired" : "not_verified_with_google_places");
    if (places && places.user_rating_count != null) {
      cells.review_count = cell(places.user_rating_count, "places_api", places.fetched_at);
      if (hasOwn && places.user_rating_count > you.review_count.value) {
        gaps.push({ rule: "review_count_gap", competitor_id: c.id, competitor: c.name, text: `${c.name} shows ${places.user_rating_count - you.review_count.value} more Google reviews than the ${you.review_count.value} LocalBoost has stored for you.`, evidence: { competitor_count: places.user_rating_count, competitor_as_of: places.fetched_at, your_stored_count: you.review_count.value, your_as_of: asOfOwn }, caveat: you.review_count_caveat });
      }
    } else cells.review_count = nullCell(c.place_id ? "places_data_missing_or_expired" : "not_verified_with_google_places");
    cells.website_facts = nullCell("no_crawler_result_stored");
    out.push({ id: c.id, name: c.name, source: c.source, verification_state: c.verification_state, data_label: c.source === "user_entered" ? "user_entered_not_verified_by_google" : "confirmed_google_place", cells });
  }
  return ctx.json({
    business_id: businessId, keyword_id: keyword?.id ?? null, keyword: keyword?.keyword ?? null,
    scan: scan ? { id: scan.id, provider: scan.provider, completed_at: scanAsOf, grid_size: scan.grid_size, points_total: points.length, points_with_competitor_data: own.comparable } : null,
    you, competitors: out, gaps,
    places_ttl_days: profileTtlDays(env),
    notes: out.length ? [] : ["No competitors added yet."],
  });
}

export const routes = [
  { method: "GET", path: "/api/competitors/list", auth: "session", handler: listRoute },
  { method: "POST", path: "/api/competitors/add", auth: "session", handler: addRoute },
  { method: "POST", path: "/api/competitors/update", auth: "session", handler: updateRoute },
  { method: "POST", path: "/api/competitors/remove", auth: "session", handler: removeRoute },
  { method: "POST", path: "/api/competitors/verify", auth: "session", handler: verifyRoute },
  { method: "POST", path: "/api/competitors/confirm-place", auth: "session", handler: confirmRoute },
  { method: "GET", path: "/api/competitors/compare", auth: "session", handler: compareRoute },
];
