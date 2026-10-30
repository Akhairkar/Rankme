import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { routes, jobs, computeGst, PLANS, addPeriod, formatInvoiceNumber, expireSubscriptions, ensurePlanEntitlements, verifyCheckoutSignature } from "../src/billing.js";
import { getSubscriptionEntitlements } from "../src/db.js";

const dir = new URL("../migrations/", import.meta.url);
function makeDB() {
  const sql = new DatabaseSync(":memory:");
  for (const f of ["000_base.sql", "020_billing.sql"]) sql.exec(fs.readFileSync(new URL(f, dir), "utf8"));
  const wrap = (s, a) => ({
    async first() { return s.get(...a) ?? null; },
    async all() { return { results: s.all(...a) }; },
    async run() { const r = s.run(...a); return { meta: { changes: Number(r.changes) } }; },
  });
  return { sql, prepare: (q) => { const s = sql.prepare(q); return { bind: (...a) => wrap(s, a), ...wrap(s, []) }; } };
}

const KEY_ID = "rzp_test_abc", KEY_SECRET = "key_secret_xyz", WH_SECRET = "wh_secret_123";
const hmac = (k, m) => crypto.createHmac("sha256", k).update(m).digest("hex");
const route = (m, p) => routes.find((r) => r.method === m && r.path === p);
function setup(over = {}) {
  const db = makeDB();
  db.sql.exec("INSERT INTO users (id,google_sub,email,created_at,updated_at) VALUES ('u1','g1','a@b.in',1,1),('u2','g2','c@d.in',1,1)");
  const env = { DB: db, PAYMENT_PROVIDER_ENABLED: "true", RAZORPAY_KEY_ID: KEY_ID, RAZORPAY_KEY_SECRET: KEY_SECRET, RAZORPAY_WEBHOOK_SECRET: WH_SECRET, ...over };
  return { db, env };
}
function call(env, m, p, { userId = "u1", body, headers = {}, raw, now = Date.now() } = {}) {
  const r = route(m, p);
  const ctx = {
    env, userId, ip: "1.1.1.1", now: () => now, url: new URL("https://x" + p),
    json: (d, s = 200) => Response.json(d, { status: s }),
    rateLimit: async () => ({ ok: true }),
  };
  const init = { method: m, headers };
  if (raw !== undefined) init.body = raw; else if (body !== undefined) init.body = JSON.stringify(body);
  return r.handler(new Request("https://x" + p, init), ctx);
}
let orderSeq = 0;
function mockRazorpay(calls = []) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const b = JSON.parse(init.body);
    return Response.json({ id: "order_" + ++orderSeq, amount: b.amount, currency: "INR" });
  };
  return calls;
}
async function checkout(env, body = { plan_code: "pro", interval: "month" }, opts = {}) {
  const res = await call(env, "POST", "/api/billing/checkout", { body, ...opts });
  return { res, data: await res.json() };
}
const verifyBody = (orderId, payId = "pay_1") => ({ razorpay_order_id: orderId, razorpay_payment_id: payId, razorpay_signature: hmac(KEY_SECRET, `${orderId}|${payId}`) });

test("GST math: 18% split into CGST 9 + SGST 9", () => {
  assert.deepEqual(computeGst(99900), { taxable_minor: 99900, cgst_minor: 8991, sgst_minor: 8991, total_minor: 117882 });
  const g = computeGst(PLANS.agency.prices.year);
  assert.equal(g.cgst_minor, g.sgst_minor);
  assert.equal(g.total_minor, g.taxable_minor + 2 * g.cgst_minor);
  assert.equal(PLANS.pro.prices.year, 899900);
});

test("period math and invoice number format", () => {
  assert.equal(new Date(addPeriod(Date.UTC(2026, 0, 31), "year")).getUTCFullYear(), 2027);
  assert.equal(formatInvoiceNumber(2026, 1), "LB-2026-000001");
});

