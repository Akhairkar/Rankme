// Google OAuth callback, session creation, encrypted token storage and GBP discovery.
// Runs only on the Worker (server side). Secrets come from Worker secrets, never from Git.

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export const sha256Hex = async (v) => hex(await crypto.subtle.digest("SHA-256", enc.encode(v)));

const STATE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const FRONTEND = "https://www.localboost.in";

async function aesKey(secret) {
  if (!secret || secret.length < 24) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY missing or too short");
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptToken(secret, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(secret), enc.encode(plaintext));
  return "v1." + b64(iv) + "." + b64(ct);
}

export async function decryptToken(secret, value) {
  const [v, iv, ct] = String(value).split(".");
  if (v !== "v1" || !iv || !ct) throw new Error("Unsupported ciphertext");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await aesKey(secret), unb64(ct));
  return dec.decode(pt);
}

function fail(code) {
  return Response.redirect(FRONTEND + "/dashboard/google-profile.html?google_error=" + encodeURIComponent(code), 302);
}

export async function handleGoogleCallback(request, env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI || !env.GOOGLE_TOKEN_ENCRYPTION_KEY || !env.DB) {
    return Response.json({ error: "Google OAuth is not configured for production." }, { status: 503 });
  }
  const url = new URL(request.url);
  if (url.searchParams.get("error")) return fail("access_denied");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return fail("invalid_request");

  // One-time state check (CSRF protection).
  const stateHash = await sha256Hex(state);
  const row = await env.DB.prepare("SELECT created_at FROM oauth_states WHERE state_hash=?").bind(stateHash).first();
  await env.DB.prepare("DELETE FROM oauth_states WHERE state_hash=?").bind(stateHash).run();
  if (!row || Date.now() - row.created_at > STATE_TTL_MS) return fail("invalid_state");

  // Exchange the authorization code server side.
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return fail("token_exchange_failed");
  const tokens = await tokenRes.json();
  if (!tokens.access_token) return fail("token_exchange_failed");

  // Resolve the Google identity from the access token.
  const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: "Bearer " + tokens.access_token },
  });
  if (!infoRes.ok) return fail("identity_failed");
  const info = await infoRes.json();
  if (!info.sub || !info.email) return fail("identity_failed");

  const now = Date.now();
  const existing = await env.DB.prepare("SELECT id FROM users WHERE google_sub=?").bind(info.sub).first();
  const userId = existing?.id || "usr_" + crypto.randomUUID();
  if (existing) {
    await env.DB.prepare("UPDATE users SET email=?,name=?,picture_url=?,updated_at=? WHERE id=?")
      .bind(info.email, info.name || null, info.picture || null, now, userId).run();
  } else {
    await env.DB.prepare("INSERT INTO users (id,google_sub,email,name,picture_url,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
      .bind(userId, info.sub, info.email, info.name || null, info.picture || null, now, now).run();
  }

  // Persist the refresh token encrypted. Google only returns it on first consent; keep the old one otherwise.
  if (tokens.refresh_token) {
    const ct = await encryptToken(env.GOOGLE_TOKEN_ENCRYPTION_KEY, tokens.refresh_token);
    await env.DB.prepare(
      "INSERT INTO google_connections (user_id,refresh_token_ciphertext,scope,updated_at) VALUES (?,?,?,?) " +
      "ON CONFLICT(user_id) DO UPDATE SET refresh_token_ciphertext=excluded.refresh_token_ciphertext,scope=excluded.scope,updated_at=excluded.updated_at"
    ).bind(userId, ct, tokens.scope || "", now).run();
  }

  // Create the session. Only a hash of the id is stored.
  const sid = hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare("INSERT INTO sessions (id_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)")
    .bind(await sha256Hex(sid), userId, now + SESSION_TTL_MS, now).run();
  // Opportunistic cleanup of expired rows.
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at<?").bind(now).run();
  await env.DB.prepare("DELETE FROM oauth_states WHERE created_at<?").bind(now - STATE_TTL_MS).run();

  const headers = new Headers({ location: FRONTEND + "/dashboard/google-profile.html?connected=1" });
  headers.append("set-cookie", `lb_session=${sid}; Path=/; Max-Age=${SESSION_TTL_MS / 1000}; HttpOnly; Secure; SameSite=Lax`);
  return new Response(null, { status: 302, headers });
}

export async function handleLogout(request, env, userId) {
  const m = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)lb_session=([^;]+)/);
  if (m && env.DB) await env.DB.prepare("DELETE FROM sessions WHERE id_hash=?").bind(await sha256Hex(decodeURIComponent(m[1]))).run();
  return new Headers({ "set-cookie": "lb_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax" });
}

async function accessTokenFor(env, userId) {
  const conn = await env.DB.prepare("SELECT refresh_token_ciphertext FROM google_connections WHERE user_id=?").bind(userId).first();
  if (!conn) return null;
  const refresh = await decryptToken(env.GOOGLE_TOKEN_ENCRYPTION_KEY, conn.refresh_token_ciphertext);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  return (await res.json()).access_token || null;
}

const READ_MASK = "name,title,storefrontAddress,categories,phoneNumbers,websiteUri,regularHours,profile,metadata";

// Discover Business Profile accounts and locations and store only what the dashboard needs.
export async function syncGoogleLocations(env, userId) {
  const token = await accessTokenFor(env, userId);
  if (!token) return { state: "awaiting_google_connection", status: 409 };
  const auth = { authorization: "Bearer " + token };
  const accRes = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", { headers: auth });
  if (!accRes.ok) return { state: "provider_error", status: 502, upstream: accRes.status };
  const accounts = (await accRes.json()).accounts || [];
  let count = 0;
  const now = Date.now();
  for (const account of accounts) {
    let pageToken = "";
    do {
      const q = new URLSearchParams({ readMask: READ_MASK, pageSize: "100" });
      if (pageToken) q.set("pageToken", pageToken);
      const locRes = await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?` + q, { headers: auth });
      if (!locRes.ok) return { state: "provider_error", status: 502, upstream: locRes.status };
      const data = await locRes.json();
      for (const loc of data.locations || []) {
        await env.DB.prepare(
          "INSERT INTO google_locations (user_id,resource_name,account_name,location_name,raw_json,synced_at) VALUES (?,?,?,?,?,?) " +
          "ON CONFLICT(user_id,resource_name) DO UPDATE SET account_name=excluded.account_name,location_name=excluded.location_name,raw_json=excluded.raw_json,synced_at=excluded.synced_at"
        ).bind(userId, loc.name, account.name, loc.title || null, JSON.stringify(loc), now).run();
        count++;
      }
      pageToken = data.nextPageToken || "";
    } while (pageToken);
  }
  return { state: count ? "verified_data" : "no_locations_found", accounts: accounts.length, locations: count, status: 200 };
}
