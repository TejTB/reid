# Sprint 4 — Native App Shell (voice-first) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline) or subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the orb the app — voice-first onboarding, orb as the default tab, a real Home dashboard with Reid's Picks — on `reid-native` only.

**Architecture:** Reuse the shipped Sprint-3 voice stack (`useVoiceSession`, `ReidOrb`, pure utils in `lib/voice/*`, `conversationStore`). Extend `useVoiceSession` (backward-compatibly) to support an onboarding "speak-first" turn. Fold the orb into the `(app)` tab group as the default `reid` tab; demote chat/plan/tasks to non-tab routes (`href:null`). Wire Home to real Supabase data and add a file-sourced Picks carousel. Align design tokens to the documented spec.

**Tech Stack:** Expo SDK 54, Expo Router (typedRoutes, group-qualified hrefs e.g. `/(app)/reid`), expo-audio, Reanimated 4, Supabase JS, node:test for pure utils.

**Backend is FIXED & EXTERNAL:** reid-app at `https://reid-app.vercel.app` — `/api/transcribe`, `/api/reid` (voice:true, mode chat|onboarding, streams; `[ONBOARDING_COMPLETE]` sentinel + `X-Reid-Session-Id`), `/api/tts` (audio bytes), `/api/session-recap`. Do NOT edit reid-app.

---

## File Structure

**Create:**
- `lib/picks.ts` — Reid's Picks data (10 entries) + type.
- `lib/picks.test.ts` — data integrity tests.
- `lib/voice/envelope.ts` — pure shaped speech-envelope (replaces Math.random orb pulse).
- `lib/voice/envelope.test.ts` — bounds/attack tests.
- `components/GlowCard.tsx` — reusable native glow card (surfaceGlass + border + entering + press-scale + optional red glow).
- `components/PicksCarousel.tsx` — horizontal Picks carousel → in-app browser.
- `app/(app)/reid.tsx` — the orb voice screen, now a tab (moved from `app/voice.tsx`, recap-on-blur).
- `app/onboarding/voice.tsx` — voice-first onboarding (Reid speaks first), text fallback link.

**Modify:**
- `constants/theme.ts` — token swap (secondary/dim blue-grey, bg-deep, input border floor).
- `lib/voice/machine.ts` + `machine.test.ts` — add `OPENING` event (idle→processing).
- `hooks/useVoiceSession.ts` — options `{mode, gate, speakFirst, onComplete}` + `kickoff()` speak-first turn + envelope amplitude.
- `app/(app)/_layout.tsx` — 4 visible tabs (reid·home·goals·noticed); chat/plan/tasks `href:null`; badge on reid.
- `app/_layout.tsx` — remove `voice` Stack.Screen.
- `app/index.tsx` — land on `/(app)/reid`.
- `app/onboarding/index.tsx` — Begin → `/onboarding/voice`.
- `app/onboarding/chat.tsx` — token sweep; completion → `/(app)/reid`.
- `app/(app)/home.tsx` — real data (primary goal focus, sessions-this-week, last-session nudge), Picks carousel, gear→plan, Continue→`/(app)/reid`.
- `app/(app)/goals.tsx`, `app/(app)/tasks.tsx`, `app/(app)/chat.tsx` — repoint `/voice` → `/(app)/reid`; token sweep.

**Delete:**
- `app/voice.tsx` (content moves to `app/(app)/reid.tsx`).

---

## Task 1 — Design tokens (SP0 foundation)

**Files:** Modify `constants/theme.ts`.

- [ ] In `C`: set `border: 'rgba(255,255,255,0.10)'`; `textDim: '#7A90A8'`; `muted: '#C8D5E3'`; add `bgDeep: '#060E1C'`; add `inputBorder: 'rgba(255,255,255,0.10)'`.
- [ ] Grep sweep hardcoded duplicates and route through tokens (no half-applied): `rgba(242,237,227,...)`, `#C8D5E3`, `#7A90A8`, `rgba(122,144,168,...)`, and `rgba(255,255,255,0.04/0.06/0.20/0.35)` literals in screens I touch → `C.surfaceGlass`/`C.border`/`C.inputBorder`/`C.muted`/`C.textDim`. `_layout` `INACTIVE_COLOR` → `C.textDim`.
- [ ] `tsc --noEmit` clean. Commit.

## Task 2 — Speech envelope (kills Math.random orb pulse)

