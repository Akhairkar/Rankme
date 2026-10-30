import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { routes, jobs, findDuplicateBusiness, csvCell, sanitizeEvent, validateHours, normalizePhone, retentionCleanup, rollupAnalytics } from "../src/platform.js";

// Real SQLite (node:sqlite) behind a D1-shaped adapter, loaded from the real migrations.
function makeDB() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys = ON");
  for (const f of ["000_base.sql", "001_rate_limits.sql", "050_platform.sql"]) {
    sql.exec(readFileSync(fileURLToPath(new URL("../migrations/" + f, import.meta.url)), "utf8"));
  }
  const norm = (a) => a.map((x) => (x === undefined ? null : x));
  return {
    sql,
    prepare(q) {
      const noBind = { first: () => noBind.bind().first(), all: () => noBind.bind().all(), run: () => noBind.bind().run() };
      return Object.assign(noBind, {
        bind(...a) {
          return {
            async first() { return sql.prepare(q).get(...norm(a)) || null; },
            async all() { return { results: sql.prepare(q).all(...norm(a)) }; },
            async run() { const r = sql.prepare(q).run(...norm(a)); return { meta: { changes: Number(r.changes) } }; },
          };
        },
      });
    },
  };
}
const NOW = Date.UTC(2026, 9, 30, 12);
function seed(db) {
  const s = db.sql;
  for (const [id, email] of [["uA", "a@x.in"], ["uB", "b@x.in"]]) s.prepare("INSERT INTO users VALUES (?,?,?,?,?,?,?)").run(id, "g_" + id, email, "N " + id, null, 1, 1);
  const biz = (id, user, name, city) => s.prepare("INSERT INTO businesses (id,user_id,name,category,city,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").run(id, user, name, "Dentist", city, "active", 1, 1);
  biz("bA", "uA", "Smile Clinic", "Pune");
  biz("bB", "uB", "SECRET_B_CLINIC", "Delhi");
  s.prepare("INSERT INTO google_connections VALUES (?,?,?,?)").run("uA", "CIPHERTEXT_A_REFRESH", "business.manage", 5);
  s.prepare("INSERT INTO google_connections VALUES (?,?,?,?)").run("uB", "CIPHERTEXT_B_REFRESH", "business.manage", 5);
  s.prepare("INSERT INTO keywords (id,business_id,keyword,location_name,created_at,updated_at) VALUES (?,?,?,?,?,?)").run("kA", "bA", "dentist pune", "Pune", 1, 1);
  s.prepare("INSERT INTO keywords (id,business_id,keyword,location_name,created_at,updated_at) VALUES (?,?,?,?,?,?)").run("kB", "bB", "SECRET_B_KEYWORD", "Delhi", 1, 1);
  s.prepare("INSERT INTO rank_snapshots (id,keyword_id,checked_at,position) VALUES (?,?,?,?)").run("rA", "kA", 1, 3);
  s.prepare("INSERT INTO rank_snapshots (id,keyword_id,checked_at,position) VALUES (?,?,?,?)").run("rB", "kB", 1, 9);
  s.prepare("INSERT INTO sessions VALUES (?,?,?,?)").run("hashA", "uA", NOW + 1000, 1);
}
function mkCtx(db, userId, extra = {}) {
  const env = { DB: db, ...(extra.env || {}) };
  const url = new URL(extra.url || "https://api.localboost.in/x");
  const counts = new Map();
  return {
    env, url, userId: userId ?? null, ip: extra.ip || "1.2.3.4",
    json: (d, s = 200) => Response.json(d, { status: s }),
    now: () => NOW,
    getUserBusiness: (id) => db.prepare("SELECT * FROM businesses WHERE id=? AND user_id=? LIMIT 1").bind(id, userId).first(),
    requireFeature: async () => ({ ok: true }),
    rateLimit: async (k, limit) => { const c = (counts.get(k) || 0) + 1; counts.set(k, c); return { ok: c <= limit }; },
    ...(extra.ctx || {}),
  };
}
const R = (method, path) => routes.find((r) => r.method === method && r.path === path);
const post = (body, headers = {}) => new Request("https://api.localboost.in/x", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
async function call(method, path, ctx, req) { return R(method, path).handler(req, ctx); }

// ---------- business update ----------
test("update validates each field", async () => {
  const db = makeDB(); seed(db);
  const cases = {
    name: ["", "x".repeat(121), 5],
    category: [""],
    secondary_categories: ["x", Array(10).fill("a")],
    city: [""],
    pin_code: ["12345", "0123456", "abcdef"],
    phone: ["12345", "5876543210", "+0123"],
    website: ["ftp://a.com", "javascript:alert(1)", "notaurl", "https://nodot"],
    hours: [{ funday: [] }, { mon: [{ open: "10:00", close: "09:00" }] }, { mon: [{ open: "25:00", close: "26:00" }] }, { mon: [] }],
    description: ["x".repeat(751)],
    language: ["fr", null],
    timezone: ["Mars/Base", "../etc", 5],
    lat: [91, "12", -91],
    lng: [181, "x"],
  };
  for (const [field, bads] of Object.entries(cases)) {
    for (const bad of bads) {
      const body = { id: "bA", [field]: bad };
      if (field === "lat") body.lng = 10;
      const res = await call("POST", "/api/businesses/update", mkCtx(db, "uA"), post(body));
      assert.equal(res.status, 400, `${field}=${JSON.stringify(bad)}`);
      const j = await res.json();
      assert.equal(j.code, "validation_failed");
      assert.ok(j.fields[field], `error for ${field}`);
    }
  }
  const unk = await call("POST", "/api/businesses/update", mkCtx(db, "uA"), post({ id: "bA", user_id: "uB" }));
  assert.equal(unk.status, 400);
  assert.ok((await unk.json()).fields.user_id);
});

test("update accepts valid fields and returns merged object", async () => {
  const db = makeDB(); seed(db);
  const res = await call("POST", "/api/businesses/update", mkCtx(db, "uA"), post({
    id: "bA", name: "Smile Care", phone: "98765 43210", website: "https://smile.in", pin_code: "411001", state: "Maharashtra", country: "IN",
    address: "12 MG Road", secondary_categories: ["Orthodontist"], service_areas: ["Kothrud"], description: "d", language: "hi",
    timezone: "Asia/Kolkata", lat: 18.5, lng: 73.8, hours: { mon: { open: "09:00", close: "18:00" }, sun: { closed: true } },
  }));
  assert.equal(res.status, 200);
  const { business: b } = await res.json();
  assert.equal(b.name, "Smile Care"); assert.equal(b.phone, "+919876543210");
  assert.equal(b.pin_code, "411001"); assert.deepEqual(b.hours.mon, [{ open: "09:00", close: "18:00" }]); assert.deepEqual(b.hours.sun, { closed: true });
  assert.deepEqual(b.secondary_categories, ["Orthodontist"]); assert.equal(b.lat, 18.5); assert.equal(b.timezone, "Asia/Kolkata");
  // second update keeps earlier ext fields
  const r2 = await call("POST", "/api/businesses/update", mkCtx(db, "uA"), post({ id: "bA", description: "new" }));
  const b2 = (await r2.json()).business;
  assert.equal(b2.description, "new"); assert.equal(b2.pin_code, "411001");
  assert.equal(normalizePhone("+14155552671"), "+14155552671");
  assert.ok(validateHours({ mon: [{ open: "00:00", close: "24:00" }] }).value);
});

test("lat without lng is rejected", async () => {
  const db = makeDB(); seed(db);
  const res = await call("POST", "/api/businesses/update", mkCtx(db, "uA"), post({ id: "bA", lat: 10 }));
  assert.equal(res.status, 400);
});

test("duplicate guard: same user, name, city (case-insensitive)", async () => {
  const db = makeDB(); seed(db);
  db.sql.prepare("INSERT INTO businesses (id,user_id,name,category,city,status,created_at,updated_at) VALUES ('bA2','uA','Other','Dentist','Pune','active',1,1)").run();
  const res = await call("POST", "/api/businesses/update", mkCtx(db, "uA"), post({ id: "bA2", name: " smile CLINIC " }));
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, "duplicate_business");
  assert.ok(await findDuplicateBusiness({ DB: db }, "uA", "SMILE clinic", "pune"));
  assert.equal(await findDuplicateBusiness({ DB: db }, "uA", "Smile Clinic", "Pune", "bA"), null, "excludes itself");
  assert.equal(await findDuplicateBusiness({ DB: db }, "uB", "Smile Clinic", "Pune"), null, "other users do not collide");
  // renaming to a different city is fine
  const ok = await call("POST", "/api/businesses/update", mkCtx(db, "uA"), post({ id: "bA2", name: "Smile Clinic", city: "Mumbai" }));
  assert.equal(ok.status, 200);
});

