import test from "node:test";
import assert from "node:assert/strict";
import { routes, validateCompetitorInput, normalizePlace, competitorCap, PLACES_SEARCH_URL, PLACES_FIELD_MASK } from "../src/competitors.js";
import { makeDB } from "./_db.mjs";

const NOW = Date.UTC(2026, 9, 30, 12);
const R = (m, p) => routes.find((r) => r.method === m && r.path === p);
function ctxFor(db, userId, url, extra = {}) {
  return {
    env: { DB: db, ...(extra.env || {}) }, url: new URL(url), userId, ip: "1.1.1.1",
    json: (d, s = 200) => Response.json(d, { status: s }), now: () => extra.now ?? NOW,
    getUserBusiness: (id) => db.prepare("SELECT * FROM businesses WHERE id=? AND user_id=? LIMIT 1").bind(id, userId).first(),
    requireFeature: async () => ({ ok: true }), rateLimit: async () => ({ ok: true }), ...(extra.ctx || {}),
  };
}
const post = (b) => new Request("https://x/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
async function call(method, path, db, userId, { body, query = "", env, now, ctx } = {}) {
  const res = await R(method, path).handler(method === "POST" ? post(body) : new Request("https://x/"), ctxFor(db, userId, "https://x" + path + query, { env, now, ctx }));
  return { status: res.status, j: await res.json() };
}
function seed(db, plan = "pro") {
  const s = db.sql;
  for (const u of ["uA", "uB"]) s.prepare("INSERT INTO users VALUES (?,?,?,?,?,?,?)").run(u, "g_" + u, u + "@x.in", "N", null, 1, 1);
  for (const [b, u] of [["bA", "uA"], ["bB", "uB"]]) {
    s.prepare("INSERT INTO businesses (id,user_id,name,category,city,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").run(b, u, "Biz " + b, "Cafe", "Pune", "active", 1, 1);
    s.prepare("INSERT INTO business_locations (id,business_id,name,created_at,updated_at) VALUES (?,?,?,?,?)").run("loc" + b, b, "L", 1, 1);
    s.prepare("INSERT INTO keywords (id,business_id,keyword,location_name,created_at,updated_at) VALUES (?,?,?,?,?,?)").run("k" + b, b, "cafe pune", "Pune", 1, 1);
  }
  for (const u of ["uA", "uB"]) if (plan) s.prepare("INSERT INTO subscriptions (id,user_id,plan_code,status,created_at,updated_at) VALUES (?,?,?,?,?,?)").run("s" + u, u, plan, "active", 1, 1);
}
const PLACES_OK = { places: [
  { id: "PLACE_1", displayName: { text: "Rival Cafe" }, formattedAddress: "1 MG Road, Pune", location: { latitude: 18.52, longitude: 73.85 }, websiteUri: "https://rival.example", rating: 4.6, userRatingCount: 321 },
  { id: "PLACE_2", displayName: { text: "Rival Cafe Annex" }, formattedAddress: "9 FC Road, Pune", location: { latitude: 18.53, longitude: 73.84 }, rating: 4.1, userRatingCount: 12 },
] };
function mockFetch(handler) {
  const calls = [], orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return handler(url, init); };
  return { calls, restore: () => { globalThis.fetch = orig; } };
}
const jsonRes = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const add = async (db, u, b, name, extra = {}) => (await call("POST", "/api/competitors/add", db, u, { body: { business_id: b, name, ...extra } }));

