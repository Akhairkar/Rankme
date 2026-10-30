// Notifications module: in-app notifications, preferences, email outbox with a provider boundary,
// fan-out of real stored events, and a weekly digest. Contract: ../../docs/api/notifications.md
// Workers-compatible only (WebCrypto + fetch). Never logs secrets; parameterised SQL only.
import { id as newId } from "./db.js";
import { AUDIT_MONTHLY_LIMITS } from "./audit.js";
import { limitsFor } from "./rank.js";

const DAY_MS = 86400000;
const DEDUPE_WINDOW_MS = DAY_MS;
const EMAIL_BATCH = 20;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 5 * 60000; // 5 min, 10 min after the 1st / 2nd failure
const FANOUT_LOOKBACK_MS = 14 * DAY_MS;
const SEVERITIES = ["info", "warning", "critical"];

// kind -> default delivery. Email is opt-in except for kinds a user cannot reasonably miss.
export const KINDS = {
  google_connection_expired: { email: 1 },
  review_new: { email: 0 },
  review_needs_response: { email: 0 },
  website_issue_detected: { email: 0 },
  rank_changed: { email: 0 },
  competitor_changed: { email: 0 },
  search_console_decline: { email: 0 },
  job_failed: { email: 0 },
  subscription_renewal_soon: { email: 1 },
  credits_low: { email: 0 },
  security_alert: { email: 1 },
  team_invite: { email: 1 },
};
const FORCED_KINDS = new Set(["security_alert"]); // cannot be switched off (in-app and email)

// monitoring_events.event_type -> notification kind. Unknown types are logged as handled-but-skipped.
const EVENT_KIND = {
  rank_change: "rank_changed", rank_changed: "rank_changed",
  competitor_change: "competitor_changed", competitor_changed: "competitor_changed",
  website_issue: "website_issue_detected", website_issue_detected: "website_issue_detected", site_issue: "website_issue_detected",
  search_console_decline: "search_console_decline",
  review_new: "review_new", review_needs_response: "review_needs_response",
  job_failed: "job_failed",
};
const EVENT_SEVERITY = { critical: "critical", high: "warning", warning: "warning" };

const clean = (v) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim() : "");
const bad = (ctx, status, code, error) => ctx.json({ error, code }, status);
async function readBody(request) { try { const b = await request.json(); return b && typeof b === "object" && !Array.isArray(b) ? b : null; } catch { return null; } }
const validEmail = (e) => typeof e === "string" && e.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(e);

// ---------------------------------------------------------------------------------------------------
// Email provider boundary
// ---------------------------------------------------------------------------------------------------
export function emailProviderState(env) {
  return env?.EMAIL_PROVIDER === "resend" && env.RESEND_API_KEY && env.EMAIL_FROM ? "configured" : "awaiting_email_provider";
}

// Returns {state:"sent", provider_id} | {state:"awaiting_email_provider"} | {state:"failed", error, retryable}.
// Only "sent" means the provider accepted the message. Nothing is ever reported delivered otherwise.
export async function sendEmail(env, { to, subject, text }) {
  if (emailProviderState(env) !== "configured") return { state: "awaiting_email_provider" };
  if (!validEmail(to)) return { state: "failed", error: "invalid_recipient", retryable: false };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: "Bearer " + env.RESEND_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject: String(subject).slice(0, 200), text: String(text) }),
    });
    if (res.ok) {
      let pid = null;
      try { pid = (await res.json())?.id ?? null; } catch {}
      return { state: "sent", provider_id: pid };
    }
    const retryable = res.status === 429 || res.status === 408 || res.status >= 500;
    return { state: "failed", error: "provider_http_" + res.status, retryable };
  } catch {
    return { state: "failed", error: "provider_unreachable", retryable: true };
  }
}

// ---------------------------------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------------------------------
async function loadPrefs(env, userId) {
  const { results } = await env.DB.prepare("SELECT kind,in_app,email,digest FROM notification_preferences WHERE user_id=?").bind(userId).all();
  const m = new Map();
  for (const r of results || []) m.set(r.kind, r);
  return m;
}
function effectivePref(kind, row) {
  const def = KINDS[kind] || { email: 0 };
  const p = row
    ? { in_app: !!row.in_app, email: !!row.email, digest: !!row.digest, custom: true }
    : { in_app: true, email: !!def.email, digest: true, custom: false };
  if (FORCED_KINDS.has(kind)) { p.in_app = true; p.email = true; }
  return p;
}

