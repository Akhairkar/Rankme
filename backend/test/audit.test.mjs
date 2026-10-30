import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { routes, evaluateAudit, buildActionPlan, csvCell, findingsToCsv, AUDIT_MODEL, __setCrawlerForTests } from "../src/audit.js";

// Real SQLite behind a minimal D1 facade, with the real migrations applied.
function makeDB() {
  const sq = new DatabaseSync(":memory:");
  sq.exec(readFileSync(new URL("../migrations/000_base.sql", import.meta.url), "utf8"));
  sq.exec(readFileSync(new URL("../migrations/030_audit.sql", import.meta.url), "utf8"));
  return {
    sq,
    prepare(sql) {
      const st = sq.prepare(sql);
      return { bind: (...a) => ({
        async first() { return st.get(...a) ?? null; },
        async all() { return { results: st.all(...a) }; },
        async run() { st.run(...a); return {}; },
      }) };
    },
  };
}
const NOW = Date.UTC(2026, 5, 15);
function ctxFor(db, userId, path, { query = "", body } = {}) {
  const url = new URL("https://x.test" + path + query);
  return { env: { DB: db }, url, userId, ip: "1.1.1.1", now: () => NOW,
    json: (d, s = 200) => Response.json(d, { status: s }),
    getUserBusiness: async (id) => db.prepare("SELECT * FROM businesses WHERE id=? AND user_id=?").bind(id, userId).first(),
    requireFeature: async () => ({ ok: true }), rateLimit: async () => ({ ok: true }) };
}
async function call(db, userId, method, path, { query = "", body } = {}) {
  const r = routes.find((x) => x.method === method && x.path === path);
  const req = new Request("https://x.test" + path, { method, body: body ? JSON.stringify(body) : undefined });
  return r.handler(req, ctxFor(db, userId, path, { query }));
}
function seed(db) {
  for (const u of ["u1", "u2"]) db.sq.prepare("INSERT INTO users (id,google_sub,email,created_at,updated_at) VALUES (?,?,?,1,1)").run(u, "g" + u, u + "@x.in");
  db.sq.prepare("INSERT INTO businesses (id,user_id,name,category,website_url,phone,city,created_at,updated_at) VALUES ('b1','u1','Acme Plumbing','Plumber','https://acme.in','+91 98765 43210','Pune',1,1)").run();
  db.sq.prepare("INSERT INTO businesses (id,user_id,name,category,created_at,updated_at) VALUES ('b2','u2','Other','Cafe',1,1)").run();
}
function linkGoogle(db, raw) {
  db.sq.prepare("INSERT INTO google_locations (user_id,resource_name,location_name,raw_json,synced_at) VALUES ('u1','locations/1','Acme',?,1)").run(JSON.stringify(raw));
  db.sq.prepare("INSERT INTO business_locations (id,business_id,google_resource_name,name,created_at,updated_at) VALUES ('bl1','b1','locations/1','Acme',1,1)").run();
}
const goodCrawl = (over = {}) => ({ state: "completed", url: "https://acme.in/", final_url: "https://acme.in/", pages: [{ url: "https://acme.in/", status: 200, title: "Plumber in Pune", description: "d", h1_count: 1, canonical: "https://acme.in/", robots: "", indexable: true, links_broken: 0, schema_types: ["LocalBusiness"], viewport: "width=device-width", ...over }] });
const googleRaw = (over = {}) => ({ title: "Acme Plumbing", categories: { primaryCategory: { displayName: "Plumber" }, additionalCategories: [{ displayName: "Water heater" }] }, phoneNumbers: { primaryPhone: "098765 43210" }, websiteUri: "https://acme.in", storefrontAddress: { addressLines: ["1 MG Road"], locality: "Pune", postalCode: "411001" }, profile: { description: "x".repeat(150) }, regularHours: { periods: [{ openDay: "MONDAY", openTime: { hours: 9 }, closeDay: "MONDAY", closeTime: { hours: 17 } }] }, ...over });

test("model weights sum to 100 and criteria are exported", () => {
  assert.equal(AUDIT_MODEL.total_weight, 100);
  assert.ok(AUDIT_MODEL.sections.every((s) => s.checks.every((c) => c.criteria && c.why_it_matters)));
});

test("score is null when too little data is available; unavailable is not a failure", () => {
  const r = evaluateAudit({ business: { name: "A" }, google: null, reviews: { count: 0, unanswered: 0, average_rating: null }, crawl: null, crawl_note: "none", website_url: null });
  // only business-record profile fields are available (weights 5+3+3+3=14 < 40)
  assert.equal(r.score, null);
  assert.equal(r.state, "partial");
  const hours = r.checks.find((c) => c.code === "profile_hours");
  assert.equal(hours.status, "unavailable");
  assert.ok(!r.findings.some((f) => f.code === "profile_hours"), "unavailable creates no finding");
  assert.equal(r.breakdown.find((b) => b.section === "reviews").available, false);
});