test("validation: name, website, coordinates, unknown fields", () => {
  assert.deepEqual(Object.keys(validateCompetitorInput({ name: "" }).fields), ["name"]);
  assert.ok(validateCompetitorInput({ name: "x".repeat(161) }).fields.name);
  for (const w of ["ftp://a.com", "javascript:alert(1)", "notaurl", "https://nodot", "https://u:p@a.com"]) assert.ok(validateCompetitorInput({ name: "A", website: w }).fields.website, w);
  assert.equal(validateCompetitorInput({ name: "A", website: "https://a.com/x" }).fields.website, undefined);
  assert.ok(validateCompetitorInput({ name: "A", lat: 91, lng: 0 }).fields.lat);
  assert.ok(validateCompetitorInput({ name: "A", lat: 10 }).fields.lng);
  assert.ok(validateCompetitorInput({ name: "A", lat: "1", lng: 2 }).fields.lat);
  assert.deepEqual(validateCompetitorInput({ name: "A", lat: 10, lng: 20 }).values.lat, 10);
  assert.ok(validateCompetitorInput({ name: "A", place_id: "x", source: "places_api" }).fields.place_id);
  assert.ok(validateCompetitorInput({ name: "A", source: "places_api" }).fields.source);
});

test("CRUD: add is user_entered/unverified, list, update, duplicate, remove", async () => {
  const db = makeDB(); seed(db);
  const a = await add(db, "uA", "bA", " Rival Cafe ", { website: "https://rival.example", address_text: "MG Road", lat: 18.5, lng: 73.8 });
  assert.equal(a.status, 201);
  const c = a.j.competitor;
  assert.equal(c.source, "user_entered"); assert.equal(c.verification_state, "unverified"); assert.equal(c.verified_at, null);
  assert.equal(c.data_label, "user_entered_not_verified_by_google"); assert.equal(c.place_id, null); assert.equal(c.places_data, null);
  assert.equal(c.name, "Rival Cafe");
  assert.equal((await add(db, "uA", "bA", "rival cafe")).status, 409);
  assert.equal((await add(db, "uA", "bA", "")).status, 400);
  assert.equal((await add(db, "uA", "bA", "X", { website: "ftp://x" })).j.fields.website, "must_be_http_or_https_url");
  const list = await call("GET", "/api/competitors/list", db, "uA", { query: "?business_id=bA" });
  assert.equal(list.j.competitors.length, 1); assert.deepEqual(list.j.cap, { limit: 5, used: 1, plan: "pro", source: "constants" });
  const up = await call("POST", "/api/competitors/update", db, "uA", { body: { id: c.id, website: "https://new.example", address_text: null } });
  assert.equal(up.status, 200); assert.equal(up.j.competitor.website, "https://new.example/"); assert.equal(up.j.competitor.address_text, null); assert.equal(up.j.competitor.verification_state, "unverified");
  assert.equal((await call("POST", "/api/competitors/update", db, "uA", { body: { id: c.id, lat: 100, lng: 1 } })).status, 400);
  assert.equal((await call("POST", "/api/competitors/update", db, "uA", { body: { id: c.id } })).status, 400);
  const rm = await call("POST", "/api/competitors/remove", db, "uA", { body: { id: c.id } });
  assert.equal(rm.status, 200);
  assert.equal(db.sql.prepare("SELECT COUNT(*) AS n FROM competitor_profiles").get().n, 0);
  assert.equal((await call("POST", "/api/competitors/remove", db, "uA", { body: { id: c.id } })).status, 404);
});

test("legacy competitors table is read-only and listed separately", async () => {
  const db = makeDB(); seed(db);
  db.sql.prepare("INSERT INTO competitors (id,business_id,name,website_url,active,created_at,updated_at) VALUES ('cmp_1','bA','Old Rival','https://old.example',1,1,1)").run();
  const list = await call("GET", "/api/competitors/list", db, "uA", { query: "?business_id=bA" });
  assert.equal(list.j.competitors.length, 0);
  assert.equal(list.j.legacy_competitors.length, 1);
  assert.equal(list.j.legacy_competitors[0].verification_state, "unverified"); assert.equal(list.j.legacy_competitors[0].source, "user_entered");
  assert.equal(list.j.cap.used, 1);
  assert.equal((await add(db, "uA", "bA", "old rival")).status, 201); // moves into the new table
  assert.equal(db.sql.prepare("SELECT COUNT(*) AS n FROM competitors").get().n, 1); // legacy row untouched
});

