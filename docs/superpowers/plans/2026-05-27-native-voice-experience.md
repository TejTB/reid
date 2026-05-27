# Native Voice Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A full-screen, tap-per-turn voice mode in the Reid native app — a living Reanimated orb the user taps to speak, with transcription, short spoken Reid replies, a shared conversation with text chat, and one-free-session gating.

**Architecture:** A new root `app/voice.tsx` route drives a `useVoiceSession` state machine (record → transcribe → reid → tts → play) over `expo-audio`, calling only existing SP1 backend endpoints via `reidFetch`. A shared `conversationStore` (module singleton + `useSyncExternalStore`) holds `messages`+`sessionId`; both the voice screen and `chat.tsx` read/write it, so voice turns appear in chat. All branchable logic (stream strip, gating, amplitude, silence, FSM transitions, orb-state mapping, store reducer) is extracted into import-free pure modules unit-tested with `node:test`; RN/expo wiring is verified by `tsc` + device.

**Tech Stack:** Expo SDK 54, expo-router (typedRoutes), `expo-audio` (new), react-native-reanimated v4, `node:test` (Node v26), TypeScript strict, Supabase JS.

**Branch:** All work on `sprint3-voice-native` (already created; the spec commit is its first commit).

---

## ⚠️ Pre-execution notes (read once)

1. **Pre-existing uncommitted changes:** `app/(app)/chat.tsx` (and several other screens) already have uncommitted edits in the working tree from before this sprint. Among this plan's targets, only `chat.tsx` is affected. When Task 8 commits `chat.tsx`, those pre-existing edits will be bundled into the commit (no way to split within one file without interactive staging). If you want them separated, commit/stash the WIP before Task 8. All other targets (`app/_layout.tsx`, `app.json`, and the new files) are clean.
2. **Dev-client rebuild:** Task 4 adds `expo-audio` (a native module) + a microphone permission. After this plan, **Theo must rebuild the dev client** (`expo run:ios` / EAS) before device testing. Do NOT run `expo start` as part of execution.
3. **Test runner:** reid-native has none today; Task 4 adds `"test": "node --test"`. Pure-logic tests live under `lib/**/__tests__/*.test.ts`, import source by RELATIVE path with the `.ts` extension (the `@/` alias is NOT resolvable by Node), and import NO React Native / expo modules. Run a file with `node --test <path>` (Node v26 strips TS natively).
4. **`tsc`:** `cd "/Users/theod/Documents/Documents - Mac/reid-native" && npx tsc --noEmit` must stay at zero errors after every task.

## File structure

New (pure, unit-tested — no RN imports):
- `lib/voice/strip.ts` — `stripReidStream(raw)` (also fixes the chat REID_ACTIONS bug)
- `lib/voice/amplitude.ts` — `meterToAmplitude(db)`
- `lib/voice/silence.ts` — `shouldAutoStop(samples, thresholdDb, silenceMs)`
- `lib/voice/gating.ts` — `voiceGateDecision({ isPro, priorVoiceSessions })`
- `lib/voice/orbState.ts` — `mapOrbState(sessionState, micAmp, playbackAmp)`
- `lib/voice/machine.ts` — `voiceReducer(state, event)` (pure FSM)
- `lib/conversationStore.ts` — shared messages/sessionId store (framework-agnostic)
- `lib/voice/__tests__/*.test.ts`, `lib/__tests__/conversationStore.test.ts`

New (RN/expo — tsc + device):
- `hooks/useConversation.ts` — `useSyncExternalStore` wrapper over the store
- `hooks/useOrbState.ts` — thin hook over `mapOrbState`
- `hooks/useVoiceSession.ts` — the state machine + audio + API + gating
- `components/ReidOrb.tsx` — Reanimated orb (4 states, full fidelity)
- `app/voice.tsx` — full-screen voice screen

Modified:
- `app/_layout.tsx` — register the `voice` route
- `app/(app)/chat.tsx` — migrate to the store; `\x1e` strip; orb toggle
- `app.json` — `expo-audio` plugin + mic permission
- `package.json` — `expo-audio` dep + `"test"` script

---

### Task 1: Voice pure utils (strip, amplitude, silence, gating)

**Files:**
- Create: `lib/voice/strip.ts`, `lib/voice/amplitude.ts`, `lib/voice/silence.ts`, `lib/voice/gating.ts`
- Test: `lib/voice/__tests__/utils.test.ts`

- [ ] **Step 1: Write the failing test** — create `lib/voice/__tests__/utils.test.ts`:

```ts
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
  assert.equal(meterToAmplitude(0), 1);       // loudest
  assert.equal(meterToAmplitude(-60), 0);     // floor
  assert.equal(meterToAmplitude(-120), 0);    // below floor clamps
  assert.equal(meterToAmplitude(10), 1);      // above ceiling clamps
  const mid = meterToAmplitude(-30);
  assert.ok(mid > 0.4 && mid < 0.6, `mid ~0.5, got ${mid}`);
});

test("shouldAutoStop true only when the trailing window is all silent", () => {
  // samples newest-last, each ~100ms apart; threshold -40dB, need 300ms silence
  assert.equal(shouldAutoStop([-10, -50, -50, -50], -40, 300, 100), true);
  assert.equal(shouldAutoStop([-50, -50, -10], -40, 300, 100), false); // recent loud
  assert.equal(shouldAutoStop([-50, -50], -40, 300, 100), false);      // <300ms of data
});

test("voiceGateDecision: pro unlimited; non-pro one free session", () => {
  assert.deepEqual(voiceGateDecision({ isPro: true, priorVoiceSessions: 9 }), { allowed: true });
  assert.deepEqual(voiceGateDecision({ isPro: false, priorVoiceSessions: 0 }), { allowed: true });
  assert.deepEqual(voiceGateDecision({ isPro: false, priorVoiceSessions: 1 }), { allowed: false });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `cd "/Users/theod/Documents/Documents - Mac/reid-native" && node --test lib/voice/__tests__/utils.test.ts` → modules not found.

- [ ] **Step 3: Implement `lib/voice/strip.ts`:**

```ts
/** The web /api/reid stream appends trailing `\x1e`-prefixed control markers
 *  (REID_ACTIONS / REID_SESSION_END) after the visible text. Return only the
 *  text before the first record separator. No-op when there is none. */