test("archive and unarchive", async () => {
  const db = makeDB(); seed(db);
  let res = await call("POST", "/api/businesses/archive", mkCtx(db, "uA"), post({ id: "bA", archived: true }));
  assert.equal((await res.json()).business.archived, true);
  res = await call("POST", "/api/businesses/archive", mkCtx(db, "uA"), post({ id: "bA", archived: "yes" }));
  assert.equal(res.status, 400);
  res = await call("POST", "/api/businesses/archive", mkCtx(db, "uA"), post({ id: "bA", archived: false }));
  assert.equal((await res.json()).business.status, "active");
});

// ---------- export ----------
test("export excludes token ciphertext and other users' data", async () => {
  const db = makeDB(); seed(db);
  const res = await call("GET", "/api/account/export", mkCtx(db, "uA"), new Request("https://api.localboost.in/api/account/export"));
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-disposition"), /^attachment; filename="localboost-export-2026-10-30\.json"$/);
  const text = await res.text();
  assert.ok(!text.includes("CIPHERTEXT"), "no token ciphertext");
  assert.ok(!text.includes("refresh_token"));
  assert.ok(!text.includes("SECRET_B"), "no other user data");
  assert.ok(!text.includes("hashA"), "no session ids");
  const j = JSON.parse(text);
  assert.equal(j.data.google_connections[0].scope, "business.manage");
  assert.equal(j.data.businesses.length, 1);
  assert.equal(j.data.keywords.length, 1);
  assert.equal(j.data.rank_snapshots.length, 1, "child rows reached through ownership");
});

