# Native Voice Experience — Sub-project 2 (Design Spec)

- **Date:** 2026-05-27
- **Repo:** `reid-native` (Expo SDK 54, expo-router, Reanimated v4)
- **Status:** Approved for planning
- **Part of:** Sprint 3 — Voice Pivot + Web Sync. Sub-project 2 of 4. Depends on sub-project 1
  (backend foundation), which is complete on `reid-app` branch `sprint3-voice-backend` and exposes:
  `POST /api/transcribe` → `{ transcript }`; `POST /api/reid { mode, sessionId?, messages, voice:true }`
  (SSE text stream, `X-Reid-Session-Id` header, marks `sessions.voice_used`, short spoken replies);
  `POST /api/tts { text }` → `audio/mpeg` bytes; `POST /api/session-recap { session_id }`. All four
  are reached through `reidFetch` (`lib/api.ts`) against `EXPO_PUBLIC_API_URL`. Both `/api/transcribe`
  and `/api/tts` are rate-limited per user/hour (free 20, pro 60) → may return 429
  `{ error: "rate_limit_exceeded", retryAfter }`.

## Goal

A full-screen voice mode where the user taps a living orb, speaks, and Reid transcribes, replies
(short, spoken), and speaks back — a tappable turn-by-turn conversation that shares one session with
text chat. No backend changes in this sub-project.

## Decisions (by Theo)

1. **Turn model:** tap-per-turn with silence auto-stop. User taps to speak; recording auto-stops on
   ~1.5s of silence (and on manual tap, and a safety max duration); Reid responds and speaks; returns
   to idle for the next tap. No hands-free auto-reopen.
2. **Voice↔chat history:** a shared in-memory conversation store both screens read/write. `chat.tsx`
   migrates its message + sessionId ownership to this store. Voice turns appear in chat. In-memory
   only (lost on app restart — same as chat today).
3. **Gating:** non-pro users get one free voice session; after that the orb shows a paywall routing to
   the existing `/upgrade` modal. Pro = unlimited. Enforced client-side using `users.subscription_status`
   and a count of the user's own `sessions where voice_used = true`.
4. **Audio lib:** `expo-audio` for the new recording + voice playback only. Leave `chat.tsx`'s existing
   `expo-av` TTS playback untouched (the two libraries coexist).
5. **Orb:** full visual fidelity (see §6) — not simplified.

## Architecture

Decomposed into small units so the testable logic is isolated from RN/expo wiring:

| Unit | File | Responsibility | Testable? |
|---|---|---|---|
| Conversation store | `lib/conversation.ts` | Shared `{ messages, sessionId }` + `append`/`setSessionId`/`reset`, via `useSyncExternalStore` | logic yes (pure store) |
| Stream strip | `lib/voice/strip.ts` | `stripReidStream(raw)` → text before first `\x1e` | yes (node:test) |
| Gating | `lib/voice/gating.ts` | `voiceGateDecision({ isPro, voiceSessionsUsed })` | yes |
| Amplitude | `lib/voice/amplitude.ts` | `meterToAmplitude(db)` → 0–1 | yes |
| Silence | `lib/voice/silence.ts` | `shouldAutoStop(levels, thresholdDb, silenceMs)` | yes |
| Voice session FSM | `hooks/useVoiceSession.ts` | record→transcribe→reid→tts→play state machine | tsc + device |
| Orb state map | `hooks/useOrbState.ts` | `sessionState`+amplitude → orb visual state | tsc + device |
| Orb | `components/ReidOrb.tsx` | Reanimated orb, 4 states | tsc + device |
| Screen | `app/voice.tsx` | full-screen layout + wiring | tsc + device |
| Chat integration | `app/(app)/chat.tsx` | use shared store; add orb toggle; strip `\x1e` | tsc + device |

**Test runner:** reid-native has none today. Pure helpers under `lib/voice/` (and the store's pure
reducer logic) are unit-tested with `node:test` + `node:assert/strict` run via `node --test
lib/voice/__tests__/<file>.test.ts` (Node v26 strips TS natively). Test files import helpers by
RELATIVE path with the `.ts` extension (the `@/` alias is not resolvable by Node). Helpers MUST NOT
import React Native / expo modules, or Node can't load them. A `"test": "node --test"` script is added
to `package.json`.

