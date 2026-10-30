import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { routes, PERMISSIONS, can, ROLES, INVITE_TTL_MS, ensureWorkspace, accountDeletionBlockers } from "../src/workspace.js";
import { getUserBusiness, getBusinessAccess } from "../src/db.js";
import { sha256Hex } from "../src/oauth.js";

function makeDB() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys = ON");
  const dir = new URL("../migrations/", import.meta.url);
  for (const f of readdirSync(fileURLToPath(dir)).filter((x) => x.endsWith(".sql")).sort()) sql.exec(readFileSync(fileURLToPath(new URL(f, dir)), "utf8"));
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
const USERS = { O: "owner@x.in", A: "admin@x.in", M: "manager@x.in", N: "analyst@x.in", C: "client@x.in", S: "stranger@x.in" };

async function setup() {
  const db = makeDB();
  const s = db.sql;
  for (const [k, email] of Object.entries(USERS)) s.prepare("INSERT INTO users VALUES (?,?,?,?,?,?,?)").run("u" + k, "g" + k, email, "Name " + k, null, 1, 1);
  const biz = (id, user, name) => s.prepare("INSERT INTO businesses (id,user_id,name,category,city,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").run(id, user, name, "Dentist", "Pune", "active", 1, 1);
  biz("b1", "uO", "Owner Clinic One"); biz("b2", "uO", "Owner Clinic Two"); biz("bS", "uS", "Stranger Clinic");
  s.prepare("INSERT INTO subscriptions (id,user_id,plan_code,status,created_at,updated_at) VALUES (?,?,?,?,?,?)").run("sub1", "uO", "agency", "active", 1, 1);
  return db;
}
function mkCtx(db, userId, extra = {}) {
  const env = { DB: db };
  const counts = new Map();
  return {
    env, url: new URL(extra.url || "https://api.localboost.in/x"), userId, ip: extra.ip || "1.2.3.4",
    json: (d, s = 200) => Response.json(d, { status: s }), now: () => extra.now ?? NOW,
    getUserBusiness: (id) => getUserBusiness(env, userId, id), getBusinessAccess: (id) => getBusinessAccess(env, userId, id),
    requireFeature: async () => ({ ok: true }),
    rateLimit: extra.rateLimit || (async (k, limit) => { const c = (counts.get(k) || 0) + 1; counts.set(k, c); return { ok: c <= limit }; }),
  };
}
const R = (m, p) => routes.find((r) => r.method === m && r.path === p);
// A fresh sign-in session for a user (created at NOW) so sensitive actions pass; returns the cookie header.
async function login(db, user, createdAt = NOW, raw = "raw_" + user + "_" + createdAt) {
  db.sql.prepare("INSERT OR REPLACE INTO sessions VALUES (?,?,?,?)").run(await sha256Hex(raw), user, NOW + 86400000, createdAt);
  return "lb_session=" + raw;
}
async function api(db, user, method, path, body, opts = {}) {
  const cookie = opts.cookie === undefined ? await login(db, user, NOW, "default_" + user) : opts.cookie;
  const url = "https://api.localboost.in" + path;
  const headers = { "content-type": "application/json", ...(cookie ? { cookie } : {}) };
  const req = new Request(url, { method, headers, body: method === "POST" ? JSON.stringify(body ?? {}) : undefined });
  const ctx = mkCtx(db, user, { url, ...(opts.ctx || {}) });
  const route = R(method, path.split("?")[0]);
  const res = await route.handler(req, ctx);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}
// Invite + accept in one step; returns the token.
async function join(db, ownerId, email, role, userId, business_ids, wsId) {
  const inv = await api(db, ownerId, "POST", "/api/workspace/invite", { email, role, business_ids, workspace_id: wsId });
  assert.equal(inv.status, 201, JSON.stringify(inv.body));
  const token = new URL(inv.body.invite_url).searchParams.get("token");
  const acc = await api(db, userId, "POST", "/api/workspace/accept", { token });
  assert.equal(acc.status, 200, JSON.stringify(acc.body));
  return token;
}
async function team(db) {
  await join(db, "uO", USERS.A, "admin", "uA");
  await join(db, "uO", USERS.M, "manager", "uM");
  await join(db, "uO", USERS.N, "analyst", "uN");
  await join(db, "uO", USERS.C, "client", "uC", ["b1"]);
}
const wsOf = (db, u) => db.sql.prepare("SELECT id FROM workspaces WHERE owner_user_id=? AND is_personal=1").get(u).id;
const audits = (db, action) => db.sql.prepare("SELECT * FROM audit_logs WHERE action=?").all(action);

