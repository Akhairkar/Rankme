// Billing (Razorpay, INR). Orders are marked paid ONLY after server-side signature verification
// (POST /api/billing/verify) or a verified webhook. Secrets never leave the server.
import { id } from "./db.js";

export const GST_RATE_PERCENT = 18; // CGST 9 + SGST 9
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const RAZORPAY_ORDERS_URL = "https://api.razorpay.com/v1/orders";

// Prices are GST-exclusive, in paise. Limits are config; the feature flags mirror db.js PLAN_DEFAULTS.
export const PLANS = {
  free: {
    name: "Free", prices: { month: 0, year: 0 },
    limits: { businesses: 1, locations: 1, keywords: 5, audits_per_month: 3, rank_scans_per_month: 0, competitors: 0, crawl_pages: 1 },
    features: { rank_tracking_enabled: 0, review_monitoring_enabled: 0, reports_enabled: 0, competitor_tracking_enabled: 0 },
  },
  pro: {
    name: "Pro", prices: { month: 99900, year: 899900 },
    limits: { businesses: 1, locations: 3, keywords: 50, audits_per_month: 30, rank_scans_per_month: 100, competitors: 5, crawl_pages: 50 },
    features: { rank_tracking_enabled: 1, review_monitoring_enabled: 1, reports_enabled: 1, competitor_tracking_enabled: 1 },
  },
  agency: {
    name: "Agency", prices: { month: 299900, year: 2699900 },
    limits: { businesses: 10, locations: 10, keywords: 500, audits_per_month: 300, rank_scans_per_month: 1000, competitors: 25, crawl_pages: 200 },
    features: { rank_tracking_enabled: 1, review_monitoring_enabled: 1, reports_enabled: 1, competitor_tracking_enabled: 1 },
  },
};
const PLAN_RANK = { free: 0, pro: 1, agency: 2 };

// GST math: taxable (exclusive price) -> CGST 9% + SGST 9% + total, all integer paise.
export function computeGst(taxableMinor) {
  const cgst = Math.round((taxableMinor * GST_RATE_PERCENT) / 200);
  const sgst = cgst;
  return { taxable_minor: taxableMinor, cgst_minor: cgst, sgst_minor: sgst, total_minor: taxableMinor + cgst + sgst };
}

export function addPeriod(startMs, interval) {
  const d = new Date(startMs);
  if (interval === "year") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.getTime();
}