test("plan caps: free 0, pro 5, agency 25, entitlements override", async () => {
  const free = makeDB(); seed(free, null);
  const f = await add(free, "uA", "bA", "One");
  assert.equal(f.status, 403); assert.equal(f.j.code, "competitor_limit_reached"); assert.equal(f.j.limit, 0);
  const pro = makeDB(); seed(pro, "pro");
  for (let i = 1; i <= 5; i++) assert.equal((await add(pro, "uA", "bA", "Rival " + i)).status, 201);
  const sixth = await add(pro, "uA", "bA", "Rival 6");
  assert.equal(sixth.status, 403); assert.equal(sixth.j.code, "competitor_limit_reached"); assert.equal(sixth.j.limit, 5);
  assert.equal((await add(pro, "uB", "bB", "B one")).status, 201); // other tenant unaffected
  const ag = makeDB(); seed(ag, "agency");
  assert.equal((await competitorCap({ DB: ag }, "uA")).cap, 25);
  const ent = makeDB(); seed(ent, "pro");
  ent.sql.prepare("INSERT INTO plan_entitlements (plan_code,max_businesses,max_locations,max_keywords,max_competitors) VALUES ('pro',1,3,50,2)").run();
  assert.deepEqual(await competitorCap({ DB: ent }, "uA"), { plan: "pro", cap: 2, from: "plan_entitlements" });
  assert.equal((await add(ent, "uA", "bA", "a")).status, 201); assert.equal((await add(ent, "uA", "bA", "b")).status, 201);
  assert.equal((await add(ent, "uA", "bA", "c")).status, 403);
  // plan feature gate
  const gated = await call("POST", "/api/competitors/add", pro, "uA", { body: { business_id: "bA", name: "Z" }, ctx: { requireFeature: async () => ({ ok: false }) } });
  assert.equal(gated.status, 403); assert.equal(gated.j.code, "plan_upgrade_required");
});

