// Workspace module: workspaces, team roles, invitations, audit log, session management.
// Contract: ../../docs/api/workspace.md. Workers-compatible only (WebCrypto, no Node APIs).
// Tenant isolation: every query is scoped by workspace_id taken from a membership row of the signed-in
// user (never from the request alone); non-members always get 404, never 403, so ids cannot be probed.
import { sha256Hex } from "./oauth.js";
import { getSubscriptionEntitlements, getBusinessAccess } from "./db.js";

const DAY_MS = 86400000;
export const INVITE_TTL_MS = 7 * DAY_MS;
export const REAUTH_WINDOW_MS = 15 * 60 * 1000;
export const INVITE_BASE_URL = "https://www.localboost.in/dashboard/accept-invite.html";
export const ROLES = ["owner", "admin", "manager", "analyst", "client"];
const INVITABLE = ["admin", "manager", "analyst", "client"];
const WRITE_ROLES = ["owner", "admin", "manager"];

// Seats (active members + pending invitations) per plan, counted against the WORKSPACE OWNER's plan.
export const MEMBER_LIMITS = { free: 1, pro: 3, agency: 25 };

// ---------- role matrix ----------
// owner   : everything, incl. billing, workspace settings, ownership transfer.
// admin   : businesses + team management + audit log; NOT billing/settings/ownership transfer.
// manager : business operations (audits, scans, review replies with confirmation, reports).
// analyst : read-only analysis and reports (all workspace businesses).
// client  : read-only, assigned businesses only (business_members).
const ALL_READ = ["business.read", "analysis.read", "reports.read"];
export const PERMISSIONS = Object.freeze({
  owner: Object.freeze(["billing.manage", "workspace.settings", "workspace.transfer", "team.view", "team.manage", "audit_log.read", "business.manage", "business.operate", ...ALL_READ]),
  admin: Object.freeze(["team.view", "team.manage", "audit_log.read", "business.manage", "business.operate", ...ALL_READ]),
  manager: Object.freeze(["team.view", "business.operate", ...ALL_READ]),
  analyst: Object.freeze(["team.view", ...ALL_READ]),
  client: Object.freeze([...ALL_READ]),
});
export function can(role, action) {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, role) && PERMISSIONS[role].includes(action);
}

// ---------- helpers ----------
const SECRET_KEY = /token|secret|password|authorization|cookie|api_?key|ciphertext/i;
const newId = (p) => p + "_" + crypto.randomUUID().replaceAll("-", "");
const noStore = { "cache-control": "no-store" };
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const safeJson = (s, f) => { try { return s ? JSON.parse(s) : f; } catch { return f; } };
const err = (ctx, status, code, error, extra = {}) => ctx.json({ error, code, ...extra }, status);

async function sessionHash(request) {
  const m = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)lb_session=([^;]+)/);
  if (!m) return null;
  try { return await sha256Hex(decodeURIComponent(m[1])); } catch { return null; }
}

/** Sensitive-action gate: null when the current session was created <= 15 minutes ago, else a 403 Response. */
export async function requireRecentAuth(ctx, request) {
  const h = await sessionHash(request);
  const row = h ? await ctx.env.DB.prepare("SELECT created_at FROM sessions WHERE id_hash=? AND user_id=? LIMIT 1").bind(h, ctx.userId).first() : null;
  if (!row || ctx.now() - Number(row.created_at) > REAUTH_WINDOW_MS) {
    return ctx.json({ error: "Please sign in again to confirm this action.", code: "reauth_required", reauth_url: "/auth/google/start", max_age_seconds: REAUTH_WINDOW_MS / 1000 }, 403);
  }
  return null;
}

/** For POST /api/account/delete: workspaces with other members that the user solely owns must be transferred first. */
export async function accountDeletionBlockers(env, userId) {
  const rows = await env.DB.prepare(
    `SELECT w.id, w.name FROM workspaces w WHERE w.owner_user_id=? AND
       EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id=w.id AND m.user_id<>?) AND
       (SELECT COUNT(*) FROM workspace_members o WHERE o.workspace_id=w.id AND o.role='owner' AND o.status='active' AND o.user_id<>?)=0`
  ).bind(userId, userId, userId).all();
  return rows.results || [];
}

