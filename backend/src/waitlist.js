// Public waitlist / lead capture. No account needed; only minimal contact data is stored.
import { sha256Hex } from "./oauth.js";

const clip = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const PHONE = /^[6-9][0-9]{9}$/;
const HOURLY_LIMIT = 8;

export function validateLead(body) {
  if (!body || typeof body !== "object") return { error: "Invalid request" };
  if (clip(body.website, 200)) return { error: "ignored", silent: true }; // honeypot
  if (body.consent !== true) return { error: "Consent is required" };
  const email = clip(body.email, 254).toLowerCase();
  const phone = clip(body.phone, 15).replace(/[\s-]/g, "").replace(/^(\+91|91)(?=[6-9][0-9]{9}$)/, "");
  if (!email && !phone) return { error: "Email or mobile number is required" };
  if (email && !EMAIL.test(email)) return { error: "Enter a valid email address" };
  if (phone && !PHONE.test(phone)) return { error: "Enter a valid 10-digit mobile number" };
  const score = Number.isInteger(body.score) && body.score >= 0 && body.score <= 100 ? body.score : null;
  return {
    lead: {
      email: email || null,
      phone: phone || null,
      name: clip(body.name, 80) || null,
      business_name: clip(body.business_name, 120) || null,
      city: clip(body.city, 120) || null,
      source: clip(body.source, 40) || "unknown",
      score,
      lang: body.lang === "hi" ? "hi" : "en",
    },
  };
}

export async function handleWaitlist(request, env, json) {
  if (!env.DB) return json({ error: "Database unavailable" }, 503);
  const body = await request.json().catch(() => null);
  const v = validateLead(body);
  if (v.silent) return json({ ok: true });
  if (v.error) return json({ error: v.error }, 400);
  const l = v.lead;
  const now = Date.now();
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const ipHash = await sha256Hex(ip + ":" + (env.GOOGLE_TOKEN_ENCRYPTION_KEY || "lb"));
  const recent = await env.DB.prepare("SELECT COUNT(*) AS c FROM waitlist WHERE ip_hash=? AND updated_at>?").bind(ipHash, now - 3600000).first();
  if (Number(recent?.c || 0) >= HOURLY_LIMIT) return json({ error: "Too many requests. Try again later." }, 429);
  const key = l.email || "tel:" + l.phone;
  await env.DB.prepare(
    "INSERT INTO waitlist (id,contact_key,email,phone,name,business_name,city,source,score,lang,ip_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) " +
    "ON CONFLICT(contact_key) DO UPDATE SET phone=COALESCE(excluded.phone,phone),name=COALESCE(excluded.name,name),business_name=COALESCE(excluded.business_name,business_name),city=COALESCE(excluded.city,city),source=excluded.source,score=COALESCE(excluded.score,score),ip_hash=excluded.ip_hash,updated_at=excluded.updated_at"
  ).bind("wl_" + crypto.randomUUID(), key, l.email, l.phone, l.name, l.business_name, l.city, l.source, l.score, l.lang, ipHash, now, now).run();
  return json({ ok: true });
}