export function stripReidStream(raw: string): string {
  const i = raw.indexOf("\x1e");
  return i === -1 ? raw : raw.slice(0, i);
}
```

- [ ] **Step 4: Implement `lib/voice/amplitude.ts`:**

```ts
/** Normalize an audio meter reading in dBFS (≈ -60 quiet .. 0 loud) to 0..1. */
export function meterToAmplitude(db: number, floorDb = -60): number {
  if (!Number.isFinite(db)) return 0;
  if (db >= 0) return 1;
  if (db <= floorDb) return 0;
  return 1 - db / floorDb; // db in (floor,0): -30/-60 = 0.5
}
```

- [ ] **Step 5: Implement `lib/voice/silence.ts`:**

```ts
/** True when the most recent `silenceMs` worth of samples (each ~`sampleMs`
 *  apart, newest last) are all at/below `thresholdDb`. Requires enough samples
 *  to cover the window. */
export function shouldAutoStop(
  samples: number[],
  thresholdDb: number,
  silenceMs: number,
  sampleMs: number,
): boolean {
  const needed = Math.ceil(silenceMs / sampleMs);
  if (samples.length < needed) return false;
  const window = samples.slice(-needed);
  return window.every((db) => db <= thresholdDb);
}
```

- [ ] **Step 6: Implement `lib/voice/gating.ts`:**

```ts
/** Voice entitlement. Pro = unlimited. Non-pro get exactly one free voice
 *  session: `priorVoiceSessions` counts COMPLETED voice sessions excluding the
 *  in-progress one (the caller excludes the active sessionId), so a free user
 *  can finish a full multi-turn session before the gate trips next time. */
export function voiceGateDecision(args: {
  isPro: boolean;
  priorVoiceSessions: number;
}): { allowed: boolean } {
  return { allowed: args.isPro || args.priorVoiceSessions < 1 };
}
```

- [ ] **Step 7: Run tests, expect PASS** — `node --test lib/voice/__tests__/utils.test.ts` → 4/4.

- [ ] **Step 8: Commit**

```bash
cd "/Users/theod/Documents/Documents - Mac/reid-native"
git add lib/voice/strip.ts lib/voice/amplitude.ts lib/voice/silence.ts lib/voice/gating.ts lib/voice/__tests__/utils.test.ts
git commit -m "feat(voice): pure utils — stream strip, amplitude, silence, gating"
```

---

### Task 2: Orb-state mapping + voice FSM reducer

**Files:**
- Create: `lib/voice/orbState.ts`, `lib/voice/machine.ts`
- Test: `lib/voice/__tests__/machine.test.ts`

- [ ] **Step 1: Write the failing test** — `lib/voice/__tests__/machine.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { voiceReducer } from "../machine.ts";
import { mapOrbState } from "../orbState.ts";

test("voiceReducer transitions", () => {
  assert.equal(voiceReducer("idle", { type: "TAP" }), "recording");
  assert.equal(voiceReducer("recording", { type: "TAP" }), "processing");   // manual stop
  assert.equal(voiceReducer("recording", { type: "SILENCE" }), "processing");
  assert.equal(voiceReducer("processing", { type: "REPLY_READY" }), "playing");
  assert.equal(voiceReducer("playing", { type: "PLAYBACK_DONE" }), "idle");
  // terminal/guards
  assert.equal(voiceReducer("processing", { type: "TAP" }), "processing"); // ignore taps mid-flight
  assert.equal(voiceReducer("playing", { type: "TAP" }), "playing");
  assert.equal(voiceReducer("processing", { type: "ERROR" }), "idle");
  assert.equal(voiceReducer("recording", { type: "ERROR" }), "idle");
});