async function writeAudit(ctx, workspaceId, action, targetType, targetId, metadata) {
  try {
    const md = {};
    for (const [k, v] of Object.entries(metadata || {})) {
      if (SECRET_KEY.test(k)) continue;
      if (v === null || ["string", "number", "boolean"].includes(typeof v) || Array.isArray(v)) md[k] = typeof v === "string" ? v.slice(0, 300) : v;
    }
    const ipHash = await sha256Hex((ctx.ip || "unknown") + ":" + (ctx.env.AUDIT_IP_SALT || "lb-audit"));
    await ctx.env.DB.prepare(
      "INSERT INTO audit_logs (id,workspace_id,actor_user_id,action,target_type,target_id,metadata_json,ip_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?)"
    ).bind(newId("aud"), workspaceId || null, ctx.userId, action, targetType || null, targetId || null, JSON.stringify(md), ipHash, ctx.now()).run();
  } catch {
    console.error("audit_log_write_failed", action); // never log metadata/tokens
  }
}

/** Lazily creates the user's personal workspace + owner membership and maps their unmapped businesses to it. */
export async function ensureWorkspace(env, userId, now = Date.now()) {
  const DB = env.DB;
  let ws = await DB.prepare("SELECT * FROM workspaces WHERE owner_user_id=? AND is_personal=1 LIMIT 1").bind(userId).first();
  if (!ws) {
    await DB.prepare("INSERT OR IGNORE INTO workspaces (id,name,owner_user_id,is_personal,created_at) VALUES (?,?,?,1,?)").bind(newId("ws"), "My workspace", userId, now).run();
    ws = await DB.prepare("SELECT * FROM workspaces WHERE owner_user_id=? AND is_personal=1 LIMIT 1").bind(userId).first();
    await DB.prepare("INSERT OR IGNORE INTO workspace_members (workspace_id,user_id,role,status,invited_by,created_at) VALUES (?,?,?,?,?,?)").bind(ws.id, userId, "owner", "active", null, now).run();
  }
  await DB.prepare("INSERT OR IGNORE INTO business_workspace (business_id,workspace_id) SELECT id, ? FROM businesses WHERE user_id=?").bind(ws.id, userId).run();
  return ws;
}

/** The workspace the caller is acting in: explicit workspace_id (must be an ACTIVE membership) or the personal one. */
async function resolveWorkspace(ctx, requestedId) {
  const personal = await ensureWorkspace(ctx.env, ctx.userId, ctx.now());
  const wsId = requestedId || personal.id;
  if (typeof wsId !== "string") return null;
  const row = await ctx.env.DB.prepare(
    "SELECT w.id,w.name,w.owner_user_id,w.is_personal,w.created_at,m.role,m.status FROM workspaces w JOIN workspace_members m ON m.workspace_id=w.id WHERE w.id=? AND m.user_id=? LIMIT 1"
  ).bind(wsId, ctx.userId).first();
  if (!row || row.status !== "active") return null;
  return row;
}

async function workspaceBusinesses(env, ws) {
  const r = await env.DB.prepare(
    `SELECT b.id,b.name,b.city,b.status FROM businesses b LEFT JOIN business_workspace bw ON bw.business_id=b.id
     WHERE bw.workspace_id=? OR (bw.business_id IS NULL AND ?=1 AND b.user_id=?) ORDER BY b.created_at,b.id`
  ).bind(ws.id, ws.is_personal ? 1 : 0, ws.owner_user_id).all();
  return r.results || [];
}

async function memberLimit(env, ws) {
  const ent = await getSubscriptionEntitlements(env, ws.owner_user_id);
  const limit = MEMBER_LIMITS[ent.plan_code] ?? MEMBER_LIMITS.free;
  return { plan_code: ent.plan_code, limit };
}
async function seatCounts(env, wsId, now, exceptEmail = null) {
  const m = await env.DB.prepare("SELECT COUNT(*) AS c FROM workspace_members WHERE workspace_id=?").bind(wsId).first();
  const p = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM workspace_invitations WHERE workspace_id=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>? AND email<>?"
  ).bind(wsId, now, exceptEmail || "").first();
  return { members: Number(m?.c || 0), pending: Number(p?.c || 0) };
}
const upgrade = (ctx, plan, limit) => err(ctx, 403, "upgrade_required", `Your plan allows ${limit} team member${limit === 1 ? "" : "s"}. Upgrade to add more.`, { feature: "team_members", plan_code: plan, member_limit: limit });

async function validateBusinessIds(env, ws, ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some((x) => typeof x !== "string")) return null;
  const allowed = new Set((await workspaceBusinesses(env, ws)).map((b) => b.id));
  const uniq = [...new Set(ids)];
  return uniq.every((x) => allowed.has(x)) ? uniq : null;
}

