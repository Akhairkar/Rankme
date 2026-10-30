import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { rateLimit } from "../src/router.js";

test("rate limiter fails closed when the database is missing or errors", async () => {
  assert.equal((await rateLimit({}, "k", 5)).ok, false);
  const broken = { DB: { prepare() { throw new Error("db down"); } } };
  assert.equal((await rateLimit(broken, "k", 5)).ok, false);
});

test("every response carries a request id", async () => {
  const r = await worker.fetch(new Request("https://api.localboost.in/health"), {});
  assert.match(r.headers.get("x-request-id") || "", /^[0-9a-f-]{36}$/);
  const bad = await worker.fetch(new Request("https://api.localboost.in/nope"), {});
  assert.notEqual(r.headers.get("x-request-id"), bad.headers.get("x-request-id"));
});

test("oversized request bodies are rejected with 413", async () => {
  const r = await worker.fetch(new Request("https://api.localboost.in/api/waitlist", { method: "POST", headers: { "content-length": "999999", "content-type": "application/json" }, body: "{}" }), { DB: {} });
  assert.equal(r.status, 413);
});

test("POST from a foreign Origin is rejected before any handler runs", async () => {
  const r = await worker.fetch(new Request("https://api.localboost.in/api/waitlist", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" }), { DB: {} });
  assert.equal(r.status, 403);
  assert.equal((await r.json()).code, "bad_origin");
});

test("CORS never reflects an unlisted origin", async () => {
  const r = await worker.fetch(new Request("https://api.localboost.in/health", { headers: { origin: "https://evil.example" } }), {});
  assert.notEqual(r.headers.get("access-control-allow-origin"), "https://evil.example");
});
