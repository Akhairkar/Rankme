// Action Center tasks: manual tasks and tasks created from audit findings, with notes, link attachments,
// progress, and re-audit verification. Contract: ../../docs/api/actions.md
// A task is "done" only because a user marked it so (optionally backed by a verifying re-audit).
import { id as newId, getBusinessAccess } from "./db.js";
import { EFFORT } from "./audit.js";

const STATUSES = ["open", "in_progress", "done", "reopened", "ignored"];
const PRIORITIES = ["critical", "high", "medium", "low"];
const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const ACTIVE = ["open", "in_progress", "reopened"];
// Effort scale documented in audit.js: 1 = about 15 min, 2 = about an hour, 3 = half a day or more.
const EFFORT_MINUTES = { 1: 15, 2: 60, 3: 240 };
// High-severity findings that stop pages being indexed are escalated to critical.
const BLOCKING_INDEXING_CODES = new Set(["site_noindex"]);
const MAX_ATTACHMENTS = 20;

const clean = (v) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim() : "");
const bad = (ctx, status, code, error) => ctx.json({ error, code }, status);
const notFound = (ctx) => bad(ctx, 404, "not_found", "Not found");
async function readBody(request) { try { const b = await request.json(); return b && typeof b === "object" && !Array.isArray(b) ? b : null; } catch { return null; } }
const safeJson = (s, f) => { try { return s ? JSON.parse(s) : f; } catch { return f; } };

function validDate(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
function validUrl(v) {
  if (typeof v !== "string" || v.length > 2000) return null;
  let u;
  try { u = new URL(v.trim()); } catch { return null; }
  if (u.protocol !== "https:" || !u.hostname.includes(".") || u.username || u.password) return null;
  return u.toString();
}

export function taskView(t) {
  return {
    id: t.id, business_id: t.business_id, source_type: t.source_type, source_id: t.source_id, finding_key: t.finding_key,
    title: t.title, description: t.description, reason: t.reason, evidence: t.evidence, priority: t.priority,
    effort_minutes: t.effort_minutes, due_date: t.due_date, status: t.status, assignee_user_id: t.assignee_user_id,
    created_by: t.created_by, completed_at: t.completed_at, completed_by: t.completed_by,
    verified_audit_id: t.verified_audit_id, verified_at: t.verified_at,
    before_evidence: t.before_evidence, after_evidence: t.after_evidence, created_at: t.created_at, updated_at: t.updated_at,
    ...(t.note_count !== undefined ? { note_count: t.note_count, attachment_count: t.attachment_count } : {}),
  };
}

// Assignee must have access to the business: its owner, or an active workspace member (see db.getBusinessAccess,
// which falls back to owner-only when workspace tables are unavailable).
async function canAssign(env, userId, businessId) {
  const access = await getBusinessAccess(env, userId, businessId);
  return !!access;
}

async function loadTask(ctx, taskId) {
  if (typeof taskId !== "string" || !taskId || taskId.length > 80) return null;
  const task = await ctx.env.DB.prepare("SELECT * FROM action_tasks WHERE id=? LIMIT 1").bind(taskId).first();
  if (!task) return null;
  const business = await ctx.getUserBusiness(task.business_id);
  return business ? { task, business } : null;
}

// ---------- re-audit verification ----------
// Reports whether the originating finding is still open in the latest audit. Never changes the task.
export async function verifyFinding(env, task) {
  const base = { task_id: task.id, rerun: { method: "POST", path: "/api/audits/run", body: { business_id: task.business_id } } };
  if (task.source_type !== "audit_finding" || !task.finding_key) return { ...base, suggestion: "not_applicable", finding_still_open: null, reason: "This task did not come from an audit finding." };
  const latest = await env.DB.prepare("SELECT id,created_at,status FROM audits WHERE business_id=? AND audit_type='unified' ORDER BY created_at DESC, rowid DESC LIMIT 1").bind(task.business_id).first();
  if (!latest) return { ...base, suggestion: "no_audit", finding_still_open: null, reason: "No audit exists yet. Run an audit to check this item." };
  const source = task.source_audit_id ? await env.DB.prepare("SELECT created_at FROM audits WHERE id=? LIMIT 1").bind(task.source_audit_id).first() : null;
  const sourceAt = source?.created_at ?? task.created_at;
  const common = { ...base, latest_audit_id: latest.id, latest_audit_at: latest.created_at };
  if (latest.id === task.source_audit_id || latest.created_at <= sourceAt) {
    return { ...common, suggestion: "no_newer_audit", finding_still_open: null, reason: "No audit newer than the one that found this issue. Re-run the audit after making the fix." };
  }
  const issue = await env.DB.prepare("SELECT status,evidence FROM audit_issues WHERE audit_id=? AND (finding_key=? OR (finding_key IS NULL AND code||'|'||COALESCE(source,'')=?)) LIMIT 1").bind(latest.id, task.finding_key, task.finding_key).first();
  if (issue && issue.status === "open") return { ...common, suggestion: "still_open", finding_still_open: true, current_evidence: issue.evidence ?? null, reason: "The latest audit still reports this issue." };
  if (issue) return { ...common, suggestion: "unverified", finding_still_open: null, reason: "The latest audit lists this issue as " + issue.status + " (set by a person), which is not an automated confirmation." };
  // Absent from the findings: only counts as fixed when the check ran and passed (an unavailable check is not a pass).
  const code = task.finding_key.split("|")[0];
  const checks = safeJson((await env.DB.prepare("SELECT checks_json FROM audits WHERE id=?").bind(latest.id).first())?.checks_json, []);
  const check = Array.isArray(checks) ? checks.find((c) => c.code === code) : null;
  if (check && check.status === "pass") return { ...common, suggestion: "verified_fixed", finding_still_open: false, current_evidence: check.evidence ?? null, reason: "The latest audit ran this check and it passed." };
  return { ...common, suggestion: "cannot_verify", finding_still_open: null, reason: "The latest audit could not evaluate this check, so the fix cannot be confirmed automatically." };
}

// ---------- routes ----------
async function listRoute(request, ctx) {
  if (!ctx.env.DB) return bad(ctx, 503, "unavailable", "Database unavailable");
  const q = ctx.url.searchParams;
  const businessId = q.get("business_id");
  if (!businessId) return bad(ctx, 400, "business_id_required", "business_id is required");
  if (!(await ctx.getUserBusiness(businessId))) return notFound(ctx);
  const where = ["t.business_id=?"], args = [businessId];
  const status = q.get("status");
  if (status) { if (!STATUSES.includes(status)) return bad(ctx, 400, "invalid_status", "Unknown status"); where.push("t.status=?"); args.push(status); }
  const assignee = q.get("assignee");
  if (assignee === "unassigned") where.push("t.assignee_user_id IS NULL");
  else if (assignee) { where.push("t.assignee_user_id=?"); args.push(assignee === "me" ? ctx.userId : assignee); }
  const { results } = await ctx.env.DB.prepare(`SELECT t.*, (SELECT COUNT(*) FROM action_task_notes n WHERE n.task_id=t.id) AS note_count, (SELECT COUNT(*) FROM action_task_attachments a WHERE a.task_id=t.id) AS attachment_count FROM action_tasks t WHERE ${where.join(" AND ")} LIMIT 500`).bind(...args).all();
  const tasks = (results || []).sort((a, b) => (PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]) || String(a.due_date || "9999").localeCompare(String(b.due_date || "9999")) || a.created_at - b.created_at);
  return ctx.json({ tasks: tasks.map(taskView) });
}