test("export is rate limited to 3/hour", async () => {
  const db = makeDB(); seed(db);
  const ctx = mkCtx(db, "uA");
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await call("GET", "/api/account/export", ctx, new Request("https://x/"))).status);
  assert.deepEqual(codes, [200, 200, 200, 429]);
});

test("export discovers tables from other modules by user_id/FK and strips secret-like columns", async () => {
  const db = makeDB(); seed(db);
  db.sql.exec("CREATE TABLE extra_things (id TEXT PRIMARY KEY, user_id TEXT, label TEXT, api_token TEXT)");
  db.sql.exec("INSERT INTO extra_things VALUES ('e1','uA','mine','TOKSECRET'),('e2','uB','SECRET_B_EXTRA','TOK')");
  db.sql.exec("CREATE TABLE scan_pts (id TEXT PRIMARY KEY, keyword_id TEXT REFERENCES keywords(id), note TEXT)");
  db.sql.exec("INSERT INTO scan_pts VALUES ('p1','kA','mine'),('p2','kB','SECRET_B_PT')");
  const text = await (await call("GET", "/api/account/export", mkCtx(db, "uA"), new Request("https://x/"))).text();
  assert.ok(text.includes("mine") && !text.includes("TOKSECRET") && !text.includes("SECRET_B"));
  assert.equal(JSON.parse(text).data.scan_pts.length, 1);
});