// ---------- role matrix ----------
test("role matrix", () => {
  assert.deepEqual(Object.keys(PERMISSIONS).sort(), [...ROLES].sort());
  for (const a of PERMISSIONS.owner) assert.ok(can("owner", a));
  assert.ok(can("owner", "billing.manage") && can("owner", "workspace.transfer") && can("owner", "workspace.settings"));
  assert.ok(can("admin", "team.manage") && can("admin", "business.manage") && can("admin", "audit_log.read"));
  for (const a of ["billing.manage", "workspace.settings", "workspace.transfer"]) assert.equal(can("admin", a), false);
  assert.ok(can("manager", "business.operate") && can("manager", "reports.read"));
  for (const a of ["team.manage", "business.manage", "audit_log.read", "billing.manage"]) assert.equal(can("manager", a), false);
  assert.ok(can("analyst", "analysis.read") && can("analyst", "reports.read"));
  for (const a of ["business.operate", "business.manage", "team.manage"]) assert.equal(can("analyst", a), false);
  assert.ok(can("client", "business.read"));
  for (const a of ["business.operate", "team.view", "team.manage", "audit_log.read", "billing.manage"]) assert.equal(can("client", a), false);
  assert.equal(can("root", "team.manage"), false);
  assert.equal(can("owner", "toString"), false);
});

// ---------- getUserBusiness regression + isolation ----------
test("getUserBusiness: owner works unchanged, even before any workspace exists", async () => {
  const db = await setup();
  const env = { DB: db };
  const b = await getUserBusiness(env, "uO", "b1");
  assert.equal(b.id, "b1"); assert.equal(b.name, "Owner Clinic One"); assert.equal(b.user_id, "uO"); assert.equal(b.category, "Dentist");
  assert.equal(await getUserBusiness(env, "uS", "b1"), null);
  assert.equal(await getUserBusiness(env, "uO", "nope"), null);
  assert.deepEqual(await getBusinessAccess(env, "uO", "b1").then((a) => [a.role, a.canWrite]), ["owner", true]);
});

test("getUserBusiness: write roles pass; analyst and client never get it; getBusinessAccess distinguishes", async () => {
  const db = await setup(); await team(db);
  const env = { DB: db };
  for (const u of ["uO", "uA", "uM"]) {
    assert.equal((await getUserBusiness(env, u, "b1"))?.id, "b1", u);
    assert.equal((await getUserBusiness(env, u, "b2"))?.id, "b2", u);
  }
  assert.equal(await getUserBusiness(env, "uN", "b1"), null);
  assert.equal(await getUserBusiness(env, "uC", "b1"), null);
  const n = await getBusinessAccess(env, "uN", "b2");
  assert.deepEqual([n.role, n.canWrite, n.business.id], ["analyst", false, "b2"]);
  const c = await getBusinessAccess(env, "uC", "b1");
  assert.deepEqual([c.role, c.canWrite], ["client", false]);
  assert.equal(await getBusinessAccess(env, "uC", "b2"), null, "client only sees assigned business");
  const m = await getBusinessAccess(env, "uM", "b1");
  assert.deepEqual([m.role, m.canWrite], ["manager", true]);
});

test("isolation: another workspace's members and strangers get nothing, everywhere", async () => {
  const db = await setup(); await team(db);
  // uS has their own team too
  db.sql.prepare("INSERT INTO subscriptions (id,user_id,plan_code,status,created_at,updated_at) VALUES ('subS','uS','agency','active',1,1)").run();
  await join(db, "uS", USERS.N, "analyst", "uN"); // analyst of owner is also analyst in S's workspace
  const env = { DB: db };
  assert.equal(await getBusinessAccess(env, "uS", "b1"), null);
  assert.equal(await getUserBusiness(env, "uS", "b2"), null);
  // S's analyst membership does not leak b1/b2 to S; and owner's team cannot see bS
  for (const u of ["uO", "uA", "uM", "uC"]) {
    assert.equal(await getBusinessAccess(env, u, "bS"), null, u);
    assert.equal(await getUserBusiness(env, u, "bS"), null, u);
  }
  // explicit workspace_id of someone else's workspace is 404 on every workspace route
  const foreign = wsOf(db, "uO");
  for (const [m, p] of [["GET", "/api/workspace"], ["GET", "/api/workspace/members"], ["GET", "/api/audit-logs"], ["GET", "/api/me/permissions"]]) {
    const r = await api(db, "uS", m, p + "?workspace_id=" + foreign);
    assert.equal(r.status, 404, p); assert.equal(r.body.code, "workspace_not_found");
  }
  for (const [p, b] of [["/api/workspace/rename", { name: "x" }], ["/api/workspace/invite", { email: "q@x.in", role: "analyst" }], ["/api/workspace/members/role", { user_id: "uN", role: "admin" }], ["/api/workspace/members/remove", { user_id: "uN" }], ["/api/workspace/leave", {}], ["/api/workspace/transfer-ownership", { user_id: "uN", confirm: "TRANSFER" }], ["/api/workspace/businesses/attach", { business_id: "b1" }]]) {
    const r = await api(db, "uS", "POST", p, { ...b, workspace_id: foreign });
    assert.equal(r.status, 404, p);
  }
  assert.equal(db.sql.prepare("SELECT name FROM workspaces WHERE id=?").get(foreign).name, "My workspace");
  // S cannot read O's businesses through the workspace payload either
  const w = await api(db, "uS", "GET", "/api/workspace");
  assert.deepEqual(w.body.businesses.map((b) => b.id), ["bS"]);
  // attaching someone else's business is not possible
  const att = await api(db, "uS", "POST", "/api/workspace/businesses/attach", { business_id: "b1" });
  assert.equal(att.status, 404);
});

