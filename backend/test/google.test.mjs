import test from "node:test";
import assert from "node:assert/strict";
import { encryptToken } from "../src/oauth.js";
import { routes, getAccessToken, queryAllRows, syncSearchConsole, runGoogleSyncJob, jobs } from "../src/google.js";

const KEY = "k".repeat(40);

// Minimal in-memory D1 stand-in: handles only the statements google.js and db.js issue here.
function fakeDB() {
  const t = {
    conn: new Map(), state: new Map(), users: new Map(), locs: [], bizLocs: [], reviews: [], replies: [],
    perf: [], props: [], metrics: [], log: [], businesses: [],
  };
  const handle = (sql, a, mode) => {
    const S = (p) => sql.startsWith(p);
    if (S("SELECT refresh_token_ciphertext,scope,updated_at FROM google_connections")) return t.conn.get(a[0]) || null;
    if (S("SELECT scope,updated_at FROM google_connections")) return t.conn.get(a[0]) || null;
    if (S("SELECT refresh_token_ciphertext FROM google_connections")) return t.conn.get(a[0]) || null;
    if (S("SELECT needs_reconnect,reconnect_flagged_at,last_sync_at FROM google_connection_state") || S("SELECT needs_reconnect,reconnect_flagged_at FROM google_connection_state")) return t.state.get(a[0]) || null;
    if (S("INSERT INTO google_connection_state (user_id,needs_reconnect,reconnect_flagged_at")) { t.state.set(a[0], { ...(t.state.get(a[0]) || {}), needs_reconnect: 1, reconnect_flagged_at: a[1], last_error_code: a[2] }); return {}; }
    if (S("INSERT INTO google_connection_state (user_id,needs_reconnect,last_sync_at")) { t.state.set(a[0], { ...(t.state.get(a[0]) || {}), last_sync_at: a[1] }); return {}; }
    if (S("DELETE FROM google_connections")) { t.conn.delete(a[0]); return {}; }
    if (S("DELETE FROM google_connection_state")) { t.state.delete(a[0]); return {}; }
    if (S("SELECT email FROM users")) return t.users.get(a[0]) || null;
    if (S("SELECT COUNT(*) AS n")) return { n: t.locs.length, last: t.locs.length ? 5 : null };
    if (S("SELECT account_name FROM google_locations")) return t.locs.find((l) => l.resource_name === a[1]) || null;
    if (S("SELECT bl.id,bl.google_resource_name")) return t.bizLocs[0] ? { ...t.bizLocs[0], raw_json: "{}" } : null;
    if (S("SELECT id FROM reviews WHERE google_review_name")) return t.reviews.find((r) => r.google_review_name === a[0]) || null;
    if (S("INSERT INTO reviews")) { t.reviews.push({ id: a[0], business_location_id: a[1], google_review_name: a[2], rating: a[4], reply_status: a[7] }); return {}; }
    if (S("UPDATE reviews SET reviewer_display_name")) { const r = t.reviews.find((x) => x.id === a[7]); r.rating = a[1]; return {}; }
    if (S("SELECT r.id,r.google_review_name FROM reviews")) return t.reviews.find((r) => r.id === a[0]) || null;
    if (S("UPDATE reviews SET reply_status='answered'")) { t.reviews.find((r) => r.id === a[0]).reply_status = "answered"; return {}; }
    if (S("INSERT INTO review_replies")) { t.replies.push({ status: sql.includes("'posted'") ? "posted" : "failed", text: a[4] }); return {}; }
    if (S("SELECT * FROM businesses")) return { id: a[0], user_id: "u1" };
    if (S("SELECT * FROM performance_metrics WHERE id")) return t.perf.at(-1) || null;
    if (S("INSERT INTO performance_metrics")) { t.perf.push({ id: a[0], impressions: a[4], website_clicks: a[5], call_clicks: a[6], direction_requests: a[7], raw: a[9] }); return {}; }
    if (S("INSERT INTO google_sync_log")) { t.log.push({ kind: a[3], state: a[4], code: a[5] }); return {}; }
    if (S("SELECT id,property_url FROM search_console_properties")) return t.props.find((p) => p.status === "active") || null;
    if (S("SELECT property_url FROM search_console_properties")) return t.props.find((p) => p.status === "active") || null;
    if (S("SELECT id FROM search_console_properties")) return t.props.find((p) => p.property_url === a[2]) || null;
    if (S("UPDATE search_console_properties SET status='inactive'")) { t.props.forEach((p) => { if (p.property_url !== a[3]) p.status = "inactive"; }); return {}; }
    if (S("UPDATE search_console_properties SET status='active'")) { t.props.find((p) => p.id === a[1]).status = "active"; return {}; }
    if (S("INSERT INTO search_console_properties")) { t.props.push({ id: a[0], property_url: a[3], status: "active" }); return {}; }
    if (S("UPDATE search_console_properties SET last_synced_at")) return {};
    if (S("DELETE FROM search_console_metrics")) { t.metrics = []; return {}; }
    if (S("INSERT INTO search_console_metrics")) { t.metrics.push({ date: a[4], clicks: a[5], position: a[8], q: a[9], p: a[10], raw: a[11] }); return {}; }
    if (S("SELECT plan_code,status")) return t.sub || null;
    if (S("SELECT b.id AS business_id")) return { results: t.businesses };
    throw new Error("fake DB: unhandled SQL: " + sql.slice(0, 80));
  };
  const db = {
    t,
    prepare(sql) {
      const mk = (a) => ({
        sql, a,
        async first() { return handle(sql, a, "first"); },
        async run() { return handle(sql, a, "run"); },
        async all() { const r = handle(sql, a, "all"); return r?.results ? r : { results: [] }; },
      });
      return { ...mk([]), bind: (...a) => mk(a) };
    },
    async batch(stmts) { for (const s of stmts) await s.run(); return []; },
  };
  return db;
}

