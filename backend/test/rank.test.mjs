import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { buildGrid, aggregate, routes, jobs, csvCell, scanPoint, makeProvider, runDueSchedules } from "../src/rank.js";

// Real SQLite (node:sqlite) behind a D1-shaped wrapper; schema from the actual migrations.
function d1() {
  const db = new DatabaseSync(":memory:");
  for (const f of ["000_base.sql", "040_rank.sql"]) db.exec(readFileSync(new URL("../migrations/" + f, import.meta.url), "utf8"));
  const wrap = (sql, args) => ({
    async first() { return db.prepare(sql).get(...args) ?? null; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async run() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
  });
  return { raw: db, prepare: (sql) => ({ bind: (...a) => wrap(sql, a), ...wrap(sql, []) }) };
}
const NOW = Date.UTC(2026, 5, 10, 12);
function seed(DB, { loc = true } = {}) {
  const r = DB.raw;
  r.exec("INSERT INTO users (id,google_sub,email,created_at,updated_at) VALUES ('u1','g1','a@b.in',1,1),('u2','g2','c@d.in',1,1)");
  r.exec("INSERT INTO businesses (id,user_id,name,status,created_at,updated_at) VALUES ('b1','u1','Shop','active',1,1),('b2','u2','Other','active',1,1)");
  r.exec("INSERT INTO keywords (id,business_id,keyword,location_name,device,active,created_at,updated_at) VALUES ('k1','b1','=cmd dentist','Pune','mobile',1,1,1),('k2','b2','x','Pune','desktop',1,1,1)");
  if (loc) r.exec("INSERT INTO business_locations (id,business_id,name,latitude,longitude,created_at,updated_at) VALUES ('l1','b1','Shop',18.5204,73.8567,1,1)");
}
const baseEnv = (DB, extra = {}) => ({ DB, RANK_PROVIDER_ENABLED: "true", RANK_PROVIDER_URL: "https://prov.example/q", RANK_RETRY_DELAY_MS: "0", ...extra });
function ctxFor(env, userId, url, { feature = true, plan = "pro" } = {}) {
  return {
    env, url: new URL(url), userId, ip: "1", now: () => NOW,
    json: (d, s = 200) => Response.json(d, { status: s }),
    getUserBusiness: async (id) => env.DB.prepare("SELECT * FROM businesses WHERE id=? AND user_id=?").bind(id, userId).first(),
    requireFeature: async () => ({ ok: feature, entitlements: { plan_code: plan } }),
    rateLimit: async () => ({ ok: true }),
  };
}
const route = (m, p) => routes.find((r) => r.method === m && r.path === p).handler;
const post = (url, body) => new Request(url, { method: "POST", body: JSON.stringify(body) });
const U = "https://x/api/rank/";
const scanBody = { business_id: "b1", keyword_id: "k1", grid_size: 3, radius_m: 1000 };
// positions by call index
function mockProvider(fn) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body); calls.push(body);
    const out = fn(body, calls.length - 1);
    if (out instanceof Response) return out;
    return Response.json(out);
  };
  return calls;
}

test("grid geometry: known offsets incl. cos(latitude)", () => {
  const g = buildGrid(0, 0, 3, 1112);
  assert.equal(g.length, 9);
  const nw = g[0], se = g[8], c = g[4];
  assert.deepEqual([c.lat, c.lng], [0, 0]);
  assert.ok(Math.abs(nw.lat - 0.01) < 2e-4 && nw.lng < 0); // ~1112m = ~0.01 deg at equator
  assert.ok(se.lat < 0 && se.lng > 0);
  const g60 = buildGrid(60, 10, 3, 1000);
  const dLat = g60[0].lat - 60, dLng = g60[2].lng - 10;
  assert.ok(Math.abs(dLng / dLat - 2) < 0.01, "at 60N a metre is 2x as many degrees of longitude");
  assert.equal(buildGrid(18.5, 73.8, 7, 3000).length, 49);
  assert.equal(g60[0].row, 0); assert.equal(g60[0].col, 0);
});