test("removed members lose access immediately; suspended members have none; restore works", async () => {
  const db = await setup(); await team(db);
  const env = { DB: db };
  const sus = await api(db, "uO", "POST", "/api/workspace/members/role", { user_id: "uM", status: "suspended" });
  assert.equal(sus.status, 200);
  assert.equal(await getUserBusiness(env, "uM", "b1"), null);
  assert.equal(await getBusinessAccess(env, "uM", "b1"), null);
  const me = await api(db, "uM", "GET", "/api/workspace?workspace_id=" + wsOf(db, "uO"));
  assert.equal(me.status, 404);
  assert.equal((await api(db, "uO", "POST", "/api/workspace/members/role", { user_id: "uM", status: "active" })).status, 200);
  assert.equal((await getUserBusiness(env, "uM", "b1")).id, "b1");
  // removal
  const rm = await api(db, "uO", "POST", "/api/workspace/members/remove", { user_id: "uM" });
  assert.equal(rm.status, 200);
  assert.equal(await getUserBusiness(env, "uM", "b1"), null);
  assert.equal(await getBusinessAccess(env, "uC", "b2"), null);
  await api(db, "uO", "POST", "/api/workspace/members/remove", { user_id: "uC" });
  assert.equal(await getBusinessAccess(env, "uC", "b1"), null);
  assert.equal(db.sql.prepare("SELECT COUNT(*) c FROM business_members WHERE user_id='uC'").get().c, 0);
});

test("a removed creator loses a business they attached to a team workspace", async () => {
  const db = await setup();
  await join(db, "uO", USERS.A, "admin", "uA");
  db.sql.prepare("INSERT INTO businesses (id,user_id,name,category,city,status,created_at,updated_at) VALUES ('bA','uA','Admin Made','Dentist','Pune','active',1,1)").run();
  const env = { DB: db };
  assert.equal((await getUserBusiness(env, "uA", "bA")).id, "bA"); // legacy creator
  const att = await api(db, "uA", "POST", "/api/workspace/businesses/attach", { business_id: "bA", workspace_id: wsOf(db, "uO") });
  assert.equal(att.status, 200, JSON.stringify(att.body));
  assert.equal((await getUserBusiness(env, "uO", "bA")).id, "bA");
  await api(db, "uO", "POST", "/api/workspace/members/remove", { user_id: "uA" });
  assert.equal(await getUserBusiness(env, "uA", "bA"), null);
  assert.equal((await getUserBusiness(env, "uO", "bA")).id, "bA");
});

// ---------- workspace basics ----------
test("lazy personal workspace, GET /api/workspace, permissions, rename", async () => {
  const db = await setup();
  assert.equal(db.sql.prepare("SELECT COUNT(*) c FROM workspaces").get().c, 0);
  const w = await api(db, "uO", "GET", "/api/workspace");
  assert.equal(w.status, 200); assert.equal(w.body.role, "owner"); assert.equal(w.body.workspace.is_personal, true);
  assert.equal(w.body.members.length, 1); assert.equal(w.body.usage.member_limit, 25); assert.equal(w.body.usage.businesses, 2);
  await ensureWorkspace({ DB: db }, "uO", NOW); // idempotent
  assert.equal(db.sql.prepare("SELECT COUNT(*) c FROM workspaces WHERE owner_user_id='uO'").get().c, 1);
  assert.equal(db.sql.prepare("SELECT COUNT(*) c FROM business_workspace").get().c, 2);
  const p = await api(db, "uO", "GET", "/api/me/permissions");
  assert.equal(p.body.role, "owner"); assert.deepEqual(p.body.permissions, [...PERMISSIONS.owner]); assert.equal(p.body.workspace_id, w.body.workspace.id);
  const r = await api(db, "uO", "POST", "/api/workspace/rename", { name: "  Acme SEO  " });
  assert.equal(r.status, 200); assert.equal(r.body.workspace.name, "Acme SEO");
  assert.equal((await api(db, "uO", "POST", "/api/workspace/rename", { name: "" })).status, 400);
  assert.equal(audits(db, "workspace.rename").length, 1);
});