// ---------- data isolation ----------
test("every session route never returns another user's data", async () => {
  const db = makeDB(); seed(db);
  const sessionRoutes = routes.filter((r) => r.auth === "session");
  assert.ok(sessionRoutes.length >= 4);
  const before = db.sql.prepare("SELECT * FROM businesses WHERE id='bB'").get();
  for (const r of sessionRoutes) {
    const ctx = mkCtx(db, "uA", { url: "https://api.localboost.in" + r.path + "?id=bB" });
    const req = r.method === "GET" ? new Request(ctx.url) : post({ id: "bB", name: "HACKED", archived: true });
    const res = await r.handler(req, ctx);
    const text = await res.text();
    assert.ok(!text.includes("SECRET_B") && !text.includes("CIPHERTEXT_B"), `${r.path} leaked`);
    if (r.path !== "/api/account/export") assert.equal(res.status, 404, r.path);
  }
  assert.deepEqual(db.sql.prepare("SELECT * FROM businesses WHERE id='bB'").get(), before, "other user's row unchanged");
});

// ---------- events ----------
const evReq = (body, headers = {}) => post(body, { "x-lb-consent": "granted", "user-agent": "UA", ...headers });
const evCount = (db) => db.sql.prepare("SELECT COUNT(*) c FROM analytics_events").get().c;

test("events without consent store nothing and return 204", async () => {
  const db = makeDB();
  for (const h of [{}, { "x-lb-consent": "denied" }, { "x-lb-consent": "Granted" }]) {
    const res = await call("POST", "/api/events", mkCtx(db, null), post({ event: "page_view" }, h));
    assert.equal(res.status, 204);
  }
  assert.equal(evCount(db), 0);
});

test("events: whitelist, prop filtering, no IP stored, daily-rotating hash", async () => {
  const db = makeDB();
  const env = { GOOGLE_TOKEN_ENCRYPTION_KEY: "k".repeat(40) };
  assert.equal((await call("POST", "/api/events", mkCtx(db, null, { env }), evReq({ event: "hack" }))).status, 400);
  assert.equal((await call("POST", "/api/events", mkCtx(db, null, { env }), evReq({ event: "page_view", props: { path: "/tools/audit?email=a@b.in#x", email: "a@b.in", tool: "Bad Tool!", lang: "hi", plan: "pro" } }))).status, 204);
  const row = db.sql.prepare("SELECT * FROM analytics_events").get();
  assert.equal(row.path, "/tools/audit"); assert.equal(row.tool, null); assert.equal(row.lang, "hi"); assert.equal(row.plan, "pro");
  const dump = JSON.stringify(row);
  assert.ok(!dump.includes("1.2.3.4") && !dump.includes("a@b.in"));
  assert.match(row.visitor_hash, /^[0-9a-f]{64}$/);
  assert.equal(sanitizeEvent({ event: "tool_used", props: { tool: "gbp-audit", path: "http://evil" } }).path, null);
  // all whitelisted events accepted
  for (const e of ["tool_used", "audit_started", "audit_completed", "signup_started", "google_connect_clicked", "waitlist_submitted", "pricing_viewed", "checkout_started", "checkout_completed"]) {
    assert.equal((await call("POST", "/api/events", mkCtx(db, null, { env, ip: "9.9.9.9" }), evReq({ event: e }))).status, 204);
  }
});

test("events rate limit 120/hour/IP", async () => {
  const db = makeDB();
  const ctx = mkCtx(db, null);
  let last;
  for (let i = 0; i < 121; i++) last = await call("POST", "/api/events", ctx, evReq({ event: "page_view" }));
  assert.equal(last.status, 429);
  assert.equal(evCount(db), 120);
});