async function detailRoute(request, ctx) {
  if (!ctx.env.DB) return bad(ctx, 503, "unavailable", "Database unavailable");
  const loaded = await loadTask(ctx, ctx.url.searchParams.get("id"));
  if (!loaded) return notFound(ctx);
  const [notes, atts] = await Promise.all([
    ctx.env.DB.prepare("SELECT id,user_id,note,created_at FROM action_task_notes WHERE task_id=? ORDER BY created_at ASC LIMIT 200").bind(loaded.task.id).all(),
    ctx.env.DB.prepare("SELECT id,filename,url,created_by,created_at FROM action_task_attachments WHERE task_id=? ORDER BY created_at ASC LIMIT 50").bind(loaded.task.id).all(),
  ]);
  return ctx.json({ task: taskView(loaded.task), notes: notes.results || [], attachments: atts.results || [] });
}

async function validateTaskFields(ctx, businessId, b, { partial }) {
  const out = {};
  if (b.title !== undefined || !partial) { const t = clean(b.title); if (!t || t.length > 200) return { error: "title is required (max 200 characters)" }; out.title = t; }
  for (const [f, max] of [["description", 4000], ["reason", 2000], ["evidence", 4000]]) {
    if (b[f] === undefined) continue;
    if (b[f] === null || b[f] === "") { out[f] = null; continue; }
    if (typeof b[f] !== "string" || clean(b[f]).length > max) return { error: `${f} must be text up to ${max} characters` };
    out[f] = clean(b[f]);
  }
  if (b.priority !== undefined) { if (!PRIORITIES.includes(b.priority)) return { error: "priority must be critical, high, medium or low" }; out.priority = b.priority; }
  if (b.effort_minutes !== undefined) {
    if (b.effort_minutes === null) out.effort_minutes = null;
    else if (!Number.isInteger(b.effort_minutes) || b.effort_minutes < 1 || b.effort_minutes > 10080) return { error: "effort_minutes must be an integer from 1 to 10080" };
    else out.effort_minutes = b.effort_minutes;
  }
  if (b.due_date !== undefined) { if (b.due_date !== null && !validDate(b.due_date)) return { error: "due_date must be YYYY-MM-DD" }; out.due_date = b.due_date; }
  if (b.assignee_user_id !== undefined) {
    if (b.assignee_user_id !== null) {
      if (typeof b.assignee_user_id !== "string" || !(await canAssign(ctx.env, b.assignee_user_id, businessId))) return { error: "assignee_user_id must be the owner or an active member of this business's workspace", code: "invalid_assignee" };
    }
    out.assignee_user_id = b.assignee_user_id;
  }
  return { value: out };
}