test("aggregate math: null stays null, errors excluded", () => {
  const a = aggregate([{ position: 1 }, { position: 3 }, { position: null }, { position: 8 }, { position: null, error: "timeout" }]);
  assert.equal(a.avg_position, 4); // (1+3+8)/3
  assert.equal(a.visibility, 0.5); // 2 of 4 observed in top 3
  assert.equal(a.failed, 1);
  const none = aggregate([{ position: null, error: "x" }]);
  assert.equal(none.avg_position, null); assert.equal(none.visibility, null);
  const nf = aggregate([{ position: null }, { position: null }]);
  assert.equal(nf.avg_position, null); assert.equal(nf.visibility, 0);
});

test("provider disabled -> awaiting_rank_provider, nothing stored", async () => {
  const DB = d1(); seed(DB);
  let called = false; globalThis.fetch = async () => { called = true; return Response.json({}); };
  const env = { DB, RANK_PROVIDER_ENABLED: "false", RANK_PROVIDER_URL: "https://p" };
  const res = await route("POST", "/api/rank/scans")(post(U, scanBody), ctxFor(env, "u1", U + "scans"));
  const j = await res.json();
  assert.equal(j.state, "awaiting_rank_provider");
  assert.equal(called, false);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) n FROM rank_scans").get().n, 0);
});

test("no location -> awaiting_location, no guess", async () => {
  const DB = d1(); seed(DB, { loc: false });
  mockProvider(() => ({ results: [] }));
  const j = await (await route("POST", "/api/rank/scans")(post(U, scanBody), ctxFor(baseEnv(DB), "u1", U + "scans"))).json();
  assert.equal(j.state, "awaiting_location");
  assert.equal(DB.raw.prepare("SELECT COUNT(*) n FROM rank_scans").get().n, 0);
});

test("user-supplied lat/lng in address_json is used when no Google location", async () => {
  const DB = d1(); seed(DB, { loc: false });
  DB.raw.exec(`UPDATE businesses SET address_json='{"lat":12.9,"lng":77.6}' WHERE id='b1'`);
  mockProvider(() => ({ results: [] }));
  const j = await (await route("POST", "/api/rank/scans")(post(U, scanBody), ctxFor(baseEnv(DB), "u1", U + "scans"))).json();
  assert.equal(j.state, "completed");
  assert.equal(DB.raw.prepare("SELECT center_source s FROM rank_scans").get().s, "user_supplied");
});

