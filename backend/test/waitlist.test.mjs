import test from "node:test";
import assert from "node:assert/strict";
import { validateLead } from "../src/waitlist.js";

test("requires consent and a contact", () => {
  assert.ok(validateLead({ email: "a@b.in" }).error);
  assert.ok(validateLead({ consent: true }).error);
});
test("normalises email and +91 phone", () => {
  assert.equal(validateLead({ consent: true, email: " A@B.in " }).lead.email, "a@b.in");
  assert.equal(validateLead({ consent: true, phone: "+91 98765-43210" }).lead.phone, "9876543210");
});
test("rejects bad email, bad phone, honeypot", () => {
  assert.ok(validateLead({ consent: true, email: "nope" }).error);
  assert.ok(validateLead({ consent: true, phone: "12345" }).error);
  assert.equal(validateLead({ consent: true, email: "a@b.in", website: "x" }).silent, true);
});
test("score must be 0-100 integer", () => {
  assert.equal(validateLead({ consent: true, email: "a@b.in", score: 140 }).lead.score, null);
  assert.equal(validateLead({ consent: true, email: "a@b.in", score: 55 }).lead.score, 55);
});