async function createRoute(request, ctx) {
  if (!ctx.env.DB) return bad(ctx, 503, "unavailable", "Database unavailable");
  const b = await readBody(request);
  if (!b) return bad(ctx, 400, "invalid_json", "JSON body required");
  if (typeof b.business_id !== "string" || !(await ctx.getUserBusiness(b.business_id))) return notFound(ctx);
  const v = await validateTaskFields(ctx, b.business_id, b, { partial: false });
  if (v.error) return bad(ctx, 400, v.code || "validation_failed", v.error);
  const f = v.value, now = ctx.now(), tid = newId("task");
  await ctx.env.DB.prepare("INSERT INTO action_tasks (id,business_id,source_type,title,description,reason,evidence,priority,effort_minutes,due_date,status,assignee_user_id,created_by,created_at,updated_at) VALUES (?,?,'manual',?,?,?,?,?,?,?,'open',?,?,?,?)")
    .bind(tid, b.business_id, f.title, f.description ?? null, f.reason ?? null, f.evidence ?? null, f.priority || "medium", f.effort_minutes ?? null, f.due_date ?? null, f.assignee_user_id ?? null, ctx.userId, now, now).run();
  const task = await ctx.env.DB.prepare("SELECT * FROM action_tasks WHERE id=?").bind(tid).first();
  return ctx.json({ task: taskView(task) }, 201);
}

async function fromAuditRoute(request, ctx) {
  if (!ctx.env.DB) return bad(ctx, 503, "unavailable", "Database unavailable");
  const b = await readBody(request);
  if (!b || typeof b.audit_id !== "string" || !b.audit_id || b.audit_id.length > 80) return bad(ctx, 400, "audit_id_required", "audit_id is required");
  const audit = await ctx.env.DB.prepare("SELECT id,business_id,created_at FROM audits WHERE id=? LIMIT 1").bind(b.audit_id).first();
  if (!audit || !(await ctx.getUserBusiness(audit.business_id))) return notFound(ctx);
  const { results: issues } = await ctx.env.DB.prepare("SELECT * FROM audit_issues WHERE audit_id=? AND status='open' ORDER BY created_at ASC LIMIT 100").bind(audit.id).all();
  const created = [], skipped = [], reopened = [];
  const now = ctx.now();
  for (const i of issues || []) {
    const key = i.finding_key || `${i.code}|${i.source || ""}`;
    const existing = await ctx.env.DB.prepare("SELECT * FROM action_tasks WHERE business_id=? AND finding_key=? ORDER BY created_at DESC LIMIT 1").bind(audit.business_id, key).first();
    if (existing) {
      if (existing.status === "done" && existing.completed_at != null && existing.completed_at < audit.created_at) {
        // The finding is open in an audit run after the task was completed: surface it again, never silently.
        await ctx.env.DB.prepare("UPDATE action_tasks SET status='reopened',completed_at=NULL,completed_by=NULL,verified_audit_id=NULL,verified_at=NULL,updated_at=? WHERE id=?").bind(now, existing.id).run();
        reopened.push(existing.id);
      } else skipped.push({ key, task_id: existing.id, reason: existing.status === "ignored" ? "ignored" : "already_tracked" });
      continue;
    }
    const priority = i.severity === "high" ? (BLOCKING_INDEXING_CODES.has(i.code) ? "critical" : "high") : i.severity === "medium" ? "medium" : "low";
    const steps = safeJson(i.instructions_json, []);
    const description = [i.recommended_fix, Array.isArray(steps) && steps.length ? "Steps:\n" + steps.map((s, n) => `${n + 1}. ${s}`).join("\n") : null].filter(Boolean).join("\n\n") || null;
    const effort = EFFORT_MINUTES[EFFORT[i.code]] ?? null;
    const tid = newId("task");
    await ctx.env.DB.prepare("INSERT INTO action_tasks (id,business_id,source_type,source_id,source_audit_id,finding_key,title,description,reason,evidence,priority,effort_minutes,status,created_by,before_evidence,created_at,updated_at) VALUES (?,?,'audit_finding',?,?,?,?,?,?,?,?,?,'open',?,?,?,?)")
      .bind(tid, audit.business_id, i.id, audit.id, key, clean(i.title).slice(0, 200), description, i.explanation ?? null, i.evidence ?? null, priority, effort, ctx.userId, i.evidence ?? null, now, now).run();
    created.push(taskView(await ctx.env.DB.prepare("SELECT * FROM action_tasks WHERE id=?").bind(tid).first()));
  }
  return ctx.json({ created, skipped, reopened, source: "audit", audit_id: audit.id }, created.length ? 201 : 200);
}