async function listMembers(env, ws, onlyUserId = null) {
  const r = await env.DB.prepare(
    `SELECT m.user_id,u.email,u.name,m.role,m.status,m.invited_by,m.created_at FROM workspace_members m JOIN users u ON u.id=m.user_id
     WHERE m.workspace_id=? ${onlyUserId ? "AND m.user_id=?" : ""} ORDER BY m.created_at,m.user_id`
  ).bind(...(onlyUserId ? [ws.id, onlyUserId] : [ws.id])).all();
  const members = r.results || [];
  const bm = await env.DB.prepare("SELECT user_id,business_id FROM business_members WHERE workspace_id=?").bind(ws.id).all();
  const byUser = new Map();
  for (const x of bm.results || []) byUser.set(x.user_id, [...(byUser.get(x.user_id) || []), x.business_id]);
  return members.map((m) => ({ ...m, ...(m.role === "client" ? { business_ids: byUser.get(m.user_id) || [] } : {}) }));
}

async function activeOwners(env, wsId) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS c FROM workspace_members WHERE workspace_id=? AND role='owner' AND status='active'").bind(wsId).first();
  return Number(r?.c || 0);
}

// ---------- route plumbing ----------
// opts: bucket, limit, perm (action required in the workspace), reauth, noWorkspace, post (parse JSON body)
function route(method, path, opts, fn) {
  return {
    method, path, auth: "session",
    async handler(request, ctx) {
      if (!ctx.env.DB) return err(ctx, 503, "database_unavailable", "Database unavailable");
      const rl = await ctx.rateLimit(`ws:${opts.bucket}:${ctx.userId}`, opts.limit || 60, opts.windowMs || 60000);
      if (!rl.ok) return err(ctx, 429, "rate_limited", "Too many requests. Try again shortly.");
      let body = {};
      if (method === "POST") {
        try { body = await request.json(); } catch { body = null; }
        if (!body || typeof body !== "object" || Array.isArray(body)) return err(ctx, 400, "invalid_json", "A JSON object body is required.");
      }
      if (opts.noWorkspace) return fn({ ctx, request, body });
      const ws = await resolveWorkspace(ctx, method === "POST" ? body.workspace_id : ctx.url.searchParams.get("workspace_id"));
      if (!ws) return err(ctx, 404, "workspace_not_found", "Workspace not found");
      if (opts.perm && !can(ws.role, opts.perm)) return err(ctx, 403, "forbidden", "Your role does not allow this action.", { required: opts.perm });
      if (opts.reauth) { const r = await requireRecentAuth(ctx, request); if (r) return r; }
      return fn({ ctx, request, body, ws, role: ws.role });
    },
  };
}

const wsView = (ws) => ({ id: ws.id, name: ws.name, owner_user_id: ws.owner_user_id, is_personal: !!ws.is_personal, created_at: ws.created_at });
const ok = (ctx, data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...noStore } });

// ---------- handlers ----------
async function getWorkspace({ ctx, ws, role }) {
  const full = can(role, "team.view");
  const members = await listMembers(ctx.env, ws, full ? null : ctx.userId);
  let businesses = await workspaceBusinesses(ctx.env, ws);
  if (role === "client") {
    const mine = new Set(((members[0] || {}).business_ids) || []);
    businesses = businesses.filter((b) => mine.has(b.id));
  }
  const { plan_code, limit } = await memberLimit(ctx.env, ws);
  const seats = await seatCounts(ctx.env, ws.id, ctx.now());
  const mine = await ctx.env.DB.prepare(
    "SELECT w.id,w.name,w.is_personal,m.role FROM workspace_members m JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=? AND m.status='active' ORDER BY w.created_at,w.id"
  ).bind(ctx.userId).all();
  return ok(ctx, {
    workspace: wsView(ws), role, members, businesses,
    usage: { members: seats.members, pending_invitations: seats.pending, member_limit: limit, plan_code, businesses: businesses.length },
    workspaces: (mine.results || []).map((w) => ({ id: w.id, name: w.name, is_personal: !!w.is_personal, role: w.role })),
  });
}