test("mapOrbState maps session state + amplitudes", () => {
  assert.deepEqual(mapOrbState("idle", 0.9, 0.9), { state: "idle", amplitude: 0 });
  assert.deepEqual(mapOrbState("recording", 0.7, 0.1), { state: "listening", amplitude: 0.7 });
  assert.deepEqual(mapOrbState("processing", 0.7, 0.7), { state: "thinking", amplitude: 0 });
  assert.deepEqual(mapOrbState("playing", 0.1, 0.6), { state: "speaking", amplitude: 0.6 });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `node --test lib/voice/__tests__/machine.test.ts`.

- [ ] **Step 3: Implement `lib/voice/machine.ts`:**

```ts
export type VoiceState = "idle" | "recording" | "processing" | "playing";

export type VoiceEvent =
  | { type: "TAP" }
  | { type: "SILENCE" }
  | { type: "REPLY_READY" }
  | { type: "PLAYBACK_DONE" }
  | { type: "ERROR" }
  | { type: "RESET" };

/** Pure transition function for the voice turn loop. Unknown transitions are
 *  no-ops (return the current state). */
export function voiceReducer(state: VoiceState, event: VoiceEvent): VoiceState {
  if (event.type === "ERROR" || event.type === "RESET") return "idle";
  switch (state) {
    case "idle":
      return event.type === "TAP" ? "recording" : "idle";
    case "recording":
      return event.type === "TAP" || event.type === "SILENCE" ? "processing" : "recording";
    case "processing":
      return event.type === "REPLY_READY" ? "playing" : "processing";
    case "playing":
      return event.type === "PLAYBACK_DONE" ? "idle" : "playing";
    default:
      return state;
  }
}
```

- [ ] **Step 4: Implement `lib/voice/orbState.ts`:**

```ts
import type { VoiceState } from "./machine.ts";

export type OrbVisual = "idle" | "listening" | "thinking" | "speaking";

/** Map the session state + live amplitudes to the orb's visual state and the
 *  single amplitude value that drives it. */
export function mapOrbState(
  sessionState: VoiceState,
  micAmplitude: number,
  playbackAmplitude: number,
): { state: OrbVisual; amplitude: number } {
  switch (sessionState) {
    case "recording":
      return { state: "listening", amplitude: micAmplitude };
    case "processing":
      return { state: "thinking", amplitude: 0 };
    case "playing":
      return { state: "speaking", amplitude: playbackAmplitude };
    case "idle":
    default:
      return { state: "idle", amplitude: 0 };
  }
}
```

(Note: in `machine.test.ts` the import is `../machine.ts`; `orbState.ts` imports `./machine.ts` for the `VoiceState` type — type-only import, fine under Node strip.)

- [ ] **Step 5: Run tests, expect PASS** — `node --test lib/voice/__tests__/machine.test.ts` → 2/2.

- [ ] **Step 6: Commit**

```bash
cd "/Users/theod/Documents/Documents - Mac/reid-native"
git add lib/voice/machine.ts lib/voice/orbState.ts lib/voice/__tests__/machine.test.ts
git commit -m "feat(voice): pure FSM reducer + orb-state mapping"
```

---

### Task 3: Shared conversation store + hook

**Files:**
- Create: `lib/conversationStore.ts`, `hooks/useConversation.ts`
- Test: `lib/__tests__/conversationStore.test.ts`

- [ ] **Step 1: Write the failing test** — `lib/__tests__/conversationStore.test.ts`:

```ts
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as store from "../conversationStore.ts";

beforeEach(() => store.__resetForTest());

test("append / appendMany / getSnapshot", () => {
  store.append({ role: "user", content: "hi" });
  store.appendMany([{ role: "assistant", content: "hey" }, { role: "user", content: "yo" }]);
  assert.deepEqual(store.getSnapshot().messages.map((m) => m.content), ["hi", "hey", "yo"]);
});

test("replaceLast and dropLast", () => {
  store.append({ role: "assistant", content: "partial" });
  store.replaceLast({ role: "assistant", content: "final" });
  assert.equal(store.getSnapshot().messages.at(-1)?.content, "final");
  store.dropLast();
  assert.equal(store.getSnapshot().messages.length, 0);
});

test("setSessionId / setMessages / reset", () => {
  store.setSessionId("abc");
  store.setMessages([{ role: "user", content: "x" }]);
  assert.equal(store.getSnapshot().sessionId, "abc");
  assert.equal(store.getSnapshot().messages.length, 1);
  store.reset();
  assert.deepEqual(store.getSnapshot(), { messages: [], sessionId: null });
});

test("subscribe fires on change and snapshot identity is stable until mutation", () => {
  let calls = 0;
  const unsub = store.subscribe(() => { calls += 1; });
  const before = store.getSnapshot();
  store.append({ role: "user", content: "a" });
  assert.equal(calls, 1);
  assert.notEqual(store.getSnapshot(), before); // new snapshot ref
  unsub();
  store.append({ role: "user", content: "b" });
  assert.equal(calls, 1); // no longer subscribed
});
```

- [ ] **Step 2: Run it, expect FAIL** — `node --test lib/__tests__/conversationStore.test.ts`.

- [ ] **Step 3: Implement `lib/conversationStore.ts`** (no React import — framework-agnostic):

```ts
export type Msg = { role: "user" | "assistant"; content: string };
export type ConversationSnapshot = { messages: Msg[]; sessionId: string | null };

let snapshot: ConversationSnapshot = { messages: [], sessionId: null };
const listeners = new Set<() => void>();

function set(next: ConversationSnapshot): void {
  snapshot = next;
  for (const l of listeners) l();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getSnapshot(): ConversationSnapshot {
  return snapshot;
}

export function setMessages(messages: Msg[]): void {
  set({ ...snapshot, messages });
}

export function append(msg: Msg): void {
  set({ ...snapshot, messages: [...snapshot.messages, msg] });
}

export function appendMany(msgs: Msg[]): void {
  set({ ...snapshot, messages: [...snapshot.messages, ...msgs] });
}

export function replaceLast(msg: Msg): void {
  const m = snapshot.messages;
  if (m.length === 0) { append(msg); return; }
  set({ ...snapshot, messages: [...m.slice(0, -1), msg] });
}

export function dropLast(): void {
  set({ ...snapshot, messages: snapshot.messages.slice(0, -1) });
}

export function setSessionId(sessionId: string | null): void {
  set({ ...snapshot, sessionId });
}

export function reset(): void {
  set({ messages: [], sessionId: null });
}

/** Test-only: clear module singleton state between tests. */
export function __resetForTest(): void {
  snapshot = { messages: [], sessionId: null };
  listeners.clear();
}
```

- [ ] **Step 4: Run tests, expect PASS** — `node --test lib/__tests__/conversationStore.test.ts` → 4/4.

- [ ] **Step 5: Implement `hooks/useConversation.ts`:**

```ts
import { useSyncExternalStore } from "react";
import { subscribe, getSnapshot } from "@/lib/conversationStore";

/** Subscribe a component to the shared conversation (messages + sessionId). */
export function useConversation() {
  return useSyncExternalStore(subscribe, getSnapshot);
}
```

- [ ] **Step 6: Typecheck + commit**

```bash
cd "/Users/theod/Documents/Documents - Mac/reid-native"
npx tsc --noEmit
git add lib/conversationStore.ts hooks/useConversation.ts lib/__tests__/conversationStore.test.ts
git commit -m "feat(voice): shared conversation store + useConversation hook"
```

---

### Task 4: expo-audio dependency + native config + test script

**Files:**
- Modify: `package.json` (dep + `"test"` script), `app.json` (plugin + permission)

- [ ] **Step 1: Install expo-audio (SDK-pinned)**

Run: `cd "/Users/theod/Documents/Documents - Mac/reid-native" && npx expo install expo-audio`
Expected: `expo-audio` added to `package.json` dependencies at the SDK-54-compatible version.

- [ ] **Step 2: Add the `test` script** to `package.json` `scripts` (alongside `start`/`android`/`ios`/`web`):

```json
"test": "node --test"
```

- [ ] **Step 3: Add the expo-audio config plugin + mic permission** to `app.json`. In `expo.plugins`, add an entry; and add the iOS usage string. Resulting `plugins` array (keep existing entries, add the `expo-audio` block):

```json
"plugins": [
  "expo-router",
  "expo-secure-store",
  ["expo-notifications", { "color": "#B91C1C" }],
  "expo-web-browser",
  ["expo-audio", { "microphonePermission": "Reid needs your microphone so you can talk to him." }]
]
```

And in `expo.ios.infoPlist`, add (keep the existing keys):

```json
"NSMicrophoneUsageDescription": "Reid needs your microphone so you can talk to him."
```

(Android `RECORD_AUDIO` is added automatically by the expo-audio plugin.)

- [ ] **Step 4: Verify config validity**

Run: `cd "/Users/theod/Documents/Documents - Mac/reid-native" && npx expo config --type public > /dev/null && echo "config OK"`
Expected: prints `config OK` (no schema errors). If `expo config` is unavailable offline, instead confirm `app.json` is valid JSON: `node -e "JSON.parse(require('fs').readFileSync('app.json','utf8')); console.log('json OK')"`.

- [ ] **Step 5: Commit**

```bash
cd "/Users/theod/Documents/Documents - Mac/reid-native"
git add package.json package-lock.json app.json
git commit -m "chore(voice): add expo-audio + mic permission + test script"
```

> After this task a dev-client rebuild is required before device testing (native module added). Do not run `expo start` here.

---

### Task 5: ReidOrb component + useOrbState hook

**Files:**
- Create: `components/ReidOrb.tsx`, `hooks/useOrbState.ts`

> RN/Reanimated component — not unit-tested; verified by `tsc` + device. Full visual fidelity per spec §6.

- [ ] **Step 1: Implement `hooks/useOrbState.ts`:**

```ts
import { mapOrbState } from "@/lib/voice/orbState";
import type { VoiceState } from "@/lib/voice/machine";

/** Thin hook: derive the orb's visual state + amplitude from the session. */
export function useOrbState(args: {
  sessionState: VoiceState;
  micAmplitude: number;
  playbackAmplitude: number;
}) {
  return mapOrbState(args.sessionState, args.micAmplitude, args.playbackAmplitude);
}
```

- [ ] **Step 2: Implement `components/ReidOrb.tsx`** (Reanimated v4; transform + opacity only):

```tsx
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
  withRepeat,
  withSequence,
  interpolate,
  interpolateColor,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";
import type { OrbVisual } from "@/lib/voice/orbState";

const RED = "#B91C1C";
const CREAM = "#F2EDE3";
const BASE = 200;

type Props = { state: OrbVisual; amplitude: number; onPress?: () => void };

export default function ReidOrb({ state, amplitude, onPress }: Props) {
  // Live amplitude (0..1), smoothed.
  const amp = useSharedValue(0);
  // Idle/thinking breathing driver (0..1 loop).
  const breath = useSharedValue(0);
  // Thinking contraction (0 = normal, 1 = contracted to 0.88).
  const contract = useSharedValue(0);

  useEffect(() => {
    amp.value = withTiming(amplitude, { duration: 90, easing: Easing.out(Easing.quad) });
  }, [amplitude, amp]);

  useEffect(() => {
    cancelAnimation(breath);
    cancelAnimation(contract);
    if (state === "idle") {
      breath.value = 0;
      breath.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
      contract.value = withTiming(0, { duration: 300 });
    } else if (state === "thinking") {
      contract.value = withTiming(1, { duration: 300, easing: Easing.in(Easing.ease) });
      breath.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    } else {
      // listening / speaking are amplitude-driven; settle the breathing drivers.
      contract.value = withTiming(0, { duration: 200 });
      breath.value = withTiming(0, { duration: 200 });
    }
  }, [state, breath, contract]);

  // Core: scale + color depend on state.
  const coreStyle = useAnimatedStyle(() => {
    let scale = 1;
    if (state === "idle") scale = interpolate(breath.value, [0, 1], [1.0, 1.05]);
    else if (state === "listening") scale = 1.0 + amp.value * 0.3;
    else if (state === "thinking") scale = interpolate(contract.value, [0, 1], [1.0, 0.88]);
    else if (state === "speaking") scale = 1.0 + amp.value * 0.12;
    const colorT = state === "speaking" ? amp.value : 0;
    return {
      transform: [{ scale }],
      backgroundColor: interpolateColor(colorT, [0, 1], [RED, CREAM]),
    };
  });

  // Inner pulse opacity (idle breathing offset; thinking slow 0.5 breathing).
  const innerStyle = useAnimatedStyle(() => {
    let opacity = 1;
    if (state === "idle") opacity = interpolate(breath.value, [0, 1], [0.6, 1.0]);
    else if (state === "thinking") opacity = interpolate(breath.value, [0, 1], [0.35, 0.6]);
    else if (state === "listening") opacity = 0.85 + amp.value * 0.15;
    else if (state === "speaking") opacity = 0.9;
    return { opacity };
  });

  // Outer glow.
  const glowStyle = useAnimatedStyle(() => {
    const base = state === "listening" ? 0.15 + amp.value * 0.25 : 0.15;
    return { opacity: state === "thinking" ? 0.1 : base };
  });

  // Ring 1 — expands with amplitude (listening) / pulses (speaking).
  const ring1Style = useAnimatedStyle(() => {
    if (state === "listening") {
      return { transform: [{ scale: 1.3 + amp.value * 0.4 }], opacity: amp.value };
    }
    if (state === "speaking") {
      return { transform: [{ scale: 1.2 + amp.value * 0.5 }], opacity: 0.15 + amp.value * 0.5 };
    }
    return { transform: [{ scale: 1.2 }], opacity: 0 };
  });

  // Ring 2 — wider, fainter.
  const ring2Style = useAnimatedStyle(() => {
    if (state === "listening") {
      return { transform: [{ scale: 1.6 + amp.value * 0.3 }], opacity: amp.value * 0.6 };
    }
    if (state === "speaking") {
      return { transform: [{ scale: 1.5 + amp.value * 0.5 }], opacity: amp.value * 0.4 };
    }
    return { transform: [{ scale: 1.5 }], opacity: 0 };
  });

  const ring = (sizeMul: number) =>
    ({
      position: "absolute" as const,
      width: BASE * sizeMul,
      height: BASE * sizeMul,
      borderRadius: (BASE * sizeMul) / 2,
      borderWidth: 1.5,
      borderColor: RED,
    });

  return (
    <Pressable onPress={onPress} hitSlop={24} style={{ alignItems: "center", justifyContent: "center", width: BASE * 1.8, height: BASE * 1.8 }}>
      <Animated.View style={[ring(1.0), ring2Style]} />
      <Animated.View style={[ring(1.0), ring1Style]} />
      <Animated.View
        style={[
          {
            position: "absolute",
            width: BASE * 1.3,
            height: BASE * 1.3,
            borderRadius: (BASE * 1.3) / 2,
            backgroundColor: RED,
            shadowColor: RED,
            shadowOpacity: 1,
            shadowRadius: 60,
            shadowOffset: { width: 0, height: 0 },
          },
          glowStyle,
        ]}
      />
      <Animated.View
        style={[
          {
            width: BASE,
            height: BASE,
            borderRadius: BASE / 2,
            backgroundColor: RED,
          },
          coreStyle,
        ]}
      >
        <Animated.View
          style={[
            { flex: 1, borderRadius: BASE / 2, backgroundColor: RED },
            innerStyle,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}
```

- [ ] **Step 3: Typecheck** — `cd "/Users/theod/Documents/Documents - Mac/reid-native" && npx tsc --noEmit` → zero errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/theod/Documents/Documents - Mac/reid-native"
git add components/ReidOrb.tsx hooks/useOrbState.ts
git commit -m "feat(voice): ReidOrb (Reanimated, 4 states) + useOrbState"
```

---

### Task 6: useVoiceSession hook

**Files:**
- Create: `hooks/useVoiceSession.ts`

> RN/expo wiring — `tsc` + device. **Before writing, use context7 (`/expo/expo`) to confirm two SDK-54 API details and adjust the marked spots if they differ:** (a) the recorder metering field name on `useAudioRecorderState` (assumed `state.metering`, dBFS); (b) the `createAudioPlayer` completion signal (assumed `player.addListener("playbackStatusUpdate", (s) => s.didJustFinish)`). The code below is structured so only those two spots need adjustment; if metering is unavailable, the `micAmplitude` falls back to a simulated pulse and silence auto-stop is skipped (manual / max-duration stop still work).

- [ ] **Step 1: Implement `hooks/useVoiceSession.ts`:**

```ts
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { router } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import {
  useAudioRecorder,
  useAudioRecorderState,
  createAudioPlayer,
  setAudioModeAsync,
  AudioModule,
  RecordingPresets,
} from "expo-audio";
import { reidFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import * as convo from "@/lib/conversationStore";
import { voiceReducer, type VoiceState, type VoiceEvent } from "@/lib/voice/machine";
import { meterToAmplitude } from "@/lib/voice/amplitude";
import { shouldAutoStop } from "@/lib/voice/silence";
import { voiceGateDecision } from "@/lib/voice/gating";
import { stripReidStream } from "@/lib/voice/strip";

const SILENCE_DB = -40;
const SILENCE_MS = 1500;
const SAMPLE_MS = 150;
const MAX_RECORD_MS = 30000;

function bytesToBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let bin = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return typeof globalThis.btoa === "function" ? globalThis.btoa(bin) : "";
}

export function useVoiceSession() {
  const [state, dispatch] = useReducer(
    (s: VoiceState, e: VoiceEvent) => voiceReducer(s, e),
    "idle",
  );
  const [transcript, setTranscript] = useState("");
  const [reidResponse, setReidResponse] = useState("");
  const [micAmplitude, setMicAmplitude] = useState(0);
  const [playbackAmplitude, setPlaybackAmplitude] = useState(0);
  const [voiceBlocked, setVoiceBlocked] = useState(false);

  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recorderState = useAudioRecorderState(recorder, SAMPLE_MS);

  const levelsRef = useRef<number[]>([]);
  const startedAtRef = useRef<number>(0);
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const stateRef = useRef<VoiceState>("idle");
  stateRef.current = state;

  // --- entitlement ---
  const refreshEntitlement = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: row } = await supabase
      .from("users").select("subscription_status").eq("auth_id", session.user.id).maybeSingle();
    const isPro = row?.subscription_status === "pro";
    const current = convo.getSnapshot().sessionId;
    let q = supabase.from("sessions").select("id", { count: "exact", head: true }).eq("voice_used", true);
    if (current) q = q.neq("id", current);
    const { count } = await q;
    setVoiceBlocked(!voiceGateDecision({ isPro, priorVoiceSessions: count ?? 0 }).allowed);
  }, []);

  useEffect(() => { void refreshEntitlement(); }, [refreshEntitlement]);

  // --- recording metering → amplitude + silence auto-stop ---
  useEffect(() => {
    if (state !== "recording") return;
    // (a) VERIFY field: recorder metering in dBFS.
    const db = (recorderState as { metering?: number }).metering;
    if (typeof db === "number") {
      const a = meterToAmplitude(db);
      setMicAmplitude(a);
      levelsRef.current = [...levelsRef.current.slice(-40), db];
      if (shouldAutoStop(levelsRef.current, SILENCE_DB, SILENCE_MS, SAMPLE_MS)) {
        void stopRecording();
      }
    } else {
      // Fallback: gentle simulated pulse; no silence detection.
      setMicAmplitude(0.4 + 0.4 * Math.abs(Math.sin(Date.now() / 250)));
    }
    if (Date.now() - startedAtRef.current > MAX_RECORD_MS) void stopRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorderState, state]);

  const startSession = useCallback(async () => {
    if (stateRef.current !== "idle") return;
    if (voiceBlocked) { router.push("/upgrade"); return; }
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) { setTranscript("Microphone permission denied."); return; }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    levelsRef.current = [];
    startedAtRef.current = Date.now();
    setTranscript("");
    setReidResponse("");
    await recorder.prepareToRecordAsync();
    recorder.record();
    dispatch({ type: "TAP" }); // idle → recording
  }, [recorder, voiceBlocked]);

  const stopRecording = useCallback(async () => {
    if (stateRef.current !== "recording") return;
    dispatch({ type: "SILENCE" }); // recording → processing
    setMicAmplitude(0);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error("no recording uri");
      await runTurn(uri);
    } catch {
      dispatch({ type: "ERROR" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder]);

  async function runTurn(uri: string) {
    // 1) transcribe
    const form = new FormData();
    // RN FormData file shape:
    form.append("file", { uri, name: "speech.m4a", type: "audio/m4a" } as unknown as Blob);
    const tRes = await reidFetch("/api/transcribe", { method: "POST", body: form, headers: {} });
    if (!tRes.ok) { dispatch({ type: "ERROR" }); setTranscript(tRes.status === 429 ? "Slow down — try again in a moment." : "Could not hear that."); return; }
    const { transcript: text } = (await tRes.json()) as { transcript: string };
    if (!text.trim()) { dispatch({ type: "RESET" }); return; }
    setTranscript(text);
    convo.append({ role: "user", content: text });

    // 2) reid (voice mode, shared session)
    const rRes = await reidFetch("/api/reid", {
      method: "POST",
      body: JSON.stringify({ mode: "chat", voice: true, sessionId: convo.getSnapshot().sessionId, messages: convo.getSnapshot().messages }),
    });
    if (!rRes.ok) { dispatch({ type: "ERROR" }); return; }
    const sid = rRes.headers.get("X-Reid-Session-Id") ?? rRes.headers.get("x-reid-session-id");
    if (sid) convo.setSessionId(sid);
    let acc = "";
    const body = rRes.body as ReadableStream<Uint8Array> | null | undefined;
    if (body && typeof body.getReader === "function") {
      const reader = body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) { acc += dec.decode(value, { stream: true }); setReidResponse(stripReidStream(acc)); }
      }
    } else {
      acc = await rRes.text();
      setReidResponse(stripReidStream(acc));
    }
    const reply = stripReidStream(acc).trim();
    convo.append({ role: "assistant", content: reply });

    // 3) tts → play
    dispatch({ type: "REPLY_READY" }); // processing → playing
    await playReply(reply);
  }

  async function playReply(text: string) {
    try {
      const res = await reidFetch("/api/tts", { method: "POST", body: JSON.stringify({ text }) });
      if (!res.ok) { dispatch({ type: "PLAYBACK_DONE" }); return; }
      const buf = await res.arrayBuffer();
      const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      if (!dir) { dispatch({ type: "PLAYBACK_DONE" }); return; }
      const fileUri = `${dir}reid_voice_turn.mp3`;
      await FileSystem.writeAsStringAsync(fileUri, bytesToBase64(new Uint8Array(buf)), { encoding: FileSystem.EncodingType.Base64 });

      playerRef.current?.remove();
      const player = createAudioPlayer({ uri: fileUri });
      playerRef.current = player;
      // synthesized speaking amplitude
      const pulse = setInterval(() => setPlaybackAmplitude(0.3 + 0.5 * Math.random()), 120);
      // (b) VERIFY event: completion via playbackStatusUpdate.didJustFinish
      const sub = player.addListener("playbackStatusUpdate", (s: { didJustFinish?: boolean }) => {
        if (s.didJustFinish) {
          clearInterval(pulse);
          setPlaybackAmplitude(0);
          sub.remove();
          player.remove();
          if (playerRef.current === player) playerRef.current = null;
          dispatch({ type: "PLAYBACK_DONE" });
        }
      });
      player.play();
    } catch {
      dispatch({ type: "PLAYBACK_DONE" });
    }
  }

  // Cleanup on unmount.
  useEffect(() => () => { playerRef.current?.remove(); }, []);

  return {
    sessionState: state,
    transcript,
    reidResponse,
    micAmplitude,
    playbackAmplitude,
    voiceBlocked,
    startSession,
    stopRecording,
    refreshEntitlement,
  };
}
```

- [ ] **Step 2: Confirm the two VERIFY spots via context7** (`/expo/expo`, query "expo-audio useAudioRecorderState metering field" and "expo-audio AudioPlayer playbackStatusUpdate didJustFinish"). Adjust the two marked lines if the field/event names differ; keep the metering-absent fallback.

- [ ] **Step 3: Typecheck** — `cd "/Users/theod/Documents/Documents - Mac/reid-native" && npx tsc --noEmit` → zero errors. (If `reidFetch` rejects an empty `headers: {}` for FormData, drop the `headers` key; `reidFetch` sets `Content-Type: application/json` by default — for the multipart call pass `headers: { "Content-Type": "" }` is wrong; instead, see Task 6 note below.)

> **`reidFetch` + multipart:** `lib/api.ts:reidFetch` always sets `Content-Type: application/json`. For `/api/transcribe` we must NOT force JSON — let fetch set the multipart boundary. Implementation detail for Step 1: call `reidFetch("/api/transcribe", { method: "POST", body: form, headers: { "Content-Type": "multipart/form-data" } })` is also wrong (no boundary). The correct fix is a tiny addition to `lib/api.ts`: allow callers to opt out of the JSON content-type. Add this in Step 1 of THIS task as well:
>
> In `lib/api.ts` `reidFetch`, change the header merge so a caller passing `body instanceof FormData` does NOT get `Content-Type: application/json`:
> ```ts
> const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
> return fetch(`${BASE}${path}`, {
>   ...options,
>   headers: {
>     ...(isForm ? {} : { "Content-Type": "application/json" }),
>     Authorization: `Bearer ${token}`,
>     ...(options.headers ?? {}),
>   },
> });
> ```
> Then call transcribe as `reidFetch("/api/transcribe", { method: "POST", body: form })` (no headers).

- [ ] **Step 4: Commit**

```bash
cd "/Users/theod/Documents/Documents - Mac/reid-native"
git add hooks/useVoiceSession.ts lib/api.ts
git commit -m "feat(voice): useVoiceSession state machine (record→transcribe→reid→tts)"
```

---

### Task 7: Voice screen + route registration

**Files:**
- Create: `app/voice.tsx`
- Modify: `app/_layout.tsx` (register the route)

- [ ] **Step 1: Register the route** in `app/_layout.tsx`. After the `upgrade` screen line (`<Stack.Screen name="upgrade" options={{ presentation: 'modal' }} />`), add:

```tsx
        <Stack.Screen name="voice" options={{ presentation: 'fullScreenModal' }} />