## 1. Routing & navigation

- Create `app/voice.tsx` and register it in the root `Stack` in `app/_layout.tsx` as a sibling of the
  existing `upgrade` screen: `<Stack.Screen name="voice" options={{ presentation: "fullScreenModal" }} />`
  (full-screen, above the tab bar). Status bar hidden/translucent dark.
- From `chat.tsx` header: an orb icon (`#7A90A8`, 24px) → `router.push('/voice')`.
- From `voice.tsx` top bar: a chat-bubble icon (`#7A90A8`, 24px) → `router.back()`.
- Shared store (below) preserves the conversation across the toggle.

## 2. Shared conversation store — `lib/conversation.ts`

```ts
export type Msg = { role: 'user' | 'assistant'; content: string };
```

- Module singleton holding `{ messages: Msg[]; sessionId: string | null }`, exposed through a
  `useConversation()` hook built on `useSyncExternalStore`. Methods: `append(msg)`, `appendMany(msgs)`,
  `replaceLast(msg)`, `setSessionId(id)`, `reset()`. No new dependency.
- `chat.tsx` migration: replace its local `useState<Msg[]>` and module-level `cachedSessionId` /
  `sessionIdRef` with the store. All existing chat behavior (opening line seeding, streaming
  accumulation into the last assistant message, `/api/tts` auto-play, scroll) is preserved — only the
  source of truth for `messages` and `sessionId` moves into the store. The opening-line seeding still
  runs once (guarded by the existing `OPENING_SENT_KEY`) but writes to the store.

## 3. `hooks/useVoiceSession.ts` — state machine

States: `idle → recording → processing → playing → idle`.

- **idle:** nothing active; waiting for a tap.
- **recording:** request mic permission on first use (handle denied gracefully — surface a one-line
  message, return to idle). Start `expo-audio` recording (m4a, `RecordingPresets.HIGH_QUALITY`). Poll
  recorder status (~150ms) for metering → `meterToAmplitude(db)` → `micAmplitude`. Maintain a rolling
  buffer of recent levels; `shouldAutoStop(...)` ends recording after ~1500ms below threshold (~-40dB).
  Manual tap also stops. Safety cap ~30s. If recorder metering is unavailable on SDK 54 (verify with
  context7 at implementation), fall back to a simulated `micAmplitude` pulse and rely on manual /
  max-duration stop (no silence detection).
- **processing:** stop recording → file URI. `POST /api/transcribe` as `multipart/form-data` (field
  `file`, the m4a) via `reidFetch`. On `{ transcript }`: `append({role:'user', content: transcript})`
  to the store and set `transcript`. Then `POST /api/reid` with
  `{ mode: 'chat', sessionId, voice: true, messages }` (messages from the store). Read the streamed
  body; accumulate; run `stripReidStream` so trailing `\x1e` markers never surface; capture
  `X-Reid-Session-Id` → `setSessionId`. `append({role:'assistant', content: reidText})`.
- **playing:** `POST /api/tts { text: reidText }` → `arrayBuffer` → write a temp file
  (`${cacheDirectory}reid_voice_turn.mp3`) → play via `expo-audio` player. `playbackAmplitude` is
  **synthesized** (a Reanimated-driven pseudo-waveform; expo-audio does not expose playback metering).
  Reid text streams into the transcript zone word-by-word during playback. On finish → `idle`.
- **Errors:** transcription/reid/tts failures (incl. 429 `rate_limit_exceeded`) return to `idle` and
  surface a short status line; a 429 shows "slow down — try again in a moment". Never crash the screen.

Exposes:
```ts
{
  sessionState: 'idle' | 'recording' | 'processing' | 'playing';
  transcript: string;        // latest user utterance
  reidResponse: string;      // latest Reid reply (streams in)
  micAmplitude: number;      // 0–1
  playbackAmplitude: number; // 0–1 (synthesized)
  voiceBlocked: boolean;     // gate says no more free voice
  startSession: () => void;  // begin recording (or open paywall if blocked)
  stopRecording: () => void; // manual stop
}
```

