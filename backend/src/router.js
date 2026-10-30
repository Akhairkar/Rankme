// Module router. Feature modules export `routes` (see routes.js) instead of editing index.js.
// Route: { method, path, auth: "public" | "session", handler(request, ctx) -> Response }
// ctx: { env, url, userId, json(data,status), getUserBusiness(id), requireFeature(name),
//        rateLimit(key, limit, windowMs) -> {ok}, ip, now() }
import { routes } from "./routes.js";

const enc = new TextEncoder();
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

export async function rateLimit(env, key, limit = 60, windowMs = 60000) {
  if (!env.DB) return { ok: true };
  const now = Date.now();
  const windowStart = now - (now % windowMs);
  const k = key + ":" + windowStart;
  try {
    await env.DB.prepare(
      "INSERT INTO rate_limits (key,window_start,count) VALUES (?,?,1) ON CONFLICT(key) DO UPDATE SET count=count+1"
    ).bind(k, windowStart).run();
    const row = await env.DB.prepare("SELECT count FROM rate_limits WHERE key=?").bind(k).first();
    if (Math.random() < 0.01) await env.DB.prepare("DELETE FROM rate_limits WHERE window_start<?").bind(now - 3600000).run();
    return { ok: Number(row?.count || 0) <= limit };
  } catch {
    return { ok: true }; // fail open on infrastructure error, never block users because of the limiter
  }
}

export async function routeModules(request, env, url, deps) {
  const route = routes.find((r) => r.method === request.method && r.path === url.pathname);
  if (!route) return null;
  const { json, requestUser, getUserBusiness, requireFeature } = deps;
  let userId = null;
  if (route.auth === "session") {
    userId = await requestUser(request, env);
    if (!userId) return json({ error: "Authentication required" }, 401);
  }
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const ctx = {
    env, url, userId, ip, json,
    now: () => Date.now(),
    getUserBusiness: (id) => getUserBusiness(env, userId, id),
    requireFeature: (name) => requireFeature(env, userId, name),
    rateLimit: (key, limit, windowMs) => rateLimit(env, key, limit, windowMs),
  };
  try {
    return await route.handler(request, ctx);
  } catch (e) {
    return json({ error: "Internal server error", code: "internal_error" }, 500);
  }
}