const enc = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}
export function timingSafeEqualHex(a, b) {
  a = String(a || ""); b = String(b || "");
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
export async function verifyCheckoutSignature(secret, orderId, paymentId, signature) {
  if (!secret || !orderId || !paymentId || !signature) return false;
  return timingSafeEqualHex(await hmacSha256Hex(secret, `${orderId}|${paymentId}`), signature);
}
export async function verifyWebhookSignature(secret, rawBody, signature) {
  if (!secret || !signature) return false;
  return timingSafeEqualHex(await hmacSha256Hex(secret, rawBody), signature);
}

const providerReady = (env) =>
  env.PAYMENT_PROVIDER_ENABLED === "true" && !!env.RAZORPAY_KEY_ID && !!env.RAZORPAY_KEY_SECRET;

// ---- plan_entitlements sync -------------------------------------------------------------------
const synced = new WeakSet();
export async function ensurePlanEntitlements(env) {
  if (!env.DB || synced.has(env.DB)) return;
  for (const [code, p] of Object.entries(PLANS)) {
    const l = p.limits, f = p.features;
    try {
      await env.DB.prepare(
        `INSERT INTO plan_entitlements (plan_code,max_businesses,max_locations,max_keywords,rank_tracking_enabled,review_monitoring_enabled,reports_enabled,competitor_tracking_enabled,max_audits_per_month,max_rank_scans_per_month,max_competitors,max_crawl_pages)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(plan_code) DO UPDATE SET max_businesses=excluded.max_businesses,max_locations=excluded.max_locations,max_keywords=excluded.max_keywords,
           rank_tracking_enabled=excluded.rank_tracking_enabled,review_monitoring_enabled=excluded.review_monitoring_enabled,reports_enabled=excluded.reports_enabled,
           competitor_tracking_enabled=excluded.competitor_tracking_enabled,max_audits_per_month=excluded.max_audits_per_month,
           max_rank_scans_per_month=excluded.max_rank_scans_per_month,max_competitors=excluded.max_competitors,max_crawl_pages=excluded.max_crawl_pages`
      ).bind(code, l.businesses, l.locations, l.keywords, f.rank_tracking_enabled, f.review_monitoring_enabled, f.reports_enabled, f.competitor_tracking_enabled,
        l.audits_per_month, l.rank_scans_per_month, l.competitors, l.crawl_pages).run();
    } catch {
      // migration 020 not applied yet: fall back to the base columns only
      await env.DB.prepare(
        `INSERT INTO plan_entitlements (plan_code,max_businesses,max_locations,max_keywords,rank_tracking_enabled,review_monitoring_enabled,reports_enabled,competitor_tracking_enabled)
         VALUES (?,?,?,?,?,?,?,?)
         ON CONFLICT(plan_code) DO UPDATE SET max_businesses=excluded.max_businesses,max_locations=excluded.max_locations,max_keywords=excluded.max_keywords,
           rank_tracking_enabled=excluded.rank_tracking_enabled,review_monitoring_enabled=excluded.review_monitoring_enabled,reports_enabled=excluded.reports_enabled,
           competitor_tracking_enabled=excluded.competitor_tracking_enabled`
      ).bind(code, l.businesses, l.locations, l.keywords, f.rank_tracking_enabled, f.review_monitoring_enabled, f.reports_enabled, f.competitor_tracking_enabled).run();
    }
  }
  synced.add(env.DB);
}

// ---- invoices ---------------------------------------------------------------------------------
const istYear = (ms) => new Date(ms + 5.5 * 3600 * 1000).getUTCFullYear();
export const formatInvoiceNumber = (year, seq) => `LB-${year}-${String(seq).padStart(6, "0")}`;

async function nextInvoiceSeq(env, year) {
  // Single atomic statement: race-safe sequential numbering.
  const row = await env.DB.prepare(
    "INSERT INTO invoice_counters (year,last_seq) VALUES (?,1) ON CONFLICT(year) DO UPDATE SET last_seq=last_seq+1 RETURNING last_seq"
  ).bind(year).first();
  return Number(row.last_seq);
}

export async function ensureInvoice(env, pay, now = Date.now()) {
  const existing = await env.DB.prepare("SELECT id FROM invoices WHERE payment_id=?").bind(pay.id).first();
  if (existing) return existing.id;
  const gst = pay.taxable_minor != null && pay.cgst_minor != null
    ? { taxable_minor: pay.taxable_minor, cgst_minor: pay.cgst_minor, sgst_minor: pay.sgst_minor }
    : computeGst(pay.amount_minor);
  const year = istYear(now);
  const number = formatInvoiceNumber(year, await nextInvoiceSeq(env, year));
  const invId = id("inv");
  await env.DB.prepare(
    `INSERT INTO invoices (id,number,user_id,payment_id,plan_code,billing_interval,taxable_minor,cgst_minor,sgst_minor,total_minor,currency,status,customer_name,customer_gstin,issued_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(invId, number, pay.user_id, pay.id, pay.plan_code, pay.billing_interval, gst.taxable_minor, gst.cgst_minor, gst.sgst_minor,
    pay.amount_minor, pay.currency || "INR", "paid", pay.billing_name || null, pay.billing_gstin || null, now).run();
  return invId;
}

// ---- subscription state -----------------------------------------------------------------------
async function logEvent(env, userId, subId, type, providerEventId, now) {
  await env.DB.prepare("INSERT INTO subscription_events (id,user_id,subscription_id,event_type,provider_event_id,created_at) VALUES (?,?,?,?,?,?)")
    .bind(id("sev"), userId, subId || null, type, providerEventId || null, now).run();
}

async function activateSubscription(env, pay, providerEventId, now) {
  const sub = await env.DB.prepare("SELECT * FROM subscriptions WHERE user_id=? ORDER BY updated_at DESC LIMIT 1").bind(pay.user_id).first();
  const stillActive = sub && ["active", "trialing"].includes(sub.status) && Number(sub.current_period_end) > now;
  const start = stillActive && sub.plan_code === pay.plan_code ? Number(sub.current_period_end) : now; // renewal extends, upgrade restarts
  const end = addPeriod(start, pay.billing_interval);
  let subId;
  if (sub) {
    subId = sub.id;
    await env.DB.prepare("UPDATE subscriptions SET plan_code=?,status='active',current_period_start=?,current_period_end=?,cancel_at_period_end=0,updated_at=? WHERE id=?")
      .bind(pay.plan_code, start, end, now, subId).run();
  } else {
    subId = id("sub");
    await env.DB.prepare("INSERT INTO subscriptions (id,user_id,plan_code,status,current_period_start,current_period_end,cancel_at_period_end,created_at,updated_at) VALUES (?,?,?,?,?,?,0,?,?)")
      .bind(subId, pay.user_id, pay.plan_code, "active", start, end, now, now).run();
  }
  await env.DB.prepare("UPDATE payments SET subscription_id=? WHERE id=?").bind(subId, pay.id).run();
  await logEvent(env, pay.user_id, subId, stillActive && sub.plan_code !== pay.plan_code ? "plan_upgraded" : "subscription_activated", providerEventId, now);
  return { id: subId, plan_code: pay.plan_code, status: "active", current_period_start: start, current_period_end: end, cancel_at_period_end: 0 };
}

// Idempotent: only the caller that flips the payment to 'paid' activates; later calls just ensure the invoice.
async function settlePayment(env, pay, providerPaymentId, providerEventId, now) {
  await ensurePlanEntitlements(env);
  const res = await env.DB.prepare(
    "UPDATE payments SET status='paid',provider_payment_id=?,verified_at=?,updated_at=? WHERE id=? AND status IN ('pending','failed')"
  ).bind(providerPaymentId, now, now, pay.id).run();
  const won = Number(res?.meta?.changes ?? res?.changes ?? 0) > 0;
  let subscription = null;
  const fresh = await env.DB.prepare("SELECT * FROM payments WHERE id=?").bind(pay.id).first();
  if (won) subscription = await activateSubscription(env, fresh, providerEventId, now);
  if (fresh.status === "paid" || fresh.status === "partially_refunded") await ensureInvoice(env, fresh, now);
  if (!subscription && fresh.subscription_id) {
    subscription = await env.DB.prepare("SELECT id,plan_code,status,current_period_start,current_period_end,cancel_at_period_end FROM subscriptions WHERE id=?").bind(fresh.subscription_id).first();
  }
  return { activated: won, subscription };
}

// ---- handlers ---------------------------------------------------------------------------------
const bad = (ctx, status, code, error) => ctx.json({ error, code }, status);
async function readJson(request) { try { return await request.json(); } catch { return null; } }

function planEntry(code) {
  const p = PLANS[code];
  const price = (i) => ({ taxable_minor: p.prices[i], ...computeGst(p.prices[i]) });
  return {
    code, name: p.name, currency: "INR", interval: "month", price_minor: p.prices.month,
    prices: { month: price("month"), year: price("year") },
    gst_inclusive: false, limits: p.limits,
  };
}

async function plansHandler(request, ctx) {
  try { await ensurePlanEntitlements(ctx.env); } catch { /* plans are served from code regardless */ }
  return ctx.json({
    provider_enabled: providerReady(ctx.env),
    currency: "INR",
    prices_exclude_gst: true,
    gst: { rate_percent: GST_RATE_PERCENT, cgst_percent: 9, sgst_percent: 9, note: "Listed prices exclude GST. 18% GST (9% CGST + 9% SGST) is added at checkout." },
    plans: Object.keys(PLANS).map(planEntry),
  });
}

async function checkoutHandler(request, ctx) {
  const { env } = ctx;
  const rl = await ctx.rateLimit(`billing_checkout:${ctx.userId}`, 10, 3600000);
  if (!rl.ok) return bad(ctx, 429, "rate_limited", "Too many checkout attempts. Try again later.");
  const body = await readJson(request);
  if (!body) return bad(ctx, 400, "invalid_json", "Invalid JSON body");
  const { plan_code, interval } = body;
  if (plan_code === "free") return bad(ctx, 400, "downgrade_not_supported", "Use cancel to move to the free plan; it takes effect at period end.");
  if (!["pro", "agency"].includes(plan_code)) return bad(ctx, 400, "invalid_plan", "plan_code must be pro or agency");
  if (!["month", "year"].includes(interval)) return bad(ctx, 400, "invalid_interval", "interval must be month or year");
  let gstin = null;
  if (body.gstin != null && String(body.gstin).trim() !== "") {
    gstin = String(body.gstin).trim().toUpperCase();
    if (!GSTIN_RE.test(gstin)) return bad(ctx, 400, "invalid_gstin", "GSTIN must be a valid 15-character GSTIN");
  }
  const name = body.billing_name == null ? null : String(body.billing_name).trim().slice(0, 120) || null;
  if (!providerReady(env)) return bad(ctx, 503, "provider_not_configured", "Payments are not configured yet");

  const now = ctx.now();
  const cur = await env.DB.prepare("SELECT plan_code,status,current_period_end FROM subscriptions WHERE user_id=? ORDER BY updated_at DESC LIMIT 1").bind(ctx.userId).first();
  if (cur && ["active", "trialing"].includes(cur.status) && Number(cur.current_period_end) > now && PLAN_RANK[plan_code] < PLAN_RANK[cur.plan_code]) {
    return bad(ctx, 409, "downgrade_at_period_end", "Downgrades take effect at the end of the current period. Cancel the current plan, then choose the lower plan after it ends.");
  }

  const gst = computeGst(PLANS[plan_code].prices[interval]);
  const payId = id("pay");
  let res, order;
  try {
    res = await fetch(RAZORPAY_ORDERS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Basic " + btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`) },
      body: JSON.stringify({ amount: gst.total_minor, currency: "INR", receipt: payId.slice(0, 40), notes: { user_id: ctx.userId, plan_code, interval } }),
    });
    order = await res.json().catch(() => null);
  } catch {
    return bad(ctx, 502, "provider_error", "Could not reach the payment provider");
  }
  if (!res.ok || !order?.id) return bad(ctx, 502, "provider_error", "The payment provider rejected the order");

  await env.DB.prepare(
    `INSERT INTO payments (id,user_id,provider_order_id,plan_code,billing_interval,amount_minor,taxable_minor,cgst_minor,sgst_minor,currency,status,billing_name,billing_gstin,raw_reference_json,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,'INR','pending',?,?,?,?,?)`
  ).bind(payId, ctx.userId, order.id, plan_code, interval, gst.total_minor, gst.taxable_minor, gst.cgst_minor, gst.sgst_minor, name, gstin,
    JSON.stringify({ order_id: order.id }), now, now).run();
  return ctx.json({ order: { id: order.id, amount: gst.total_minor, currency: "INR", key_id: env.RAZORPAY_KEY_ID }, gst });
}