async function setup({ scope = "openid business.manage", withLoc = "locations/123" } = {}) {
  const db = fakeDB();
  db.t.conn.set("u1", { refresh_token_ciphertext: await encryptToken(KEY, "refresh-1"), scope, updated_at: 1000 });
  db.t.users.set("u1", { email: "a@b.in" });
  if (withLoc) {
    db.t.bizLocs.push({ id: "loc1", google_resource_name: withLoc });
    db.t.locs.push({ resource_name: "locations/123", account_name: "accounts/456" });
  }
  const env = { DB: db, GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "sec", GOOGLE_TOKEN_ENCRYPTION_KEY: KEY, GOOGLE_RETRY_BASE_MS: "0" };
  return { db, env };
}

function ctxFor(env, url, { feature = true } = {}) {
  return {
    env, url: new URL(url), userId: "u1", ip: "1.1.1.1", now: () => Date.now(),
    json: (data, status = 200) => Response.json(data, { status }),
    getUserBusiness: async (bid) => (bid === "b1" ? { id: "b1" } : null),
    requireFeature: async () => ({ ok: feature }),
    rateLimit: async () => ({ ok: true }),
  };
}
const route = (method, path) => routes.find((r) => r.method === method && r.path === path);
const post = (body) => new Request("https://x/api", { method: "POST", body: JSON.stringify(body) });
const tokenOk = (u) => String(u).includes("oauth2.googleapis.com/token");
const ok = (data, init) => Response.json(data, init);

test("token refresh succeeds and returns the access token with scope", async () => {
  const { env } = await setup();
  let sent;
  globalThis.fetch = async (u, init) => { sent = init.body.toString(); return ok({ access_token: "at-1" }); };
  const r = await getAccessToken(env, "u1");
  assert.equal(r.ok, true);
  assert.equal(r.token, "at-1");
  assert.match(sent, /refresh_token=refresh-1/);
});