test("verify -> candidates for the user to confirm -> confirm-place stores Places data separately", async () => {
  const db = makeDB(); seed(db);
  const c = (await add(db, "uA", "bA", "Rival Cafe", { address_text: "Pune", lat: 18.5, lng: 73.8 })).j.competitor;
  const m = mockFetch(() => jsonRes(PLACES_OK));
  try {
    const v = await call("POST", "/api/competitors/verify", db, "uA", { body: { id: c.id }, env: { GOOGLE_MAPS_API_KEY: "KEY123" } });
    assert.equal(v.status, 200); assert.equal(v.j.state, "awaiting_confirmation");
    assert.equal(v.j.candidates.length, 2);
    assert.equal(v.j.candidates[0].place_id, "PLACE_1"); assert.equal(v.j.candidates[0].source, "places_api"); assert.equal(v.j.candidates[0].fetched_at, NOW);
    assert.equal(v.j.candidates[0].rating, 4.6); assert.equal(v.j.candidates[0].user_rating_count, 321);
    // request shape
    assert.equal(m.calls.length, 1);
    assert.equal(m.calls[0].url, PLACES_SEARCH_URL); assert.equal(m.calls[0].init.method, "POST");
    assert.equal(m.calls[0].init.headers["X-Goog-Api-Key"], "KEY123"); assert.equal(m.calls[0].init.headers["X-Goog-FieldMask"], PLACES_FIELD_MASK);
    assert.match(PLACES_FIELD_MASK, /places\.id,places\.displayName,places\.formattedAddress,places\.location,places\.websiteUri,places\.rating,places\.userRatingCount/);
    const sent = JSON.parse(m.calls[0].init.body); assert.equal(sent.textQuery, "Rival Cafe Pune"); assert.ok(sent.locationBias.circle);
    // never auto-selected: profile untouched
    let row = db.sql.prepare("SELECT * FROM competitor_profiles WHERE id=?").get(c.id);
    assert.equal(row.place_id, null); assert.equal(row.verification_state, "unverified"); assert.equal(row.source, "user_entered"); assert.equal(row.lat, 18.5);
    assert.equal(db.sql.prepare("SELECT COUNT(*) AS n FROM competitor_places_data").get().n, 0);
    // confirm must reference a returned candidate
    assert.equal((await call("POST", "/api/competitors/confirm-place", db, "uA", { body: { id: c.id, place_id: "FORGED" } })).j.code, "candidate_not_found");
    assert.equal((await call("POST", "/api/competitors/confirm-place", db, "uA", { body: { id: c.id } })).status, 400);
    // expired candidates are refused
    assert.equal((await call("POST", "/api/competitors/confirm-place", db, "uA", { body: { id: c.id, place_id: "PLACE_1" }, now: NOW + 2 * 86400000 })).j.code, "candidate_not_found");
    const ok = await call("POST", "/api/competitors/confirm-place", db, "uA", { body: { id: c.id, place_id: "PLACE_1" } });
    assert.equal(ok.status, 200);
    const comp = ok.j.competitor;
    assert.equal(comp.place_id, "PLACE_1"); assert.equal(comp.verification_state, "verified"); assert.equal(comp.source, "places_api"); assert.equal(comp.verified_at, NOW);
    assert.equal(comp.lat, 18.52); assert.equal(comp.lng, 73.85);
    assert.deepEqual(comp.places_data, { display_name: "Rival Cafe", formatted_address: "1 MG Road, Pune", website_uri: "https://rival.example", rating: 4.6, user_rating_count: 321, source: "places_api", fetched_at: NOW });
    assert.equal(comp.name, "Rival Cafe"); assert.equal(comp.website, null); // user fields untouched by Google data
    assert.equal(db.sql.prepare("SELECT COUNT(*) AS n FROM competitor_place_candidates").get().n, 0);
    // editing identity after confirmation drops the match: it no longer describes what the user typed
    const up = await call("POST", "/api/competitors/update", db, "uA", { body: { id: c.id, name: "Rival Cafe Two" } });
    assert.equal(up.j.verification_reset, true);
    assert.equal(up.j.competitor.verification_state, "unverified"); assert.equal(up.j.competitor.source, "user_entered"); assert.equal(up.j.competitor.place_id, null); assert.equal(up.j.competitor.places_data, null);
  } finally { m.restore(); }
});

test("verify: provider_not_configured, provider_error, no candidates, rate limit", async () => {
  const db = makeDB(); seed(db);
  const c = (await add(db, "uA", "bA", "Rival Cafe")).j.competitor;
  const m = mockFetch(() => { throw new Error("must not call without a key"); });
  try {
    const nc = await call("POST", "/api/competitors/verify", db, "uA", { body: { id: c.id } });
    assert.equal(nc.status, 503); assert.equal(nc.j.code, "provider_not_configured"); assert.equal(nc.j.state, "provider_not_configured");
    assert.equal(m.calls.length, 0);
  } finally { m.restore(); }
  const e = mockFetch(() => jsonRes({ error: { message: "API key invalid KEY_SECRET" } }, 403));
  try {
    const r = await call("POST", "/api/competitors/verify", db, "uA", { body: { id: c.id }, env: { GOOGLE_MAPS_API_KEY: "k" } });
    assert.equal(r.status, 502); assert.equal(r.j.code, "provider_error"); assert.ok(!JSON.stringify(r.j).includes("KEY_SECRET"));
    assert.equal(db.sql.prepare("SELECT verification_state FROM competitor_profiles").get().verification_state, "unverified");
  } finally { e.restore(); }
  const z = mockFetch(() => jsonRes({}));
  try {
    const r = await call("POST", "/api/competitors/verify", db, "uA", { body: { id: c.id }, env: { GOOGLE_MAPS_API_KEY: "k" } });
    assert.equal(r.j.state, "no_candidates"); assert.deepEqual(r.j.candidates, []);
    assert.equal(db.sql.prepare("SELECT verification_state FROM competitor_profiles").get().verification_state, "failed");
    const lim = await call("POST", "/api/competitors/verify", db, "uA", { body: { id: c.id }, env: { GOOGLE_MAPS_API_KEY: "k" }, ctx: { rateLimit: async () => ({ ok: false }) } });
    assert.equal(lim.status, 429);
  } finally { z.restore(); }
  assert.deepEqual(normalizePlace({ id: "p", rating: "bad", userRatingCount: 1.5 }), { place_id: "p", display_name: null, formatted_address: null, lat: null, lng: null, website_uri: null, rating: null, user_rating_count: null });
  assert.equal(normalizePlace({}), null);
});