async function verifyHandler(request, ctx) {
  const { env } = ctx;
  if (!env.RAZORPAY_KEY_SECRET) return bad(ctx, 503, "provider_not_configured", "Payments are not configured yet");
  const body = await readJson(request);
  const orderId = body?.razorpay_order_id, paymentId = body?.razorpay_payment_id, sig = body?.razorpay_signature;
  if (![orderId, paymentId, sig].every((v) => typeof v === "string" && v)) return bad(ctx, 400, "invalid_request", "razorpay_order_id, razorpay_payment_id and razorpay_signature are required");
  const pay = await env.DB.prepare("SELECT * FROM payments WHERE provider_order_id=? AND user_id=?").bind(orderId, ctx.userId).first();
  if (!pay) return bad(ctx, 404, "order_not_found", "Order not found");
  if (!(await verifyCheckoutSignature(env.RAZORPAY_KEY_SECRET, orderId, paymentId, sig))) return bad(ctx, 400, "invalid_signature", "Payment signature verification failed");
  if (pay.status === "refunded") return bad(ctx, 409, "order_refunded", "This order was refunded");
  const r = await settlePayment(env, pay, paymentId, null, ctx.now());
  return ctx.json({ ok: true, subscription: r.subscription });
}

async function applyRefund(env, pay, refundId, amount, eventId, now) {
  await env.DB.prepare("INSERT OR IGNORE INTO refunds (id,payment_id,user_id,amount_minor,created_at) VALUES (?,?,?,?,?)").bind(refundId, pay.id, pay.user_id, amount, now).run();
  const sum = await env.DB.prepare("SELECT COALESCE(SUM(amount_minor),0) AS s FROM refunds WHERE payment_id=?").bind(pay.id).first();
  const refunded = Number(sum.s);
  const full = refunded >= Number(pay.amount_minor);
  await env.DB.prepare("UPDATE payments SET refunded_minor=?,status=?,updated_at=? WHERE id=?").bind(refunded, full ? "refunded" : "partially_refunded", now, pay.id).run();
  if (full) {
    await env.DB.prepare("UPDATE invoices SET status='refunded' WHERE payment_id=?").bind(pay.id).run();
    if (pay.subscription_id) {
      await env.DB.prepare("UPDATE subscriptions SET status='canceled',cancel_at_period_end=0,current_period_end=?,updated_at=? WHERE id=? AND user_id=?")
        .bind(now, now, pay.subscription_id, pay.user_id).run();
    }
  }
  await logEvent(env, pay.user_id, pay.subscription_id, full ? "payment_refunded_full" : "payment_refunded_partial", eventId, now);
}