test("invalid_grant flags reconnect, later calls do not hit Google, reconnect clears it", async () => {
  const { env, db } = await setup();
  let calls = 0;
  globalThis.fetch = async () => { calls++; return ok({ error: "invalid_grant" }, { status: 400 }); };
  const r = await getAccessToken(env, "u1");
  assert.deepEqual([r.ok, r.state, r.code], [false, "awaiting_google_connection", "reconnect_required"]);
  assert.equal(db.t.state.get("u1").needs_reconnect, 1);
  const r2 = await getAccessToken(env, "u1");
  assert.equal(r2.code, "reconnect_required");
  assert.equal(calls, 1);
  // status route reports it
  const st = await (await route("GET", "/api/google/status").handler(new Request("https://x"), ctxFor(env, "https://x/api/google/status"))).json();
  assert.equal(st.state, "reconnect_required");
  assert.equal(st.connected, false);
  // OAuth callback re-stores the connection with a newer updated_at
  db.t.conn.get("u1").updated_at = Date.now() + 10;
  globalThis.fetch = async () => ok({ access_token: "at-2" });
  assert.equal((await getAccessToken(env, "u1")).ok, true);
});

test("429 is retried with Retry-After and then succeeds", async () => {
  const { env } = await setup();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return calls < 3 ? new Response("{}", { status: 429, headers: { "retry-after": "0" } }) : ok({ access_token: "at" });
  };
  const r = await getAccessToken(env, "u1");
  assert.equal(r.ok, true);
  assert.equal(calls, 3, "1 try + 2 retries");
});

test("persistent 429 / network failure maps to provider_error", async () => {
  const { env } = await setup();
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response("{}", { status: 429 }); };
  let r = await getAccessToken(env, "u1");
  assert.equal(calls, 3);
  assert.deepEqual([r.state, r.code], ["provider_error", "quota_exceeded"]);
  globalThis.fetch = async () => { throw new Error("boom"); };
  r = await getAccessToken(env, "u1");
  assert.deepEqual([r.state, r.code], ["provider_error", "network_error"]);
});

test("reviews google-fetch paginates, resolves locations/ID via google_locations and stores", async () => {
  const { env, db } = await setup();
  const urls = [];
  globalThis.fetch = async (u) => {
    u = String(u);
    if (tokenOk(u)) return ok({ access_token: "at" });
    urls.push(u);
    if (!u.includes("pageToken")) {
      return ok({ reviews: [{ name: "accounts/456/locations/123/reviews/r1", starRating: "FIVE", comment: "Great", createTime: "2026-01-01T00:00:00Z", reviewer: { displayName: "A" } }], nextPageToken: "p2", totalReviewCount: 2 });
    }
    return ok({ reviews: [{ name: "accounts/456/locations/123/reviews/r2", starRating: "TWO", reviewReply: { comment: "thanks" } }] });
  };
  const res = await route("POST", "/api/reviews/google-fetch").handler(post({ business_id: "b1" }), ctxFor(env, "https://x/api/reviews/google-fetch"));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual([body.state, body.fetched], ["verified_data", 2]);
  assert.equal(urls.length, 2);
  assert.match(urls[0], /\/v4\/accounts\/456\/locations\/123\/reviews\?/);
  assert.match(urls[1], /pageToken=p2/);
  assert.equal(db.t.reviews.length, 2);
  assert.equal(db.t.reviews.find((r) => r.google_review_name.endsWith("r2")).reply_status, "answered");
});

test("reviews google-fetch without a location is awaiting_google_location; plan gate returns 403", async () => {
  const { env } = await setup({ withLoc: null });
  const res = await route("POST", "/api/reviews/google-fetch").handler(post({ business_id: "b1" }), ctxFor(env, "https://x"));
  assert.equal(res.status, 409);
  assert.equal((await res.json()).state, "awaiting_google_location");
  const gated = await route("POST", "/api/reviews/google-fetch").handler(post({ business_id: "b1" }), ctxFor(env, "https://x", { feature: false }));
  assert.equal(gated.status, 403);
});