test("remove purges competitor rows, candidates and Places data", async () => {
  const db = makeDB(); seed(db);
  const c = (await add(db, "uA", "bA", "Rival Cafe")).j.competitor;
  const m = mockFetch(() => jsonRes(PLACES_OK));
  try {
    await call("POST", "/api/competitors/verify", db, "uA", { body: { id: c.id }, env: { GOOGLE_MAPS_API_KEY: "k" } });
    await call("POST", "/api/competitors/confirm-place", db, "uA", { body: { id: c.id, place_id: "PLACE_1" } });
    await call("POST", "/api/competitors/verify", db, "uA", { body: { id: c.id }, env: { GOOGLE_MAPS_API_KEY: "k" } });
  } finally { m.restore(); }
  assert.equal(db.sql.prepare("SELECT COUNT(*) AS n FROM competitor_places_data").get().n, 1);
  assert.equal(db.sql.prepare("SELECT COUNT(*) AS n FROM competitor_place_candidates").get().n, 2);
  const rm = await call("POST", "/api/competitors/remove", db, "uA", { body: { id: c.id } });
  assert.deepEqual(rm.j.removed, { profile: 1, places_data: 1, place_candidates: 2 });
  for (const t of ["competitor_profiles", "competitor_places_data", "competitor_place_candidates"]) assert.equal(db.sql.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n, 0);
});

test("compare: nulls with reasons when nothing exists", async () => {
  const db = makeDB(); seed(db);
  const c = (await add(db, "uA", "bA", "Rival Cafe")).j.competitor;
  const r = await call("GET", "/api/competitors/compare", db, "uA", { query: "?business_id=bA&keyword_id=kbA" });
  assert.equal(r.status, 200);
  assert.deepEqual(r.j.you.rating, { value: null, reason: "no_stored_reviews" });
  assert.deepEqual(r.j.you.review_count, { value: null, reason: "no_stored_reviews" });
  assert.equal(r.j.you.grid_visibility.reason, "no_completed_scan");
  const cells = r.j.competitors[0].cells;
  assert.equal(r.j.competitors[0].id, c.id); assert.equal(r.j.competitors[0].data_label, "user_entered_not_verified_by_google");
  assert.equal(cells.grid_visibility.reason, "no_completed_scan");
  assert.equal(cells.rating.reason, "not_verified_with_google_places"); assert.equal(cells.review_count.reason, "not_verified_with_google_places");
  assert.equal(cells.website_facts.reason, "no_crawler_result_stored");
  assert.deepEqual(r.j.gaps, []);
  const nokw = await call("GET", "/api/competitors/compare", db, "uA", { query: "?business_id=bA" });
  assert.equal(nokw.j.competitors[0].cells.grid_visibility.reason, "keyword_id_not_provided");
});