async function updateRoute(request, ctx) {
  if (!ctx.env.DB) return bad(ctx, 503, "unavailable", "Database unavailable");
  const b = await readBody(request);
  if (!b) return bad(ctx, 400, "invalid_json", "JSON body required");
  const allowed = new Set(["id", "status", "assignee_user_id", "due_date", "priority", "after_evidence", "verified_audit_id"]);
  for (const k of Object.keys(b)) if (!allowed.has(k)) return bad(ctx, 400, "unknown_field", "Unknown field: " + k.slice(0, 40));
  const loaded = await loadTask(ctx, b.id);
  if (!loaded) return notFound(ctx);
  const { task } = loaded;
  const v = await validateTaskFields(ctx, task.business_id, { assignee_user_id: b.assignee_user_id, due_date: b.due_date, priority: b.priority }, { partial: true });
  if (v.error) return bad(ctx, 400, v.code || "validation_failed", v.error);
  const set = { ...v.value }, now = ctx.now();
  if (b.after_evidence !== undefined) {
    if (b.after_evidence !== null && (typeof b.after_evidence !== "string" || b.after_evidence.length > 4000)) return bad(ctx, 400, "validation_failed", "after_evidence must be text up to 4000 characters");
    set.after_evidence = b.after_evidence === null ? null : clean(b.after_evidence);
  }
  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status)) return bad(ctx, 400, "invalid_status", "Unknown status");
    if (b.status === "reopened" && !["done", "ignored"].includes(task.status)) return bad(ctx, 409, "invalid_transition", "Only done or ignored tasks can be reopened");
    set.status = b.status;
    if (b.status === "done") {
      set.completed_at = now; set.completed_by = ctx.userId;
      if (b.verified_audit_id !== undefined) {
        const ver = await verifyFinding(ctx.env, task);
        if (ver.suggestion !== "verified_fixed" || ver.latest_audit_id !== b.verified_audit_id) return bad(ctx, 409, "verification_failed", "That audit does not verify this fix: " + ver.reason);
        set.verified_audit_id = ver.latest_audit_id; set.verified_at = now;
      }
    } else if (task.status === "done") {
      set.completed_at = null; set.completed_by = null; set.verified_audit_id = null; set.verified_at = null;
    }
  } else if (b.verified_audit_id !== undefined) return bad(ctx, 400, "validation_failed", "verified_audit_id requires status done");
  const keys = Object.keys(set);
  if (!keys.length) return bad(ctx, 400, "nothing_to_update", "No changes supplied");
  await ctx.env.DB.prepare(`UPDATE action_tasks SET ${keys.map((k) => k + "=?").join(",")},updated_at=? WHERE id=?`).bind(...keys.map((k) => set[k]), now, task.id).run();
  return ctx.json({ task: taskView(await ctx.env.DB.prepare("SELECT * FROM action_tasks WHERE id=?").bind(task.id).first()) });
}