test("reply requires confirm:true and never calls Google without it", async () => {
  const { env, db } = await setup();
  db.t.reviews.push({ id: "rv1", google_review_name: "accounts/456/locations/123/reviews/r1", reply_status: "unanswered" });
  let calls = 0;
  globalThis.fetch = async () => { calls++; return ok({}); };
  const h = route("POST", "/api/reviews/reply").handler;
  for (const confirm of [undefined, false, "true", 1]) {
    const res = await h(post({ business_id: "b1", review_id: "rv1", reply: "Thanks!", confirm }), ctxFor(env, "https://x"));
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, "confirmation_required");
  }
  assert.equal(calls, 0);
  assert.equal(db.t.reviews[0].reply_status, "unanswered");
});

test("confirmed reply is PUT to Google and status stored; failure is recorded", async () => {
  const { env, db } = await setup();
  db.t.reviews.push({ id: "rv1", google_review_name: "accounts/456/locations/123/reviews/r1", reply_status: "unanswered" });
  let put;
  globalThis.fetch = async (u, init) => {
    if (tokenOk(u)) return ok({ access_token: "at" });
    put = { u: String(u), method: init.method, body: JSON.parse(init.body) };
    return ok({ comment: "Thanks!" });
  };
  const h = route("POST", "/api/reviews/reply").handler;
  const res = await h(post({ business_id: "b1", review_id: "rv1", reply: " Thanks! ", confirm: true }), ctxFor(env, "https://x"));
  assert.equal(res.status, 200);
  assert.equal(put.method, "PUT");
  assert.match(put.u, /\/v4\/accounts\/456\/locations\/123\/reviews\/r1\/reply$/);
  assert.deepEqual(put.body, { comment: "Thanks!" });
  assert.equal(db.t.reviews[0].reply_status, "answered");
  assert.equal(db.t.replies[0].status, "posted");

  db.t.reviews[0].reply_status = "unanswered";
  globalThis.fetch = async (u) => (tokenOk(u) ? ok({ access_token: "at" }) : ok({ error: { message: "nope" } }, { status: 403 }));
  const bad = await h(post({ business_id: "b1", review_id: "rv1", reply: "x", confirm: true }), ctxFor(env, "https://x"));
  assert.equal(bad.status, 502);
  assert.equal((await bad.json()).state, "provider_error");
  assert.equal(db.t.reviews[0].reply_status, "unanswered");
  assert.equal(db.t.replies[1].status, "failed");
});

test("search console without webmasters scope returns awaiting_search_console_authorization, no zeros", async () => {
  const { env, db } = await setup({ scope: "openid email business.manage" });
  db.t.props.push({ id: "p1", property_url: "https://shop.in/", status: "active" });
  let googleCalls = 0;
  globalThis.fetch = async (u) => { if (tokenOk(u)) return ok({ access_token: "at" }); googleCalls++; return ok({}); };
  for (const [method, path, req] of [
    ["GET", "/api/search-console/properties", new Request("https://x")],
    ["POST", "/api/search-console/sync", post({})],
    ["POST", "/api/search-console/select", post({ business_id: "b1", site_url: "https://shop.in/" })],
  ]) {
    const res = await route(method, path).handler(req, ctxFor(env, `https://x${path}?business_id=b1`));
    const body = await res.json();
    assert.equal(res.status, 409, path);
    assert.equal(body.state, "awaiting_search_console_authorization");
    assert.equal(body.code, "search_console_scope_missing");
    assert.equal(body.rows, path.endsWith("sync") ? 0 : undefined);
  }
  assert.equal(googleCalls, 0);
  assert.equal(db.t.metrics.length, 0);
});