async function processWebhook(env, event, eventId, now) {
  const type = event?.event;
  const p = event?.payload?.payment?.entity;
  const refund = event?.payload?.refund?.entity;
  if (["payment.captured", "order.paid", "payment.failed"].includes(type)) {
    const orderId = p?.order_id || event?.payload?.order?.entity?.id;
    if (!orderId) return;
    const pay = await env.DB.prepare("SELECT * FROM payments WHERE provider_order_id=?").bind(orderId).first();
    if (!pay) return; // not one of our orders
    if (type === "payment.failed") {
      const r = await env.DB.prepare("UPDATE payments SET status='failed',provider_payment_id=COALESCE(?,provider_payment_id),updated_at=? WHERE id=? AND status='pending'").bind(p?.id || null, now, pay.id).run();
      if (Number(r?.meta?.changes ?? r?.changes ?? 0) > 0) await logEvent(env, pay.user_id, pay.subscription_id, "payment_failed", eventId, now);
      return;
    }
    if (!p?.id || Number(p.amount) !== Number(pay.amount_minor) || (p.currency && p.currency !== pay.currency)) {
      await logEvent(env, pay.user_id, pay.subscription_id, "payment_amount_mismatch", eventId, now);
      return; // never activate on a mismatched amount
    }
    if (p.status && p.status !== "captured") return;
    await settlePayment(env, pay, p.id, eventId, now);
  } else if (type === "refund.processed") {
    if (!refund?.id || !refund.payment_id) return;
    const pay = await env.DB.prepare("SELECT * FROM payments WHERE provider_payment_id=?").bind(refund.payment_id).first();
    if (!pay) return;
    await applyRefund(env, pay, refund.id, Number(refund.amount || 0), eventId, now);
  }
}