**Files:** Create `lib/voice/envelope.ts`, `lib/voice/envelope.test.ts`.

- [ ] Test first: `speechEnvelope(t)` ∈ [0.12, 0.95] for many t; attack — `speechEnvelope(0)` ≤ 0.2; continuity — |Δ| small over 80ms steps.
- [ ] Implement: layered sines (≈11/5.3/2.1 Hz) centered 0.5, scaled, clamped [0.12,0.95], with linear attack over first 250ms. Pure, deterministic, NO Math.random.
- [ ] Run tests green. Commit.

## Task 3 — Machine OPENING event (speak-first)

**Files:** Modify `lib/voice/machine.ts`, `lib/voice/machine.test.ts`.

- [ ] Add `{ type: "OPENING" }` to `VoiceEvent`; transition `idle --OPENING--> processing`. Other states ignore it.
- [ ] Test: `voiceReducer("idle",{type:"OPENING"})==="processing"`; `voiceReducer("recording",{type:"OPENING"})==="recording"`.
- [ ] Tests green. Commit.

## Task 4 — Extend useVoiceSession (options + kickoff + envelope)

**Files:** Modify `hooks/useVoiceSession.ts`.

- [ ] Signature → `useVoiceSession(opts: { mode?: "chat"|"onboarding"; gate?: boolean; onComplete?: () => void } = {})`. Defaults: mode `"chat"`, gate `true`. Reid tab calls with no args (identical behavior).
- [ ] Gate: only run `refreshEntitlement` / `voiceBlocked` when `gate !== false`.
- [ ] `/api/reid` body uses `opts.mode` (was hardcoded `"chat"`).
- [ ] Extract `streamReid(messages)` helper (POST `/api/reid`, set sessionId, read stream, `stripReidStream`) shared by `runTurn` and `kickoff`. After accumulating, detect `[ONBOARDING_COMPLETE]` (strip from spoken text) OR poll `users.onboarding_complete`; if complete, set a `completeRef` so playback-finish calls `opts.onComplete`.
- [ ] Add `kickoff()`: guard busy; `dispatch({type:"OPENING"})`; `streamReid(convo messages)`; `dispatch REPLY_READY`; `playReply(reply)`. For onboarding seed, messages may be empty.
- [ ] Replace `setPlaybackAmplitude(0.3 + 0.5*Math.random())` with envelope: capture `playStart=Date.now()`, interval (80ms) → `setPlaybackAmplitude(speechEnvelope(Date.now()-playStart))`. Import from `@/lib/voice/envelope`.
- [ ] In `finishPlayback`: if `completeRef.current` → `opts.onComplete?.()`.
- [ ] Return `kickoff` alongside existing API.
- [ ] `tsc` clean. Commit.

## Task 5 — Orb as the Reid tab (`app/(app)/reid.tsx`)

**Files:** Create `app/(app)/reid.tsx` (from `app/voice.tsx`), delete `app/voice.tsx`, modify `app/_layout.tsx`.

- [ ] New `reid.tsx`: same orb UI as voice.tsx, but recap on **blur** via `useFocusEffect` cleanup (not unmount), guarded by `hadExchangeRef`. Header left = `LogoMark`, right = gear (`Settings` icon) → `router.push('/(app)/plan')`. Add quiet "type instead" link near status → `router.push('/(app)/chat')`. Not a modal — full-bleed view, status bar light (not hidden, since tab bar shows).
- [ ] Delete `app/voice.tsx`; remove its `<Stack.Screen name="voice" .../>` from `app/_layout.tsx`.
- [ ] `tsc` clean. Commit.

## Task 6 — Tab bar restructure

**Files:** Modify `app/(app)/_layout.tsx`.

- [ ] Visible tabs in order: **reid** (orb, `Sparkles`/`AudioLines` icon, first/default), **home**, **goals**, **noticed**.
- [ ] `chat`, `plan`, `tasks` → `options={{ href: null }}` (route kept, off bar).
- [ ] Move unread badge to the **reid** tab; clear `LAST_SEEN_KEY` when pathname endsWith `/reid` (keep `/chat` clear too).
- [ ] `tsc` clean. Commit.

## Task 7 — Routing repoint (`/voice` → `/(app)/reid`)