test("Google 403 insufficient scope from Search Console maps to authorization state", async () => {
  const { env } = await setup({ scope: "openid https://www.googleapis.com/auth/webmasters.readonly" });
  globalThis.fetch = async (u) => (tokenOk(u) ? ok({ access_token: "at" }) : ok({ error: { message: "Request had insufficient authentication scopes." } }, { status: 403 }));
  const res = await route("GET", "/api/search-console/properties").handler(new Request("https://x"), ctxFor(env, "https://x?business_id=b1"));
  assert.equal((await res.json()).state, "awaiting_search_console_authorization");
});

test("search console properties, select and paginated sync", async () => {
  const { env, db } = await setup({ scope: "openid https://www.googleapis.com/auth/webmasters.readonly" });
  const sites = { siteEntry: [{ siteUrl: "https://shop.in/", permissionLevel: "siteOwner" }, { siteUrl: "sc-domain:x.in", permissionLevel: "siteUnverifiedUser" }] };
  const queryBodies = [];
  globalThis.fetch = async (u, init) => {
    u = String(u);
    if (tokenOk(u)) return ok({ access_token: "at" });
    if (u.endsWith("/webmasters/v3/sites")) return ok(sites);
    queryBodies.push(JSON.parse(init.body));
    const dim = JSON.parse(init.body).dimensions[0];
    return ok({ rows: dim === "date" ? [{ keys: ["2026-10-01"], clicks: 3, impressions: 40, ctr: 0.07, position: 6.2 }] : [{ keys: [dim + "1"], clicks: 2, impressions: 9, ctr: 0.2, position: 3 }] });
  };
  const props = await (await route("GET", "/api/search-console/properties").handler(new Request("https://x"), ctxFor(env, "https://x?business_id=b1"))).json();
  assert.deepEqual(props.properties, [{ site_url: "https://shop.in/", permission_level: "siteOwner" }]);
  const bad = await route("POST", "/api/search-console/select").handler(post({ business_id: "b1", site_url: "https://other.in/" }), ctxFor(env, "https://x"));
  assert.equal(bad.status, 403);
  const sel = await route("POST", "/api/search-console/select").handler(post({ business_id: "b1", site_url: "https://shop.in/" }), ctxFor(env, "https://x"));
  assert.deepEqual(await sel.json(), { ok: true });
  const sync = await (await route("POST", "/api/search-console/sync").handler(post({}), ctxFor(env, "https://x?business_id=b1"))).json();
  assert.equal(sync.state, "verified_data");
  assert.equal(sync.rows, 3);
  assert.match(sync.position_note, /not your Google Maps/);
  assert.equal(queryBodies[0].rowLimit, 25000);
  assert.equal(db.t.metrics.length, 3);
  assert.match(db.t.metrics[0].raw, /not_maps_rank/);
});

test("searchAnalytics paging uses startRow until a short page", async () => {
  const { env } = await setup();
  const starts = [];
  globalThis.fetch = async (u, init) => {
    const b = JSON.parse(init.body);
    starts.push(b.startRow);
    const n = b.startRow >= 4 ? 1 : 2;
    return ok({ rows: Array.from({ length: n }, (_, i) => ({ keys: ["k" + b.startRow + i], clicks: 1 })) });
  };
  const r = await queryAllRows(env, "tok", "https://shop.in/", { dimensions: ["query"] }, { pageSize: 2 });
  assert.deepEqual(starts, [0, 2, 4]);
  assert.equal(r.rows.length, 5);
  const capped = await queryAllRows(env, "tok", "https://shop.in/", { dimensions: ["query"] }, { pageSize: 2, maxRows: 3 });
  assert.equal(capped.rows.length, 3);
});

test("disconnect revokes at Google, deletes the connection and keeps going if revoke fails", async () => {
  const { env, db } = await setup();
  let revoked;
  globalThis.fetch = async (u, init) => { revoked = { u: String(u), body: init.body.toString() }; return ok({}); };
  const res = await route("POST", "/api/google/disconnect").handler(post({}), ctxFor(env, "https://x"));
  assert.deepEqual(await res.json(), { ok: true, revoked: true });
  assert.equal(revoked.u, "https://oauth2.googleapis.com/revoke");
  assert.equal(revoked.body, "token=refresh-1");
  assert.equal(db.t.conn.size, 0);

  const s2 = await setup();
  globalThis.fetch = async () => new Response("{}", { status: 400 });
  const r2 = await (await route("POST", "/api/google/disconnect").handler(post({}), ctxFor(s2.env, "https://x"))).json();
  assert.deepEqual(r2, { ok: true, revoked: false });
  assert.equal(s2.db.t.conn.size, 0);
});