test("completed scan: null for not found, avg/visibility, usage units, detail + csv", async () => {
  const DB = d1(); seed(DB);
  const calls = mockProvider((b) => ({
    provider: "testprov",
    results: b.lat > 18.528 ? [{ position: 2, ranking_url: "https://s.in" }] : [],
    competitors: [{ name: "=EVIL", position: 1 }, { name: "Rival", position: 3 }],
  }));
  const env = baseEnv(DB);
  const j = await (await route("POST", "/api/rank/scans")(post(U, scanBody), ctxFor(env, "u1", U + "scans"))).json();
  assert.equal(j.state, "completed"); assert.equal(j.points, 9);
  assert.equal(calls.length, 9);
  assert.equal(calls[0].business_id, "b1"); assert.ok("lat" in calls[0] && "lng" in calls[0]);
  const d = await (await route("GET", "/api/rank/scans/detail")(new Request("https://x"), ctxFor(env, "u1", U + "scans/detail?id=" + j.scan_id))).json();
  assert.equal(d.points.length, 9);
  const nulls = d.points.filter((p) => p.position === null).length;
  assert.equal(nulls, 6); // north row found (3), others null
  assert.equal(d.avg_position, 2); assert.equal(d.visibility, 0.3333);
  assert.ok(d.points.every((p) => p.provider === "testprov" && p.observed_at > 0));
  assert.equal(d.top_competitors[0].name, "=EVIL");
  const u = DB.raw.prepare("SELECT units,event_type FROM usage_events").get();
  assert.equal(u.units, 9); assert.equal(u.event_type, "rank_scan_points");
  const csv = await (await route("GET", "/api/rank/export.csv")(new Request("https://x"), ctxFor(env, "u1", U + "export.csv?scan_id=" + j.scan_id))).text();
  assert.match(csv, /'=cmd dentist/); // keyword starts with '=' -> neutralised
  assert.ok(!/^=cmd/m.test(csv));
  assert.match(csv, /,73\.\d+,/); // numbers untouched
  assert.match(csv, /not_found/);
});

test("no competitors from provider -> omitted", async () => {
  const DB = d1(); seed(DB);
  mockProvider(() => ({ results: [{ position: 5 }] }));
  const env = baseEnv(DB);
  const j = await (await route("POST", "/api/rank/scans")(post(U, scanBody), ctxFor(env, "u1", U + "scans"))).json();
  const d = await (await route("GET", "/api/rank/scans/detail")(new Request("https://x"), ctxFor(env, "u1", U + "scans/detail?id=" + j.scan_id))).json();
  assert.equal("top_competitors" in d, false);
});

test("partial scan: failed points flagged error, distinct from not found, retries bounded", async () => {
  const DB = d1(); seed(DB);
  let n = 0;
  const calls = mockProvider((b) => {
    if (Math.abs(b.lng - 73.8567) < 1e-9 && b.lat > 18.528) { n++; return new Response("boom", { status: 500 }); } // one point always 500
    return { results: [{ position: 4 }] };
  });
  const env = baseEnv(DB);
  const j = await (await route("POST", "/api/rank/scans")(post(U, scanBody), ctxFor(env, "u1", U + "scans"))).json();
  assert.equal(j.state, "partial");
  assert.equal(n, 3, "bounded retries");
  const d = await (await route("GET", "/api/rank/scans/detail")(new Request("https://x"), ctxFor(env, "u1", U + "scans/detail?id=" + j.scan_id))).json();
  const errored = d.points.filter((p) => p.error);
  assert.equal(errored.length, 1); assert.equal(errored[0].position, null);
  assert.equal(d.avg_position, 4); assert.equal(d.visibility, 0); // 8 observed, none in top 3
});

test("all points fail -> provider_error with null aggregates", async () => {
  const DB = d1(); seed(DB);
  mockProvider(() => new Response("x", { status: 401 }));
  const env = baseEnv(DB);
  const j = await (await route("POST", "/api/rank/scans")(post(U, scanBody), ctxFor(env, "u1", U + "scans"))).json();
  assert.equal(j.state, "provider_error");
  const s = DB.raw.prepare("SELECT avg_position a, visibility v FROM rank_scans").get();
  assert.equal(s.a, null); assert.equal(s.v, null);
});

test("concurrency never exceeds 4", async () => {
  let cur = 0, max = 0;
  globalThis.fetch = async () => { cur++; max = Math.max(max, cur); await new Promise((r) => setTimeout(r, 5)); cur--; return Response.json({ results: [] }); };
  const DB = d1(); seed(DB);
  await route("POST", "/api/rank/scans")(post(U, { ...scanBody, grid_size: 5 }), ctxFor(baseEnv(DB), "u1", U + "scans"));
  assert.ok(max <= 4 && max >= 2, "max " + max);
});

test("plan caps: grid points and monthly scans; feature gate", async () => {
  const DB = d1(); seed(DB);
  mockProvider(() => ({ results: [] }));
  const env = baseEnv(DB, { RANK_MAX_SCANS_PER_MONTH: "2" });
  const h = route("POST", "/api/rank/scans");
  const big = await h(post(U, { ...scanBody, grid_size: 7 }), ctxFor(env, "u1", U + "scans", { plan: "pro" }));
  assert.equal(big.status, 403); assert.equal((await big.json()).code, "plan_points_limit");
  assert.equal((await h(post(U, scanBody), ctxFor(env, "u1", U + "scans"))).status, 200);
  assert.equal((await h(post(U, scanBody), ctxFor(env, "u1", U + "scans"))).status, 200);
  const capped = await h(post(U, scanBody), ctxFor(env, "u1", U + "scans"));
  assert.equal(capped.status, 403); assert.equal((await capped.json()).code, "scan_cap_reached");
  const denied = await h(post(U, scanBody), ctxFor(env, "u1", U + "scans", { feature: false }));
  assert.equal(denied.status, 403);
  assert.equal((await h(post(U, { ...scanBody, grid_size: 4 }), ctxFor(env, "u1", U + "scans"))).status, 400);
});

test("ownership denial on create, list, detail, history, export", async () => {
  const DB = d1(); seed(DB);
  mockProvider(() => ({ results: [{ position: 1 }] }));
  const env = baseEnv(DB);
  const j = await (await route("POST", "/api/rank/scans")(post(U, scanBody), ctxFor(env, "u1", U + "scans"))).json();
  const other = (m, p, q) => route(m, p)(new Request("https://x"), ctxFor(env, "u2", U + q));
  assert.equal((await route("POST", "/api/rank/scans")(post(U, scanBody), ctxFor(env, "u2", U + "scans"))).status, 404);
  assert.equal((await route("POST", "/api/rank/scans")(post(U, { ...scanBody, business_id: "b2" }), ctxFor(env, "u2", U + "scans"))).status, 404); // k1 not b2's keyword
  assert.equal((await other("GET", "/api/rank/scans", "scans?business_id=b1")).status, 404);
  assert.equal((await other("GET", "/api/rank/scans/detail", "scans/detail?id=" + j.scan_id)).status, 404);
  assert.equal((await other("GET", "/api/rank/history", "history?business_id=b1&keyword_id=k1")).status, 404);
  assert.equal((await other("GET", "/api/rank/export.csv", "export.csv?scan_id=" + j.scan_id)).status, 404);
  assert.equal((await route("GET", "/api/rank/scans")(new Request("https://x"), ctxFor(env, "u1", U + "scans?business_id=b1&keyword_id=k1"))).status, 200);
});

test("history: one row per date (latest wins), partial counted", async () => {
  const DB = d1(); seed(DB);
  const ins = (id, date, t, avg, state) => DB.raw.prepare("INSERT INTO rank_scans (id,user_id,business_id,keyword_id,grid_size,radius_m,center_lat,center_lng,state,avg_position,visibility,scan_date,created_at) VALUES (?,?,?,?,3,1000,1,1,?,?,0.5,?,?)").run(id, "u1", "b1", "k1", state, avg, date, t);
  ins("a", "2026-06-01", 1, 5, "completed"); ins("b", "2026-06-01", 2, 4, "completed"); ins("c", "2026-06-02", 3, null, "provider_error"); ins("d", "2026-06-03", 4, 3, "partial");
  const j = await (await route("GET", "/api/rank/history")(new Request("https://x"), ctxFor(baseEnv(DB), "u1", U + "history?business_id=b1&keyword_id=k1"))).json();
  assert.deepEqual(j.history.map((h) => [h.date, h.avg_position]), [["2026-06-01", 4], ["2026-06-03", 3]]);
});

test("csvCell escapes and neutralises injection, leaves numbers alone", () => {
  assert.equal(csvCell("=1+1"), "'=1+1");
  assert.equal(csvCell("+x"), "'+x"); assert.equal(csvCell("-x"), "'-x"); assert.equal(csvCell("@x"), "'@x");
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell(-73.5), "-73.5"); assert.equal(csvCell(null), "");
});