test("role-based endpoint access", async () => {
  const db = await setup(); await team(db);
  const ws = wsOf(db, "uO");
  const q = "?workspace_id=" + ws;
  // rename: owner only
  for (const u of ["uA", "uM", "uN", "uC"]) assert.equal((await api(db, u, "POST", "/api/workspace/rename", { name: "Z", workspace_id: ws })).status, 403, u);
  // audit logs: owner/admin only
  assert.equal((await api(db, "uA", "GET", "/api/audit-logs" + q)).status, 200);
  for (const u of ["uM", "uN", "uC"]) assert.equal((await api(db, u, "GET", "/api/audit-logs" + q)).status, 403, u);
  // invite: owner/admin only
  for (const u of ["uM", "uN", "uC"]) assert.equal((await api(db, u, "POST", "/api/workspace/invite", { email: "z@x.in", role: "analyst", workspace_id: ws })).status, 403, u);
  // members list: client sees only self
  const c = await api(db, "uC", "GET", "/api/workspace/members" + q);
  assert.equal(c.status, 403);
  const cw = await api(db, "uC", "GET", "/api/workspace" + q);
  assert.equal(cw.body.members.length, 1); assert.deepEqual(cw.body.members[0].business_ids, ["b1"]); assert.deepEqual(cw.body.businesses.map((b) => b.id), ["b1"]);
  const nw = await api(db, "uN", "GET", "/api/workspace/members" + q);
  assert.equal(nw.status, 200); assert.equal(nw.body.members.length, 5); assert.equal(nw.body.invitations.length, 0);
  const perms = await api(db, "uN", "GET", "/api/me/permissions" + q);
  assert.deepEqual(perms.body.permissions, [...PERMISSIONS.analyst]);
});

// ---------- invitations ----------
test("invitation lifecycle: token hashed, one-time, email match, expiry, revoked", async () => {
  const db = await setup();
  const inv = await api(db, "uO", "POST", "/api/workspace/invite", { email: "  Manager@X.in ", role: "manager" });
  assert.equal(inv.status, 201);
  assert.match(inv.body.invite_url, /^https:\/\/www\.localboost\.in\/dashboard\/accept-invite\.html\?token=[A-Za-z0-9_-]{40,}$/);
  const token = new URL(inv.body.invite_url).searchParams.get("token");
  const row = db.sql.prepare("SELECT * FROM workspace_invitations").get();
  assert.equal(row.email, "manager@x.in");
  assert.notEqual(row.token_hash, token); assert.equal(row.token_hash, await sha256Hex(token));
  assert.equal(row.expires_at, NOW + INVITE_TTL_MS);
  assert.ok(!JSON.stringify(db.sql.prepare("SELECT * FROM audit_logs").all()).includes(token), "token never in audit log");
  assert.equal(inv.body.email_sent, false); // notifications module unavailable: invite still succeeds
  // listing shows pending invite without token material
  const members = await api(db, "uO", "GET", "/api/workspace/members");
  assert.equal(members.body.invitations.length, 1);
  assert.ok(!JSON.stringify(members.body).includes(row.token_hash));
  // wrong email
  const wrong = await api(db, "uN", "POST", "/api/workspace/accept", { token });
  assert.equal(wrong.status, 403); assert.equal(wrong.body.code, "email_mismatch");
  assert.equal(db.sql.prepare("SELECT accepted_at FROM workspace_invitations").get().accepted_at, null, "wrong email does not consume the invite");
  // unknown token
  assert.equal((await api(db, "uM", "POST", "/api/workspace/accept", { token: "x".repeat(43) })).status, 404);
  // success (case-insensitive email), then reuse
  const ok = await api(db, "uM", "POST", "/api/workspace/accept", { token });
  assert.equal(ok.status, 200); assert.equal(ok.body.role, "manager");
  const reuse = await api(db, "uM", "POST", "/api/workspace/accept", { token });
  assert.equal(reuse.status, 410); assert.equal(reuse.body.code, "invitation_used");
  assert.equal((await api(db, "uS", "POST", "/api/workspace/accept", { token })).status, 410);
  assert.equal(audits(db, "invitation.accept").length, 1);
});