```

- [ ] **Step 2: Implement `app/voice.tsx`:**

```tsx
import { useEffect } from "react";
import { View, Text, Pressable } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MessageCircle } from "lucide-react-native";
import { C, F } from "@/constants/theme";
import LogoMark from "@/components/LogoMark";
import ReidOrb from "@/components/ReidOrb";
import { useVoiceSession } from "@/hooks/useVoiceSession";
import { useOrbState } from "@/hooks/useOrbState";
import { reidFetch } from "@/lib/api";
import * as convo from "@/lib/conversationStore";

export default function VoiceScreen() {
  const insets = useSafeAreaInsets();
  const vs = useVoiceSession();
  const orb = useOrbState({
    sessionState: vs.sessionState,
    micAmplitude: vs.micAmplitude,
    playbackAmplitude: vs.playbackAmplitude,
  });

  // Recap on exit (fire-and-forget) if this visit had a voice exchange.
  useEffect(() => {
    return () => {
      const sid = convo.getSnapshot().sessionId;
      const hadVoice = convo.getSnapshot().messages.some((m) => m.role === "assistant");
      if (sid && hadVoice) {
        void reidFetch("/api/session-recap", {
          method: "POST",
          body: JSON.stringify({ session_id: sid }),
        }).catch(() => {});
      }
    };
  }, []);

  const status =
    vs.voiceBlocked ? "upgrade to continue"
    : vs.sessionState === "recording" ? "listening…"
    : vs.sessionState === "processing" ? "thinking…"
    : vs.sessionState === "playing" ? "" : "tap to speak";

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="light" hidden />
      {/* top bar */}
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, height: 56 + insets.top, flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1 }}><LogoMark size={28} /></View>
        <Pressable onPress={() => router.back()} hitSlop={16}>
          <MessageCircle size={24} color={C.muted} />
        </Pressable>
      </View>

      {/* orb zone */}
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ReidOrb
          state={orb.state}
          amplitude={orb.amplitude}
          onPress={vs.sessionState === "recording" ? vs.stopRecording : vs.startSession}
        />
      </View>

      {/* transcript zone */}
      <View style={{ minHeight: 120, paddingHorizontal: 28, gap: 10 }}>
        {vs.transcript ? (
          <Animated.Text entering={FadeIn.duration(250)} exiting={FadeOut.duration(300)}
            style={{ fontFamily: F.sans, fontSize: 14, color: C.muted, textAlign: "center" }}>
            {vs.transcript}
          </Animated.Text>
        ) : null}
        {vs.reidResponse ? (
          <Animated.Text entering={FadeIn.duration(300)} exiting={FadeOut.duration(300)}
            style={{ fontFamily: F.serifItalic, fontSize: 20, lineHeight: 28, color: C.text, textAlign: "center" }}>
            {vs.reidResponse}
          </Animated.Text>
        ) : null}
      </View>

      {/* bottom zone */}
      <View style={{ height: 64, alignItems: "center", justifyContent: "center", paddingBottom: insets.bottom }}>
        <Pressable disabled={!vs.voiceBlocked} onPress={() => router.push("/upgrade")}>
          <Text style={{ fontFamily: F.sans, fontSize: 12, color: vs.voiceBlocked ? C.red : C.muted, letterSpacing: 0.5 }}>
            {status}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