async function mkSchedule(env, freq = "weekly") {
  const r = await route("POST", "/api/rank/schedules")(post(U, { business_id: "b1", keyword_id: "k1", grid_size: 3, radius_m: 1000, frequency: freq }), ctxFor(env, "u1", U + "schedules"));
  return r;
}

test("schedules: create/update/list, ownership, validation", async () => {
  const DB = d1(); seed(DB); const env = baseEnv(DB);
  assert.equal((await mkSchedule(env)).status, 201);
  assert.equal((await mkSchedule(env, "monthly")).status, 200);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) n FROM scan_schedules").get().n, 1);
  const bad = await route("POST", "/api/rank/schedules")(post(U, { business_id: "b1", keyword_id: "k1", grid_size: 3, radius_m: 1000, frequency: "daily" }), ctxFor(env, "u1", U + "schedules"));
  assert.equal(bad.status, 400);
  const l = await (await route("GET", "/api/rank/schedules")(new Request("https://x"), ctxFor(env, "u1", U + "schedules?business_id=b1"))).json();
  assert.equal(l.schedules.length, 1); assert.equal(l.schedules[0].frequency, "monthly");
  assert.equal((await route("GET", "/api/rank/schedules")(new Request("https://x"), ctxFor(env, "u2", U + "schedules?business_id=b1"))).status, 404);
});