test("plans endpoint is public, states GST exclusion, and syncs plan_entitlements", async () => {
  const { env } = setup();
  const res = await call(env, "GET", "/api/billing/plans", { userId: null });
  const d = await res.json();
  assert.equal(d.provider_enabled, true);
  assert.equal(d.prices_exclude_gst, true);
  assert.deepEqual(d.plans.map((p) => p.code), ["free", "pro", "agency"]);
  assert.equal(d.plans[1].price_minor, 99900);
  const row = env.DB.sql.prepare("SELECT * FROM plan_entitlements WHERE plan_code='agency'").get();
  assert.equal(row.max_businesses, 10);
  assert.equal(row.rank_tracking_enabled, 1);
  const free = env.DB.sql.prepare("SELECT * FROM plan_entitlements WHERE plan_code='free'").get();
  assert.equal(free.reports_enabled, 0);
});

test("checkout: provider_not_configured -> 503", async () => {
  for (const over of [{ PAYMENT_PROVIDER_ENABLED: "false" }, { RAZORPAY_KEY_SECRET: undefined }]) {
    const { env } = setup(over);
    const { res, data } = await checkout(env);
    assert.equal(res.status, 503);
    assert.equal(data.code, "provider_not_configured");
  }
});

test("checkout validation: plan, interval, free downgrade, gstin", async () => {
  const { env } = setup();
  mockRazorpay();
  assert.equal((await checkout(env, { plan_code: "free", interval: "month" })).res.status, 400);
  assert.equal((await checkout(env, { plan_code: "gold", interval: "month" })).data.code, "invalid_plan");
  assert.equal((await checkout(env, { plan_code: "pro", interval: "week" })).data.code, "invalid_interval");
  assert.equal((await checkout(env, { plan_code: "pro", interval: "month", gstin: "BAD" })).data.code, "invalid_gstin");
  assert.equal((await checkout(env, { plan_code: "pro", interval: "month", gstin: "27AAPFU0939F1ZV" })).res.status, 200);
});