**Files:** `app/index.tsx`, `app/onboarding/chat.tsx`, `app/(app)/home.tsx`, `app/(app)/goals.tsx`, `app/(app)/tasks.tsx`, `app/(app)/chat.tsx`.

- [ ] Grep `'/voice'` repo-wide; replace each nav with `'/(app)/reid'`. index landing, onboarding completion, home Continue, goals/tasks CTAs, chat header.
- [ ] `tsc` clean (typedRoutes must resolve `/(app)/reid`, `/voice` gone). Commit.

## Task 8 — Voice onboarding (SP1)

**Files:** Create `app/onboarding/voice.tsx`; modify `app/onboarding/index.tsx`.

- [ ] `onboarding/voice.tsx`: `useVoiceSession({ mode:'onboarding', gate:false, onComplete: () => router.replace('/(app)/reid') })`. On mount (after a tick / first orb tap), request mic perm + `convo.reset()` + `kickoff()` so Reid speaks first. Orb reactive (`useOrbState`); show Reid text + transcript like reid screen. Quiet "type instead" → `router.replace('/onboarding/chat')`.
- [ ] `onboarding/index.tsx`: Begin → `/onboarding/voice` (was `/onboarding/chat`).
- [ ] `tsc` clean. Commit.

## Task 9 — Picks data + carousel (SP3)

**Files:** Create `lib/picks.ts`, `lib/picks.test.ts`, `components/PicksCarousel.tsx`. Verify/ада `expo-web-browser`.

- [ ] `lib/picks.ts`: `type Pick = { id; name; tagline; url; }`; export `PICKS` = Claude, Notion, Linear, Vercel, Stripe, Supabase, Figma, GitHub, Product Hunt, YC (real https URLs).
- [ ] `picks.test.ts`: 10 entries; unique ids; all urls https.
- [ ] If `expo-web-browser` not installed → `npx expo install expo-web-browser` (native dep; rebuild already required). Use `WebBrowser.openBrowserAsync(url)`.
- [ ] `PicksCarousel.tsx`: horizontal `ScrollView` of `GlowCard` items (name + tagline), tap → in-app browser. transform/opacity motion only.
- [ ] Tests green; `tsc` clean. Commit.

## Task 10 — GlowCard + Home real data (SP3)

**Files:** Create `components/GlowCard.tsx`; modify `app/(app)/home.tsx`.

- [ ] `GlowCard.tsx`: surfaceGlass bg, `C.border`, radius `R.md`, padding, `FadeInUp` delay prop, press-scale, optional `glow` (red shadow). Generalizes home's `CardShell`.
- [ ] Home: query primary goal (`goals` where `is_primary` true) → Current Focus (fallback onboarding_summary). Query `sessions` count last 7d → real "Sessions this week". Query latest session recap (`title,reid_note,mood,ended_at`) → **last-session nudge** GlowCard ("Reid's been thinking about…") tap → `/(app)/reid`. Add `<PicksCarousel/>` section ("Reid's Picks"). Add header gear → `/(app)/plan`. Continue → `/(app)/reid`. Remove the `min(sessionCount,7)` hack.
- [ ] `tsc` clean. Commit.

## Task 11 — Quality gate

- [ ] Impeccable (`~/.agents/skills/impeccable`) — TS errors, missing imports, UI-thread violations, hardcoded colours BLOCK.
- [ ] secret-scanner on touched areas.
- [ ] `npx tsc --noEmit` clean.
- [ ] node:test suite green (`machine`, `envelope`, `picks`, existing voice utils).
- [ ] Commit (git-commit-smart), push `sprint4-native-shell`, open PR. STOP — Theo runs device test (gate #4) + merge.

---

## Self-Review notes
- Spec coverage: SP1 voice onboarding = Task 8 (+4,3). SP2 shell/tabs = Tasks 5,6,7. SP3 home+picks = Tasks 9,10. Design system = Task 1 + GlowCard (10). Orb metering decision = Task 2,4. All mapped.
- Reuse honored: ReidOrb, useVoiceSession (extended not rebuilt), LogoMark, pure utils, conversationStore, CardShell→GlowCard. Nothing recreated.
- Risk: extending shared `useVoiceSession` could regress the reid tab — mitigated by backward-compatible defaults (no-arg call unchanged) + unit test on the machine change.
- Out of scope (Sprint 5): real buffer-analysed orb amplitude, Sessions list/detail, Goals detail, Stripe, tasks-table wiring.