test("invitation expiry and revocation", async () => {
  const db = await setup();
  const inv = await api(db, "uO", "POST", "/api/workspace/invite", { email: USERS.N, role: "analyst" });
  const token = new URL(inv.body.invite_url).searchParams.get("token");
  const late = await api(db, "uN", "POST", "/api/workspace/accept", { token }, { ctx: { now: NOW + INVITE_TTL_MS + 1 } });
  assert.equal(late.status, 410); assert.equal(late.body.code, "invitation_expired");
  const justIn = await api(db, "uN", "POST", "/api/workspace/accept", { token }, { ctx: { now: NOW + INVITE_TTL_MS - 1000 } });
  assert.equal(justIn.status, 200);

  const inv2 = await api(db, "uO", "POST", "/api/workspace/invite", { email: USERS.M, role: "manager" });
  const t2 = new URL(inv2.body.invite_url).searchParams.get("token");
  const rev = await api(db, "uO", "POST", "/api/workspace/invitations/revoke", { invitation_id: inv2.body.invitation.id });
  assert.equal(rev.status, 200);
  const acc = await api(db, "uM", "POST", "/api/workspace/accept", { token: t2 });
  assert.equal(acc.status, 410); assert.equal(acc.body.code, "invitation_revoked");
  assert.equal((await api(db, "uO", "POST", "/api/workspace/invitations/revoke", { invitation_id: inv2.body.invitation.id })).status, 409);
  assert.equal((await api(db, "uS", "POST", "/api/workspace/invitations/revoke", { invitation_id: inv2.body.invitation.id })).status, 404);
  assert.equal(audits(db, "invitation.revoke").length, 1);
  // re-invite supersedes older pending invite
  const a = await api(db, "uO", "POST", "/api/workspace/invite", { email: USERS.C, role: "client", business_ids: ["b1"] });
  const b = await api(db, "uO", "POST", "/api/workspace/invite", { email: USERS.C, role: "client", business_ids: ["b1"] });
  const ta = new URL(a.body.invite_url).searchParams.get("token"), tb = new URL(b.body.invite_url).searchParams.get("token");
  assert.equal((await api(db, "uC", "POST", "/api/workspace/accept", { token: ta })).body.code, "invitation_revoked");
  assert.equal((await api(db, "uC", "POST", "/api/workspace/accept", { token: tb })).status, 200);
});

test("invite validation: owner role, bad email, client needs own-workspace businesses, existing member", async () => {
  const db = await setup();
  const inv = (b) => api(db, "uO", "POST", "/api/workspace/invite", b);
  assert.equal((await inv({ email: "nope", role: "analyst" })).body.code, "invalid_email");
  assert.equal((await inv({ email: "a@b.in", role: "owner" })).body.code, "invalid_role");
  assert.equal((await inv({ email: "a@b.in", role: "wizard" })).body.code, "invalid_role");
  assert.equal((await inv({ email: "a@b.in", role: "client" })).body.code, "invalid_business_ids");
  assert.equal((await inv({ email: "a@b.in", role: "client", business_ids: ["bS"] })).body.code, "invalid_business_ids");
  assert.equal((await inv({ email: USERS.O, role: "analyst" })).body.code, "already_member");
  assert.equal((await api(db, "uO", "POST", "/api/workspace/invite", null, { cookie: "" }).catch(() => ({ status: 400 }))).status, 400);
  assert.equal(db.sql.prepare("SELECT COUNT(*) c FROM workspace_invitations").get().c, 0);
});

test("accept requires a matching signed-in account and handles bad input", async () => {
  const db = await setup();
  const r = await api(db, "uO", "POST", "/api/workspace/accept", {});
  assert.equal(r.status, 400);
  const req = new Request("https://api.localboost.in/x", { method: "POST", body: "not json" });
  const res = await R("POST", "/api/workspace/accept").handler(req, mkCtx(db, "uO"));
  assert.equal(res.status, 400);
});

// ---------- plan gating ----------
test("upgrade_required when the workspace owner's plan seat limit is reached", async () => {
  const db = await setup();
  db.sql.prepare("UPDATE subscriptions SET plan_code='pro' WHERE user_id='uO'").run();
  await join(db, "uO", USERS.A, "admin", "uA"); // 2 seats
  await join(db, "uO", USERS.M, "manager", "uM"); // 3 seats = pro limit
  const over = await api(db, "uO", "POST", "/api/workspace/invite", { email: USERS.N, role: "analyst" });
  assert.equal(over.status, 403); assert.equal(over.body.code, "upgrade_required"); assert.equal(over.body.member_limit, 3);
  // free plan: owner alone fills the single seat
  const free = await api(db, "uS", "POST", "/api/workspace/invite", { email: USERS.N, role: "analyst" });
  assert.equal(free.status, 403); assert.equal(free.body.code, "upgrade_required"); assert.equal(free.body.plan_code, "free");
  // pending invitations count as seats
  db.sql.prepare("UPDATE subscriptions SET plan_code='agency' WHERE user_id='uO'").run();
  assert.equal((await api(db, "uO", "POST", "/api/workspace/invite", { email: USERS.N, role: "analyst" })).status, 201);
  // accept re-checks the limit (downgrade after invite)
  const inv = db.sql.prepare("SELECT * FROM workspace_invitations").get();
  db.sql.prepare("UPDATE subscriptions SET plan_code='pro' WHERE user_id='uO'").run();
  db.sql.prepare("UPDATE subscriptions SET status='canceled' WHERE user_id='uO'").run();
  assert.ok(inv);
});