test("checkout creates Razorpay order with Basic auth, GST-inclusive amount, pending payment; no secret in response", async () => {
  const { env } = setup();
  const calls = mockRazorpay();
  const { res, data } = await checkout(env, { plan_code: "pro", interval: "month", billing_name: "Acme Dental" });
  assert.equal(res.status, 200);
  assert.equal(calls[0].url, "https://api.razorpay.com/v1/orders");
  assert.equal(calls[0].init.headers.Authorization, "Basic " + Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64"));
  assert.equal(data.order.amount, 117882);
  assert.equal(data.order.key_id, KEY_ID);
  assert.ok(!JSON.stringify(data).includes(KEY_SECRET));
  const p = env.DB.sql.prepare("SELECT * FROM payments").get();
  assert.equal(p.status, "pending");
  assert.equal(p.provider_order_id, data.order.id);
  assert.equal(p.cgst_minor, 8991);
  assert.equal(env.DB.sql.prepare("SELECT COUNT(*) c FROM subscriptions").get().c, 0, "no subscription before payment");
});

test("verify: valid signature activates, is idempotent, creates one invoice, status reads consistent", async () => {
  const { env } = setup();
  mockRazorpay();
  const { data } = await checkout(env);
  const now = Date.now();
  const r1 = await call(env, "POST", "/api/billing/verify", { body: verifyBody(data.order.id), now });
  const d1 = await r1.json();
  assert.equal(r1.status, 200);
  assert.equal(d1.subscription.plan_code, "pro");
  assert.equal(d1.subscription.current_period_end, addPeriod(now, "month"));
  const r2 = await call(env, "POST", "/api/billing/verify", { body: verifyBody(data.order.id), now: now + 1000 });
  assert.equal(r2.status, 200);
  assert.equal(env.DB.sql.prepare("SELECT COUNT(*) c FROM subscriptions").get().c, 1);
  assert.equal(env.DB.sql.prepare("SELECT COUNT(*) c FROM invoices").get().c, 1);
  assert.equal(env.DB.sql.prepare("SELECT COUNT(*) c FROM subscription_events WHERE event_type='subscription_activated'").get().c, 1);
  assert.equal(env.DB.sql.prepare("SELECT status FROM payments").get().status, "paid");
  const ent = await getSubscriptionEntitlements(env, "u1");
  assert.equal(ent.plan_code, "pro");
  assert.equal(ent.status, "active");
});

test("verify: bad signature and tampered payment id are rejected and nothing is activated", async () => {
  const { env } = setup();
  mockRazorpay();
  const { data } = await checkout(env);
  const b = verifyBody(data.order.id);
  const r1 = await call(env, "POST", "/api/billing/verify", { body: { ...b, razorpay_signature: "0".repeat(64) } });
  assert.equal(r1.status, 400);
  const r2 = await call(env, "POST", "/api/billing/verify", { body: { ...b, razorpay_payment_id: "pay_other" } });
  assert.equal(r2.status, 400);
  assert.equal(env.DB.sql.prepare("SELECT status FROM payments").get().status, "pending");
  assert.equal(env.DB.sql.prepare("SELECT COUNT(*) c FROM subscriptions").get().c, 0);
  assert.equal(await verifyCheckoutSignature(KEY_SECRET, "o", "p", hmac(KEY_SECRET, "o|p")), true);
  assert.equal(await verifyCheckoutSignature(KEY_SECRET, "o", "p", hmac(KEY_SECRET, "o|q")), false);
});

test("verify: another user cannot claim someone else's order", async () => {
  const { env } = setup();
  mockRazorpay();
  const { data } = await checkout(env);
  const r = await call(env, "POST", "/api/billing/verify", { userId: "u2", body: verifyBody(data.order.id) });
  assert.equal(r.status, 404);
  assert.equal(env.DB.sql.prepare("SELECT COUNT(*) c FROM subscriptions").get().c, 0);
});

function whEvent(type, entity, extra = {}) {
  return { event: type, payload: { payment: { entity }, ...extra } };
}
async function webhook(env, evt, { eventId = "evt_1", sig, raw } = {}) {
  raw = raw ?? JSON.stringify(evt);
  return call(env, "POST", "/api/billing/webhook", { userId: null, raw, headers: { "X-Razorpay-Signature": sig ?? hmac(WH_SECRET, raw), "X-Razorpay-Event-Id": eventId } });
}

test("webhook: bad signature -> 400; signature is over RAW body (reformatted JSON fails)", async () => {
  const { env } = setup();
  const evt = whEvent("payment.captured", { id: "pay_1", order_id: "o", amount: 1, status: "captured" });
  const raw = JSON.stringify(evt);
  assert.equal((await webhook(env, evt, { sig: "deadbeef" })).status, 400);
  assert.equal((await webhook(env, evt, { raw: JSON.stringify(evt, null, 2), sig: hmac(WH_SECRET, raw) })).status, 400);
  assert.equal((await webhook(env, evt, { raw: "not json", sig: hmac(WH_SECRET, "not json") })).status, 400);
  assert.equal(env.DB.sql.prepare("SELECT COUNT(*) c FROM processed_webhook_events").get().c, 0);
});

test("webhook: payment.captured activates once, replay returns 200 duplicate", async () => {
  const { env } = setup();
  mockRazorpay();
  const { data } = await checkout(env, { plan_code: "agency", interval: "year" });
  const evt = whEvent("payment.captured", { id: "pay_9", order_id: data.order.id, amount: data.order.amount, currency: "INR", status: "captured" });
  const r1 = await webhook(env, evt);
  assert.equal(r1.status, 200);
  const r2 = await webhook(env, evt);
  assert.equal(r2.status, 200);
  assert.equal((await r2.json()).duplicate, true);
  // a different event id for the same payment must still not double-activate or double-invoice
  assert.equal((await webhook(env, evt, { eventId: "evt_2" })).status, 200);
  assert.equal(env.DB.sql.prepare("SELECT COUNT(*) c FROM invoices").get().c, 1);
  assert.equal(env.DB.sql.prepare("SELECT COUNT(*) c FROM subscription_events WHERE event_type='subscription_activated'").get().c, 1);
  const sub = env.DB.sql.prepare("SELECT * FROM subscriptions").get();
  assert.equal(sub.plan_code, "agency");
  assert.equal(sub.status, "active");
});

test("webhook: tampered/mismatched amount never activates", async () => {
  const { env } = setup();
  mockRazorpay();
  const { data } = await checkout(env);
  await webhook(env, whEvent("payment.captured", { id: "pay_x", order_id: data.order.id, amount: 100, currency: "INR", status: "captured" }));
  assert.equal(env.DB.sql.prepare("SELECT status FROM payments").get().status, "pending");
  assert.equal(env.DB.sql.prepare("SELECT COUNT(*) c FROM subscriptions").get().c, 0);
  assert.equal(env.DB.sql.prepare("SELECT COUNT(*) c FROM subscription_events WHERE event_type='payment_amount_mismatch'").get().c, 1);
});

test("webhook: payment.failed marks failed and does not downgrade a paid payment", async () => {
  const { env } = setup();
  mockRazorpay();
  const { data } = await checkout(env);
  await webhook(env, whEvent("payment.failed", { id: "pay_f", order_id: data.order.id, amount: data.order.amount, status: "failed" }), { eventId: "e_f" });
  assert.equal(env.DB.sql.prepare("SELECT status FROM payments").get().status, "failed");
  // user retries successfully
  await call(env, "POST", "/api/billing/verify", { body: verifyBody(data.order.id, "pay_ok") });
  assert.equal(env.DB.sql.prepare("SELECT status FROM payments").get().status, "paid");
  await webhook(env, whEvent("payment.failed", { id: "pay_f2", order_id: data.order.id, amount: data.order.amount, status: "failed" }), { eventId: "e_f2" });
  assert.equal(env.DB.sql.prepare("SELECT status FROM payments").get().status, "paid");
});

test("webhook: partial then full refund downgrades only on full refund", async () => {
  const { env } = setup();
  mockRazorpay();
  const { data } = await checkout(env);
  await call(env, "POST", "/api/billing/verify", { body: verifyBody(data.order.id, "pay_r") });
  const refundEvt = (rid, amount) => ({ event: "refund.processed", payload: { refund: { entity: { id: rid, payment_id: "pay_r", amount } } } });
  await webhook(env, refundEvt("rfnd_1", 1000), { eventId: "e_r1" });
  assert.equal(env.DB.sql.prepare("SELECT status FROM payments").get().status, "partially_refunded");
  assert.equal((await getSubscriptionEntitlements(env, "u1")).plan_code, "pro");
  await webhook(env, refundEvt("rfnd_2", data.order.amount - 1000), { eventId: "e_r2" });
  assert.equal(env.DB.sql.prepare("SELECT status FROM payments").get().status, "refunded");
  assert.equal(env.DB.sql.prepare("SELECT status FROM invoices").get().status, "refunded");
  assert.equal((await getSubscriptionEntitlements(env, "u1")).plan_code, "free");
});

test("invoice numbering is sequential and per-year; invoices endpoint lists GST split", async () => {
  const { env } = setup();
  mockRazorpay();
  for (const [uid, pid] of [["u1", "pay_a"], ["u2", "pay_b"], ["u1", "pay_c"]]) {
    const { data } = await checkout(env, { plan_code: "pro", interval: "month", billing_name: "N" }, { userId: uid });
    await call(env, "POST", "/api/billing/verify", { userId: uid, body: verifyBody(data.order.id, pid), now: Date.UTC(2026, 5, 1) });
  }
  const nums = env.DB.sql.prepare("SELECT number FROM invoices ORDER BY number").all().map((r) => r.number);
  assert.deepEqual(nums, ["LB-2026-000001", "LB-2026-000002", "LB-2026-000003"]);
  const d = await (await call(env, "GET", "/api/billing/invoices", { userId: "u2" })).json();
  assert.equal(d.invoices.length, 1);
  assert.equal(d.invoices[0].amount_minor, 117882);
  assert.equal(d.invoices[0].cgst_minor, 8991);
  assert.equal(d.invoices[0].pdf_url, null);
  // a different calendar year restarts the sequence
  const { data } = await checkout(env, { plan_code: "agency", interval: "month" });
  await call(env, "POST", "/api/billing/verify", { body: verifyBody(data.order.id, "pay_d"), now: Date.UTC(2027, 5, 1) });
  assert.ok(env.DB.sql.prepare("SELECT 1 FROM invoices WHERE number='LB-2027-000001'").get());
});

test("no fake invoices: pending/failed payments have none", async () => {
  const { env } = setup();
  mockRazorpay();
  await checkout(env);
  assert.equal(env.DB.sql.prepare("SELECT COUNT(*) c FROM invoices").get().c, 0);
});

test("cancel keeps access until period end; downgrade checkout is blocked; upgrade allowed", async () => {
  const { env } = setup();
  mockRazorpay();
  assert.equal((await call(env, "POST", "/api/billing/cancel")).status, 404);
  const a = await checkout(env, { plan_code: "agency", interval: "month" });
  await call(env, "POST", "/api/billing/verify", { body: verifyBody(a.data.order.id, "pay_ag") });
  const down = await checkout(env, { plan_code: "pro", interval: "month" });
  assert.equal(down.res.status, 409);
  const c = await call(env, "POST", "/api/billing/cancel");
  const cd = await c.json();
  assert.equal(c.status, 200);
  const sub = env.DB.sql.prepare("SELECT * FROM subscriptions").get();
  assert.equal(sub.cancel_at_period_end, 1);
  assert.equal(cd.ends_at, sub.current_period_end);
  assert.equal((await getSubscriptionEntitlements(env, "u1")).plan_code, "agency");
});

test("upgrade pro -> agency via new checkout switches plan", async () => {
  const { env } = setup();
  mockRazorpay();
  const p = await checkout(env);
  await call(env, "POST", "/api/billing/verify", { body: verifyBody(p.data.order.id, "pay_p") });
  const a = await checkout(env, { plan_code: "agency", interval: "month" });
  assert.equal(a.res.status, 200);
  await call(env, "POST", "/api/billing/verify", { body: verifyBody(a.data.order.id, "pay_a2") });
  assert.equal((await getSubscriptionEntitlements(env, "u1")).plan_code, "agency");
  assert.equal(env.DB.sql.prepare("SELECT COUNT(*) c FROM subscriptions").get().c, 1);
});

test("expiry job downgrades past-due subscriptions, idempotent, ignores current ones", async () => {
  const { env } = setup();
  mockRazorpay();
  const p = await checkout(env);
  const t0 = Date.UTC(2026, 0, 1);
  await call(env, "POST", "/api/billing/verify", { body: verifyBody(p.data.order.id, "pay_e"), now: t0 });
  assert.deepEqual(await expireSubscriptions(env, t0 + 86400000), { expired: 0 });
  const later = addPeriod(t0, "month") + 1;
  assert.deepEqual(await expireSubscriptions(env, later), { expired: 1 });
  assert.deepEqual(await expireSubscriptions(env, later + 1000), { expired: 0 });
  assert.equal(env.DB.sql.prepare("SELECT status FROM subscriptions").get().status, "expired");
  assert.equal(env.DB.sql.prepare("SELECT COUNT(*) c FROM subscription_events WHERE event_type='subscription_expired'").get().c, 1);
  assert.equal((await getSubscriptionEntitlements(env, "u1")).plan_code, "free");
  assert.equal(jobs[0].name, "billing_expire_subscriptions");
});

test("ensurePlanEntitlements is idempotent", async () => {
  const { env } = setup();
  await ensurePlanEntitlements(env);
  await ensurePlanEntitlements(env);
  assert.equal(env.DB.sql.prepare("SELECT COUNT(*) c FROM plan_entitlements").get().c, 3);
});