test("compare: uses only stored data, cites source and as_of, derives gaps by rule", async () => {
  const db = makeDB(); seed(db);
  const s = db.sql;
  const c = (await add(db, "uA", "bA", "Rival Cafe")).j.competitor;
  const other = (await add(db, "uA", "bA", "Unseen Cafe")).j.competitor;
  // Google-confirmed data for Rival
  s.prepare("UPDATE competitor_profiles SET place_id='PLACE_1',source='places_api',verification_state='verified',verified_at=? WHERE id=?").run(NOW, c.id);
  s.prepare("INSERT INTO competitor_places_data (competitor_id,place_id,rating,user_rating_count,fetched_at) VALUES (?,?,?,?,?)").run(c.id, "PLACE_1", 4.6, 321, NOW - 1000);
  // own authorised reviews: avg 4, 2 reviews
  s.prepare("INSERT INTO reviews (id,business_location_id,google_review_name,rating,review_time,reply_status,synced_at) VALUES ('r1','locbA','g1',5,?, 'answered',?),('r2','locbA','g2',3,?, 'unanswered',?)").run(NOW - 86400000, NOW - 500, NOW - 86400000, NOW - 500);
  // scan: 4 points; provider returned competitors at 3, none at 1
  s.prepare("INSERT INTO rank_scans (id,user_id,business_id,keyword_id,grid_size,radius_m,center_lat,center_lng,state,provider,points_total,scan_date,created_at,completed_at) VALUES ('sc','uA','bA','kbA',3,1000,18.5,73.8,'completed','testprov',4,'2026-10-29',?,?)").run(NOW - 5000, NOW - 4000);
  const pt = s.prepare("INSERT INTO rank_scan_points (id,scan_id,grid_row,grid_col,lat,lng,position,competitors_json,provider,observed_at) VALUES (?,?,?,?,?,?,?,?,?,?)");
  pt.run("p1", "sc", 0, 0, 1, 1, 5, JSON.stringify([{ name: "Rival Cafe", position: 1 }]), "testprov", NOW);
  pt.run("p2", "sc", 0, 1, 1, 1, 2, JSON.stringify([{ name: "RIVAL  cafe", position: 2 }]), "testprov", NOW);
  pt.run("p3", "sc", 0, 2, 1, 1, null, JSON.stringify([{ name: "Rival Cafe", position: 3 }, { name: "Other", position: 1 }]), "testprov", NOW);
  pt.run("p4", "sc", 1, 0, 1, 1, 1, null, "testprov", NOW);
  const r = await call("GET", "/api/competitors/compare", db, "uA", { query: "?business_id=bA&keyword_id=kbA" });
  assert.equal(r.status, 200);
  assert.deepEqual(r.j.you.rating, { value: 4, source: "google_business_profile_api (stored reviews)", as_of: NOW - 500 });
  assert.equal(r.j.you.review_count.value, 2);
  assert.deepEqual(r.j.you.grid_visibility.value, { points_with_competitor_data: 3, points_found: 2, points_top3: 1, basis: "points where the rank provider returned a competitor list" });
  assert.equal(r.j.scan.points_with_competitor_data, 3); assert.equal(r.j.scan.completed_at, NOW - 4000);
  const rival = r.j.competitors.find((x) => x.id === c.id).cells;
  assert.deepEqual(rival.rating, { value: 4.6, source: "places_api", as_of: NOW - 1000 });
  assert.deepEqual(rival.review_count, { value: 321, source: "places_api", as_of: NOW - 1000 });
  assert.deepEqual(rival.grid_visibility.value, { points_with_competitor_data: 3, points_present: 3, points_top3: 3, best_position: 1, average_position: 2, matched_by: "name_match" });
  assert.equal(rival.grid_visibility.source, "rank_provider:testprov"); assert.equal(rival.grid_visibility.as_of, NOW - 4000);
  const unseen = r.j.competitors.find((x) => x.id === other.id).cells;
  assert.equal(unseen.grid_visibility.reason, "not_in_provider_results");
  const rules = r.j.gaps.map((g) => g.rule).sort();
  assert.deepEqual(rules, ["grid_top3_gap", "rating_gap", "review_count_gap"]);
  const grid = r.j.gaps.find((g) => g.rule === "grid_top3_gap");
  assert.match(grid.text, /appears in the top 3 at 2 more grid points than you/);
  assert.ok(r.j.gaps.every((g) => g.competitor_id === c.id)); // nothing derived for the competitor without data
  // a competitor that is NOT better on a number yields no gap for it
  s.prepare("UPDATE competitor_places_data SET rating=3.0,user_rating_count=1 WHERE competitor_id=?").run(c.id);
  const r2 = await call("GET", "/api/competitors/compare", db, "uA", { query: "?business_id=bA&keyword_id=kbA" });
  assert.deepEqual(r2.j.gaps.map((g) => g.rule), ["grid_top3_gap"]);
});