// ---------------------------------------------------------------------------------------------------
// createNotification
// ---------------------------------------------------------------------------------------------------
// Returns {state: "created"|"suppressed_duplicate"|"suppressed_preference"|"invalid"|"unavailable", id?, email?}
export async function createNotification(env, input = {}) {
  if (!env?.DB) return { state: "unavailable" };
  const { userId, businessId = null, kind, severity = "info", link = null, dedupeKey = null } = input;
  const now = Number.isFinite(input.now) ? input.now : Date.now();
  const title = clean(input.title).slice(0, 200), body = clean(input.body).slice(0, 2000);
  if (!userId || !KINDS[kind] || !title || !SEVERITIES.includes(severity)) return { state: "invalid" };
  const safeLink = typeof link === "string" && (link.startsWith("/") && !link.startsWith("//") || link.startsWith("https://")) ? link.slice(0, 500) : null;

  const prefs = await loadPrefs(env, userId);
  const pref = effectivePref(kind, prefs.get(kind));
  if (!pref.in_app && !pref.email) return { state: "suppressed_preference" };

  if (businessId) {
    const b = await env.DB.prepare("SELECT id FROM businesses WHERE id=? LIMIT 1").bind(businessId).first();
    if (!b) return { state: "invalid" };
  }
  const key = dedupeKey == null ? null : String(dedupeKey).slice(0, 200);
  if (key) {
    const dup = await env.DB.prepare("SELECT id FROM notifications WHERE user_id=? AND dedupe_key=? AND created_at>? LIMIT 1").bind(userId, key, now - DEDUPE_WINDOW_MS).first();
    if (dup) return { state: "suppressed_duplicate", id: dup.id };
  }
  // Email-only preference: the row is still stored (history + dedupe window) but created already read.
  const nid = newId("ntf");
  await env.DB.prepare("INSERT INTO notifications (id,user_id,business_id,kind,severity,title,body,link,dedupe_key,read_at,created_at,emailed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL)")
    .bind(nid, userId, businessId, kind, severity, title, body || null, safeLink, key, pref.in_app ? null : now, now).run();
  let email = "not_requested";
  if (pref.email) {
    const u = await env.DB.prepare("SELECT email FROM users WHERE id=? LIMIT 1").bind(userId).first();
    const subject = `[LocalBoost] ${title}`.slice(0, 200);
    const text = `${title}\n\n${body || ""}${safeLink ? `\n\nOpen: ${safeLink.startsWith("/") ? "https://www.localboost.in" + safeLink : safeLink}` : ""}\n\nYou can change which emails you receive in LocalBoost notification settings.`;
    email = await enqueueEmail(env, { userId, notificationId: nid, to: u?.email, subject, text, now });
  }
  return { state: "created", id: nid, email };
}

async function enqueueEmail(env, { userId, notificationId = null, to, subject, text, now }) {
  const oid = newId("eml");
  const ok = validEmail(to);
  await env.DB.prepare("INSERT INTO email_outbox (id,user_id,notification_id,to_email,subject,body_text,status,attempts,last_error,next_attempt_at,created_at) VALUES (?,?,?,?,?,?,?,0,?,NULL,?)")
    .bind(oid, userId, notificationId, ok ? to : "", subject, text, ok ? "pending" : "suppressed", ok ? null : "no_valid_recipient", now).run();
  return ok ? "queued" : "suppressed";
}

