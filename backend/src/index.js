const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "https://localboost.in,https://www.localboost.in").split(",").map(s => s.trim()).filter(Boolean);
  return { "access-control-allow-origin": allowed.includes(origin) ? origin : allowed[0], "access-control-allow-credentials": "true", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };
}

function withCors(response, request, env) {
  const h = new Headers(response.headers);
  Object.entries(corsHeaders(request, env)).forEach(([k,v]) => h.set(k,v));
  return new Response(response.body, { status: response.status, headers: h });
}

async function health(env) {
  let db = "unavailable";
  if (env.DB) {
    try { await env.DB.prepare("SELECT 1").first(); db = "ok"; } catch (_) { db = "error"; }
  }
  return json({ ok: true, service: "localboost-api", database: db });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    const url = new URL(request.url);
    try {
      if (url.pathname === "/health" && request.method === "GET") return withCors(await health(env), request, env);
      if (url.pathname === "/api/me" && request.method === "GET") return withCors(json({ authenticated: false, user: null, message: "Google account connection is required." }), request, env);
      if (url.pathname === "/api/businesses" && request.method === "GET") return withCors(json({ businesses: [] }), request, env);
      if (url.pathname === "/api/keywords" && request.method === "GET") return withCors(json({ keywords: [] }), request, env);
      if (url.pathname === "/api/action-center" && request.method === "GET") return withCors(json({ score: null, actions: [], state: "awaiting_verified_data" }), request, env);
      if (url.pathname === "/auth/google/start" && request.method === "GET") return withCors(json({ error: "Google OAuth is not configured for production yet." }, 503), request, env);
      return withCors(json({ error: "Not found" }, 404), request, env);
    } catch (error) {
      return withCors(json({ error: "Internal server error" }, 500), request, env);
    }
  }
};