// ---------- admin ----------
const adminReq = (token) => new Request("https://api.localboost.in/api/admin/metrics", { headers: token ? { authorization: "Bearer " + token } : {} });
test("admin auth: 404 when unset; 401 missing/wrong; 200 right", async () => {
  const db = makeDB(); seed(db);
  assert.equal((await call("GET", "/api/admin/metrics", mkCtx(db, null), adminReq("anything"))).status, 404);
  assert.equal((await call("GET", "/api/admin/waitlist.csv", mkCtx(db, null), adminReq("anything"))).status, 404);
  const env = { ADMIN_TOKEN: "s3cret-admin-token" };
  assert.equal((await call("GET", "/api/admin/metrics", mkCtx(db, null, { env }), adminReq(null))).status, 401);
  assert.equal((await call("GET", "/api/admin/metrics", mkCtx(db, null, { env }), adminReq("s3cret-admin-tokeX"))).status, 401);
  assert.equal((await call("GET", "/api/admin/metrics", mkCtx(db, null, { env }), adminReq("short"))).status, 401);
  assert.equal((await call("GET", "/api/admin/waitlist.csv", mkCtx(db, null, { env }), adminReq("bad"))).status, 401);
  const ok = await call("GET", "/api/admin/metrics", mkCtx(db, null, { env }), adminReq("s3cret-admin-token"));
  assert.equal(ok.status, 200);
});

test("admin metrics report only real rows", async () => {
  const db = makeDB(); seed(db);
  const env = { ADMIN_TOKEN: "t".repeat(20), GOOGLE_TOKEN_ENCRYPTION_KEY: "k".repeat(40) };
  for (const [e, ip] of [["signup_started", "1.1.1.1"], ["signup_started", "2.2.2.2"], ["audit_completed", "1.1.1.1"]]) {
    await call("POST", "/api/events", mkCtx(db, null, { env, ip }), evReq({ event: e }));
  }
  await call("POST", "/api/events", mkCtx(db, null, { env, ip: "1.1.1.1" }), evReq({ event: "tool_used", props: { tool: "gbp-audit" } }));
  db.sql.prepare("INSERT INTO subscriptions (id,user_id,plan_code,status,created_at,updated_at) VALUES ('s1','uA','pro','active',1,1)").run();
  db.sql.prepare("INSERT INTO usage_events (id,user_id,event_type,provider,units,estimated_cost_minor,created_at) VALUES ('ue1','uA','rank_scan','p',25,500,?)").run(NOW - 1000);
  db.sql.prepare("INSERT INTO waitlist (id,contact_key,email,created_at,updated_at) VALUES ('w1','a@b.in','a@b.in',1,1)").run();
  const m = await (await call("GET", "/api/admin/metrics", mkCtx(db, null, { env }), adminReq(env.ADMIN_TOKEN))).json();
  assert.equal(m.registered_users, 2); assert.equal(m.paid_subscriptions, 1); assert.equal(m.waitlist, 1);
  assert.equal(m.analytics.funnel[0].events, 2); assert.equal(m.analytics.funnel[0].visitor_days, 2);
  assert.equal(m.analytics.funnel[1].events, 1); assert.equal(m.analytics.funnel[2].events, 0);
  assert.deepEqual(m.analytics.tool_usage, [{ tool: "gbp-audit", events: 1 }]);
  assert.equal(m.analytics.by_day[0].visitors, 2);
  assert.equal(m.api_usage.total_units, 25); assert.equal(m.api_usage.estimated_cost_minor, 500);
});

test("waitlist CSV is injection-safe and omits ip_hash", async () => {
  const db = makeDB();
  db.sql.prepare("INSERT INTO waitlist (id,contact_key,email,phone,name,business_name,ip_hash,created_at,updated_at) VALUES ('w1','k1','=cmd|x@e.in','+919876543210','@SUM(1)','He said \"hi\", ok','IPHASH',1000,1000)").run();
  db.sql.prepare("INSERT INTO waitlist (id,contact_key,email,name,created_at,updated_at) VALUES ('w2','k2','b@e.in','-1+2',2000,2000)").run();
  const env = { ADMIN_TOKEN: "t".repeat(20) };
  const res = await call("GET", "/api/admin/waitlist.csv", mkCtx(db, null, { env }), adminReq(env.ADMIN_TOKEN));
  assert.match(res.headers.get("content-type"), /text\/csv/);
  const csv = await res.text();
  assert.ok(csv.includes("\"'=cmd|x@e.in\""));
  assert.ok(csv.includes("\"'@SUM(1)\""));
  assert.ok(csv.includes("\"'-1+2\""));
  assert.ok(csv.includes("\"'+919876543210\""));
  assert.ok(csv.includes('"He said ""hi"", ok"'));
  assert.ok(!csv.includes("IPHASH") && !/ip_hash/.test(csv));
  assert.equal(csvCell("\tx"), "\"'\tx\"");
  assert.equal(csvCell(null), '""');
});

