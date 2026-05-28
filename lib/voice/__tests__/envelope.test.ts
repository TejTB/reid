import { test } from "node:test";
import assert from "node:assert/strict";
import { speechEnvelope } from "../envelope.ts";

test("speechEnvelope stays within [0.12, 0.95] once past the attack", () => {
  for (let ms = 250; ms <= 10000; ms += 37) {
    const v = speechEnvelope(ms);
    assert.ok(v >= 0.12 - 1e-9 && v <= 0.95 + 1e-9, `out of range at ${ms}ms: ${v}`);
  }
});

test("speechEnvelope swells in from near-zero (attack)", () => {
  assert.ok(speechEnvelope(0) <= 0.2, `attack start too high: ${speechEnvelope(0)}`);
  assert.ok(speechEnvelope(0) <= speechEnvelope(250));
});

test("speechEnvelope is continuous over 80ms steps", () => {
  let prev = speechEnvelope(300);
  for (let ms = 380; ms <= 5000; ms += 80) {
    const v = speechEnvelope(ms);
    assert.ok(Math.abs(v - prev) < 0.35, `discontinuous jump at ${ms}ms: ${Math.abs(v - prev)}`);
    prev = v;
  }
});

test("speechEnvelope is deterministic (no randomness)", () => {
  assert.equal(speechEnvelope(1234), speechEnvelope(1234));
});
