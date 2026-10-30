import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { routes } from "../src/actions.js";
import { getUserBusiness } from "../src/db.js";

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
let clock = Date.UTC(2026, 9, 30, 12);
function seed(db) {
  const s = db.sql;
  for (const id of ["uA", "uB", "uC"]) s.prepare("INSERT INTO users VALUES (?,?,?,?,?,?,?)").run(id, "g_" + id, id + "@x.in", "N", null, 1, 1);
  for (const [id, u] of [["bA", "uA"], ["bB", "uB"]]) s.prepare("INSERT INTO businesses (id,user_id,name,category,city,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").run(id, u, "Biz " + id, "Dentist", "Pune", "active", 1, 1);
}
function addAudit(db, id, biz, at, issues, checks = []) {
  db.sql.prepare("INSERT INTO audits (id,business_id,audit_type,status,created_at,checks_json) VALUES (?,?,'unified','completed',?,?)").run(id, biz, at, JSON.stringify(checks));
  for (const i of issues) db.sql.prepare("INSERT INTO audit_issues (id,audit_id,code,category,severity,title,explanation,status,created_at,finding_key,source,evidence,instructions_json,recommended_fix) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(`${id}_${i.code}`, id, i.code, "website_technical", i.severity, "Title " + i.code, "why " + i.code, i.status || "open", at, `${i.code}|${i.source || "src"}`, i.source || "src", i.evidence || "ev " + i.code, JSON.stringify(["step one", "step two"]), "fix " + i.code);
}
function mkCtx(db, userId) {
  return {
    env: { DB: db }, url: new URL("https://x/x"), userId, ip: "1.1.1.1", json: (d, s = 200) => Response.json(d, { status: s }), now: () => clock,
    getUserBusiness: (id) => getUserBusiness({ DB: db }, userId, id),
  };
}
const R = (m, p) => routes.find((r) => r.method === m && r.path === p);
const post = (body) => new Request("https://x/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const withUrl = (ctx, q) => ({ ...ctx, url: new URL("https://x/x?" + q) });
const call = async (m, p, ctx, body) => { const res = await R(m, p).handler(m === "POST" ? post(body) : new Request("https://x/x"), ctx); return { status: res.status, body: await res.json() }; };

test("manual task create and validation", async () => {
  const db = makeDB(); seed(db);
  let r = await call("POST", "/api/actions", mkCtx(db, "uA"), { business_id: "bA", title: "Call supplier", priority: "high", effort_minutes: 30, due_date: "2026-11-05", description: "d" });
  assert.equal(r.status, 201);
  assert.equal(r.body.task.status, "open"); assert.equal(r.body.task.source_type, "manual"); assert.equal(r.body.task.created_by, "uA"); assert.equal(r.body.task.completed_at, null);
  for (const bad of [{ title: "" }, { title: "x".repeat(201) }, { title: "t", priority: "urgent" }, { title: "t", due_date: "2026-02-30" }, { title: "t", due_date: "tomorrow" }, { title: "t", effort_minutes: 0 }, { title: "t", assignee_user_id: "uB" }]) {
    r = await call("POST", "/api/actions", mkCtx(db, "uA"), { business_id: "bA", ...bad });
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
  r = await call("POST", "/api/actions", mkCtx(db, "uA"), { business_id: "bB", title: "Hijack" });
  assert.equal(r.status, 404);
  assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM action_tasks WHERE business_id='bB'").get().n, 0);
});

test("from-audit: priority mapping, indexing escalation, effort, dedupe, isolation", async () => {
  const db = makeDB(); seed(db);
  addAudit(db, "au1", "bA", 1000, [
    { code: "site_noindex", severity: "high" }, { code: "profile_hours", severity: "high" }, { code: "profile_phone", severity: "medium" },
    { code: "site_title", severity: "low" }, { code: "site_h1", severity: "low", status: "fixed" },
  ]);
  const ctx = mkCtx(db, "uA");
  let r = await call("POST", "/api/actions/from-audit", ctx, { audit_id: "au1" });
  assert.equal(r.status, 201);
  assert.equal(r.body.created.length, 4, "fixed finding is not turned into a task");
  const by = Object.fromEntries(r.body.created.map((t) => [t.finding_key.split("|")[0], t]));
  assert.equal(by.site_noindex.priority, "critical"); assert.equal(by.profile_hours.priority, "high");
  assert.equal(by.profile_phone.priority, "medium"); assert.equal(by.site_title.priority, "low");
  assert.equal(by.site_noindex.effort_minutes, 60); assert.equal(by.profile_hours.effort_minutes, 15);
  assert.equal(by.profile_hours.source_type, "audit_finding"); assert.equal(by.profile_hours.before_evidence, "ev profile_hours");
  assert.match(by.profile_hours.description, /fix profile_hours[\s\S]*1\. step one/);
  r = await call("POST", "/api/actions/from-audit", ctx, { audit_id: "au1" });
  assert.equal(r.body.created.length, 0); assert.equal(r.body.skipped.length, 4); assert.equal(r.body.skipped[0].reason, "already_tracked");
  assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM action_tasks").get().n, 4);
  // a newer audit with the same finding does not duplicate; a new finding is added
  addAudit(db, "au2", "bA", 2000, [{ code: "site_noindex", severity: "high" }, { code: "site_viewport", severity: "medium" }]);
  r = await call("POST", "/api/actions/from-audit", ctx, { audit_id: "au2" });
  assert.equal(r.body.created.length, 1); assert.equal(r.body.created[0].finding_key.split("|")[0], "site_viewport");
  // isolation
  assert.equal((await call("POST", "/api/actions/from-audit", mkCtx(db, "uB"), { audit_id: "au1" })).status, 404);
  assert.equal((await call("POST", "/api/actions/from-audit", ctx, { audit_id: "nope" })).status, 404);
  assert.equal((await call("POST", "/api/actions/from-audit", ctx, {})).status, 400);
});

async function oneTask(db, ctx, extra = {}) {
  const r = await call("POST", "/api/actions", ctx, { business_id: "bA", title: "T", ...extra });
  return r.body.task;
}

test("task lifecycle records who completed and clears it on reopen", async () => {
  const db = makeDB(); seed(db); const ctx = mkCtx(db, "uA");
  const t = await oneTask(db, ctx);
  let r = await call("POST", "/api/actions/update", ctx, { id: t.id, status: "in_progress" });
  assert.equal(r.body.task.status, "in_progress");
  r = await call("POST", "/api/actions/update", ctx, { id: t.id, status: "reopened" });
  assert.equal(r.status, 409, "cannot reopen an unfinished task");
  clock += 5000;
  r = await call("POST", "/api/actions/update", ctx, { id: t.id, status: "done", after_evidence: "Hours added" });
  assert.equal(r.body.task.status, "done"); assert.equal(r.body.task.completed_by, "uA"); assert.equal(r.body.task.completed_at, clock); assert.equal(r.body.task.after_evidence, "Hours added");
  assert.equal(r.body.task.verified_audit_id, null, "user-marked done is not audit verified");
  r = await call("POST", "/api/actions/update", ctx, { id: t.id, status: "reopened" });
  assert.equal(r.body.task.status, "reopened"); assert.equal(r.body.task.completed_at, null); assert.equal(r.body.task.completed_by, null);
  r = await call("POST", "/api/actions/update", ctx, { id: t.id, priority: "critical", due_date: "2026-12-01" });
  assert.equal(r.body.task.priority, "critical"); assert.equal(r.body.task.due_date, "2026-12-01");
  r = await call("POST", "/api/actions/update", ctx, { id: t.id, due_date: null });
  assert.equal(r.body.task.due_date, null);
  for (const bad of [{ status: "finished" }, { priority: "x" }, { due_date: "2026-13-01" }, { user_id: "uB" }, {}, { verified_audit_id: "a" }, { assignee_user_id: "uB" }]) {
    assert.equal((await call("POST", "/api/actions/update", ctx, { id: t.id, ...bad })).status, 400, JSON.stringify(bad));
  }
  assert.equal((await call("POST", "/api/actions/update", ctx, { id: "missing", status: "done" })).status, 404);
});

test("assignment: owner and workspace members only", async () => {
  const db = makeDB(); seed(db); const ctx = mkCtx(db, "uA");
  const t = await oneTask(db, ctx);
  let r = await call("POST", "/api/actions/update", ctx, { id: t.id, assignee_user_id: "uA" });
  assert.equal(r.body.task.assignee_user_id, "uA");
  r = await call("POST", "/api/actions/update", ctx, { id: t.id, assignee_user_id: "uC" });
  assert.equal(r.status, 400); assert.equal(r.body.code, "invalid_assignee");
  db.sql.prepare("INSERT INTO workspaces (id,name,owner_user_id,is_personal,created_at) VALUES ('wsA','A','uA',1,1)").run();
  db.sql.prepare("INSERT INTO workspace_members (workspace_id,user_id,role,status,created_at) VALUES ('wsA','uA','owner','active',1),('wsA','uC','manager','active',1)").run();
  r = await call("POST", "/api/actions/update", ctx, { id: t.id, assignee_user_id: "uC" });
  assert.equal(r.status, 200); assert.equal(r.body.task.assignee_user_id, "uC");
  db.sql.prepare("UPDATE workspace_members SET status='suspended' WHERE user_id='uC'").run();
  assert.equal((await call("POST", "/api/actions/update", ctx, { id: t.id, assignee_user_id: "uC" })).status, 400, "suspended member");
  r = await call("POST", "/api/actions/update", ctx, { id: t.id, assignee_user_id: null });
  assert.equal(r.body.task.assignee_user_id, null);
});

test("notes and link-only attachments", async () => {
  const db = makeDB(); seed(db); const ctx = mkCtx(db, "uA");
  const t = await oneTask(db, ctx);
  let r = await call("POST", "/api/actions/note", ctx, { id: t.id, note: "Called them" });
  assert.equal(r.status, 201);
  for (const bad of [{ note: "" }, { note: "x".repeat(2001) }, {}]) assert.equal((await call("POST", "/api/actions/note", ctx, { id: t.id, ...bad })).status, 400);
  r = await call("POST", "/api/actions/attachment", ctx, { id: t.id, url: "https://drive.google.com/file/d/1", filename: "photo.jpg" });
  assert.equal(r.status, 201); assert.equal(r.body.storage, "link_only");
  for (const url of ["http://a.com/x", "javascript:alert(1)", "ftp://a.com", "https://u:p@a.com/x", "notaurl", "https://localhost"]) {
    assert.equal((await call("POST", "/api/actions/attachment", ctx, { id: t.id, url, filename: "f" })).status, 400, url);
  }
  for (const filename of ["", "a/b", "x".repeat(121)]) assert.equal((await call("POST", "/api/actions/attachment", ctx, { id: t.id, url: "https://a.com/x", filename })).status, 400);
  const d = await (await R("GET", "/api/actions/detail").handler(new Request("https://x/x"), withUrl(ctx, "id=" + t.id))).json();
  assert.equal(d.notes.length, 1); assert.equal(d.attachments.length, 1); assert.equal(d.task.id, t.id);
  const list = await (await R("GET", "/api/actions").handler(null, withUrl(ctx, "business_id=bA"))).json();
  assert.equal(list.tasks[0].note_count, 1); assert.equal(list.tasks[0].attachment_count, 1);
  // other tenant
  const other = mkCtx(db, "uB");
  assert.equal((await call("POST", "/api/actions/note", other, { id: t.id, note: "x" })).status, 404);
  assert.equal((await call("POST", "/api/actions/attachment", other, { id: t.id, url: "https://a.com/x", filename: "f" })).status, 404);
  assert.equal((await R("GET", "/api/actions/detail").handler(null, withUrl(other, "id=" + t.id))).status, 404);
});

test("list filters, ordering, progress, tenant isolation", async () => {
  const db = makeDB(); seed(db); const ctx = mkCtx(db, "uA");
  const low = await oneTask(db, ctx, { title: "low", priority: "low" });
  const crit = await oneTask(db, ctx, { title: "crit", priority: "critical", assignee_user_id: "uA" });
  const hi = await oneTask(db, ctx, { title: "hi", priority: "high" });
  const ign = await oneTask(db, ctx, { title: "ign", priority: "high" });
  await call("POST", "/api/actions/update", ctx, { id: crit.id, status: "done" });
  await call("POST", "/api/actions/update", ctx, { id: ign.id, status: "ignored" });
  const list = async (q, c = ctx) => (await (await R("GET", "/api/actions").handler(null, withUrl(c, q))).json());
  assert.deepEqual((await list("business_id=bA")).tasks.map((t) => t.title), ["crit", "hi", "ign", "low"]);
  assert.deepEqual((await list("business_id=bA&status=done")).tasks.map((t) => t.title), ["crit"]);
  assert.deepEqual((await list("business_id=bA&assignee=me")).tasks.map((t) => t.title), ["crit"]);
  assert.deepEqual((await list("business_id=bA&assignee=unassigned")).tasks.map((t) => t.title).sort(), ["hi", "ign", "low"]);
  assert.equal((await R("GET", "/api/actions").handler(null, withUrl(ctx, "business_id=bA&status=zzz"))).status, 400);
  assert.equal((await R("GET", "/api/actions").handler(null, withUrl(ctx, ""))).status, 400);
  assert.equal((await R("GET", "/api/actions").handler(null, withUrl(mkCtx(db, "uB"), "business_id=bA"))).status, 404);
  const prog = await (await R("GET", "/api/actions/progress").handler(null, withUrl(ctx, "business_id=bA"))).json();
  assert.equal(prog.total, 3); assert.equal(prog.done, 1); assert.equal(prog.percent, 33);
  assert.deepEqual(prog.by_priority.critical, { total: 1, done: 1 }); assert.deepEqual(prog.by_priority.high, { total: 1, done: 0 });
  assert.equal((await R("GET", "/api/actions/progress").handler(null, withUrl(mkCtx(db, "uB"), "business_id=bA"))).status, 404);
  const empty = await (await R("GET", "/api/actions/progress").handler(null, withUrl(mkCtx(db, "uB"), "business_id=bB"))).json();
  assert.equal(empty.total, 0); assert.equal(empty.percent, null, "no tasks -> null, not 0%");
  void low; void hi;
});

test("re-audit verification: only a newer audit that ran and passed the check says verified_fixed, and never auto-completes", async () => {
  const db = makeDB(); seed(db); const ctx = mkCtx(db, "uA");
  addAudit(db, "au1", "bA", 1000, [{ code: "profile_hours", severity: "high" }, { code: "site_title", severity: "low" }]);
  const created = (await call("POST", "/api/actions/from-audit", ctx, { audit_id: "au1" })).body.created;
  const hours = created.find((t) => t.finding_key.startsWith("profile_hours")), title = created.find((t) => t.finding_key.startsWith("site_title"));
  const verify = async (id, c = ctx) => (await call("POST", "/api/actions/rerun-audit", c, { id }));
  let r = await verify(hours.id);
  assert.equal(r.body.verification.suggestion, "no_newer_audit");
  assert.deepEqual(r.body.verification.rerun, { method: "POST", path: "/api/audits/run", body: { business_id: "bA" } });
  // newer audit still has the finding
  addAudit(db, "au2", "bA", 2000, [{ code: "profile_hours", severity: "high", evidence: "still missing" }], [{ code: "profile_hours", status: "fail" }, { code: "site_title", status: "unavailable" }]);
  r = await verify(hours.id);
  assert.equal(r.body.verification.suggestion, "still_open"); assert.equal(r.body.verification.finding_still_open, true);
  // finding absent but check unavailable -> cannot verify
  r = await verify(title.id);
  assert.equal(r.body.verification.suggestion, "cannot_verify"); assert.equal(r.body.verification.finding_still_open, null);
  // newer audit where the check passed
  addAudit(db, "au3", "bA", 3000, [], [{ code: "profile_hours", status: "pass", evidence: "hours present" }, { code: "site_title", status: "pass" }]);
  r = await verify(hours.id);
  assert.equal(r.body.verification.suggestion, "verified_fixed"); assert.equal(r.body.verification.finding_still_open, false);
  assert.equal(r.body.verification.latest_audit_id, "au3");
  assert.equal(r.body.task_status, "open", "verification alone never completes a task");
  assert.equal(db.sql.prepare("SELECT status FROM action_tasks WHERE id=?").get(hours.id).status, "open");
  // marking done with a wrong audit id is refused; the right one records verification
  r = await call("POST", "/api/actions/update", ctx, { id: hours.id, status: "done", verified_audit_id: "au2" });
  assert.equal(r.status, 409); assert.equal(r.body.code, "verification_failed");
  r = await call("POST", "/api/actions/update", ctx, { id: title.id, status: "done", verified_audit_id: "au3" });
  assert.equal(r.status, 200); assert.equal(r.body.task.verified_audit_id, "au3"); assert.equal(r.body.task.completed_by, "uA");
  r = await call("POST", "/api/actions/update", ctx, { id: hours.id, status: "done", verified_audit_id: "au2" });
  assert.equal(r.status, 409);
  // an audit that lists the finding as user-fixed is not an automated verification
  addAudit(db, "au4", "bA", 4000, [{ code: "profile_hours", severity: "high", status: "fixed" }]);
  assert.equal((await verify(hours.id)).body.verification.suggestion, "unverified");
  // manual tasks have nothing to verify; other tenants are refused
  const m = await oneTask(db, ctx);
  assert.equal((await verify(m.id)).body.verification.suggestion, "not_applicable");
  assert.equal((await verify(hours.id, mkCtx(db, "uB"))).status, 404);
  // done task is reopened by a later audit that still shows the issue
  await call("POST", "/api/actions/update", ctx, { id: hours.id, status: "done" });
  clock += 10 * 86400000;
  addAudit(db, "au5", "bA", clock + 1, [{ code: "profile_hours", severity: "high" }]);
  r = await call("POST", "/api/actions/from-audit", ctx, { audit_id: "au5" });
  assert.deepEqual(r.body.reopened, [hours.id]);
  assert.equal(db.sql.prepare("SELECT status FROM action_tasks WHERE id=?").get(hours.id).status, "reopened");
});

test("all routes require a session", () => {
  assert.ok(routes.length >= 9);
  assert.ok(routes.every((r) => r.auth === "session"));
});