```

- [ ] **Step 3: Typecheck** — `cd "/Users/theod/Documents/Documents - Mac/reid-native" && npx tsc --noEmit` → zero errors (typedRoutes must recognize `/voice` now that the screen exists; if the route type hasn't regenerated, it regenerates on `tsc`/`expo` run).

- [ ] **Step 4: Commit**

```bash
cd "/Users/theod/Documents/Documents - Mac/reid-native"
git add app/voice.tsx app/_layout.tsx
git commit -m "feat(voice): full-screen voice screen + route registration"
```

---

### Task 8: Migrate chat.tsx to the shared store + strip + orb toggle

**Files:**
- Modify: `app/(app)/chat.tsx`

> ⚠️ `chat.tsx` has pre-existing uncommitted edits (see pre-execution note 1); this commit bundles them.

- [ ] **Step 1: Imports + remove locals.** In `app/(app)/chat.tsx`:
  - Replace the local `type Msg = { role: 'user' | 'assistant'; content: string };` (line ~36) with:
    `import type { Msg } from '@/lib/conversationStore';`
  - Add imports near the others:
    ```ts
    import * as convo from '@/lib/conversationStore';
    import { useConversation } from '@/hooks/useConversation';
    import { stripReidStream } from '@/lib/voice/strip';
    import { AudioLines } from 'lucide-react-native';
    ```
  - Delete the module-level `let cachedSessionId: string | null = null;` (line ~46).

- [ ] **Step 2: Swap message state for the store.**
  - Replace `const [messages, setMessages] = useState<Msg[]>([]);` (line ~240) with:
    `const { messages, sessionId } = useConversation();`
  - Delete `const sessionIdRef = useRef<string | null>(cachedSessionId);` (line ~252).

- [ ] **Step 3: Opening-line seeding — only when the shared conversation is empty** (so voice turns aren't wiped). Replace the seeding block (lines ~285-292) with:

```ts
      if (convo.getSnapshot().messages.length === 0) {
        convo.setMessages([{ role: 'assistant', content: OPENING_LINE }]);
        if (!openingSent) {
          void AsyncStorage.setItem(OPENING_SENT_KEY, new Date().toISOString());
        }
      }