async function webhookHandler(request, ctx) {
  const { env } = ctx;
  if (!env.RAZORPAY_WEBHOOK_SECRET) return bad(ctx, 503, "provider_not_configured", "Webhook secret not configured");
  const raw = await request.text(); // signature is over the raw bytes, before any parsing
  const ok = await verifyWebhookSignature(env.RAZORPAY_WEBHOOK_SECRET, raw, request.headers.get("X-Razorpay-Signature"));
  if (!ok) return bad(ctx, 400, "invalid_signature", "Invalid signature");
  let event;
  try { event = JSON.parse(raw); } catch { return bad(ctx, 400, "invalid_json", "Invalid JSON"); }
  const eventId = request.headers.get("X-Razorpay-Event-Id") || "body_" + (await hmacSha256Hex("lb-webhook-dedupe", raw));
  const now = ctx.now();
  const claim = await env.DB.prepare("INSERT OR IGNORE INTO processed_webhook_events (event_id,event_type,received_at) VALUES (?,?,?)").bind(eventId, event?.event || null, now).run();
  if (!(Number(claim?.meta?.changes ?? claim?.changes ?? 0) > 0)) return ctx.json({ ok: true, duplicate: true });
  try {
    await processWebhook(env, event, eventId, now);
  } catch {
    await env.DB.prepare("DELETE FROM processed_webhook_events WHERE event_id=?").bind(eventId).run().catch(() => {});
    return bad(ctx, 500, "webhook_processing_failed", "Processing failed; retry later"); // provider retries
  }
  return ctx.json({ ok: true });
}

