import test from "node:test";
import assert from "node:assert/strict";
import { encryptToken, decryptToken, handleGoogleCallback, sha256Hex } from "../src/oauth.js";

// Minimal in-memory D1 stand-in covering the statements the callback uses.
function fakeDB() {
  const t = { oauth_states: new Map(), users: new Map(), google_connections: new Map(), sessions: new Map() };
  return {
    t,
    prepare(sql) {
      return {
        bind(...a) {
          return {
            async first() {
              if (sql.startsWith("SELECT created_at FROM oauth_states")) return t.oauth_states.has(a[0]) ? { created_at: t.oauth_states.get(a[0]) } : null;
              if (sql.startsWith("SELECT id FROM users")) return [...t.users.values()].find((u) => u.google_sub === a[0]) || null;
              return null;
            },
            async run() {
              if (sql.startsWith("DELETE FROM oauth_states WHERE state_hash")) t.oauth_states.delete(a[0]);
              else if (sql.startsWith("INSERT INTO users")) t.users.set(a[0], { id: a[0], google_sub: a[1], email: a[2] });
              else if (sql.startsWith("INSERT INTO google_connections")) t.google_connections.set(a[0], a[1]);
              else if (sql.startsWith("INSERT INTO sessions")) t.sessions.set(a[0], a[1]);
              return {};
            },
          };
        },
      };
    },
  };
}
const env = (db) => ({ DB: db, GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s", GOOGLE_REDIRECT_URI: "https://api.localboost.in/auth/google/callback", GOOGLE_TOKEN_ENCRYPTION_KEY: "x".repeat(40) });

test("token encryption round trips and is not plaintext", async () => {
  const ct = await encryptToken("k".repeat(32), "refresh-123");
  assert.ok(!ct.includes("refresh-123"));
  assert.equal(await decryptToken("k".repeat(32), ct), "refresh-123");
  await assert.rejects(decryptToken("z".repeat(32), ct));
});

test("callback rejects unknown state", async () => {
  const r = await handleGoogleCallback(new Request("https://api.localboost.in/auth/google/callback?code=a&state=nope"), env(fakeDB()));
  assert.match(r.headers.get("location"), /google_error=invalid_state/);
});

test("callback creates user, encrypted token and hashed session", async () => {
  const db = fakeDB();
  db.t.oauth_states.set(await sha256Hex("good"), Date.now());
  globalThis.fetch = async (u) =>
    String(u).includes("oauth2.googleapis.com/token")
      ? Response.json({ access_token: "at", refresh_token: "rt", scope: "s" })
      : Response.json({ sub: "g1", email: "a@b.in", name: "A" });
  const r = await handleGoogleCallback(new Request("https://api.localboost.in/auth/google/callback?code=c&state=good"), env(db));
  assert.match(r.headers.get("location"), /connected=1/);
  const cookie = r.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly; Secure; SameSite=Lax/);
  const sid = cookie.match(/lb_session=([0-9a-f]+)/)[1];
  assert.ok(db.t.sessions.has(await sha256Hex(sid)) && !db.t.sessions.has(sid));
  assert.ok(![...db.t.google_connections.values()][0].includes("rt"));
  assert.equal(db.t.oauth_states.size, 0, "state is single-use");
});