## 4. Pure helpers — `lib/voice/*.ts`

- `stripReidStream(raw: string): string` → `raw.split('\x1e')[0]` (text before the first record
  separator). Used by the voice flow AND the chat REID_ACTIONS fix (§8).
- `voiceGateDecision({ isPro, priorVoiceSessions }: { isPro: boolean; priorVoiceSessions: number }):
  { allowed: boolean }` → `allowed = isPro || priorVoiceSessions < 1`. `priorVoiceSessions` counts
  the user's COMPLETED voice sessions, EXCLUDING the in-progress one (see §5) — so re-checking the
  gate between turns of the same free session stays allowed; only the next, separate session blocks.
- `meterToAmplitude(db: number): number` → clamp/normalize a dBFS reading (≈ -60..0) to 0..1.
- `shouldAutoStop(levels: number[], thresholdDb: number, silenceMs: number, sampleMs: number):
  boolean` → true when the most recent `silenceMs` worth of samples are all below `thresholdDb`.

Each has a `node:test` file under `lib/voice/__tests__/`.

## 5. Gating & paywall

- `hooks/useVoiceSession` (or a small `useVoiceEntitlement`) reads, on mount and before each
  `startSession`: `users.subscription_status` (Supabase, by `auth_id`, as `chat.tsx` already does) and
  a count of the user's own voice sessions: `from('sessions').select('id', { count: 'exact', head:
  true }).eq('voice_used', true)` (RLS scopes to the user), with `.neq('id', sessionId)` appended ONLY
  when a current `sessionId` exists, so the in-progress session is excluded → `priorVoiceSessions`.
  `voiceGateDecision({ isPro, priorVoiceSessions })` → `voiceBlocked`. Excluding the active session is
  what lets a free user finish a full multi-turn session before the gate trips on their next one.
- When `voiceBlocked`: bottom zone shows "upgrade to continue" (`#B91C1C`, tappable); the orb tap and
  that text both `router.push('/upgrade')` (existing modal that opens web pricing). No new Stripe UI.
- This is a client-side UX gate; server quotas (`/api/reid` 5/month, voice route rate limits) remain
  the hard backstop.

## 6. Orb — `components/ReidOrb.tsx` + `hooks/useOrbState.ts` (FULL spec)

`useOrbState({ sessionState, micAmplitude, playbackAmplitude })` →
`{ state: 'idle'|'listening'|'thinking'|'speaking', amplitude: number }`:
`idle→{idle,0}`, `recording→{listening,micAmplitude}`, `processing→{thinking,0}`,
`playing→{speaking,playbackAmplitude}`.

`ReidOrb({ state, amplitude, onPress })` — React Native Reanimated v4 (shared values +
`useAnimatedStyle` + `interpolate`/`interpolateColor`). Transform + opacity only. 60fps. 200px base
diameter, centered in the upper ~60% of the screen.

- **idle:** core `#B91C1C` fill, 200px circle; outer glow `rgba(185,28,28,0.15)`, 260px, blurred via
  shadow; core scale `1.0 → 1.05 → 1.0` on a 3s ease-in-out loop; inner pulse opacity `0.6 → 1.0 → 0.6`
  on a 3s loop offset by 1.5s.
- **listening** (driven by `amplitude` realtime): core `#B91C1C`, scale `1.0 + amplitude*0.3`; outer
  ring 1 scale `1.3 + amplitude*0.4`, opacity `amplitude`; outer ring 2 scale `1.6 + amplitude*0.3`,
  opacity `amplitude*0.6`; color shifts slightly warmer as amplitude rises; subtle surface ripple on
  high-amplitude spikes.
- **thinking:** core contracts to scale `0.88` (ease-in 300ms); rings tighten inward; pulsing slows to
  a `0.5` opacity breathing on a 2s loop; no amplitude reactivity.
- **speaking** (driven by `amplitude`): core glow lerps `#B91C1C → #F2EDE3` based on amplitude;
  concentric rings pulse outward on amplitude spikes — ring scale `1.2 + amplitude*0.5`, a new ring on
  each spike `> 0.3`; rings fade out between words.
- **Tap:** `onPress` → `startSession()` when idle, `stopRecording()` when recording (no-op while
  processing/playing).