test("unavailable checks are excluded from the score, not counted as zero", () => {
  const input = { business: { name: "Acme Plumbing", category: "Plumber", phone: "9876543210", city: "Pune", website_url: "https://acme.in", address_json: "{\"locality\":\"Pune\"}" }, google: null, reviews: { count: 12, unanswered: 0, average_rating: 4.5 }, crawl: goodCrawl(), website_url: "https://acme.in" };
  const r = evaluateAudit(input);
  assert.equal(r.score, 100);
  assert.equal(r.state, "partial"); // google checks unavailable
  assert.equal(r.findings.length, 0);
});

test("NAP mismatch evidence shows both values", () => {
  const google = { name: "Acme Plumbers Ltd", phone: "+91 11111 22222", address: { locality: "Mumbai", postalCode: "400001" }, additional_categories: [], hours_periods: [], description: "", primary_category: "", website: "" };
  const r = evaluateAudit({ business: { name: "Acme Plumbing", phone: "+91 98765 43210", city: "Pune", address_json: JSON.stringify({ locality: "Pune", postalCode: "411001" }) }, google, reviews: null, crawl: null, website_url: null });
  for (const code of ["nap_name", "nap_phone", "nap_address"]) {
    const f = r.findings.find((x) => x.code === code);
    assert.ok(f, code);
    assert.match(f.evidence, /user provided/);
    assert.match(f.evidence, /verified/);
  }
  assert.match(r.findings.find((x) => x.code === "nap_name").evidence, /Acme Plumbing.*Acme Plumbers Ltd/);
  assert.match(r.findings.find((x) => x.code === "nap_phone").evidence, /98765 43210.*11111 22222/);
});

test("CSV injection and escaping", () => {
  assert.equal(csvCell("=HYPERLINK(\"x\")"), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell("+1"), "'+1");
  assert.equal(csvCell("-1"), "'-1");
  assert.equal(csvCell("@a"), "'@a");
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell("line\nbreak"), '"line\nbreak"');
  const csv = findingsToCsv([{ severity: "high", category: "c", title: "=cmd", status: "open", evidence: "e", source: "s", verification: "verified", why_it_matters: "w", recommended_action: "r", instructions: ["a", "b"], checked_at: "t" }]);
  assert.match(csv, /^Severity,Category,Title,/);
  assert.match(csv, /'=cmd/);
});

async function runAudit(db, user = "u1", bid = "b1") {
  const res = await call(db, user, "POST", "/api/audits/run", { body: { business_id: bid } });
  return { res, body: await res.json() };
}

test("run stores audit, ownership denial for another user's audit, csv export", async () => {
  const db = makeDB(); seed(db); linkGoogle(db, googleRaw({ phoneNumbers: undefined }));
  __setCrawlerForTests(async () => goodCrawl({ title: "" }));
  const { res, body } = await runAudit(db);
  assert.equal(res.status, 200);
  assert.ok(body.audit_id && typeof body.score === "number");
  const d = await (await call(db, "u1", "GET", "/api/audits/detail", { query: "?id=" + body.audit_id })).json();
  assert.ok(d.findings.find((f) => f.code === "site_title"));
  assert.ok(d.score_breakdown.every((b) => "weight" in b && "points" in b && "max" in b && "available" in b));
  for (const [m, p, q] of [["GET", "/api/audits/detail", "?id="], ["GET", "/api/audits/export.csv", "?id="], ["GET", "/api/audits/plan", "?id="]]) {
    assert.equal((await call(db, "u2", m, p, { query: q + body.audit_id })).status, 404, p);
  }
  assert.equal((await call(db, "u2", "GET", "/api/audits", { query: "?business_id=b1" })).status, 404);
  assert.equal((await call(db, "u2", "POST", "/api/audits/finding-status", { body: { finding_id: d.findings[0].id, status: "fixed" } })).status, 404);
  assert.equal((await call(db, "u2", "POST", "/api/audits/run", { body: { business_id: "b1" } })).status, 404);
  const csv = await call(db, "u1", "GET", "/api/audits/export.csv", { query: "?id=" + body.audit_id });
  assert.match(csv.headers.get("content-type"), /text\/csv/);
  assert.match(await csv.text(), /Severity,Category/);
});

test("free plan is limited to 1 audit per month; paid plan allows more", async () => {
  const db = makeDB(); seed(db); __setCrawlerForTests(async () => goodCrawl());
  assert.equal((await runAudit(db)).res.status, 200);
  const second = await runAudit(db);
  assert.equal(second.res.status, 403);
  assert.equal(second.body.code, "audit_limit_reached");
  db.sq.prepare("INSERT INTO subscriptions (id,user_id,plan_code,status,created_at,updated_at) VALUES ('s','u1','pro','active',1,1)").run();
  assert.equal((await runAudit(db)).res.status, 200);
});