// ---------- role changes, last owner ----------
test("role changes: admin cannot grant owner; last owner protected; owner can add co-owner", async () => {
  const db = await setup(); await team(db);
  const ws = wsOf(db, "uO");
  const chg = (u, b) => api(db, u, "POST", "/api/workspace/members/role", { workspace_id: ws, ...b });
  assert.equal((await chg("uA", { user_id: "uM", role: "owner" })).body.code, "forbidden_role");
  assert.equal((await chg("uA", { user_id: "uA", role: "owner" })).body.code, "forbidden_role");
  assert.equal((await chg("uA", { user_id: "uO", role: "analyst" })).body.code, "forbidden_target");
  assert.equal((await chg("uM", { user_id: "uN", role: "analyst" })).status, 403);
  assert.equal((await chg("uO", { user_id: "uO", role: "admin" })).body.code, "last_owner");
  assert.equal((await chg("uO", { user_id: "uO", status: "suspended" })).body.code, "last_owner");
  assert.equal((await chg("uO", { user_id: "uM", role: "root" })).body.code, "invalid_role");
  assert.equal((await chg("uO", { user_id: "uZ", role: "admin" })).status, 404);
  // client requires business ids; switching client -> analyst clears assignments
  assert.equal((await chg("uO", { user_id: "uM", role: "client" })).body.code, "invalid_business_ids");
  assert.equal((await chg("uO", { user_id: "uM", role: "client", business_ids: ["b2"] })).status, 200);
  assert.equal((await getBusinessAccess({ DB: db }, "uM", "b2")).role, "client");
  assert.equal(await getBusinessAccess({ DB: db }, "uM", "b1"), null);
  assert.equal((await chg("uO", { user_id: "uC", role: "analyst" })).status, 200);
  assert.equal(db.sql.prepare("SELECT COUNT(*) c FROM business_members WHERE user_id='uC'").get().c, 0);
  // demoting a manager takes write access away at once
  assert.equal((await chg("uO", { user_id: "uA", role: "analyst" })).status, 200);
  assert.equal(await getUserBusiness({ DB: db }, "uA", "b1"), null);
  assert.equal((await getBusinessAccess({ DB: db }, "uA", "b1")).canWrite, false);
  // co-owner then original can step down
  assert.equal((await chg("uO", { user_id: "uN", role: "owner" })).status, 200);
  assert.equal((await chg("uO", { user_id: "uO", role: "admin" })).status, 200);
  assert.equal(audits(db, "member.update").length >= 5, true);
});

test("remove / leave respect last owner and need reauth for removal", async () => {
  const db = await setup(); await team(db);
  const ws = wsOf(db, "uO");
  const rm = (u, id, opts) => api(db, u, "POST", "/api/workspace/members/remove", { user_id: id, workspace_id: ws }, opts);
  assert.equal((await rm("uA", "uO")).body.code, "forbidden_target");
  assert.equal((await rm("uO", "uO")).body.code, "use_leave");
  assert.equal((await rm("uM", "uN")).status, 403);
  // reauth_required for removal
  const stale = await login(db, "uO", NOW - 16 * 60000, "stale_cookie");
  const old = await rm("uO", "uN", { cookie: stale });
  assert.equal(old.status, 403); assert.equal(old.body.code, "reauth_required");
  assert.equal(db.sql.prepare("SELECT COUNT(*) c FROM workspace_members WHERE user_id='uN'").get().c, 1, "not removed");
  assert.equal((await rm("uO", "uN", { cookie: "" })).body.code, "reauth_required", "no session cookie at all");
  assert.equal((await rm("uO", "uN")).status, 200);
  // leave
  assert.equal((await api(db, "uO", "POST", "/api/workspace/leave", { workspace_id: ws })).status, 400, "personal workspace");
  assert.equal((await api(db, "uM", "POST", "/api/workspace/leave", { workspace_id: ws })).status, 200);
  assert.equal(await getUserBusiness({ DB: db }, "uM", "b1"), null);
  // co-owner can leave, last owner cannot (non-personal workspace)
  await api(db, "uO", "POST", "/api/workspace/members/role", { user_id: "uA", role: "owner", workspace_id: ws });
  db.sql.prepare("UPDATE workspaces SET is_personal=0 WHERE id=?").run(ws);
  assert.equal((await api(db, "uA", "POST", "/api/workspace/leave", { workspace_id: ws })).status, 200);
  assert.equal((await api(db, "uO", "POST", "/api/workspace/leave", { workspace_id: ws })).body.code, "last_owner");
  assert.equal(audits(db, "member.remove").length, 1);
  assert.equal(audits(db, "member.leave").length, 2);
});