```

- [ ] **Step 4: `runReid` — use the store + strip `\x1e`.** In `runReid`:
  - Replace `sessionId: sessionIdRef.current,` (in the body, line ~420) with `sessionId: convo.getSnapshot().sessionId,`.
  - Replace the 429 rollback `setMessages((prev) => prev.slice(0, -1));` (line ~426) with `convo.dropLast();`.
  - Replace the session-id capture block (lines ~439-442):
    ```ts
      if (sid) {
        convo.setSessionId(sid);
      }
    ```
  - Replace `setStreamingText(acc);` at line ~452 and ~457 with `setStreamingText(stripReidStream(acc));`.
  - Replace the error append (lines ~461-464):
    ```ts
      convo.append({ role: 'assistant', content: `Something's off on my end. (${detail})` });
    ```
  - Replace the final commit `setMessages((prev) => [...prev, { role: 'assistant', content: acc }]);` (line ~469) with:
    `convo.append({ role: 'assistant', content: stripReidStream(acc) });`

- [ ] **Step 5: `handleSend` — append via the store.** Replace (lines ~474-481):

```ts
  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    setInput('');
    convo.append({ role: 'user', content: trimmed });
    await runReid(convo.getSnapshot().messages);
  }
```

- [ ] **Step 6: Add the voice toggle to the header.** In the header `View` (the one with the title + "Hear Reid"), add an orb/mic toggle as the FIRST child (before the title `View`):

```tsx
        <Pressable onPress={() => router.push('/voice')} hitSlop={12} style={{ marginRight: 14 }}>
          <AudioLines size={24} color={C.muted} />
        </Pressable>