## 7. Voice screen layout — `app/voice.tsx`

Full screen `#0A1628`, no tab bar, status bar hidden/translucent. Top→bottom:
- **Top bar (56px):** Reid logo (`LogoMark`) left; chat-bubble toggle icon (`#7A90A8`, 24px) right →
  `router.back()`.
- **Upper zone (flex 1):** `ReidOrb` centered.
- **Transcript zone (~120px):** user speech in Inter 14 `C.muted` (fades in during listening); Reid
  reply in Playfair italic 20 `C.text` (streams in word-by-word during speaking). Both fade to 0
  between turns (300ms).
- **Bottom zone (64px):** idle → "tap to speak" (Inter 12 `C.muted`); recording → "listening…" pulse;
  processing → "thinking…" shimmer; `voiceBlocked` → "upgrade to continue" (`#B91C1C`, tappable).

Uses theme tokens `C`/`F` from `constants/theme.ts` and fonts already loaded.

## 8. REID_ACTIONS fix in `chat.tsx`

The web server appends trailing `\x1e`-prefixed `REID_ACTIONS`/`REID_SESSION_END` markers after the
record separator; native currently renders the raw accumulated stream including them. Apply
`stripReidStream` to (a) the streaming accumulation as it's shown and (b) any assistant content on
render, so the markers never display. This is the real native REID_ACTIONS bug.

## 9. Session recap on exit

`sessionId` persists across turns in the store. On `voice.tsx` unmount, if ≥1 voice exchange occurred
this visit, fire-and-forget `POST /api/session-recap { session_id }` (ignore failures). Populates
title/summary/commitments/avoiding/mood for SP3's web history. No per-turn recap.

## 10. Native config & build — `app.json` + `package.json`

- Install `expo-audio` (the SDK 54 version).
- Add to `app.json` `plugins`: `["expo-audio", { "microphonePermission": "Reid needs your microphone
  so you can talk to him." }]`.
- iOS: ensure `NSMicrophoneUsageDescription` (the plugin adds it; keep the existing notifications key).
- Android: `RECORD_AUDIO` (the plugin handles it).
- Add `"test": "node --test"` to `package.json` scripts.
- ⚠️ **Dev-client rebuild required** — `expo-audio` is a native module; Theo must rebuild the
  dev client (`expo run:ios` / EAS) before on-device testing. (Do not run `expo start` in this work.)

## Testing & acceptance criteria

- **Pure helpers:** `node --test lib/voice/__tests__/*.test.ts` all pass — `stripReidStream` cuts at
  the first `\x1e` (and is a no-op without one); `voiceGateDecision` (pro→allowed; non-pro 0 used→
  allowed; non-pro ≥1 used→blocked); `meterToAmplitude` clamps to [0,1] at the rails; `shouldAutoStop`
  true only when the trailing window is all-silent.
- **Conversation store:** a small test for `append`/`replaceLast`/`reset`/`setSessionId` reducer logic
  (kept pure/importable without RN).
- `npx tsc --noEmit` → zero errors.
- **Device (Theo):** mic permission prompt; tap→listen→thinking→speaking→idle; orb states animate;
  silence auto-stop; manual stop; toggle voice↔chat preserves the conversation; voice turns appear in
  chat; non-pro second voice session shows the `/upgrade` paywall; chat no longer shows REID_ACTIONS
  markers; recap fires on exit.

## Risks / verify-at-implementation

- **expo-audio metering API:** confirm via context7 whether recording exposes per-sample metering
  (dBFS) on SDK 54. If not, `micAmplitude` + silence auto-stop fall back to a simulated pulse + manual
  / max-duration stop; the orb still animates convincingly.
- **Playback amplitude is synthesized** by design (no expo-audio playback metering).
- **Chat store migration** touches working chat code — keep streaming/auto-play/scroll behavior
  byte-for-byte; only move where `messages`/`sessionId` live.
- **Dev-client rebuild** gates device testing (native module added).

## Out of scope

SP3 (web history page, `/noticed` page, recap auto-trigger) and SP4 (Zapier signup notifier, quality
gates). No backend/edge changes here — all server endpoints come from SP1.