async function noteRoute(request, ctx) {
  if (!ctx.env.DB) return bad(ctx, 503, "unavailable", "Database unavailable");
  const b = await readBody(request);
  if (!b) return bad(ctx, 400, "invalid_json", "JSON body required");
  const loaded = await loadTask(ctx, b.id);
  if (!loaded) return notFound(ctx);
  const note = clean(b.note);
  if (!note || note.length > 2000) return bad(ctx, 400, "validation_failed", "note is required (max 2000 characters)");
  const nid = newId("note"), now = ctx.now();
  await ctx.env.DB.prepare("INSERT INTO action_task_notes (id,task_id,user_id,note,created_at) VALUES (?,?,?,?,?)").bind(nid, loaded.task.id, ctx.userId, note, now).run();
  await ctx.env.DB.prepare("UPDATE action_tasks SET updated_at=? WHERE id=?").bind(now, loaded.task.id).run();
  return ctx.json({ note: { id: nid, user_id: ctx.userId, note, created_at: now } }, 201);
}

async function attachmentRoute(request, ctx) {
  if (!ctx.env.DB) return bad(ctx, 503, "unavailable", "Database unavailable");
  const b = await readBody(request);
  if (!b) return bad(ctx, 400, "invalid_json", "JSON body required");
  const loaded = await loadTask(ctx, b.id);
  if (!loaded) return notFound(ctx);
  const url = validUrl(b.url);
  if (!url) return bad(ctx, 400, "invalid_url", "url must be an https link without credentials");
  const filename = clean(b.filename);
  if (!filename || filename.length > 120 || /[\\/]/.test(filename)) return bad(ctx, 400, "invalid_filename", "filename is required (max 120 characters, no slashes)");
  const n = await ctx.env.DB.prepare("SELECT COUNT(*) AS n FROM action_task_attachments WHERE task_id=?").bind(loaded.task.id).first();
  if (Number(n?.n || 0) >= MAX_ATTACHMENTS) return bad(ctx, 409, "attachment_limit", `At most ${MAX_ATTACHMENTS} attachments per task`);
  const aid = newId("att"), now = ctx.now();
  await ctx.env.DB.prepare("INSERT INTO action_task_attachments (id,task_id,filename,url,created_by,created_at) VALUES (?,?,?,?,?,?)").bind(aid, loaded.task.id, filename, url, ctx.userId, now).run();
  return ctx.json({ attachment: { id: aid, filename, url, created_by: ctx.userId, created_at: now }, storage: "link_only" }, 201);
}

async function progressRoute(request, ctx) {
  if (!ctx.env.DB) return bad(ctx, 503, "unavailable", "Database unavailable");
  const businessId = ctx.url.searchParams.get("business_id");
  if (!businessId) return bad(ctx, 400, "business_id_required", "business_id is required");
  if (!(await ctx.getUserBusiness(businessId))) return notFound(ctx);
  const { results } = await ctx.env.DB.prepare("SELECT priority, status, COUNT(*) AS n FROM action_tasks WHERE business_id=? AND status<>'ignored' GROUP BY priority, status").bind(businessId).all();
  const by = Object.fromEntries(PRIORITIES.map((p) => [p, { total: 0, done: 0 }]));
  let total = 0, done = 0;
  for (const r of results || []) {
    const n = Number(r.n);
    total += n; by[r.priority].total += n;
    if (r.status === "done") { done += n; by[r.priority].done += n; }
  }
  return ctx.json({ total, done, by_priority: by, percent: total ? Math.round((done / total) * 100) : null, note: "Ignored tasks are not counted." });
}

async function rerunAuditRoute(request, ctx) {
  if (!ctx.env.DB) return bad(ctx, 503, "unavailable", "Database unavailable");
  const b = await readBody(request);
  if (!b) return bad(ctx, 400, "invalid_json", "JSON body required");
  const loaded = await loadTask(ctx, b.id);
  if (!loaded) return notFound(ctx);
  return ctx.json({ verification: await verifyFinding(ctx.env, loaded.task), task_status: loaded.task.status });
}

export const routes = [
  { method: "GET", path: "/api/actions", auth: "session", handler: listRoute },
  { method: "POST", path: "/api/actions", auth: "session", handler: createRoute },
  { method: "GET", path: "/api/actions/detail", auth: "session", handler: detailRoute },
  { method: "POST", path: "/api/actions/from-audit", auth: "session", handler: fromAuditRoute },
  { method: "POST", path: "/api/actions/update", auth: "session", handler: updateRoute },
  { method: "POST", path: "/api/actions/note", auth: "session", handler: noteRoute },
  { method: "POST", path: "/api/actions/attachment", auth: "session", handler: attachmentRoute },
  { method: "GET", path: "/api/actions/progress", auth: "session", handler: progressRoute },
  { method: "POST", path: "/api/actions/rerun-audit", auth: "session", handler: rerunAuditRoute },
];
