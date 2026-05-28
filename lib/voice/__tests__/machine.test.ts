import { test } from "node:test";
import assert from "node:assert/strict";
import { voiceReducer } from "../machine.ts";
import { mapOrbState } from "../orbState.ts";

test("voiceReducer transitions", () => {
  assert.equal(voiceReducer("idle", { type: "TAP" }), "recording");
  assert.equal(voiceReducer("recording", { type: "TAP" }), "processing");
  assert.equal(voiceReducer("recording", { type: "SILENCE" }), "processing");
  assert.equal(voiceReducer("processing", { type: "REPLY_READY" }), "playing");
  assert.equal(voiceReducer("playing", { type: "PLAYBACK_DONE" }), "idle");
  assert.equal(voiceReducer("processing", { type: "TAP" }), "processing");
  assert.equal(voiceReducer("playing", { type: "TAP" }), "playing");
  assert.equal(voiceReducer("processing", { type: "ERROR" }), "idle");
  assert.equal(voiceReducer("recording", { type: "ERROR" }), "idle");
});

test("OPENING lets Reid speak first from idle", () => {
  assert.equal(voiceReducer("idle", { type: "OPENING" }), "processing");
  // OPENING is a no-op from any non-idle state.
  assert.equal(voiceReducer("recording", { type: "OPENING" }), "recording");
  assert.equal(voiceReducer("processing", { type: "OPENING" }), "processing");
  assert.equal(voiceReducer("playing", { type: "OPENING" }), "playing");
});

test("mapOrbState maps session state + amplitudes", () => {
  assert.deepEqual(mapOrbState("idle", 0.9, 0.9), { state: "idle", amplitude: 0 });
  assert.deepEqual(mapOrbState("recording", 0.7, 0.1), { state: "listening", amplitude: 0.7 });
  assert.deepEqual(mapOrbState("processing", 0.7, 0.7), { state: "thinking", amplitude: 0 });
  assert.deepEqual(mapOrbState("playing", 0.1, 0.6), { state: "speaking", amplitude: 0.6 });
});