// ---------------------------------------------------------------------------------------------------
// Outbox worker: batches of 20, max 3 attempts, exponential delay. Leaves rows pending when no provider.
// ---------------------------------------------------------------------------------------------------
export async function processEmailOutbox(env, now = Date.now()) {
  const out = { state: "ok", sent: 0, failed: 0, retry_scheduled: 0, skipped: 0 };
  if (!env?.DB) return { ...out, state: "unavailable" };
  if (emailProviderState(env) !== "configured") return { ...out, state: "awaiting_email_provider" };
  const { results } = await env.DB.prepare("SELECT id,notification_id,to_email,subject,body_text,attempts FROM email_outbox WHERE status='pending' AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY created_at ASC LIMIT ?").bind(now, EMAIL_BATCH).all();
  for (const row of results || []) {
    // claim: only one worker may attempt a row at a time
    const claim = await env.DB.prepare("UPDATE email_outbox SET next_attempt_at=? WHERE id=? AND status='pending' AND (next_attempt_at IS NULL OR next_attempt_at<=?)").bind(now + 60000, row.id, now).run();
    if (!claim.meta?.changes) { out.skipped++; continue; }
    const r = await sendEmail(env, { to: row.to_email, subject: row.subject, text: row.body_text });
    if (r.state === "sent") {
      await env.DB.prepare("UPDATE email_outbox SET status='sent',attempts=attempts+1,sent_at=?,last_error=NULL,next_attempt_at=NULL WHERE id=?").bind(now, row.id).run();
      if (row.notification_id) await env.DB.prepare("UPDATE notifications SET emailed_at=? WHERE id=?").bind(now, row.notification_id).run();
      out.sent++;
    } else if (r.state === "failed") {
      const attempts = row.attempts + 1;
      if (!r.retryable || attempts >= MAX_ATTEMPTS) {
        await env.DB.prepare("UPDATE email_outbox SET status='failed',attempts=?,last_error=?,next_attempt_at=NULL WHERE id=?").bind(attempts, r.error, row.id).run();
        out.failed++;
      } else {
        await env.DB.prepare("UPDATE email_outbox SET attempts=?,last_error=?,next_attempt_at=? WHERE id=?").bind(attempts, r.error, now + RETRY_BASE_MS * 2 ** (attempts - 1), row.id).run();
        out.retry_scheduled++;
      }
    } else {
      await env.DB.prepare("UPDATE email_outbox SET next_attempt_at=NULL WHERE id=?").bind(row.id).run();
      out.skipped++;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// Fan-out job: real stored events -> notifications. Idempotent through notification_fanout_log.
// ---------------------------------------------------------------------------------------------------
async function claimSource(env, key, now) {
  const r = await env.DB.prepare("INSERT OR IGNORE INTO notification_fanout_log (source_key,created_at) VALUES (?,?)").bind(key, now).run();
  return !!r.meta?.changes;
}
const monthStart = (now) => { const d = new Date(now); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };
const monthKey = (now) => new Date(now).toISOString().slice(0, 7);

export async function runFanout(env, now = Date.now()) {
  const stats = { events: 0, google: 0, renewals: 0, credits: 0, skipped_event_types: 0 };
  if (!env?.DB) return stats;

  // 1. monitoring_events written by rank.js and others
  const { results: events } = await env.DB.prepare("SELECT id,user_id,business_id,event_type,severity,title,detail,detected_at FROM monitoring_events WHERE detected_at>=? ORDER BY detected_at ASC LIMIT 200").bind(now - FANOUT_LOOKBACK_MS).all();
  for (const e of events || []) {
    if (!(await claimSource(env, "evt:" + e.id, now))) continue;
    const kind = EVENT_KIND[e.event_type];
    if (!kind) { stats.skipped_event_types++; continue; }
    const r = await createNotification(env, {
      userId: e.user_id, businessId: e.business_id, kind, severity: EVENT_SEVERITY[e.severity] || "info",
      title: e.title, body: e.detail, link: "/dashboard.html?business_id=" + encodeURIComponent(e.business_id), dedupeKey: "evt:" + e.id, now,
    });
    if (r.state === "created") stats.events++;
  }

  // 2. Google reconnect required
  const { results: g } = await env.DB.prepare("SELECT user_id,reconnect_flagged_at,updated_at FROM google_connection_state WHERE needs_reconnect=1 LIMIT 200").all();
  for (const s of g || []) {
    const stamp = s.reconnect_flagged_at || s.updated_at;
    if (!(await claimSource(env, `gconn:${s.user_id}:${stamp}`, now))) continue;
    const r = await createNotification(env, {
      userId: s.user_id, kind: "google_connection_expired", severity: "critical",
      title: "Reconnect your Google account",
      body: "Google rejected our access, so reviews, performance and Search Console data have stopped syncing until you reconnect.",
      link: "/dashboard.html#google", dedupeKey: "gconn:" + stamp, now,
    });
    if (r.state === "created") stats.google++;
  }

  // 3. Subscription ending within 7 days
  const { results: subs } = await env.DB.prepare("SELECT id,user_id,plan_code,current_period_end,cancel_at_period_end FROM subscriptions WHERE status IN ('active','trialing') AND current_period_end IS NOT NULL AND current_period_end>? AND current_period_end<=? LIMIT 500").bind(now, now + 7 * DAY_MS).all();
  for (const s of subs || []) {
    if (!(await claimSource(env, `renew:${s.id}:${s.current_period_end}`, now))) continue;
    const date = new Date(s.current_period_end).toISOString().slice(0, 10);
    const r = await createNotification(env, {
      userId: s.user_id, kind: "subscription_renewal_soon", severity: s.cancel_at_period_end ? "warning" : "info",
      title: s.cancel_at_period_end ? `Your ${s.plan_code} plan ends on ${date}` : `Your ${s.plan_code} plan renews on ${date}`,
      body: s.cancel_at_period_end ? "Cancellation is scheduled, so paid features stop after this date." : "The current billing period ends on this date.",
      link: "/dashboard.html#billing", dedupeKey: `renew:${s.id}:${s.current_period_end}`, now,
    });
    if (r.state === "created") stats.renewals++;
  }

  // 4. Monthly audit / rank-scan allowance (caps read from the exported constants of audit.js and rank.js)
  const { results: users } = await env.DB.prepare("SELECT DISTINCT user_id FROM businesses WHERE status='active' LIMIT 500").all();
  const since = monthStart(now), mk = monthKey(now);
  for (const u of users || []) {
    const sub = await env.DB.prepare("SELECT plan_code,status FROM subscriptions WHERE user_id=? ORDER BY updated_at DESC LIMIT 1").bind(u.user_id).first();
    const plan = sub && ["active", "trialing"].includes(sub.status) && AUDIT_MONTHLY_LIMITS[sub.plan_code] !== undefined ? sub.plan_code : "free";
    const resources = [
      ["audits", "audit", AUDIT_MONTHLY_LIMITS[plan], "SELECT COUNT(*) AS n FROM audits a JOIN businesses b ON b.id=a.business_id WHERE b.user_id=? AND a.audit_type='unified' AND a.created_at>=?"],
      ["rank scans", "rank", limitsFor(env, plan).scans, "SELECT COUNT(*) AS n FROM rank_scans WHERE user_id=? AND created_at>=?"],
    ];
    for (const [label, code, limit, sql] of resources) {
      if (!Number.isFinite(limit) || limit <= 0) continue;
      const used = Number((await env.DB.prepare(sql).bind(u.user_id, since).first())?.n || 0);
      const level = used >= limit ? "exhausted" : used >= Math.ceil(limit * 0.8) ? "low" : null;
      if (!level) continue;
      if (!(await claimSource(env, `credits:${u.user_id}:${code}:${mk}:${level}`, now))) continue;
      const r = await createNotification(env, {
        userId: u.user_id, kind: "credits_low", severity: level === "exhausted" ? "warning" : "info",
        title: level === "exhausted" ? `Monthly ${label} allowance used up` : `Monthly ${label} allowance almost used`,
        body: `You have used ${used} of ${limit} ${label} included in your ${plan} plan this month.`,
        link: "/dashboard.html#billing", dedupeKey: `credits:${code}:${mk}:${level}`, now,
      });
      if (r.state === "created") stats.credits++;
    }
  }
  return stats;
}

// ---------------------------------------------------------------------------------------------------
// Weekly digest (Mondays from 03:30 UTC, once per user per Monday). Only real stored data; empty -> nothing sent.
// ---------------------------------------------------------------------------------------------------
export function buildDigestText({ tasks, newReviews, unread }) {
  const lines = ["Your LocalBoost weekly summary", ""];
  if (tasks.total > 0) lines.push(`Open Action Center tasks: ${tasks.total}${tasks.critical ? ` (${tasks.critical} critical)` : ""}`);
  if (newReviews > 0) lines.push(`New reviews synced in the last 7 days: ${newReviews}`);
  if (unread.length) {
    lines.push(`Unread alerts: ${unread.length}`);
    for (const n of unread.slice(0, 10)) lines.push(`- ${n.title}`);
    if (unread.length > 10) lines.push(`- and ${unread.length - 10} more in the app`);
  }
  lines.push("", "Open LocalBoost: https://www.localboost.in", "You can turn this summary off in notification settings.");
  return lines.join("\n");
}

export async function runDigest(env, now = Date.now()) {
  const stats = { state: "ok", queued: 0, skipped_empty: 0 };
  if (!env?.DB) return { ...stats, state: "unavailable" };
  const d = new Date(now);
  if (d.getUTCDay() !== 1 || d.getUTCHours() * 60 + d.getUTCMinutes() < 3 * 60 + 30) return { ...stats, state: "not_due" };
  const day = d.toISOString().slice(0, 10);
  const { results: users } = await env.DB.prepare("SELECT id,email FROM users WHERE id IN (SELECT user_id FROM businesses WHERE status='active' UNION SELECT user_id FROM notifications) LIMIT 1000").all();
  for (const u of users || []) {
    if (!validEmail(u.email)) continue;
    const prefs = await loadPrefs(env, u.id);
    const wanted = Object.keys(KINDS).filter((k) => effectivePref(k, prefs.get(k)).digest);
    if (!wanted.length) continue; // user turned the digest off everywhere
    const dkey = `digest:${u.id}:${day}`;
    if (await env.DB.prepare("SELECT 1 AS x FROM notification_fanout_log WHERE source_key=?").bind(dkey).first()) continue;
    const t = await env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN t.priority='critical' THEN 1 ELSE 0 END) AS critical FROM action_tasks t JOIN businesses b ON b.id=t.business_id WHERE b.user_id=? AND t.status IN ('open','in_progress','reopened')").bind(u.id).first();
    const rv = await env.DB.prepare("SELECT COUNT(*) AS n FROM reviews r JOIN business_locations l ON l.id=r.business_location_id JOIN businesses b ON b.id=l.business_id WHERE b.user_id=? AND r.synced_at>=?").bind(u.id, now - 7 * DAY_MS).first();
    const ph = wanted.map(() => "?").join(",");
    const { results: unread } = await env.DB.prepare(`SELECT title FROM notifications WHERE user_id=? AND read_at IS NULL AND kind IN (${ph}) ORDER BY created_at DESC LIMIT 50`).bind(u.id, ...wanted).all();
    const tasks = { total: Number(t?.total || 0), critical: Number(t?.critical || 0) };
    const newReviews = Number(rv?.n || 0);
    if (!tasks.total && !newReviews && !(unread || []).length) { stats.skipped_empty++; continue; }
    if (!(await claimSource(env, dkey, now))) continue; // claimed only when there is something to send
    await enqueueEmail(env, { userId: u.id, to: u.email, subject: "[LocalBoost] Your weekly summary", text: buildDigestText({ tasks, newReviews, unread: unread || [] }), now });
    stats.queued++;
  }
  return stats;
}

// ---------------------------------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------------------------------
const publicNotification = (r) => ({ id: r.id, business_id: r.business_id, kind: r.kind, severity: r.severity, title: r.title, body: r.body, link: r.link, read: r.read_at != null, read_at: r.read_at, created_at: r.created_at });

async function listRoute(request, ctx) {
  if (!ctx.env.DB) return bad(ctx, 503, "unavailable", "Database unavailable");
  const q = ctx.url.searchParams;
  let limit = 30;
  if (q.get("limit") != null) { limit = Number(q.get("limit")); if (!Number.isInteger(limit) || limit < 1 || limit > 100) return bad(ctx, 400, "invalid_limit", "limit must be an integer from 1 to 100"); }
  const where = ["user_id=?"], args = [ctx.userId];
  const unread = q.get("unread");
  if (unread === "1" || unread === "true") where.push("read_at IS NULL");
  if (q.get("before") != null) {
    const before = Number(q.get("before"));
    if (!Number.isInteger(before) || before <= 0) return bad(ctx, 400, "invalid_before", "before must be a created_at timestamp in ms");
    where.push("created_at<?"); args.push(before);
  }
  const { results } = await ctx.env.DB.prepare(`SELECT id,business_id,kind,severity,title,body,link,read_at,created_at FROM notifications WHERE ${where.join(" AND ")} ORDER BY created_at DESC, id DESC LIMIT ?`).bind(...args, limit + 1).all();
  const rows = results || [];
  const page = rows.slice(0, limit);
  return ctx.json({ notifications: page.map(publicNotification), next_before: rows.length > limit ? page[page.length - 1].created_at : null });
}

async function unreadCountRoute(request, ctx) {
  if (!ctx.env.DB) return bad(ctx, 503, "unavailable", "Database unavailable");
  const r = await ctx.env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND read_at IS NULL").bind(ctx.userId).first();
  return ctx.json({ unread: Number(r?.n || 0) });
}

async function markReadRoute(request, ctx) {
  if (!ctx.env.DB) return bad(ctx, 503, "unavailable", "Database unavailable");
  const body = await readBody(request);
  if (!body) return bad(ctx, 400, "invalid_json", "JSON body required");
  const now = ctx.now();
  if (body.all === true) {
    const r = await ctx.env.DB.prepare("UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL").bind(now, ctx.userId).run();
    return ctx.json({ updated: r.meta?.changes ?? 0 });
  }
  if (!Array.isArray(body.ids) || !body.ids.length || body.ids.length > 100 || !body.ids.every((x) => typeof x === "string" && x.length <= 80)) {
    return bad(ctx, 400, "invalid_ids", "ids must be a list of 1-100 notification ids, or send {all:true}");
  }
  let updated = 0;
  for (const nid of body.ids) {
    const r = await ctx.env.DB.prepare("UPDATE notifications SET read_at=? WHERE id=? AND user_id=? AND read_at IS NULL").bind(now, nid, ctx.userId).run();
    updated += r.meta?.changes ?? 0;
  }
  return ctx.json({ updated });
}

async function getPrefsRoute(request, ctx) {
  if (!ctx.env.DB) return bad(ctx, 503, "unavailable", "Database unavailable");
  const prefs = await loadPrefs(ctx.env, ctx.userId);
  const email = await ctx.env.DB.prepare("SELECT email FROM users WHERE id=? LIMIT 1").bind(ctx.userId).first();
  return ctx.json({
    preferences: Object.keys(KINDS).map((kind) => { const p = effectivePref(kind, prefs.get(kind)); return { kind, in_app: p.in_app, email: p.email, digest: p.digest, locked: FORCED_KINDS.has(kind), customised: p.custom }; }),
    email_delivery: emailProviderState(ctx.env), email_address_on_file: !!email?.email,
  });
}

async function setPrefsRoute(request, ctx) {
  if (!ctx.env.DB) return bad(ctx, 503, "unavailable", "Database unavailable");
  const body = await readBody(request);
  if (!body || !Array.isArray(body.preferences) || !body.preferences.length || body.preferences.length > 40) return bad(ctx, 400, "invalid_preferences", "preferences must be a list of {kind, in_app?, email?, digest?}");
  const updates = [];
  for (const p of body.preferences) {
    if (!p || typeof p !== "object" || (p.kind !== "*" && !KINDS[p.kind])) return bad(ctx, 400, "unknown_kind", "Unknown notification kind");
    for (const f of ["in_app", "email", "digest"]) if (p[f] !== undefined && typeof p[f] !== "boolean") return bad(ctx, 400, "invalid_preferences", f + " must be true or false");
    if (p.in_app === undefined && p.email === undefined && p.digest === undefined) return bad(ctx, 400, "invalid_preferences", "Nothing to change for " + p.kind);
    for (const kind of p.kind === "*" ? Object.keys(KINDS) : [p.kind]) {
      if (FORCED_KINDS.has(kind)) { if (p.kind !== "*" && (p.in_app === false || p.email === false)) return bad(ctx, 400, "locked_kind", "Security alerts cannot be switched off"); continue; }
      updates.push({ ...p, kind });
    }
  }
  const now = ctx.now();
  const prefs = await loadPrefs(ctx.env, ctx.userId);
  for (const u of updates) {
    const cur = effectivePref(u.kind, prefs.get(u.kind));
    const next = { in_app: u.in_app ?? cur.in_app, email: u.email ?? cur.email, digest: u.digest ?? cur.digest };
    await ctx.env.DB.prepare("INSERT INTO notification_preferences (user_id,kind,in_app,email,digest,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,kind) DO UPDATE SET in_app=excluded.in_app,email=excluded.email,digest=excluded.digest,updated_at=excluded.updated_at")
      .bind(ctx.userId, u.kind, +next.in_app, +next.email, +next.digest, now).run();
    prefs.set(u.kind, { in_app: +next.in_app, email: +next.email, digest: +next.digest });
  }
  return getPrefsRoute(request, ctx);
}

export const routes = [
  { method: "GET", path: "/api/notifications", auth: "session", handler: listRoute },
  { method: "GET", path: "/api/notifications/unread-count", auth: "session", handler: unreadCountRoute },
  { method: "POST", path: "/api/notifications/read", auth: "session", handler: markReadRoute },
  { method: "GET", path: "/api/notifications/preferences", auth: "session", handler: getPrefsRoute },
  { method: "POST", path: "/api/notifications/preferences", auth: "session", handler: setPrefsRoute },
];

export const jobs = [
  { name: "notification-fanout", run: (env) => runFanout(env) },
  { name: "notification-digest", run: (env) => runDigest(env) },
  { name: "notification-email", run: (env) => processEmailOutbox(env) },
];