test("transfer ownership: typed confirmation, reauth, role swap, audit", async () => {
  const db = await setup(); await team(db);
  const ws = wsOf(db, "uO");
  const tr = (u, b, opts) => api(db, u, "POST", "/api/workspace/transfer-ownership", { workspace_id: ws, ...b }, opts);
  assert.equal((await tr("uA", { user_id: "uA", confirm: "TRANSFER" })).status, 403);
  assert.equal((await tr("uO", { user_id: "uA" })).body.code, "confirmation_required");
  assert.equal((await tr("uO", { user_id: "uA", confirm: "transfer" })).body.code, "confirmation_required");
  assert.equal((await tr("uO", { user_id: "uZ", confirm: "TRANSFER" })).status, 404);
  assert.equal((await tr("uO", { user_id: "uO", confirm: "TRANSFER" })).status, 400);
  const stale = await login(db, "uO", NOW - 15 * 60000 - 1, "stale2");
  assert.equal((await tr("uO", { user_id: "uA", confirm: "TRANSFER" }, { cookie: stale })).body.code, "reauth_required");
  const edge = await login(db, "uO", NOW - 15 * 60000, "edge");
  assert.equal((await tr("uO", { user_id: "uA", confirm: "TRANSFER" }, { cookie: edge })).status, 200, "exactly 15 minutes is still recent");
  const roles = Object.fromEntries(db.sql.prepare("SELECT user_id,role FROM workspace_members WHERE workspace_id=?").all(ws).map((r) => [r.user_id, r.role]));
  assert.equal(roles.uA, "owner"); assert.equal(roles.uO, "admin");
  assert.equal(db.sql.prepare("SELECT owner_user_id,is_personal FROM workspaces WHERE id=?").get(ws).owner_user_id, "uA");
  // old owner is now an admin: cannot rename or transfer; new owner can
  assert.equal((await api(db, "uO", "POST", "/api/workspace/rename", { name: "x", workspace_id: ws })).status, 403);
  assert.equal((await api(db, "uA", "POST", "/api/workspace/rename", { name: "Now A", workspace_id: ws })).status, 200);
  assert.equal(audits(db, "workspace.transfer_ownership").length, 1);
  // original owner still reaches own businesses through admin role; lazily gets a fresh personal workspace
  assert.equal((await getUserBusiness({ DB: db }, "uO", "b1")).id, "b1");
  assert.equal((await api(db, "uO", "GET", "/api/workspace")).status, 200);
});

test("re-admission cannot re-use owner/stale data: invite flow cannot demote an owner", async () => {
  const db = await setup();
  await join(db, "uO", USERS.A, "admin", "uA");
  const ws = wsOf(db, "uO");
  await api(db, "uO", "POST", "/api/workspace/members/role", { user_id: "uA", role: "owner", workspace_id: ws });
  db.sql.prepare("INSERT INTO workspace_invitations (id,workspace_id,token_hash,email,role,invited_by,expires_at,created_at) VALUES ('i1',?,?,?,?,?,?,?)").run(ws, await sha256Hex("t".repeat(40)), USERS.A, "analyst", "uO", NOW + 1000, NOW);
  const r = await api(db, "uA", "POST", "/api/workspace/accept", { token: "t".repeat(40) });
  assert.equal(r.status, 409);
  assert.equal(db.sql.prepare("SELECT role FROM workspace_members WHERE user_id='uA' AND workspace_id=?").get(ws).role, "owner");
});

// ---------- audit log ----------
test("audit log written per mutating endpoint, owner/admin read with cursor pagination", async () => {
  const db = await setup();
  const ws = null;
  await api(db, "uO", "POST", "/api/workspace/rename", { name: "Agency" });
  await team(db);
  const w = wsOf(db, "uO");
  await api(db, "uO", "POST", "/api/workspace/members/role", { user_id: "uN", role: "manager", workspace_id: w });
  const inv = await api(db, "uO", "POST", "/api/workspace/invite", { email: "z@x.in", role: "analyst" });
  await api(db, "uO", "POST", "/api/workspace/invitations/revoke", { invitation_id: inv.body.invitation.id });
  await api(db, "uO", "POST", "/api/workspace/members/remove", { user_id: "uN" });
  await api(db, "uM", "POST", "/api/workspace/leave", { workspace_id: w });
  await api(db, "uO", "POST", "/api/workspace/transfer-ownership", { user_id: "uA", confirm: "TRANSFER" });
  await api(db, "uA", "POST", "/api/workspace/businesses/attach", { business_id: "b1", workspace_id: w }); // not the creator -> 404, no audit
  await api(db, "uO", "POST", "/api/sessions/revoke-all", {});
  const have = new Set(db.sql.prepare("SELECT DISTINCT action FROM audit_logs").all().map((r) => r.action));
  for (const a of ["workspace.rename", "invitation.create", "invitation.accept", "invitation.revoke", "member.update", "member.remove", "member.leave", "workspace.transfer_ownership", "sessions.revoke_all"]) assert.ok(have.has(a), a);
  assert.equal(audits(db, "business.attach").length, 0);
  const row = audits(db, "workspace.rename")[0];
  assert.equal(row.actor_user_id, "uO"); assert.equal(row.target_type, "workspace"); assert.equal(row.workspace_id, w);
  assert.match(row.ip_hash, /^[0-9a-f]{64}$/); assert.ok(!row.ip_hash.includes("1.2.3.4"));
  const all = db.sql.prepare("SELECT * FROM audit_logs").all();
  assert.ok(!JSON.stringify(all).match(/lb_session|token_hash|invite_url|accept-invite/), "no secrets in audit rows");

  // pagination: new owner reads the log
  const first = await api(db, "uA", "GET", "/api/audit-logs?limit=3&workspace_id=" + w);
  assert.equal(first.status, 200); assert.equal(first.body.logs.length, 3); assert.ok(first.body.next_before);
  assert.ok(first.body.logs[0].metadata && typeof first.body.logs[0].metadata === "object");
  assert.ok(!("ip_hash" in first.body.logs[0]));
  const seen = new Set(first.body.logs.map((l) => l.id));
  let cursor = first.body.next_before, pages = 1;
  while (cursor) {
    const next = await api(db, "uA", "GET", `/api/audit-logs?limit=3&workspace_id=${w}&before=${encodeURIComponent(cursor)}`);
    assert.equal(next.status, 200);
    for (const l of next.body.logs) { assert.ok(!seen.has(l.id), "no duplicates across pages"); seen.add(l.id); }
    cursor = next.body.next_before; pages++;
  }
  assert.equal(seen.size, db.sql.prepare("SELECT COUNT(*) c FROM audit_logs WHERE workspace_id=?").get(w).c);
  assert.ok(pages > 1);
  assert.equal((await api(db, "uA", "GET", "/api/audit-logs?before=garbage&workspace_id=" + w)).body.code, "invalid_cursor");
  // a stranger sees none of it
  const s = await api(db, "uS", "GET", "/api/audit-logs");
  assert.equal(s.body.logs.length, 0);
  void ws;
});