async function rename({ ctx, body, ws }) {
  const name = typeof body.name === "string" ? body.name.replace(/[\u0000-\u001f\u007f]/g, "").trim() : "";
  if (name.length < 1 || name.length > 80) return err(ctx, 400, "invalid_name", "name must be 1-80 characters");
  await ctx.env.DB.prepare("UPDATE workspaces SET name=? WHERE id=?").bind(name, ws.id).run();
  await writeAudit(ctx, ws.id, "workspace.rename", "workspace", ws.id, { from: ws.name, to: name });
  return ok(ctx, { workspace: wsView({ ...ws, name }) });
}

async function getMembers({ ctx, ws, role }) {
  const members = await listMembers(ctx.env, ws, can(role, "team.view") ? null : ctx.userId);
  let invitations = [];
  if (can(role, "team.manage")) {
    const r = await ctx.env.DB.prepare(
      "SELECT id,email,role,business_ids_json,invited_by,expires_at,created_at FROM workspace_invitations WHERE workspace_id=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>? ORDER BY created_at DESC"
    ).bind(ws.id, ctx.now()).all();
    invitations = (r.results || []).map(({ business_ids_json, ...i }) => ({ ...i, ...(i.role === "client" ? { business_ids: safeJson(business_ids_json, []) } : {}) }));
  }
  return ok(ctx, { workspace_id: ws.id, role, members, invitations });
}

async function sendInviteEmail(env, to, workspaceName, inviteUrl) {
  try {
    const mod = await import("./notifications.js");
    if (typeof mod.sendEmail !== "function") return false;
    const res = await mod.sendEmail(env, {
      to, subject: `You have been invited to ${workspaceName} on LocalBoost`,
      text: `You have been invited to join the "${workspaceName}" workspace on LocalBoost.\n\nAccept the invitation (valid for 7 days, sign in with this email address):\n${inviteUrl}\n`,
    });
    return res?.state === "sent";
  } catch { return false; }
}

async function invite({ ctx, body, ws, role }) {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) return err(ctx, 400, "invalid_email", "A valid email is required.");
  if (typeof body.role !== "string" || !INVITABLE.includes(body.role)) return err(ctx, 400, "invalid_role", "role must be one of admin, manager, analyst, client. Use ownership transfer to change the owner.");
  let businessIds = null;
  if (body.role === "client") {
    businessIds = await validateBusinessIds(ctx.env, ws, body.business_ids);
    if (!businessIds) return err(ctx, 400, "invalid_business_ids", "client invitations need business_ids that belong to this workspace.");
  }
  const rl = await ctx.rateLimit(`ws:invite-hour:${ctx.userId}`, 30, 3600000);
  if (!rl.ok) return err(ctx, 429, "rate_limited", "Too many invitations. Try again later.");
  const existing = await ctx.env.DB.prepare("SELECT 1 AS x FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? AND lower(u.email)=? LIMIT 1").bind(ws.id, email).first();
  if (existing) return err(ctx, 409, "already_member", "That person is already a member.");
  const { plan_code, limit } = await memberLimit(ctx.env, ws);
  const seats = await seatCounts(ctx.env, ws.id, ctx.now(), email);
  if (seats.members + seats.pending >= limit) return upgrade(ctx, plan_code, limit);

  const now = ctx.now();
  // Re-inviting the same email supersedes any pending invitation.
  await ctx.env.DB.prepare("UPDATE workspace_invitations SET revoked_at=? WHERE workspace_id=? AND email=? AND accepted_at IS NULL AND revoked_at IS NULL").bind(now, ws.id, email).run();
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const inv = { id: newId("inv"), email, role: body.role, expires_at: now + INVITE_TTL_MS, created_at: now };
  await ctx.env.DB.prepare(
    "INSERT INTO workspace_invitations (id,workspace_id,token_hash,email,role,business_ids_json,invited_by,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)"
  ).bind(inv.id, ws.id, await sha256Hex(token), email, inv.role, businessIds ? JSON.stringify(businessIds) : null, ctx.userId, inv.expires_at, now).run();
  const inviteUrl = `${INVITE_BASE_URL}?token=${encodeURIComponent(token)}`;
  const emailSent = await sendInviteEmail(ctx.env, email, ws.name, inviteUrl);
  await writeAudit(ctx, ws.id, "invitation.create", "invitation", inv.id, { email, role: inv.role, business_ids: businessIds, email_sent: emailSent, by_role: role });
  return ok(ctx, { invitation: inv, invite_url: inviteUrl, email_sent: emailSent, note: "The invite link is shown only once." }, 201);
}