async function twoRuns(mutate) {
  const db = makeDB(); seed(db);
  db.sq.prepare("INSERT INTO subscriptions (id,user_id,plan_code,status,created_at,updated_at) VALUES ('s','u1','pro','active',1,1)").run();
  __setCrawlerForTests(async () => goodCrawl({ title: "", description: "" }));
  const a = (await runAudit(db)).body;
  const da = await (await call(db, "u1", "GET", "/api/audits/detail", { query: "?id=" + a.audit_id })).json();
  await mutate(db, da);
  return { db, a, da };
}

test("compare reports new and fixed findings", async () => {
  const { db, a } = await twoRuns(async () => {});
  __setCrawlerForTests(async () => goodCrawl({ description: "", h1_count: 0 })); // title fixed, h1 new
  const b = (await runAudit(db)).body;
  const c = await (await call(db, "u1", "GET", "/api/audits/compare", { query: `?a=${a.audit_id}&b=${b.audit_id}` })).json();
  assert.deepEqual(c.new.map((f) => f.code), ["site_h1"]);
  assert.deepEqual(c.fixed.map((f) => f.code).sort(), ["local_city_in_title", "site_title"]);
  assert.equal(c.unchanged >= 1, true);
  assert.equal(typeof c.score_delta, "number");
});

test("status carry-forward: kept only when evidence unchanged, otherwise reopened", async () => {
  const { db, da } = await twoRuns(async (db, da) => {
    for (const code of ["site_title", "site_meta_description"]) {
      const f = da.findings.find((x) => x.code === code);
      await call(db, "u1", "POST", "/api/audits/finding-status", { body: { finding_id: f.id, status: code === "site_title" ? "ignored" : "fixed" } });
    }
  });
  // same crawl -> evidence unchanged -> carried forward
  const b = (await runAudit(db)).body;
  const db1 = await (await call(db, "u1", "GET", "/api/audits/detail", { query: "?id=" + b.audit_id })).json();
  assert.equal(db1.findings.find((f) => f.code === "site_title").status, "ignored");
  assert.equal(db1.findings.find((f) => f.code === "site_meta_description").status, "fixed");
  // evidence changes for the description finding (still missing, but a different check message cannot occur) -> change title evidence by setting a whitespace-only title? use viewport: instead alter the ignored finding's stored evidence
  db.sq.prepare("UPDATE audit_issues SET evidence='old evidence' WHERE audit_id=? AND code='site_title'").run(b.audit_id);
  const c = (await runAudit(db)).body;
  const dc = await (await call(db, "u1", "GET", "/api/audits/detail", { query: "?id=" + c.audit_id })).json();
  assert.equal(dc.findings.find((f) => f.code === "site_title").status, "open", "changed evidence reopens");
  assert.equal(dc.findings.find((f) => f.code === "site_meta_description").status, "fixed");
});

test("plan orders by severity then effort across 4 weeks, open findings only", () => {
  const mk = (code, severity, status = "open") => ({ code, severity, status, title: code });
  const plan = buildActionPlan([mk("review_count", "low"), mk("site_noindex", "high"), mk("profile_hours", "high"), mk("site_h1", "medium"), mk("site_https", "high"), mk("profile_phone", "medium", "fixed"), mk("schema_local_business", "medium"), mk("site_canonical", "low")]);
  assert.equal(plan.weeks.length, 4);
  const flat = plan.weeks.flatMap((w) => w.items.map((i) => i.code));
  assert.ok(!flat.includes("profile_phone"));
  assert.equal(flat.length, 7);
  assert.equal(flat[0], "profile_hours"); // high, effort 1
  assert.ok(flat.indexOf("site_noindex") < flat.indexOf("site_h1"));
  assert.ok(flat.indexOf("site_https") < flat.indexOf("schema_local_business"));
  assert.ok(plan.weeks[0].items.every((i) => i.severity === "high"));
});

test("plan endpoint returns weeks", async () => {
  const { db, a } = await twoRuns(async () => {});
  const p = await (await call(db, "u1", "GET", "/api/audits/plan", { query: "?id=" + a.audit_id })).json();
  assert.equal(p.weeks.length, 4);
});

test("invalid website_url rejected; list returns summaries", async () => {
  const db = makeDB(); seed(db); __setCrawlerForTests(async () => goodCrawl());
  const bad = await call(db, "u1", "POST", "/api/audits/run", { body: { business_id: "b1", website_url: "javascript:alert(1)" } });
  assert.equal(bad.status, 400);
  await runAudit(db);
  const l = await (await call(db, "u1", "GET", "/api/audits", { query: "?business_id=b1" })).json();
  assert.equal(l.audits.length, 1);
  assert.ok("high" in l.audits[0].summary && "fixed" in l.audits[0].summary);
});