test("job: runs due schedule once, double-fire does not double-scan, advances next_run", async () => {
  const DB = d1(); seed(DB); const env = baseEnv(DB);
  await mkSchedule(env);
  const calls = mockProvider(() => ({ results: [{ position: 2 }] }));
  const due = Date.now() + 1000; // schedule next_run_at was created at NOW (2026-06); real clock is later
  const [a, b] = await Promise.all([runDueSchedules(env, due), runDueSchedules(env, due)]);
  assert.equal(a.ran + b.ran, 1);
  assert.equal(calls.length, 9);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) n FROM rank_scans").get().n, 1);
  assert.equal(DB.raw.prepare("SELECT next_run_at n FROM scan_schedules").get().n, due + 7 * 86400000);
  assert.equal((await runDueSchedules(env, due + 60000)).ran, 0);
  assert.ok(jobs[0].name && typeof jobs[0].run === "function");
});

test("job: provider disabled does nothing; max 10 per tick", async () => {
  const DB = d1(); seed(DB);
  assert.equal((await runDueSchedules({ DB, RANK_PROVIDER_ENABLED: "false" }, NOW + 1e9)).ran, 0);
  for (let i = 0; i < 12; i++) {
    DB.raw.exec(`INSERT INTO keywords (id,business_id,keyword,location_name,device,active,created_at,updated_at) VALUES ('kk${i}','b1','w${i}','Pune','mobile',1,1,1)`);
    DB.raw.exec(`INSERT INTO scan_schedules (id,user_id,business_id,keyword_id,grid_size,radius_m,frequency,plan_code,next_run_at,created_at,updated_at) VALUES ('s${i}','u1','b1','kk${i}',3,1000,'weekly','agency',${i},1,1)`);
  }
  mockProvider(() => ({ results: [] }));
  const r = await runDueSchedules(baseEnv(DB, { RANK_MAX_SCANS_PER_MONTH: "999" }), NOW);
  assert.equal(r.ran, 10);
});

test("monitoring event only on material real change between completed scans", async () => {
  const DB = d1(); seed(DB); const env = baseEnv(DB);
  const run = async (pos, t) => {
    mockProvider(() => ({ results: pos == null ? [] : [{ position: pos }] }));
    const { executeScan } = await import("../src/rank.js");
    return executeScan(env, { userId: "u1", business: DB.raw.prepare("SELECT * FROM businesses WHERE id='b1'").get(), keyword: { id: "k1", keyword: "kw", location_name: "Pune", device: "mobile" }, gridSize: 3, radiusM: 1000, planCode: "pro", now: t, skipCapCheck: true });
  };
  const ev = () => DB.raw.prepare("SELECT * FROM monitoring_events").all();
  await run(5, NOW);
  assert.equal(ev().length, 0, "first scan has nothing to compare");
  await run(5.5 > 0 ? 6 : 6, NOW + 1000); // delta 1 -> below threshold
  assert.equal(ev().length, 0);
  await run(8, NOW + 2000); // delta 2 -> event
  assert.equal(ev().length, 1);
  assert.equal(ev()[0].event_type, "rank_change"); assert.equal(ev()[0].severity, "warning");
  await run(null, NOW + 3000); // nothing found -> avg null -> no event, and no estimation
  assert.equal(ev().length, 1);
});

test("scanPoint: empty results is not-found (not error); malformed is error; timeout aborts", async () => {
  const provider = { ...makeProvider({ RANK_PROVIDER_URL: "https://p", RANK_RETRY_DELAY_MS: "0" }), maxAttempts: 2, timeoutMs: 30 };
  globalThis.fetch = async () => Response.json({ results: [] });
  let r = await scanPoint(provider, { keyword: "k", lat: 1, lng: 1 });
  assert.equal(r.position, null); assert.equal(r.error, undefined); assert.equal(r.raw_count, 0);
  globalThis.fetch = async () => Response.json({ nope: 1 });
  r = await scanPoint(provider, { keyword: "k", lat: 1, lng: 1 });
  assert.equal(r.error, "provider_bad_response");
  globalThis.fetch = (u, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("a"), { name: "AbortError" }))));
  r = await scanPoint(provider, { keyword: "k", lat: 1, lng: 1 });
  assert.equal(r.error, "timeout"); assert.equal(r.position, null);
});