async function revokeInvitation({ ctx, body, ws }) {
  if (typeof body.invitation_id !== "string") return err(ctx, 400, "invalid_request", "invitation_id is required.");
  const inv = await ctx.env.DB.prepare("SELECT id,email,role,accepted_at,revoked_at FROM workspace_invitations WHERE id=? AND workspace_id=? LIMIT 1").bind(body.invitation_id, ws.id).first();
  if (!inv) return err(ctx, 404, "invitation_not_found", "Invitation not found");
  if (inv.accepted_at || inv.revoked_at) return err(ctx, 409, "invitation_not_pending", "Invitation is no longer pending.");
  await ctx.env.DB.prepare("UPDATE workspace_invitations SET revoked_at=? WHERE id=? AND workspace_id=? AND accepted_at IS NULL AND revoked_at IS NULL").bind(ctx.now(), inv.id, ws.id).run();
  await writeAudit(ctx, ws.id, "invitation.revoke", "invitation", inv.id, { email: inv.email, role: inv.role });
  return ok(ctx, { ok: true });
}

async function acceptInvitation({ ctx, body }) {
  const ipRl = await ctx.rateLimit(`ws:accept-ip:${ctx.ip}`, 30, 3600000);
  if (!ipRl.ok) return err(ctx, 429, "rate_limited", "Too many attempts. Try again later.");
  if (typeof body.token !== "string" || body.token.length < 20 || body.token.length > 200) return err(ctx, 400, "invalid_token", "token is required.");
  const DB = ctx.env.DB, now = ctx.now();
  const inv = await DB.prepare("SELECT * FROM workspace_invitations WHERE token_hash=? LIMIT 1").bind(await sha256Hex(body.token)).first();
  if (!inv) return err(ctx, 404, "invitation_not_found", "Invitation not found");
  if (inv.revoked_at) return err(ctx, 410, "invitation_revoked", "This invitation was revoked.");
  if (inv.accepted_at) return err(ctx, 410, "invitation_used", "This invitation was already used.");
  if (inv.expires_at <= now) return err(ctx, 410, "invitation_expired", "This invitation has expired. Ask for a new one.");
  const user = await DB.prepare("SELECT email FROM users WHERE id=? LIMIT 1").bind(ctx.userId).first();
  if (!user || String(user.email).trim().toLowerCase() !== inv.email) {
    return err(ctx, 403, "email_mismatch", "Sign in with the Google account this invitation was sent to.");
  }
  const ws = await DB.prepare("SELECT id,name,owner_user_id,is_personal,created_at FROM workspaces WHERE id=? LIMIT 1").bind(inv.workspace_id).first();
  if (!ws) return err(ctx, 404, "invitation_not_found", "Invitation not found");
  const already = await DB.prepare("SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=? LIMIT 1").bind(ws.id, ctx.userId).first();
  if (already?.role === "owner") return err(ctx, 409, "already_member", "You are already a member of this workspace.");
  if (!already) {
    const { plan_code, limit } = await memberLimit(ctx.env, ws);
    const m = await seatCounts(ctx.env, ws.id, now);
    if (m.members >= limit) return upgrade(ctx, plan_code, limit);
  }
  // One-time use: the conditional UPDATE is the lock.
  const claim = await DB.prepare("UPDATE workspace_invitations SET accepted_at=?, accepted_by=? WHERE id=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>?").bind(now, ctx.userId, inv.id, now).run();
  if (Number(claim.meta?.changes || 0) !== 1) return err(ctx, 410, "invitation_used", "This invitation was already used.");
  await DB.prepare(
    "INSERT INTO workspace_members (workspace_id,user_id,role,status,invited_by,created_at) VALUES (?,?,?,'active',?,?) ON CONFLICT(workspace_id,user_id) DO UPDATE SET role=excluded.role, status='active'"
  ).bind(ws.id, ctx.userId, inv.role, inv.invited_by, now).run();
  await DB.prepare("DELETE FROM business_members WHERE workspace_id=? AND user_id=?").bind(ws.id, ctx.userId).run();
  if (inv.role === "client") {
    const wanted = safeJson(inv.business_ids_json, []);
    const allowed = new Set((await workspaceBusinesses(ctx.env, ws)).map((b) => b.id));
    for (const bid of wanted) {
      if (allowed.has(bid)) await DB.prepare("INSERT OR IGNORE INTO business_members (workspace_id,business_id,user_id,created_at) VALUES (?,?,?,?)").bind(ws.id, bid, ctx.userId, now).run();
    }
  }
  await writeAudit(ctx, ws.id, "invitation.accept", "invitation", inv.id, { role: inv.role });
  return ok(ctx, { ok: true, workspace_id: ws.id, workspace_name: ws.name, role: inv.role });
}