test("status reports scopes, email and location count", async () => {
  const { env } = await setup();
  const st = await (await route("GET", "/api/google/status").handler(new Request("https://x"), ctxFor(env, "https://x"))).json();
  assert.deepEqual([st.connected, st.email, st.state, st.locations], [true, "a@b.in", "connected", 1]);
  assert.deepEqual(st.scopes, ["openid", "business.manage"]);
});

test("performance sync is gated by env flag and stores only returned values", async () => {
  const { env, db } = await setup();
  const h = route("POST", "/api/performance/sync").handler;
  const off = await h(post({}), ctxFor(env, "https://x?business_id=b1"));
  assert.equal(off.status, 503);
  env.GOOGLE_PERFORMANCE_SYNC_ENABLED = "true";
  let url;
  const series = (m, vals) => ({ dailyMetric: m, timeSeries: { datedValues: vals.map(([d, v]) => ({ date: { year: 2026, month: 10, day: d }, ...(v === null ? {} : { value: String(v) }) })) } });
  globalThis.fetch = async (u) => {
    if (tokenOk(u)) return ok({ access_token: "at" });
    url = String(u);
    return ok({ multiDailyMetricTimeSeries: [{ dailyMetricTimeSeries: [
      series("CALL_CLICKS", [[1, 2], [2, 3]]),
      series("BUSINESS_IMPRESSIONS_MOBILE_SEARCH", [[1, 10], [2, 5]]),
      series("BUSINESS_IMPRESSIONS_DESKTOP_MAPS", [[1, 1]]),
      series("WEBSITE_CLICKS", [[1, null]]),
    ] }] });
  };
  const res = await h(post({}), ctxFor(env, "https://x?business_id=b1"));
  assert.deepEqual(await res.json(), { state: "verified_data", days: 2 });
  assert.match(url, /locations\/123:fetchMultiDailyMetricsTimeSeries\?/);
  assert.match(url, /dailyMetrics=CALL_CLICKS/);
  const row = db.t.perf[0];
  assert.deepEqual([row.call_clicks, row.impressions, row.website_clicks, row.direction_requests], [5, 16, null, null]);
});

test("job skips when flags are off, honours plan features, is bounded and records errors without throwing", async () => {
  const { env, db } = await setup();
  assert.deepEqual(await runGoogleSyncJob(env), { skipped: true });
  env.GOOGLE_PERFORMANCE_SYNC_ENABLED = "true";
  env.GOOGLE_REVIEWS_SYNC_ENABLED = "true";
  db.t.businesses.push({ business_id: "b1", user_id: "u1" });
  let calls = 0;
  globalThis.fetch = async () => { calls++; return ok({ access_token: "at" }); };
  // free plan: neither feature enabled, so no Google call at all
  let s = await runGoogleSyncJob(env);
  assert.deepEqual([s.businesses, s.errors, calls], [1, 0, 0]);
  // paid plan: Google returns an API error, which is logged as provider_error and never thrown
  db.t.sub = { plan_code: "pro", status: "active" };
  globalThis.fetch = async (u) => (tokenOk(u) ? ok({ access_token: "at" }) : ok({ error: { message: "x" } }, { status: 403 }));
  s = await runGoogleSyncJob(env);
  assert.equal(s.errors, 2);
  assert.deepEqual(db.t.log.map((l) => [l.kind, l.state]), [["performance", "provider_error"], ["reviews", "provider_error"]]);
  assert.equal(jobs[0].name, "google_sync");
});