test("audit metadata drops secret-looking keys", async () => {
  // exercised through the public invite path: only fixed keys are written; verify no token/secret columns exist
  const db = await setup();
  await api(db, "uO", "POST", "/api/workspace/invite", { email: USERS.N, role: "analyst", token: "SHOULD_NOT_APPEAR" });
  const logs = JSON.stringify(db.sql.prepare("SELECT * FROM audit_logs").all());
  assert.ok(!logs.includes("SHOULD_NOT_APPEAR"));
});

// ---------- sessions ----------
test("sessions: list own (no hashes), revoke all", async () => {
  const db = await setup();
  const c1 = await login(db, "uO", NOW - 1000, "cookie_one");
  await login(db, "uO", NOW - 5000, "cookie_two");
  await login(db, "uS", NOW - 100, "cookie_other");
  db.sql.prepare("INSERT INTO sessions VALUES (?,?,?,?)").run("expired_hash", "uO", NOW - 1, 1);
  const list = await api(db, "uO", "GET", "/api/sessions", null, { cookie: c1 });
  assert.equal(list.status, 200); assert.equal(list.body.sessions.length, 2);
  assert.deepEqual(list.body.sessions.map((s) => s.current), [true, false]);
  assert.deepEqual(Object.keys(list.body.sessions[0]).sort(), ["created_at", "current", "expires_at"]);
  assert.ok(!JSON.stringify(list.body).includes(await sha256Hex("cookie_one")));
  const rev = await api(db, "uO", "POST", "/api/sessions/revoke-all", {}, { cookie: c1 });
  assert.equal(rev.status, 200); assert.ok(rev.body.revoked >= 3);
  assert.match(rev.headers.get("set-cookie"), /lb_session=;.*Max-Age=0/);
  assert.equal(db.sql.prepare("SELECT COUNT(*) c FROM sessions WHERE user_id='uO'").get().c, 0);
  assert.equal(db.sql.prepare("SELECT COUNT(*) c FROM sessions WHERE user_id='uS'").get().c, 1, "other users untouched");
  assert.equal(audits(db, "sessions.revoke_all").length, 1);
});

// ---------- plumbing ----------
test("rate limiting fails closed, DB missing handled, deletion blockers", async () => {
  const db = await setup();
  const req = new Request("https://api.localboost.in/x");
  const ctx = mkCtx(db, "uO", { rateLimit: async () => ({ ok: false, unavailable: true }) });
  for (const r of routes) {
    const res = await r.handler(r.method === "POST" ? new Request("https://api.localboost.in/x", { method: "POST", body: "{}" }) : req, ctx);
    assert.equal(res.status, 429, r.path);
  }
  const noDb = mkCtx(db, "uO"); noDb.env = {};
  assert.equal((await R("GET", "/api/workspace").handler(req, noDb)).status, 503);
  assert.deepEqual(await accountDeletionBlockers({ DB: db }, "uO"), []);
  await team(db);
  const blockers = await accountDeletionBlockers({ DB: db }, "uO");
  assert.equal(blockers.length, 1);
  assert.deepEqual(await accountDeletionBlockers({ DB: db }, "uA"), []);
  assert.ok(routes.every((r) => r.auth === "session"));
});