async function changeRole({ ctx, body, ws, role }) {
  if (typeof body.user_id !== "string") return err(ctx, 400, "invalid_request", "user_id is required.");
  const hasRole = body.role !== undefined, hasStatus = body.status !== undefined;
  if (!hasRole && !hasStatus) return err(ctx, 400, "invalid_request", "role or status is required.");
  if (hasRole && (typeof body.role !== "string" || !ROLES.includes(body.role))) return err(ctx, 400, "invalid_role", "Unknown role.");
  if (hasStatus && !["active", "suspended"].includes(body.status)) return err(ctx, 400, "invalid_status", "status must be active or suspended.");
  const target = await ctx.env.DB.prepare("SELECT user_id,role,status FROM workspace_members WHERE workspace_id=? AND user_id=? LIMIT 1").bind(ws.id, body.user_id).first();
  if (!target) return err(ctx, 404, "member_not_found", "Member not found");
  const newRole = hasRole ? body.role : target.role, newStatus = hasStatus ? body.status : target.status;
  if (newRole === "owner" && role !== "owner") return err(ctx, 403, "forbidden_role", "Only an owner can grant the owner role.");
  if (target.role === "owner" && role !== "owner") return err(ctx, 403, "forbidden_target", "Only an owner can change an owner.");
  if (role === "admin" && target.role === "admin" && target.user_id !== ctx.userId) return err(ctx, 403, "forbidden_target", "Admins cannot change other admins.");
  if (target.role === "owner" && target.status === "active" && (newRole !== "owner" || newStatus !== "active") && (await activeOwners(ctx.env, ws.id)) <= 1) {
    return err(ctx, 409, "last_owner", "A workspace must keep at least one active owner. Transfer ownership first.");
  }
  let businessIds = null;
  if (newRole === "client") {
    if (body.business_ids !== undefined || target.role !== "client") {
      businessIds = await validateBusinessIds(ctx.env, ws, body.business_ids);
      if (!businessIds) return err(ctx, 400, "invalid_business_ids", "client role needs business_ids that belong to this workspace.");
    }
  }
  const DB = ctx.env.DB;
  await DB.prepare("UPDATE workspace_members SET role=?, status=? WHERE workspace_id=? AND user_id=?").bind(newRole, newStatus, ws.id, target.user_id).run();
  if (newRole !== "client") await DB.prepare("DELETE FROM business_members WHERE workspace_id=? AND user_id=?").bind(ws.id, target.user_id).run();
  else if (businessIds) {
    await DB.prepare("DELETE FROM business_members WHERE workspace_id=? AND user_id=?").bind(ws.id, target.user_id).run();
    for (const bid of businessIds) await DB.prepare("INSERT OR IGNORE INTO business_members (workspace_id,business_id,user_id,created_at) VALUES (?,?,?,?)").bind(ws.id, bid, target.user_id, ctx.now()).run();
  }
  await writeAudit(ctx, ws.id, "member.update", "user", target.user_id, { from_role: target.role, to_role: newRole, from_status: target.status, to_status: newStatus, business_ids: businessIds });
  return ok(ctx, { ok: true, user_id: target.user_id, role: newRole, status: newStatus });
}

async function removeMember({ ctx, body, ws, role }) {
  if (typeof body.user_id !== "string") return err(ctx, 400, "invalid_request", "user_id is required.");
  if (body.user_id === ctx.userId) return err(ctx, 400, "use_leave", "Use /api/workspace/leave to leave a workspace.");
  const target = await ctx.env.DB.prepare("SELECT user_id,role,status FROM workspace_members WHERE workspace_id=? AND user_id=? LIMIT 1").bind(ws.id, body.user_id).first();
  if (!target) return err(ctx, 404, "member_not_found", "Member not found");
  if (target.role === "owner" && role !== "owner") return err(ctx, 403, "forbidden_target", "Only an owner can remove an owner.");
  if (role === "admin" && target.role === "admin") return err(ctx, 403, "forbidden_target", "Admins cannot remove other admins.");
  if (target.role === "owner" && target.status === "active" && (await activeOwners(ctx.env, ws.id)) <= 1) return err(ctx, 409, "last_owner", "Cannot remove the last owner.");
  await dropMembership(ctx.env.DB, ws.id, target.user_id);
  await writeAudit(ctx, ws.id, "member.remove", "user", target.user_id, { role: target.role });
  return ok(ctx, { ok: true });
}
async function dropMembership(DB, wsId, userId) {
  await DB.prepare("DELETE FROM business_members WHERE workspace_id=? AND user_id=?").bind(wsId, userId).run();
  await DB.prepare("DELETE FROM workspace_members WHERE workspace_id=? AND user_id=?").bind(wsId, userId).run();
}