async function cancelHandler(request, ctx) {
  const { env } = ctx;
  const now = ctx.now();
  const sub = await env.DB.prepare("SELECT * FROM subscriptions WHERE user_id=? ORDER BY updated_at DESC LIMIT 1").bind(ctx.userId).first();
  if (!sub || !["active", "trialing"].includes(sub.status) || Number(sub.current_period_end) <= now) return bad(ctx, 404, "no_active_subscription", "No active subscription");
  if (!sub.cancel_at_period_end) {
    await env.DB.prepare("UPDATE subscriptions SET cancel_at_period_end=1,updated_at=? WHERE id=?").bind(now, sub.id).run();
    await logEvent(env, ctx.userId, sub.id, "cancel_requested", null, now);
  }
  return ctx.json({ ok: true, ends_at: Number(sub.current_period_end) });
}

async function invoicesHandler(request, ctx) {
  const rows = await ctx.env.DB.prepare("SELECT * FROM invoices WHERE user_id=? ORDER BY issued_at DESC, number DESC LIMIT 200").bind(ctx.userId).all();
  return ctx.json({
    invoices: (rows.results || []).map((r) => ({
      id: r.id, number: r.number, amount_minor: r.total_minor, taxable_minor: r.taxable_minor, cgst_minor: r.cgst_minor, sgst_minor: r.sgst_minor,
      currency: r.currency, status: r.status, plan_code: r.plan_code, interval: r.billing_interval, customer_name: r.customer_name,
      customer_gstin: r.customer_gstin, issued_at: r.issued_at, pdf_url: null,
    })),
  });
}

// ---- jobs -------------------------------------------------------------------------------------
export async function expireSubscriptions(env, now = Date.now()) {
  if (!env.DB) return { expired: 0 };
  const due = await env.DB.prepare("SELECT id,user_id FROM subscriptions WHERE status IN ('active','trialing') AND current_period_end IS NOT NULL AND current_period_end<?").bind(now).all();
  let expired = 0;
  for (const s of due.results || []) {
    const r = await env.DB.prepare("UPDATE subscriptions SET status='expired',updated_at=? WHERE id=? AND status IN ('active','trialing') AND current_period_end<?").bind(now, s.id, now).run();
    if (Number(r?.meta?.changes ?? r?.changes ?? 0) > 0) { expired++; await logEvent(env, s.user_id, s.id, "subscription_expired", null, now); }
  }
  return { expired };
}

export const routes = [
  { method: "GET", path: "/api/billing/plans", auth: "public", handler: plansHandler },
  { method: "POST", path: "/api/billing/checkout", auth: "session", handler: checkoutHandler },
  { method: "POST", path: "/api/billing/verify", auth: "session", handler: verifyHandler },
  { method: "POST", path: "/api/billing/webhook", auth: "public", handler: webhookHandler },
  { method: "POST", path: "/api/billing/cancel", auth: "session", handler: cancelHandler },
  { method: "GET", path: "/api/billing/invoices", auth: "session", handler: invoicesHandler },
];
export const jobs = [{ name: "billing_expire_subscriptions", run: (env) => expireSubscriptions(env) }];