// ---------- jobs ----------
test("retention job removes expired technical rows only", async () => {
  const db = makeDB(); seed(db);
  const s = db.sql;
  s.prepare("INSERT INTO sessions VALUES ('old','uA',?,1)").run(NOW - 1);
  s.prepare("INSERT INTO oauth_states VALUES ('stOld',?)").run(NOW - 2 * 3600000);
  s.prepare("INSERT INTO oauth_states VALUES ('stNew',?)").run(NOW - 1000);
  s.prepare("INSERT INTO rate_limits VALUES ('a:1',?,1)").run(NOW - 2 * 86400000);
  s.prepare("INSERT INTO rate_limits VALUES ('b:1',?,1)").run(NOW - 1000);
  const res = await retentionCleanup({ DB: db }, NOW);
  assert.deepEqual(res, { sessions: 1, oauth_states: 1, rate_limits: 1 });
  assert.deepEqual(s.prepare("SELECT id_hash FROM sessions").all().map((r) => r.id_hash), ["hashA"]);
  assert.equal(s.prepare("SELECT COUNT(*) c FROM oauth_states").get().c, 1);
  assert.equal(s.prepare("SELECT COUNT(*) c FROM rate_limits").get().c, 1);
  assert.equal(s.prepare("SELECT COUNT(*) c FROM businesses").get().c, 2, "customer data untouched");
});

test("analytics rollup keeps aggregates and deletes raw events older than 90 days", async () => {
  const db = makeDB(); const s = db.sql;
  const ins = s.prepare("INSERT INTO analytics_events (day,event,tool,visitor_hash,created_at) VALUES (?,?,?,?,1)");
  ins.run("2026-06-01", "tool_used", "gbp-audit", "v1"); ins.run("2026-06-01", "tool_used", "gbp-audit", "v1"); ins.run("2026-06-01", "page_view", null, "v2");
  ins.run("2026-10-29", "page_view", null, "v3");
  await rollupAnalytics({ DB: db }, NOW);
  await rollupAnalytics({ DB: db }, NOW); // idempotent
  assert.equal(s.prepare("SELECT COUNT(*) c FROM analytics_events").get().c, 1);
  const r = s.prepare("SELECT events,visitors FROM analytics_daily WHERE day='2026-06-01' AND event='tool_used'").get();
  assert.deepEqual({ ...r }, { events: 2, visitors: 1 });
  assert.equal(s.prepare("SELECT visitors v FROM analytics_daily WHERE day='2026-06-01' AND event='*'").get().v, 2);
  // metrics still show the old day through the rollup
  const env = { ADMIN_TOKEN: "t".repeat(20) };
  const url = "https://api.localboost.in/api/admin/metrics?days=365";
  const m = await (await call("GET", "/api/admin/metrics", mkCtx(db, null, { env, url }), adminReq(env.ADMIN_TOKEN))).json();
  const old = m.analytics.by_day.find((d) => d.day === "2026-06-01");
  assert.deepEqual({ events: old.events, visitors: old.visitors }, { events: 3, visitors: 2 });
  assert.deepEqual(jobs.map((j) => j.name), ["platform-retention", "platform-analytics-rollup"]);
});

test("migration is safe to re-run", () => {
  const db = makeDB();
  db.sql.exec(readFileSync(fileURLToPath(new URL("../migrations/050_platform.sql", import.meta.url)), "utf8"));
});