async function leave({ ctx, ws, role }) {
  if (ws.is_personal && ws.owner_user_id === ctx.userId) return err(ctx, 400, "cannot_leave_personal", "You cannot leave your own personal workspace.");
  if (role === "owner" && (await activeOwners(ctx.env, ws.id)) <= 1) return err(ctx, 409, "last_owner", "Transfer ownership before leaving.");
  await dropMembership(ctx.env.DB, ws.id, ctx.userId);
  await writeAudit(ctx, ws.id, "member.leave", "user", ctx.userId, { role });
  return ok(ctx, { ok: true });
}

async function transferOwnership({ ctx, body, ws }) {
  if (body.confirm !== "TRANSFER") return err(ctx, 400, "confirmation_required", 'Send confirm: "TRANSFER" to confirm.');
  if (typeof body.user_id !== "string" || body.user_id === ctx.userId) return err(ctx, 400, "invalid_request", "user_id of another member is required.");
  const target = await ctx.env.DB.prepare("SELECT user_id,status FROM workspace_members WHERE workspace_id=? AND user_id=? LIMIT 1").bind(ws.id, body.user_id).first();
  if (!target || target.status !== "active") return err(ctx, 404, "member_not_found", "Member not found");
  const DB = ctx.env.DB;
  await DB.prepare("UPDATE workspace_members SET role='owner' WHERE workspace_id=? AND user_id=?").bind(ws.id, target.user_id).run();
  await DB.prepare("DELETE FROM business_members WHERE workspace_id=? AND user_id=?").bind(ws.id, target.user_id).run();
  await DB.prepare("UPDATE workspace_members SET role='admin' WHERE workspace_id=? AND user_id=?").bind(ws.id, ctx.userId).run();
  // A transferred workspace is no longer anyone's personal workspace (also keeps the one-personal-per-user index valid).
  await DB.prepare("UPDATE workspaces SET owner_user_id=?, is_personal=0 WHERE id=?").bind(target.user_id, ws.id).run();
  await writeAudit(ctx, ws.id, "workspace.transfer_ownership", "user", target.user_id, { from_user_id: ctx.userId });
  return ok(ctx, { ok: true, owner_user_id: target.user_id, your_role: "admin" });
}

async function attachBusiness({ ctx, body, ws }) {
  if (typeof body.business_id !== "string") return err(ctx, 400, "invalid_request", "business_id is required.");
  const access = await getBusinessAccess(ctx.env, ctx.userId, body.business_id);
  // Must be the creator AND still hold a business-managing role where the business lives today.
  if (!access || access.business.user_id !== ctx.userId || !can(access.role, "business.manage")) return err(ctx, 404, "business_not_found", "Business not found");
  const DB = ctx.env.DB;
  await DB.prepare("INSERT INTO business_workspace (business_id,workspace_id) VALUES (?,?) ON CONFLICT(business_id) DO UPDATE SET workspace_id=excluded.workspace_id").bind(body.business_id, ws.id).run();
  await DB.prepare("DELETE FROM business_members WHERE business_id=? AND workspace_id<>?").bind(body.business_id, ws.id).run();
  await writeAudit(ctx, ws.id, "business.attach", "business", body.business_id, {});
  return ok(ctx, { ok: true, business_id: body.business_id, workspace_id: ws.id });
}

