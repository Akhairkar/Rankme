import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { routes, jobs, csvCell, snapshotToCsv, validateBrand, schedulePeriod, runScheduledReports, stripSensitive } from "../src/reports.js";
import { getUserBusiness } from "../src/db.js";
import { sha256Hex } from "../src/oauth.js";

function makeDB() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys = ON");
  for (const f of ["000_base.sql", "001_rate_limits.sql", "010_google.sql", "020_billing.sql", "030_audit.sql", "040_rank.sql", "050_platform.sql", "070_workspace.sql", "080_notifications.sql", "085_actions_reports.sql"]) {
    sql.exec(readFileSync(fileURLToPath(new URL("../migrations/" + f, import.meta.url)), "utf8"));
  }
  const norm = (a) => a.map((x) => (x === undefined ? null : x));
  return {
    sql,
    async batch(stmts) { for (const s of stmts) await s.run(); },
    prepare(q) {
      const nb = { first: () => nb.bind().first(), all: () => nb.bind().all(), run: () => nb.bind().run() };
      return Object.assign(nb, {
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
const DAY = 86400000;
let NOW = Date.UTC(2026, 9, 30, 12);
function seed(db) {
  const s = db.sql;
  for (const id of ["uA", "uB"]) s.prepare("INSERT INTO users VALUES (?,?,?,?,?,?,?)").run(id, "g_" + id, id + "@x.in", "N", null, 1, 1);
  for (const [id, u, name] of [["bA", "uA", "Smile Clinic"], ["bB", "uB", "SECRET_B_CLINIC"]]) s.prepare("INSERT INTO businesses (id,user_id,name,category,city,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").run(id, u, name, "Dentist", "Pune", "active", 1, 1);
}
function seedData(db) {
  const s = db.sql, t = NOW - 2 * DAY;
  s.prepare("INSERT INTO audits (id,business_id,audit_type,status,score,created_at,score_breakdown_json,checks_json) VALUES ('au0','bA','unified','completed',60,?,?,?)").run(NOW - 20 * DAY, "[]", "[]");
  s.prepare("INSERT INTO audits (id,business_id,audit_type,status,score,created_at,score_breakdown_json,checks_json) VALUES ('au1','bA','unified','completed',72,?,?,?)").run(t, JSON.stringify([{ section: "website_technical", label: "Website", points: 5, max: 10, available: true }, { section: "profile_completeness", label: "Profile", points: 8, max: 10, available: true }]), "[]");
  s.prepare("INSERT INTO audit_issues (id,audit_id,code,category,severity,title,status,created_at,finding_key,evidence) VALUES ('i1','au1','site_noindex','website_technical','high','Noindex','open',?,?,?)").run(t, "site_noindex|x", "contact owner@secret.com about it");
  s.prepare("INSERT INTO audit_issues (id,audit_id,code,category,severity,title,status,created_at,finding_key,evidence) VALUES ('i2','au1','profile_hours','profile_completeness','high','Hours','open',?,?,?)").run(t, "profile_hours|g", "missing");
  s.prepare("INSERT INTO keywords (id,business_id,keyword,location_name,created_at,updated_at) VALUES ('k1','bA','=cmd|calc','Pune',1,1)").run();
  for (const [id, at, avg] of [["rs1", NOW - 6 * DAY, 8], ["rs2", NOW - 1 * DAY, 5]]) s.prepare("INSERT INTO rank_scans (id,user_id,business_id,keyword_id,grid_size,radius_m,center_lat,center_lng,state,avg_position,visibility,scan_date,created_at) VALUES (?,?,?,?,3,1000,1,1,'completed',?,0.4,'2026-10-01',?)").run(id, "uA", "bA", "k1", avg, at);
  s.prepare("INSERT INTO rank_scan_points (id,scan_id,grid_row,grid_col,lat,lng,position,competitors_json,observed_at) VALUES ('p1','rs2',0,0,1,1,3,?,1)").run(JSON.stringify([{ name: "Rival Dental", position: 1 }]));
  s.prepare("INSERT INTO business_locations (id,business_id,name,created_at,updated_at) VALUES ('l1','bA','L',1,1)").run();
  s.prepare("INSERT INTO reviews (id,business_location_id,google_review_name,reviewer_display_name,rating,review_text,review_time,reply_status,synced_at) VALUES ('r1','l1','g1','SECRET_REVIEWER',5,'SECRET_TEXT',?,'answered',?)").run(NOW - 3 * DAY, NOW - DAY);
  s.prepare("INSERT INTO reviews (id,business_location_id,google_review_name,rating,review_time,reply_status,synced_at) VALUES ('r2','l1','g2',3,?,'unanswered',?)").run(NOW - 40 * DAY, NOW - DAY);
  s.prepare("INSERT INTO search_console_properties (id,user_id,business_id,property_url,property_type,created_at,updated_at) VALUES ('sp','uA','bA','https://s.in','url',1,1)").run();
  const day = (n) => new Date(NOW - n * DAY).toISOString().slice(0, 10);
  s.prepare("INSERT INTO search_console_metrics (id,user_id,business_id,property_id,date,clicks,impressions,position,created_at) VALUES ('m1','uA','bA','sp',?,10,100,4,?)").run(day(3), NOW);
  s.prepare("INSERT INTO search_console_metrics (id,user_id,business_id,property_id,date,clicks,impressions,position,created_at) VALUES ('m2','uA','bA','sp',?,20,300,8,?)").run(day(2), NOW);
  s.prepare("INSERT INTO search_console_metrics (id,user_id,business_id,property_id,date,clicks,impressions,position,query_text,created_at) VALUES ('m3','uA','bA','sp',?,7,50,3,'dentist pune',?)").run(day(0), NOW);
  s.prepare("INSERT INTO performance_metrics (id,user_id,business_id,checked_at,impressions,website_clicks,call_clicks,direction_requests) VALUES ('pm1','uA','bA',?,1000,50,NULL,5)").run(NOW - 2 * DAY);
  s.prepare("INSERT INTO performance_metrics (id,user_id,business_id,checked_at,impressions,website_clicks,call_clicks,direction_requests) VALUES ('pm2','uA','bA',?,500,25,NULL,NULL)").run(NOW - DAY);
  s.prepare("INSERT INTO competitors (id,business_id,name,website_url,created_at,updated_at) VALUES ('c1','bA','Tracked Rival','https://rival.in',1,1)").run();
  s.prepare("INSERT INTO action_tasks (id,business_id,source_type,title,priority,status,due_date,completed_at,created_at,updated_at) VALUES ('t1','bA','manual','a','high','done',NULL,?,1,?)").run(NOW - DAY, NOW - DAY);
  s.prepare("INSERT INTO action_tasks (id,business_id,source_type,title,priority,status,due_date,created_at,updated_at) VALUES ('t2','bA','manual','b','low','open','2026-01-01',1,1)").run();
}
function mkCtx(db, userId, o = {}) {
  const counts = new Map();
  return {
    env: { DB: db }, url: new URL(o.url || "https://x/x"), userId, ip: o.ip || "9.9.9.9", json: (d, s = 200) => Response.json(d, { status: s }), now: () => NOW,
    getUserBusiness: (id) => getUserBusiness({ DB: db }, userId, id),
    requireFeature: async () => o.feature ?? { ok: true },
    rateLimit: async (k, limit) => { if (o.rlUnavailable) return { ok: false, unavailable: true }; const c = (counts.get(k) || 0) + 1; counts.set(k, c); return { ok: c <= limit }; },
  };
}
const R = (m, p) => routes.find((r) => r.method === m && r.path === p);
const post = (body) => new Request("https://x/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
async function callPost(p, ctx, body) { const res = await R("POST", p).handler(post(body), ctx); return { status: res.status, body: await res.json() }; }
async function callGet(p, db, user, q, o = {}) { const res = await R("GET", p).handler(new Request("https://x/x"), mkCtx(db, user, { url: "https://x/x?" + q, ...o })); return res; }

test("generate: sections come from stored rows with source, timestamp and freshness", async () => {
  const db = makeDB(); seed(db); seedData(db);
  const r = await callPost("/api/reports/generate", mkCtx(db, "uA"), { business_id: "bA", kind: "weekly" });
  assert.equal(r.status, 201);
  const d = r.body.snapshot.data;
  assert.deepEqual(d.sections.map((s) => s.id), ["performance", "rank", "reviews", "search_console", "website_audit", "actions"]);
  for (const s of d.sections) { assert.ok(s.source); assert.equal(s.generated_at, NOW); assert.equal(s.available, true, s.id); assert.ok(s.freshness.latest_data_at); }
  const by = Object.fromEntries(d.sections.map((s) => [s.id, s.data]));
  assert.deepEqual([by.performance.impressions, by.performance.website_clicks, by.performance.call_clicks, by.performance.direction_requests], [1500, 75, null, 5], "all-null metric stays null, not 0");
  assert.equal(by.rank.keywords[0].change, -3); assert.equal(by.rank.keywords[0].scans, 2); assert.equal(by.rank.keywords[0].latest_avg_position, 5);
  assert.equal(by.reviews.total_synced, 2); assert.equal(by.reviews.new_in_period, 1); assert.equal(by.reviews.average_rating, 4); assert.equal(by.reviews.unanswered, 1);
  assert.deepEqual([by.search_console.clicks, by.search_console.impressions], [30, 400]); assert.equal(by.search_console.average_position, 7);
  assert.equal(by.search_console.top_queries_last_sync_window[0].query, "dentist pune");
  assert.equal(by.website_audit.score, 72); assert.equal(by.website_audit.score_change, 12); assert.equal(by.website_audit.open_findings, 1, "profile findings excluded from website section");
  assert.deepEqual([by.actions.total, by.actions.done, by.actions.percent_done, by.actions.overdue, by.actions.completed_in_period], [2, 1, 50, 1, 1]);
  const p = await callPost("/api/reports/generate", mkCtx(db, "uA"), { business_id: "bA", kind: "profile_audit" });
  assert.equal(p.body.snapshot.data.sections[0].data.open_findings, 1);
  const c = await callPost("/api/reports/generate", mkCtx(db, "uA"), { business_id: "bA", kind: "competitors" });
  const cd = c.body.snapshot.data.sections[0].data;
  assert.equal(cd.tracked[0].name, "Tracked Rival"); assert.equal(cd.seen_in_latest_scan[0].name, "Rival Dental");
});

test("missing data is unavailable with a reason, never zero", async () => {
  const db = makeDB(); seed(db);
  for (const kind of ["weekly", "monthly", "rank", "website_audit", "profile_audit", "reviews", "competitors", "search_console", "actions"]) {
    const r = await callPost("/api/reports/generate", mkCtx(db, "uA"), { business_id: "bA", kind });
    assert.equal(r.status, 201, kind);
    for (const s of r.body.snapshot.data.sections) {
      assert.equal(s.available, false, kind + "/" + s.id);
      assert.ok(s.reason && s.reason.length > 10);
      assert.ok(!("data" in s), "no data object on unavailable sections");
      assert.equal(s.freshness, null);
    }
  }
  // linked location but no reviews, and a scan older than the period
  db.sql.prepare("INSERT INTO business_locations (id,business_id,name,created_at,updated_at) VALUES ('l1','bA','L',1,1)").run();
  const r = await callPost("/api/reports/generate", mkCtx(db, "uA"), { business_id: "bA", kind: "reviews" });
  assert.match(r.body.snapshot.data.sections[0].reason, /No reviews have been synced/);
});

test("generate validates input, gates on plan, rate limits and fails closed", async () => {
  const db = makeDB(); seed(db);
  const g = (body, o) => callPost("/api/reports/generate", mkCtx(db, "uA", o), body);
  assert.equal((await g({ business_id: "bA", kind: "nope" })).status, 400);
  assert.equal((await g({ business_id: "bA", kind: "rank", period_start: "2026-10-10", period_end: "2026-10-01" })).status, 400);
  assert.equal((await g({ business_id: "bA", kind: "rank", period_start: "bad" })).status, 400);
  assert.equal((await g({ business_id: "bA", kind: "rank", period_start: "2024-01-01", period_end: "2026-01-01" })).status, 400);
  assert.equal((await g({ business_id: "bA", kind: "rank", period_end: NOW + 5 * DAY })).status, 400);
  assert.equal((await g({ business_id: "bA", kind: "rank", period_start: "2026-10-01", period_end: "2026-10-20" })).status, 201);
  const gated = await g({ business_id: "bA", kind: "rank" }, { feature: { ok: false } });
  assert.equal(gated.status, 403); assert.equal(gated.body.code, "upgrade_required");
  assert.equal((await g({ business_id: "bA", kind: "rank" }, { rlUnavailable: true })).status, 503);
  assert.equal((await g({ business_id: "bB", kind: "rank" })).status, 404, "other tenant's business");
  assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM report_snapshots WHERE business_id='bB'").get().n, 0);
});

test("tenant isolation on list, snapshot, csv, share, revoke, shares, schedule", async () => {
  const db = makeDB(); seed(db); seedData(db);
  const snap = (await callPost("/api/reports/generate", mkCtx(db, "uA"), { business_id: "bA", kind: "weekly" })).body.snapshot;
  const share = (await callPost("/api/reports/share", mkCtx(db, "uA"), { snapshot_id: snap.id })).body;
  assert.equal((await callGet("/api/reports/list", db, "uA", "business_id=bA")).status, 200);
  assert.equal((await callGet("/api/reports/list", db, "uB", "business_id=bA")).status, 404);
  assert.equal((await callGet("/api/reports/list", db, "uB", "")).status, 400);
  for (const [p, q] of [["/api/reports/snapshot", "id=" + snap.id], ["/api/reports/export.csv", "id=" + snap.id], ["/api/reports/shares", "snapshot_id=" + snap.id]]) {
    assert.equal((await callGet(p, db, "uA", q)).status, 200, p);
    assert.equal((await callGet(p, db, "uB", q)).status, 404, p);
    assert.equal((await callGet(p, db, "uA", "id=missing&snapshot_id=missing")).status, 404);
  }
  assert.equal((await callPost("/api/reports/share", mkCtx(db, "uB"), { snapshot_id: snap.id })).status, 404);
  assert.equal((await callPost("/api/reports/share/revoke", mkCtx(db, "uB"), { share_id: share.share_id })).status, 404);
  assert.equal(db.sql.prepare("SELECT revoked_at FROM report_shares").get().revoked_at, null);
  assert.equal((await callPost("/api/reports/schedule", mkCtx(db, "uB"), { business_id: "bA", kind: "weekly", active: true })).status, 404);
  assert.equal((await callGet("/api/reports/schedules", db, "uB", "business_id=bA")).status, 404);
  const list = await (await callGet("/api/reports/list", db, "uB", "business_id=bB")).json();
  assert.deepEqual(list.snapshots, []);
  assert.ok(routes.filter((r) => r.auth === "public").length === 1 && R("GET", "/api/reports/shared").auth === "public");
});

test("share link: token shown once, only its hash is stored", async () => {
  const db = makeDB(); seed(db); seedData(db);
  const snap = (await callPost("/api/reports/generate", mkCtx(db, "uA"), { business_id: "bA", kind: "weekly" })).body.snapshot;
  const r = await callPost("/api/reports/share", mkCtx(db, "uA"), { snapshot_id: snap.id, expires_in_days: 7 });
  assert.equal(r.status, 201);
  assert.match(r.body.url, /^https:\/\/www\.localboost\.in\/report\.html\?token=[A-Za-z0-9_-]{43}$/);
  const token = new URL(r.body.url).searchParams.get("token");
  assert.equal(r.body.expires_at, NOW + 7 * DAY);
  const row = db.sql.prepare("SELECT * FROM report_shares").get();
  assert.equal(row.token_hash, await sha256Hex(token));
  assert.ok(!JSON.stringify(db.sql.prepare("SELECT * FROM report_shares").all()).includes(token), "raw token never stored");
  const listed = await (await callGet("/api/reports/shares", db, "uA", "snapshot_id=" + snap.id)).json();
  assert.ok(!JSON.stringify(listed).includes(token)); assert.equal(listed.shares[0].status, "active");
  for (const days of [0, 91, 1.5, "7", -1]) assert.equal((await callPost("/api/reports/share", mkCtx(db, "uA"), { snapshot_id: snap.id, expires_in_days: days })).status, 400, String(days));
  const def = await callPost("/api/reports/share", mkCtx(db, "uA"), { snapshot_id: snap.id });
  assert.equal(def.body.expires_at, NOW + 30 * DAY);
  const t2 = new URL(def.body.url).searchParams.get("token");
  assert.notEqual(t2, token);
});

test("public view: read-only, counts views, no ids or emails, identical 404s for unknown/expired/revoked/malformed", async () => {
  const db = makeDB(); seed(db); seedData(db);
  const snap = (await callPost("/api/reports/generate", mkCtx(db, "uA"), { business_id: "bA", kind: "weekly" })).body.snapshot;
  const mk = async (days) => { const r = await callPost("/api/reports/share", mkCtx(db, "uA"), { snapshot_id: snap.id, expires_in_days: days }); return { token: new URL(r.body.url).searchParams.get("token"), id: r.body.share_id }; };
  const ok = await mk(5), toExpire = await mk(1), toRevoke = await mk(5);
  const view = (token, o = {}) => R("GET", "/api/reports/shared").handler(new Request("https://x/x"), mkCtx(db, null, { url: "https://x/x?token=" + token, ...o }));
  let res = await view(ok.token);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store"); assert.match(res.headers.get("x-robots-tag"), /noindex/);
  const text = JSON.stringify(await res.json());
  const j = JSON.parse(text);
  assert.equal(j.report.business.name, "Smile Clinic"); assert.equal(j.report.sections.length, 6); assert.equal(j.brand, null);
  for (const forbidden of ["owner@secret.com", "uA", "bA", "au1", "SECRET_REVIEWER", "SECRET_TEXT", "business_id", "snapshot", "token"]) assert.ok(!text.includes(forbidden), "leaks " + forbidden);
  assert.ok(text.includes("[email removed]"));
  assert.deepEqual([db.sql.prepare("SELECT view_count FROM report_shares WHERE id=?").get(ok.id).view_count], [1]);
  await view(ok.token);
  assert.equal(db.sql.prepare("SELECT view_count,last_viewed_at FROM report_shares WHERE id=?").get(ok.id).view_count, 2);
  await callPost("/api/reports/share/revoke", mkCtx(db, "uA"), { share_id: toRevoke.id });
  const missBodies = [];
  for (const t of ["A".repeat(43), "short", "", toRevoke.token]) {
    res = await view(t); assert.equal(res.status, 404, t); missBodies.push(await res.text());
  }
  NOW += 2 * DAY; // toExpire (1 day) is now expired; ok (5 days) is not
  res = await view(toExpire.token); assert.equal(res.status, 404); missBodies.push(await res.text());
  assert.equal((await view(ok.token)).status, 200);
  assert.ok(missBodies.every((b) => b === missBodies[0]), "all misses are byte-identical");
  assert.equal(db.sql.prepare("SELECT view_count FROM report_shares WHERE id=?").get(toRevoke.id).view_count, 0, "revoked views are not counted");
  const shares = await (await callGet("/api/reports/shares", db, "uA", "snapshot_id=" + snap.id)).json();
  assert.deepEqual(shares.shares.map((s) => s.status).sort(), ["active", "expired", "revoked"]);
  // revoke is idempotent
  assert.equal((await callPost("/api/reports/share/revoke", mkCtx(db, "uA"), { share_id: toRevoke.id })).status, 200);
  NOW -= 2 * DAY;
});

test("public view is rate limited per IP and fails closed", async () => {
  const db = makeDB(); seed(db);
  const h = R("GET", "/api/reports/shared").handler;
  const ctx = mkCtx(db, null, { url: "https://x/x?token=" + "A".repeat(43) });
  let last;
  for (let i = 0; i < 31; i++) last = await h(new Request("https://x/x"), ctx);
  assert.equal(last.status, 429);
  const down = await h(new Request("https://x/x"), mkCtx(db, null, { url: "https://x/x?token=" + "A".repeat(43), rlUnavailable: true }));
  assert.equal(down.status, 503);
});

test("white-label brand: agency only, validated, shown on share view, facts unchanged", async () => {
  const db = makeDB(); seed(db); seedData(db);
  const snap = (await callPost("/api/reports/generate", mkCtx(db, "uA"), { business_id: "bA", kind: "weekly" })).body.snapshot;
  const brand = { name: "Acme SEO", logo_url: "https://acme.in/logo.png", accent_color: "#1A73E8" };
  let r = await callPost("/api/reports/share", mkCtx(db, "uA"), { snapshot_id: snap.id, brand });
  assert.equal(r.status, 403); assert.equal(r.body.required, "agency");
  db.sql.prepare("INSERT INTO subscriptions (id,user_id,plan_code,status,created_at,updated_at) VALUES ('s','uA','agency','active',1,1)").run();
  for (const bad of [{ name: "" }, { name: "x".repeat(61) }, { name: "A", logo_url: "http://a.in/l.png" }, { name: "A", logo_url: "javascript:alert(1)" }, { name: "A", logo_url: "https://u:p@a.in/l.png" }, { name: "A", accent_color: "red" }, { name: "A", accent_color: "#12345" }, "str"]) {
    assert.equal((await callPost("/api/reports/share", mkCtx(db, "uA"), { snapshot_id: snap.id, brand: bad })).status, 400, JSON.stringify(bad));
  }
  r = await callPost("/api/reports/share", mkCtx(db, "uA"), { snapshot_id: snap.id, brand });
  assert.equal(r.status, 201);
  const plain = await callPost("/api/reports/share", mkCtx(db, "uA"), { snapshot_id: snap.id });
  const view = async (u) => (await R("GET", "/api/reports/shared").handler(new Request("https://x/x"), mkCtx(db, null, { url: "https://x/x?token=" + new URL(u).searchParams.get("token") }))).json();
  const branded = await view(r.body.url), unbranded = await view(plain.body.url);
  assert.deepEqual(branded.brand, { name: "Acme SEO", logo_url: "https://acme.in/logo.png", accent_color: "#1a73e8" });
  assert.equal(unbranded.brand, null);
  assert.deepEqual(branded.report, unbranded.report, "brand never alters factual data");
  assert.deepEqual(validateBrand(undefined), { value: null });
});

test("CSV export is injection-safe and marks unavailable sections", async () => {
  assert.equal(csvCell("=1+1"), "'=1+1"); assert.equal(csvCell("+cmd"), "'+cmd"); assert.equal(csvCell("-1"), "'-1"); assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(csvCell("\tx"), "'\tx"); assert.equal(csvCell('a,"b"'), '"a,""b"""'); assert.equal(csvCell(null), ""); assert.equal(csvCell(5), "5");
  const db = makeDB(); seed(db); seedData(db);
  db.sql.prepare("UPDATE businesses SET name='=HYPERLINK(\"http://evil\")' WHERE id='bA'").run();
  const snap = (await callPost("/api/reports/generate", mkCtx(db, "uA"), { business_id: "bA", kind: "weekly" })).body.snapshot;
  const res = await callGet("/api/reports/export.csv", db, "uA", "id=" + snap.id);
  assert.equal(res.status, 200); assert.match(res.headers.get("content-type"), /text\/csv/); assert.match(res.headers.get("content-disposition"), /attachment/);
  const csv = await res.text();
  assert.ok(csv.startsWith("Section,Metric,Value,Available,Reason,Source,Data as of\r\n"));
  assert.ok(csv.includes(`"'=HYPERLINK(""http://evil"")"`), csv.split("\r\n")[2]);
  assert.ok(csv.includes("'=cmd|calc"));
  for (const line of csv.split("\r\n").slice(1)) for (const cell of line.split(",")) assert.ok(!/^[=+@]/.test(cell.replace(/^"/, "")), "unsafe cell: " + cell);
  const empty = snapshotToCsv({ kind: "rank", business: { name: "B" }, period: { start: 0, end: DAY }, sections: [{ id: "rank", available: false, reason: "No completed rank scans were recorded in this period.", source: "s", freshness: null }] });
  assert.match(empty, /rank,,,no,No completed rank scans/);
});

test("scheduled reports: opt-in, plan-gated, idempotent per period", async () => {
  const db = makeDB(); seed(db); seedData(db);
  const sched = (kind, active, o) => callPost("/api/reports/schedule", mkCtx(db, "uA", o), { business_id: "bA", kind, active });
  assert.equal((await sched("weekly", true, { feature: { ok: false } })).status, 403);
  assert.equal((await sched("daily", true)).status, 400);
  assert.equal((await callPost("/api/reports/schedule", mkCtx(db, "uA"), { business_id: "bA", kind: "weekly" })).status, 400);
  assert.equal((await sched("weekly", true)).status, 200); await sched("weekly", true);
  assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM report_schedules").get().n, 1);
  assert.deepEqual((await (await callGet("/api/reports/schedules", db, "uA", "business_id=bA")).json()).schedules, [{ kind: "weekly", active: true }]);
  // free plan owner: skipped
  let st = await runScheduledReports({ DB: db }, NOW);
  assert.deepEqual([st.created, st.skipped], [0, 1]);
  db.sql.prepare("INSERT INTO subscriptions (id,user_id,plan_code,status,created_at,updated_at) VALUES ('s','uA','pro','active',1,1)").run();
  st = await runScheduledReports({ DB: db }, NOW);
  assert.equal(st.created, 1);
  const p = schedulePeriod("weekly", NOW); // 2026-10-30 is a Friday; last full week = Oct 19-26
  assert.equal(new Date(p.end).toISOString(), "2026-10-26T00:00:00.000Z"); assert.equal(p.end - p.start, 7 * DAY);
  st = await runScheduledReports({ DB: db }, NOW + 3600000);
  assert.deepEqual([st.created, st.existing], [0, 1], "second run in the same period creates nothing");
  assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM report_snapshots").get().n, 1);
  const row = db.sql.prepare("SELECT generated_by,period_start FROM report_snapshots").get();
  assert.equal(row.generated_by, "system:schedule");
  assert.equal((await (await callGet("/api/reports/list", db, "uA", "business_id=bA")).json()).snapshots[0].scheduled, true);
  st = await runScheduledReports({ DB: db }, NOW + 8 * DAY);
  assert.equal(st.created, 1, "next week creates a new snapshot");
  await sched("weekly", false);
  st = await runScheduledReports({ DB: db }, NOW + 20 * DAY);
  assert.equal(st.created, 0, "opted out");
  await sched("monthly", true);
  st = await runScheduledReports({ DB: db }, NOW + 20 * DAY);
  assert.equal(st.created, 1);
  assert.equal(new Date(schedulePeriod("monthly", NOW).start).toISOString(), "2026-09-01T00:00:00.000Z");
  assert.ok(jobs.some((j) => j.name === "reports-scheduled"));
});

test("stripSensitive removes ids, user refs and emails", () => {
  assert.deepEqual(stripSensitive({ id: 1, audit_id: 2, user_id: 3, a: { business_ids: [1], email: "x", ok: "mail me at a@b.co" } }), { a: { ok: "mail me at [email removed]" } });
});