test("compare: scan without provider competitor data yields null reasons, not zeros", async () => {
  const db = makeDB(); seed(db);
  await add(db, "uA", "bA", "Rival Cafe");
  db.sql.prepare("INSERT INTO rank_scans (id,user_id,business_id,keyword_id,grid_size,radius_m,center_lat,center_lng,state,provider,points_total,scan_date,created_at) VALUES ('sc','uA','bA','kbA',3,1000,1,1,'completed','p',1,'2026-10-29',?)").run(NOW);
  db.sql.prepare("INSERT INTO rank_scan_points (id,scan_id,grid_row,grid_col,lat,lng,position,observed_at) VALUES ('p1','sc',0,0,1,1,3,?)").run(NOW);
  const r = await call("GET", "/api/competitors/compare", db, "uA", { query: "?business_id=bA&keyword_id=kbA" });
  assert.equal(r.j.you.grid_visibility.reason, "provider_returned_no_competitor_data");
  assert.equal(r.j.competitors[0].cells.grid_visibility.reason, "provider_returned_no_competitor_data");
  assert.deepEqual(r.j.gaps, []);
});

test("tenant isolation on every endpoint", async () => {
  const db = makeDB(); seed(db);
  const b = (await add(db, "uB", "bB", "B Secret Rival")).j.competitor;
  db.sql.prepare("INSERT INTO competitor_place_candidates (competitor_id,place_id,data_json,fetched_at) VALUES (?,?,?,?)").run(b.id, "PB", JSON.stringify({ place_id: "PB", lat: 1, lng: 2, display_name: "B" }), NOW);
  const env = { GOOGLE_MAPS_API_KEY: "k" };
  const m = mockFetch(() => { throw new Error("no provider call for a foreign competitor"); });
  try {
    assert.equal((await call("GET", "/api/competitors/list", db, "uA", { query: "?business_id=bB" })).status, 404);
    assert.equal((await call("GET", "/api/competitors/compare", db, "uA", { query: "?business_id=bB&keyword_id=kbB" })).status, 404);
    assert.equal((await call("GET", "/api/competitors/compare", db, "uA", { query: "?business_id=bA&keyword_id=kbB" })).status, 404); // keyword of another tenant
    assert.equal((await call("POST", "/api/competitors/add", db, "uA", { body: { business_id: "bB", name: "Injected" } })).status, 404);
    for (const p of ["update", "remove", "verify"]) assert.equal((await call("POST", "/api/competitors/" + p, db, "uA", { body: { id: b.id, name: "Hijack" }, env })).status, 404, p);
    assert.equal((await call("POST", "/api/competitors/confirm-place", db, "uA", { body: { id: b.id, place_id: "PB" }, env })).status, 404);
  } finally { m.restore(); }
  const row = db.sql.prepare("SELECT name,place_id FROM competitor_profiles WHERE id=?").get(b.id);
  assert.equal(row.name, "B Secret Rival"); assert.equal(row.place_id, null);
  const mine = await call("GET", "/api/competitors/list", db, "uB", { query: "?business_id=bB" });
  assert.equal(mine.j.competitors.length, 1);
  assert.ok(!JSON.stringify((await call("GET", "/api/competitors/list", db, "uA", { query: "?business_id=bA" })).j).includes("B Secret"));
  assert.equal((await call("GET", "/api/competitors/list", db, "uA", { query: "" })).status, 400);
});