```

- [ ] **Step 7: Typecheck** — `cd "/Users/theod/Documents/Documents - Mac/reid-native" && npx tsc --noEmit` → zero errors. Confirm no remaining references to `setMessages`, `sessionIdRef`, or `cachedSessionId` in `chat.tsx`: `grep -n "setMessages\|sessionIdRef\|cachedSessionId" "app/(app)/chat.tsx"` → no output.

- [ ] **Step 8: Commit**

```bash
cd "/Users/theod/Documents/Documents - Mac/reid-native"
git add "app/(app)/chat.tsx"
git commit -m "feat(voice): chat uses shared store; strip REID_ACTIONS markers; add voice toggle"
```

---

### Task 9: Final verification

- [ ] **Step 1: Full pure-test suite**

```bash
cd "/Users/theod/Documents/Documents - Mac/reid-native"
node --test lib/voice/__tests__/utils.test.ts lib/voice/__tests__/machine.test.ts lib/__tests__/conversationStore.test.ts
```
Expected: all pass (4 + 2 + 4 = matches the test counts).

- [ ] **Step 2: Full typecheck** — `npx tsc --noEmit` → zero errors.

- [ ] **Step 3: Record the device-test checklist** (Theo runs after a dev-client rebuild):
  mic permission prompt; tap→listen→thinking→speaking→idle; orb animates each state; silence auto-stop; manual tap-stop; toggle voice↔chat preserves the conversation and shows voice turns in chat; non-pro second voice session shows the `/upgrade` paywall; chat no longer renders `REID_ACTIONS`/`REID_SESSION_END` markers; recap fires on voice-screen exit.

- [ ] **Step 4: (no commit — verification only)**

---

## Self-Review

**Spec coverage:**
- Routing & full-screen `voice` route → Task 7. ✅
- Shared conversation store + chat migration → Tasks 3 + 8. ✅
- `useVoiceSession` FSM (record→transcribe→reid(voice)→tts→play), silence auto-stop, errors/429 → Tasks 2 (reducer) + 6. ✅
- Pure helpers (strip, gating, amplitude, silence) + tests → Task 1. ✅
- Orb (full fidelity) + `useOrbState` → Tasks 2 (mapping) + 5. ✅
- Voice screen layout → Task 7. ✅
- Gating & `/upgrade` paywall (exclude active session from count) → Tasks 1 + 6. ✅
- REID_ACTIONS `\x1e` strip in chat → Task 8. ✅
- Session recap on exit → Task 7. ✅
- app.json mic permission + expo-audio + test script → Task 4. ✅
- expo-av untouched (chat playback) → confirmed: Task 8 does not touch the `expo-av`/`playMessage` path. ✅

**Placeholder scan:** No TBD/TODO. The two genuinely SDK-uncertain spots (recorder metering field, player completion event) are explicitly marked VERIFY with a context7 step and a working fallback — not placeholders. `reidFetch` multipart handling is given as concrete code.

**Type consistency:** `Msg` is defined once in `conversationStore.ts` and imported by `chat.tsx` (Task 8) and used by the store API. `VoiceState`/`VoiceEvent` defined in `machine.ts` (Task 2), consumed by `useVoiceSession` (Task 6) and `orbState.ts`. `OrbVisual` defined in `orbState.ts` (Task 2), consumed by `ReidOrb`/`useOrbState` (Task 5). `voiceGateDecision({ isPro, priorVoiceSessions })` signature consistent across Task 1 (def) and Task 6 (call). `stripReidStream` defined Task 1, used Tasks 6 + 8.

## Notes / flags for execution review
- The `useVoiceSession` hook is the one un-unit-testable unit (RN/expo + async). Its core transitions ARE covered by the `voiceReducer` tests (Task 2); the wiring is verified by `tsc` + device. Spend extra review attention on it and on the two VERIFY spots.
- `reidFetch` is modified (multipart opt-out) in Task 6 — small and backward-compatible (JSON path unchanged), but it touches a shared helper used by chat; confirm the JSON branch is byte-identical for existing callers.
- Device testing is gated on a dev-client rebuild (Task 4).
