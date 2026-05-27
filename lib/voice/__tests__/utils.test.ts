import { test } from "node:test";
import assert from "node:assert/strict";
import { stripReidStream } from "../strip.ts";
import { meterToAmplitude } from "../amplitude.ts";
import { shouldAutoStop } from "../silence.ts";
import { voiceGateDecision } from "../gating.ts";

test("stripReidStream cuts at the first record separator", () => {
  assert.equal(stripReidStream("Hello there"), "Hello there");
  assert.equal(stripReidStream("Reply\x1eREID_ACTIONS:[\"x\"]\n"), "Reply");
  assert.equal(stripReidStream("A\x1eB\x1eC"), "A");
  assert.equal(stripReidStream(""), "");
});

test("meterToAmplitude clamps dBFS to 0..1", () => {
  assert.equal(meterToAmplitude(0), 1);
  assert.equal(meterToAmplitude(-60), 0);
  assert.equal(meterToAmplitude(-120), 0);
  assert.equal(meterToAmplitude(10), 1);
  const mid = meterToAmplitude(-30);
  assert.ok(mid > 0.4 && mid < 0.6, `mid ~0.5, got ${mid}`);
});

test("shouldAutoStop true only when the trailing window is all silent", () => {
  assert.equal(shouldAutoStop([-10, -50, -50, -50], -40, 300, 100), true);
  assert.equal(shouldAutoStop([-50, -50, -10], -40, 300, 100), false);
  assert.equal(shouldAutoStop([-50, -50], -40, 300, 100), false);
});

test("voiceGateDecision: pro unlimited; non-pro one free session", () => {
  assert.deepEqual(voiceGateDecision({ isPro: true, priorVoiceSessions: 9 }), { allowed: true });
  assert.deepEqual(voiceGateDecision({ isPro: false, priorVoiceSessions: 0 }), { allowed: true });
  assert.deepEqual(voiceGateDecision({ isPro: false, priorVoiceSessions: 1 }), { allowed: false });
});
