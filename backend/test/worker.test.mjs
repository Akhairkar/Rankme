import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

// Smoke test: the Worker module must load and answer basic routes.
test("worker loads, exposes fetch and scheduled", () => {
  assert.equal(typeof worker.fetch, "function");
  assert.equal(typeof worker.scheduled, "function");
});
test("GET /health works without a database", async () => {
  const r = await worker.fetch(new Request("https://api.localboost.in/health"), {});
  assert.equal(r.status, 200);
});
test("waitlist rejects missing consent", async () => {
  const r = await worker.fetch(new Request("https://api.localboost.in/api/waitlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "a@b.in" }) }), { DB: {} });
  assert.equal(r.status, 400);
});
test("unknown route is 404 and protected route needs auth", async () => {
  assert.equal((await worker.fetch(new Request("https://api.localboost.in/nope"), {})).status, 404);
  assert.equal((await worker.fetch(new Request("https://api.localboost.in/api/businesses"), {})).status, 401);
});
