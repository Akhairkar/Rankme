import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { routes, jobs, createNotification, sendEmail, processEmailOutbox, runFanout, runDigest, buildDigestText } from "../src/notifications.js";

function makeDB() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys = ON");
  for (const f of ["000_base.sql", "001_rate_limits.sql", "010_google.sql", "020_billing.sql", "030_audit.sql", "040_rank.sql", "050_platform.sql", "070_workspace.sql", "080_notifications.sql", "085_actions_reports.sql"]) {
    sql.exec(readFileSync(fileURLToPath(new URL("../migrations/" + f, import.meta.url)), "utf8"));
  }
  const norm = (a) => a.map((x) => (x === undefined ? null : x));
  return {
    sql,
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
const NOW = Date.UTC(2026, 9, 30, 12);
const DAY = 86400000;
function seed(db) {
  const s = db.sql;
  for (const [id, email] of [["uA", "a@x.in"], ["uB", "b@x.in"]]) s.prepare("INSERT INTO users VALUES (?,?,?,?,?,?,?)").run(id, "g_" + id, email, "N", null, 1, 1);
  for (const [id, u] of [["bA", "uA"], ["bB", "uB"]]) s.prepare("INSERT INTO businesses (id,user_id,name,category,city,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").run(id, u, "Biz " + id, "Dentist", "Pune", "active", 1, 1);
}
function mkCtx(db, userId, url = "https://api.localboost.in/x") {
  return { env: { DB: db }, url: new URL(url), userId, ip: "1.1.1.1", json: (d, s = 200) => Response.json(d, { status: s }), now: () => NOW };
}
const R = (m, p) => routes.find((r) => r.method === m && r.path === p);
const post = (body) => new Request("https://x/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const count = (db, sql, ...a) => db.sql.prepare(sql).get(...a).n;
const N = (o = {}) => ({ userId: "uA", businessId: "bA", kind: "rank_changed", severity: "info", title: "Rank moved", body: "b", link: "/dashboard.html", dedupeKey: "k1", now: NOW, ...o });
function withFetch(impl, fn) {
  const orig = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return impl(url, init, calls.length); };
  return Promise.resolve(fn(calls)).finally(() => { globalThis.fetch = orig; });
}
const PROVIDER = { EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_test_secret", EMAIL_FROM: "LocalBoost <hello@localboost.in>" };

test("createNotification stores a row and suppresses duplicates within 24h only", async () => {
  const db = makeDB(); seed(db); const env = { DB: db };
  const a = await createNotification(env, N());
  assert.equal(a.state, "created");
  const dup = await createNotification(env, N({ now: NOW + 3600000 }));
  assert.equal(dup.state, "suppressed_duplicate");
  assert.equal(count(db, "SELECT COUNT(*) n FROM notifications"), 1);
  assert.equal((await createNotification(env, N({ userId: "uB", businessId: "bB" }))).state, "created", "other user is not deduped");
  assert.equal((await createNotification(env, N({ dedupeKey: "k2" }))).state, "created", "other key");
  assert.equal((await createNotification(env, N({ now: NOW + DAY + 1000 }))).state, "created", "window elapsed");
  assert.equal((await createNotification(env, N({ dedupeKey: null }))).state, "created");
  assert.equal((await createNotification(env, N({ dedupeKey: null }))).state, "created", "no key = no dedupe");
  assert.equal((await createNotification(env, N({ kind: "nope" }))).state, "invalid");
  assert.equal((await createNotification(env, N({ severity: "bad" }))).state, "invalid");
  assert.equal((await createNotification(env, N({ businessId: "missing" }))).state, "invalid");
  const l = (await createNotification(env, N({ dedupeKey: "x", link: "//evil.com" })));
  assert.equal(db.sql.prepare("SELECT link FROM notifications WHERE id=?").get(l.id).link, null, "protocol-relative link dropped");
});

test("preferences: disabling in_app and email suppresses; email-only is stored read; security_alert is locked", async () => {
  const db = makeDB(); seed(db); const env = { DB: db };
  db.sql.prepare("INSERT INTO notification_preferences VALUES ('uA','rank_changed',0,0,1,1)").run();
  assert.equal((await createNotification(env, N())).state, "suppressed_preference");
  assert.equal(count(db, "SELECT COUNT(*) n FROM notifications"), 0);
  db.sql.prepare("UPDATE notification_preferences SET email=1 WHERE user_id='uA'").run();
  const r = await createNotification(env, N());
  assert.equal(r.state, "created"); assert.equal(r.email, "queued");
  assert.ok(db.sql.prepare("SELECT read_at FROM notifications WHERE id=?").get(r.id).read_at, "email-only is created read");
  assert.equal(count(db, "SELECT COUNT(*) n FROM email_outbox WHERE status='pending'"), 1);
  db.sql.prepare("INSERT INTO notification_preferences VALUES ('uA','security_alert',0,0,0,1)").run();
  const s = await createNotification(env, N({ kind: "security_alert", severity: "critical", title: "New sign-in", dedupeKey: "s1" }));
  assert.equal(s.state, "created");
  assert.equal(db.sql.prepare("SELECT read_at FROM notifications WHERE id=?").get(s.id).read_at, null, "forced in-app");
  // default email only for kinds that need it
  await createNotification(env, N({ userId: "uB", businessId: null, kind: "rank_changed", dedupeKey: "d" }));
  assert.equal(count(db, "SELECT COUNT(*) n FROM email_outbox WHERE user_id='uB'"), 0);
  await createNotification(env, N({ userId: "uB", businessId: null, kind: "team_invite", dedupeKey: "d2", title: "Invited" }));
  assert.equal(count(db, "SELECT COUNT(*) n FROM email_outbox WHERE user_id='uB'"), 1);
});

test("preferences endpoints validate, persist, are per user and protect locked kinds", async () => {
  const db = makeDB(); seed(db);
  const get = R("GET", "/api/notifications/preferences"), set = R("POST", "/api/notifications/preferences");
  let j = await (await get.handler(null, mkCtx(db, "uA"))).json();
  assert.equal(j.preferences.length, 12);
  assert.equal(j.email_delivery, "awaiting_email_provider");
  assert.equal(j.preferences.find((p) => p.kind === "rank_changed").email, false);
  assert.equal(j.preferences.find((p) => p.kind === "security_alert").locked, true);
  let res = await set.handler(post({ preferences: [{ kind: "rank_changed", email: true, digest: false }] }), mkCtx(db, "uA"));
  assert.equal(res.status, 200);
  j = await res.json();
  const rc = j.preferences.find((p) => p.kind === "rank_changed");
  assert.deepEqual([rc.in_app, rc.email, rc.digest], [true, true, false]);
  const other = await (await get.handler(null, mkCtx(db, "uB"))).json();
  assert.equal(other.preferences.find((p) => p.kind === "rank_changed").email, false, "uB unaffected");
  for (const body of [{ preferences: [{ kind: "bogus", email: true }] }, { preferences: [{ kind: "rank_changed", email: "yes" }] }, { preferences: [{ kind: "rank_changed" }] }, { preferences: [] }, {}, { preferences: [{ kind: "security_alert", in_app: false }] }]) {
    assert.equal((await set.handler(post(body), mkCtx(db, "uA"))).status, 400, JSON.stringify(body));
  }
  res = await set.handler(post({ preferences: [{ kind: "*", digest: false }] }), mkCtx(db, "uA"));
  assert.equal(res.status, 200);
  assert.ok((await res.json()).preferences.filter((p) => p.kind !== "security_alert").every((p) => p.digest === false));
});

test("sendEmail without provider config never claims delivery; outbox stays pending", async () => {
  const db = makeDB(); seed(db);
  assert.deepEqual(await sendEmail({ DB: db }, { to: "a@x.in", subject: "s", text: "t" }), { state: "awaiting_email_provider" });
  assert.deepEqual(await sendEmail({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "k" }, { to: "a@x.in", subject: "s", text: "t" }), { state: "awaiting_email_provider" });
  await createNotification({ DB: db }, N({ kind: "team_invite", title: "Invited", dedupeKey: "t" }));
  let called = false;
  const out = await withFetch(async () => { called = true; return new Response("{}"); }, () => processEmailOutbox({ DB: db }, NOW));
  assert.equal(out.state, "awaiting_email_provider"); assert.equal(called, false);
  const row = db.sql.prepare("SELECT * FROM email_outbox").get();
  assert.equal(row.status, "pending"); assert.equal(row.attempts, 0); assert.equal(row.sent_at, null);
  assert.equal(db.sql.prepare("SELECT emailed_at FROM notifications").get().emailed_at, null);
});

test("resend provider: correct request, marks sent and emailed_at; secret never stored", async () => {
  const db = makeDB(); seed(db); const env = { DB: db, ...PROVIDER };
  await createNotification(env, N({ kind: "team_invite", title: "Invited", dedupeKey: "t" }));
  await withFetch(async () => Response.json({ id: "em_1" }), async (calls) => {
    const out = await processEmailOutbox(env, NOW);
    assert.equal(out.sent, 1);
    assert.equal(calls[0].url, "https://api.resend.com/emails");
    assert.equal(calls[0].init.headers.authorization, "Bearer re_test_secret");
    const body = JSON.parse(calls[0].init.body);
    assert.deepEqual(body.to, ["a@x.in"]); assert.equal(body.from, PROVIDER.EMAIL_FROM);
  });
  const row = db.sql.prepare("SELECT * FROM email_outbox").get();
  assert.equal(row.status, "sent"); assert.equal(row.sent_at, NOW); assert.equal(row.attempts, 1);
  assert.equal(db.sql.prepare("SELECT emailed_at FROM notifications").get().emailed_at, NOW);
  assert.ok(!JSON.stringify(db.sql.prepare("SELECT * FROM email_outbox").all()).includes("re_test_secret"));
});

test("outbox retries with exponential backoff and fails after 3 attempts; permanent errors fail at once", async () => {
  const db = makeDB(); seed(db); const env = { DB: db, ...PROVIDER };
  await createNotification(env, N({ kind: "team_invite", title: "Invited", dedupeKey: "t" }));
  await withFetch(async () => new Response("err", { status: 503 }), async () => {
    let r = await processEmailOutbox(env, NOW);
    assert.equal(r.retry_scheduled, 1);
    let row = db.sql.prepare("SELECT * FROM email_outbox").get();
    assert.equal(row.status, "pending"); assert.equal(row.attempts, 1); assert.equal(row.last_error, "provider_http_503"); assert.equal(row.next_attempt_at, NOW + 300000);
    r = await processEmailOutbox(env, NOW + 1000); // not due yet
    assert.equal(r.retry_scheduled + r.failed + r.sent, 0);
    r = await processEmailOutbox(env, NOW + 300000);
    row = db.sql.prepare("SELECT * FROM email_outbox").get();
    assert.equal(row.attempts, 2); assert.equal(row.next_attempt_at, NOW + 300000 + 600000);
    r = await processEmailOutbox(env, NOW + 900000);
    assert.equal(r.failed, 1);
    row = db.sql.prepare("SELECT * FROM email_outbox").get();
    assert.equal(row.status, "failed"); assert.equal(row.attempts, 3); assert.equal(row.last_error, "provider_http_503");
    r = await processEmailOutbox(env, NOW + 99999999);
    assert.equal(r.failed + r.sent, 0, "failed rows are never retried");
  });
  const db2 = makeDB(); seed(db2); const env2 = { DB: db2, ...PROVIDER };
  await createNotification(env2, N({ kind: "team_invite", title: "Invited", dedupeKey: "t" }));
  await withFetch(async () => new Response("bad", { status: 422 }), async () => {
    assert.equal((await processEmailOutbox(env2, NOW)).failed, 1);
  });
  assert.equal(db2.sql.prepare("SELECT status FROM email_outbox").get().status, "failed");
  // network error is retryable
  const db3 = makeDB(); seed(db3); const env3 = { DB: db3, ...PROVIDER };
  await createNotification(env3, N({ kind: "team_invite", title: "Invited", dedupeKey: "t" }));
  await withFetch(async () => { throw new Error("boom"); }, async () => { assert.equal((await processEmailOutbox(env3, NOW)).retry_scheduled, 1); });
  assert.equal(db3.sql.prepare("SELECT last_error FROM email_outbox").get().last_error, "provider_unreachable");
});

test("outbox processes at most 20 per run and invalid recipients are suppressed", async () => {
  const db = makeDB(); seed(db); const env = { DB: db, ...PROVIDER };
  for (let i = 0; i < 25; i++) db.sql.prepare("INSERT INTO email_outbox (id,user_id,to_email,subject,body_text,status,attempts,created_at) VALUES (?,?,?,?,?,'pending',0,?)").run("e" + i, "uA", "a@x.in", "s", "t", i);
  await withFetch(async () => Response.json({ id: "x" }), async (calls) => {
    assert.equal((await processEmailOutbox(env, NOW)).sent, 20); assert.equal(calls.length, 20);
    assert.equal((await processEmailOutbox(env, NOW)).sent, 5);
  });
  db.sql.prepare("UPDATE users SET email='not-an-email' WHERE id='uB'").run();
  const r = await createNotification(env, N({ userId: "uB", businessId: "bB", kind: "team_invite", title: "Invited", dedupeKey: "z" }));
  assert.equal(r.email, "suppressed");
  assert.equal(db.sql.prepare("SELECT status FROM email_outbox WHERE user_id='uB'").get().status, "suppressed");
});

test("fanout converts real monitoring events once, skips unknown types, respects preferences", async () => {
  const db = makeDB(); seed(db); const env = { DB: db };
  const ev = (id, user, biz, type, sev, at = NOW - 1000) => db.sql.prepare("INSERT INTO monitoring_events (id,user_id,business_id,event_type,severity,title,detail,reference_json,detected_at,status) VALUES (?,?,?,?,?,?,?,?,?,'open')").run(id, user, biz, type, sev, "T " + id, "detail", "{}", at);
  ev("e1", "uA", "bA", "rank_change", "warning"); ev("e2", "uA", "bA", "rank_change", "high"); ev("e3", "uB", "bB", "something_else", "info");
  ev("e4", "uA", "bA", "rank_change", "info", NOW - 30 * DAY);
  let s = await runFanout(env, NOW);
  assert.equal(s.events, 2); assert.equal(s.skipped_event_types, 1);
  assert.equal(count(db, "SELECT COUNT(*) n FROM notifications WHERE user_id='uA'"), 2);
  assert.equal(count(db, "SELECT COUNT(*) n FROM notifications WHERE user_id='uB'"), 0, "tenant: only the owner is notified");
  assert.equal(db.sql.prepare("SELECT severity FROM notifications WHERE dedupe_key='evt:e2'").get().severity, "warning");
  s = await runFanout(env, NOW + 1000);
  assert.equal(s.events, 0, "idempotent");
  assert.equal(count(db, "SELECT COUNT(*) n FROM notifications"), 2);
  ev("e5", "uA", "bA", "rank_change", "info", NOW + 500);
  db.sql.prepare("INSERT INTO notification_preferences VALUES ('uA','rank_changed',0,0,1,1)").run();
  await runFanout(env, NOW + 2000);
  assert.equal(count(db, "SELECT COUNT(*) n FROM notifications"), 2, "preference off");
  db.sql.prepare("DELETE FROM notification_preferences").run();
  await runFanout(env, NOW + 3000);
  assert.equal(count(db, "SELECT COUNT(*) n FROM notifications"), 2, "an already-considered event is not resurrected");
});

test("fanout: google reconnect, subscription renewal, allowance; each only once", async () => {
  const db = makeDB(); seed(db); const env = { DB: db }; const s = db.sql;
  s.prepare("INSERT INTO google_connection_state (user_id,needs_reconnect,reconnect_flagged_at,updated_at) VALUES ('uA',1,?,?)").run(NOW - 5000, NOW - 5000);
  s.prepare("INSERT INTO google_connection_state (user_id,needs_reconnect,updated_at) VALUES ('uB',0,?)").run(NOW);
  s.prepare("INSERT INTO subscriptions (id,user_id,plan_code,status,current_period_end,cancel_at_period_end,created_at,updated_at) VALUES ('s1','uA','pro','active',?,0,1,1)").run(NOW + 3 * DAY);
  // free plan allows 1 audit per month; uA has used it
  s.prepare("DELETE FROM subscriptions WHERE id='s1'").run();
  s.prepare("INSERT INTO subscriptions (id,user_id,plan_code,status,current_period_end,cancel_at_period_end,created_at,updated_at) VALUES ('s1','uA','pro','active',?,1,1,1)").run(NOW + 3 * DAY);
  s.prepare("INSERT INTO audits (id,business_id,audit_type,status,created_at) VALUES ('au1','bB','unified','completed',?)").run(NOW - DAY);
  let r = await runFanout(env, NOW);
  assert.equal(r.google, 1); assert.equal(r.renewals, 1); assert.ok(r.credits >= 1);
  const kinds = s.prepare("SELECT user_id,kind,severity,title FROM notifications ORDER BY kind").all();
  assert.ok(kinds.some((k) => k.user_id === "uA" && k.kind === "google_connection_expired" && k.severity === "critical"));
  const renew = kinds.find((k) => k.kind === "subscription_renewal_soon");
  assert.equal(renew.user_id, "uA"); assert.match(renew.title, /ends on/);
  const credit = kinds.find((k) => k.kind === "credits_low");
  assert.equal(credit.user_id, "uB"); assert.match(credit.title, /audit/);
  assert.ok(!kinds.some((k) => k.user_id === "uB" && k.kind === "google_connection_expired"));
  r = await runFanout(env, NOW + 1000);
  assert.deepEqual([r.google, r.renewals, r.credits], [0, 0, 0]);
  assert.equal(count(db, "SELECT COUNT(*) n FROM notifications"), kinds.length);
});

test("weekly digest: Monday only, from real data, once, nothing when empty", async () => {
  const db = makeDB(); seed(db); const env = { DB: db }; const s = db.sql;
  const mon = Date.UTC(2026, 10, 2, 4, 0);
  assert.equal((await runDigest(env, NOW)).state, "not_due");
  assert.equal((await runDigest(env, Date.UTC(2026, 10, 2, 3, 0))).state, "not_due");
  let r = await runDigest(env, mon);
  assert.equal(r.queued, 0); assert.equal(count(db, "SELECT COUNT(*) n FROM email_outbox"), 0, "no data -> no email");
  s.prepare("INSERT INTO action_tasks (id,business_id,source_type,title,priority,status,created_at,updated_at) VALUES ('t1','bA','manual','Fix hours','critical','open',1,1)").run();
  s.prepare("INSERT INTO action_tasks (id,business_id,source_type,title,priority,status,created_at,updated_at) VALUES ('t2','bA','manual','Done','low','done',1,1)").run();
  s.prepare("INSERT INTO business_locations (id,business_id,name,created_at,updated_at) VALUES ('l1','bA','L',1,1)").run();
  s.prepare("INSERT INTO reviews (id,business_location_id,google_review_name,rating,review_time,reply_status,synced_at) VALUES ('rv1','l1','g1',5,?,'unanswered',?)").run(mon - DAY, mon - DAY);
  await createNotification(env, N({ now: mon - 2 * DAY, title: "Rank dropped" }));
  r = await runDigest(env, mon + 60000);
  assert.equal(r.queued, 1);
  const row = s.prepare("SELECT * FROM email_outbox").get();
  assert.equal(row.to_email, "a@x.in"); assert.equal(row.status, "pending");
  assert.match(row.body_text, /Open Action Center tasks: 1 \(1 critical\)/);
  assert.match(row.body_text, /New reviews synced in the last 7 days: 1/);
  assert.match(row.body_text, /Rank dropped/);
  assert.equal(s.prepare("SELECT COUNT(*) n FROM email_outbox WHERE user_id='uB'").get().n, 0, "uB has nothing to report");
  r = await runDigest(env, mon + 120000);
  assert.equal(r.queued, 0); assert.equal(count(db, "SELECT COUNT(*) n FROM email_outbox"), 1, "once per Monday");
  assert.ok(!buildDigestText({ tasks: { total: 0, critical: 0 }, newReviews: 0, unread: [] }).includes("Open Action"));
  assert.ok(jobs.map((j) => j.name).includes("notification-digest"));
});

test("list, unread-count, mark read: tenant isolation, pagination, validation", async () => {
  const db = makeDB(); seed(db); const env = { DB: db };
  const ids = [];
  for (let i = 0; i < 5; i++) ids.push((await createNotification(env, N({ dedupeKey: "k" + i, now: NOW - i * 1000, title: "A" + i }))).id);
  const bId = (await createNotification(env, N({ userId: "uB", businessId: "bB", title: "SECRET_B" }))).id;
  const list = R("GET", "/api/notifications"), count_ = R("GET", "/api/notifications/unread-count"), read = R("POST", "/api/notifications/read");
  let j = await (await list.handler(null, mkCtx(db, "uA"))).json();
  assert.equal(j.notifications.length, 5);
  assert.ok(!JSON.stringify(j).includes("SECRET_B"));
  assert.ok(!("user_id" in j.notifications[0]) && !("dedupe_key" in j.notifications[0]));
  j = await (await list.handler(null, mkCtx(db, "uA", "https://x/api/notifications?limit=2"))).json();
  assert.equal(j.notifications.length, 2); assert.ok(j.next_before);
  const j2 = await (await list.handler(null, mkCtx(db, "uA", "https://x/api/notifications?limit=2&before=" + j.next_before))).json();
  assert.equal(j2.notifications[0].title, "A2");
  for (const q of ["limit=0", "limit=101", "limit=x", "before=abc"]) assert.equal((await list.handler(null, mkCtx(db, "uA", "https://x/api/notifications?" + q))).status, 400);
  assert.equal((await (await count_.handler(null, mkCtx(db, "uA"))).json()).unread, 5);
  // uA cannot mark uB's notification
  let res = await (await read.handler(post({ ids: [bId, ids[0]] }), mkCtx(db, "uA"))).json();
  assert.equal(res.updated, 1);
  assert.equal(db.sql.prepare("SELECT read_at FROM notifications WHERE id=?").get(bId).read_at, null);
  assert.equal((await (await count_.handler(null, mkCtx(db, "uA"))).json()).unread, 4);
  j = await (await list.handler(null, mkCtx(db, "uA", "https://x/api/notifications?unread=1"))).json();
  assert.equal(j.notifications.length, 4);
  for (const body of [{}, { ids: [] }, { ids: [1] }, { ids: "a" }]) assert.equal((await read.handler(post(body), mkCtx(db, "uA"))).status, 400);
  res = await (await read.handler(post({ all: true }), mkCtx(db, "uA"))).json();
  assert.equal(res.updated, 4);
  assert.equal((await (await count_.handler(null, mkCtx(db, "uB"))).json()).unread, 1, "uB untouched");
  assert.equal(routes.every((r) => r.auth === "session"), true);
});