function parseCursor(v) {
  const m = typeof v === "string" ? v.match(/^(\d{1,16})\.(aud_[0-9a-f]{32})$/) : null;
  return m ? { t: Number(m[1]), id: m[2] } : null;
}
async function auditLogs({ ctx, ws }) {
  const q = ctx.url.searchParams;
  let limit = Number.parseInt(q.get("limit") ?? "50", 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 50;
  limit = Math.min(limit, 200);
  const before = q.get("before");
  const cur = before ? parseCursor(before) : null;
  if (before && !cur) return err(ctx, 400, "invalid_cursor", "before is not a valid cursor.");
  const sql = `SELECT a.id,a.actor_user_id,u.email AS actor_email,a.action,a.target_type,a.target_id,a.metadata_json,a.created_at
     FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id WHERE a.workspace_id=? ${cur ? "AND (a.created_at<? OR (a.created_at=? AND a.id<?))" : ""}
     ORDER BY a.created_at DESC, a.id DESC LIMIT ?`;
  const args = cur ? [ws.id, cur.t, cur.t, cur.id, limit + 1] : [ws.id, limit + 1];
  const r = await ctx.env.DB.prepare(sql).bind(...args).all();
  const rows = r.results || [];
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return ok(ctx, {
    logs: page.map(({ metadata_json, ...x }) => ({ ...x, metadata: safeJson(metadata_json, {}) })),
    next_before: rows.length > limit && last ? `${last.created_at}.${last.id}` : null,
  });
}

async function myPermissions({ ctx, ws, role }) {
  return ok(ctx, { workspace_id: ws.id, role, permissions: [...PERMISSIONS[role]] });
}

async function listSessions({ ctx, request }) {
  const cur = await sessionHash(request);
  const r = await ctx.env.DB.prepare("SELECT id_hash,created_at,expires_at FROM sessions WHERE user_id=? AND expires_at>? ORDER BY created_at DESC").bind(ctx.userId, ctx.now()).all();
  return ok(ctx, { sessions: (r.results || []).map((s) => ({ created_at: s.created_at, expires_at: s.expires_at, current: !!cur && s.id_hash === cur })) });
}
async function revokeAllSessions({ ctx }) {
  const r = await ctx.env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(ctx.userId).run();
  const ws = await ensureWorkspace(ctx.env, ctx.userId, ctx.now());
  await writeAudit(ctx, ws.id, "sessions.revoke_all", "user", ctx.userId, { revoked: Number(r.meta?.changes || 0) });
  return new Response(JSON.stringify({ ok: true, revoked: Number(r.meta?.changes || 0) }), {
    status: 200, headers: { "content-type": "application/json", ...noStore, "set-cookie": "lb_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax" },
  });
}

export const routes = [
  route("GET", "/api/workspace", { bucket: "get", limit: 120 }, getWorkspace),
  route("POST", "/api/workspace/rename", { bucket: "rename", limit: 20, perm: "workspace.settings" }, rename),
  route("GET", "/api/workspace/members", { bucket: "members", limit: 120, perm: "team.view" }, getMembers),
  route("POST", "/api/workspace/invite", { bucket: "invite", limit: 20, perm: "team.manage" }, invite),
  route("POST", "/api/workspace/invitations/revoke", { bucket: "revoke", limit: 30, perm: "team.manage" }, revokeInvitation),
  route("POST", "/api/workspace/accept", { bucket: "accept", limit: 20, noWorkspace: true }, acceptInvitation),
  route("POST", "/api/workspace/members/role", { bucket: "role", limit: 30, perm: "team.manage" }, changeRole),
  route("POST", "/api/workspace/members/remove", { bucket: "remove", limit: 30, perm: "team.manage", reauth: true }, removeMember),
  route("POST", "/api/workspace/leave", { bucket: "leave", limit: 10 }, leave),
  route("POST", "/api/workspace/transfer-ownership", { bucket: "transfer", limit: 5, perm: "workspace.transfer", reauth: true }, transferOwnership),
  route("POST", "/api/workspace/businesses/attach", { bucket: "attach", limit: 30, perm: "business.manage" }, attachBusiness),
  route("GET", "/api/audit-logs", { bucket: "audit", limit: 60, perm: "audit_log.read" }, auditLogs),
  route("GET", "/api/me/permissions", { bucket: "perm", limit: 120 }, myPermissions),
  route("GET", "/api/sessions", { bucket: "sessions", limit: 60, noWorkspace: true }, listSessions),
  route("POST", "/api/sessions/revoke-all", { bucket: "revoke-all", limit: 10, noWorkspace: true }, revokeAllSessions),
];

export const jobs = [
  {
    name: "workspace-invitation-cleanup",
    async run(env) {
      if (!env.DB) return;
      await env.DB.prepare("DELETE FROM workspace_invitations WHERE (expires_at<? OR revoked_at IS NOT NULL OR accepted_at IS NOT NULL) AND created_at<?").bind(Date.now() - 90 * DAY_MS, Date.now() - 90 * DAY_MS).run();
    },
  },
];
