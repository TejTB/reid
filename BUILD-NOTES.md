# Reid Native — Build Contract (READ FIRST)

This is the single source of truth for everyone building UI. The foundation
(config, lib/, hooks/, root layout, theme, Edge Function) is **done and
typechecks clean**. Build against it. Do not modify foundation files unless your
task explicitly says so.

## Hard rules

1. **Theme only.** Import `theme` from `lib/theme`. Zero hardcoded hex colours.
   Zero hardcoded `fontFamily` strings — use `theme.font.*`. Spacing in
   multiples of 4 (prefer `theme.spacing.*`).
2. **FlatList for any list** (messages, picks, sessions, tasks) — never
   `ScrollView` + `.map()` for unbounded data.
3. **Animations: transform + opacity only.** Target 60fps. No layout animations
   inside a Skia `Canvas`.
4. **Run `npx tsc --noEmit` before you report done.** Fix every error in files
   you own. It must exit clean.
5. **Stay in your lane.** Only create/edit the files listed in your assignment.
6. **Safe area + keyboard.** Use `react-native-safe-area-context`
   (`useSafeAreaInsets`) on every screen. Wrap input screens in
   `KeyboardAvoidingView`.

## Verified library facts (already confirmed via context7 — do NOT re-verify)

- **Expo SDK 56, React 19.2, RN 0.85, new architecture ON.**
- **Reanimated v4.3.** Babel is already configured (babel-preset-expo
  auto-includes the worklets plugin — do NOT add any babel plugin).
  Hooks: `useSharedValue`, `useDerivedValue`, `withTiming`, `withRepeat`,
  `withSequence`, `withSpring`, `useAnimatedStyle`, `Easing`, `cancelAnimation`
  from `react-native-reanimated`. `withRepeat(anim, -1, true)` = infinite reverse.
- **Skia v2.6** `@shopify/react-native-skia`. Animate by passing Reanimated
  shared values / `useDerivedValue` straight into element props. Example:
  ```tsx
  import { Canvas, Circle, Group, RadialGradient, vec } from '@shopify/react-native-skia';
  import { useClock } from '@shopify/react-native-skia';
  // RadialGradient is a CHILD of the shape it fills:
  <Circle cx={cx} cy={cy} r={r}>
    <RadialGradient c={vec(cx, cy)} r={r} colors={['#EF4444', '#B91C1C', '#7F1D1D']} />
  </Circle>
  // Continuous motion: const clock = useClock(); useDerivedValue(() => Math.sin(clock.value/1000)).
  // Group transform with center origin: <Group origin={vec(cx,cy)} transform={[{ scale }]}>
  ```
- **Streaming chat** is already implemented in `lib/anthropic.ts` (`streamChat`,
  `complete`) using `expo/fetch`. Use the `useChat` hook — never call fetch yourself.
- **expo-router** v56, typed routes on. `useRouter().replace('/(tabs)/home')`,
  `router.push('/onboarding/summary')`. Params via `useLocalSearchParams`.
- Icons: `import { Feather } from '@expo/vector-icons'`.
- Haptics: `import * as Haptics from 'expo-haptics'`.
- Browser: `import * as WebBrowser from 'expo-web-browser'`.

## Data model (REAL schema — the original spec's schema was WRONG)

Types live in `lib/supabase.ts`: `Profile, Goal, Task, Session, DBMessage,
Observation`, plus helpers `goalProgress(goal)` (0–100) and `goalStatus(goal)`.

- `goals`: no status/progress columns. Use `goalProgress()` and `goalStatus()`.
- `tasks`: text is `description` (not title). No `goal_id`/`priority`. Group by
  Active vs Done. `useTasks()` gives `{ tasks, toggle, openCount, refresh }`.
- `sessions`: observation is `reid_note`; `key_points` & `commitments` are jsonb
  arrays; `task_set` is a free-text field. Title is `title`.
- `observations`: text is `text` (not content).
- Never write billing fields on `users`.

## Hooks (already built — import and use)

- `useAuth()` → `{ user, profile, loading, signIn, signUp, signOut, refreshProfile }`
- `useChat(opts)` → `{ messages, isStreaming, orbState, sessionId, send, setComposing }`
  - opts: `{ system, model?, maxTokens?, persist?: {profileId, mode}, initialAssistantMessage?, onAssistantComplete? }`
- `useGoals()` → `{ goals, loading, refresh }`
- `useTasks()` → `{ tasks, loading, refresh, toggle, openCount }`
- `useSessions()` → `{ sessions, loading, refresh }`
- `useCurrentFocus()` → `{ focus: {title, goal, progress, openTaskCount} | null, loading, refresh }`
- `persistOnboarding(profileId, result, sessionId)` from `hooks/useOnboarding`
- `generateAndSaveSession({messages, profileId, sessionId})` from `lib/session-engine`
- `getProfile()` from `lib/supabase` → current `Profile | null`

## Shared UI types (`lib/types.ts`)

- `OrbState = 'idle' | 'listening' | 'thinking' | 'responding'`
- `UIMessage = { id: string; role: 'user'|'assistant'; content: string; streaming?: boolean }`
- `genId(prefix?)` for local list keys.

## Component interface contracts (build these EXACTLY — other agents depend on them)

```ts
// components/orb/ReidOrb.tsx
export function ReidOrb(props: { size?: number; state: OrbState; style?: StyleProp<ViewStyle> }): JSX.Element
// default size 200.

// components/chat/ChatBubble.tsx
export function ChatBubble(props: { message: UIMessage; index: number }): JSX.Element
// Reid (assistant): no bubble, text only; alternate theme.font.displayItalic / theme.font.body by index parity.
// User: red-tinted bubble, right aligned. Entrance: opacity 0->1 + translateX, 250ms.

// components/chat/ChatInput.tsx
export function ChatInput(props: {
  onSend: (text: string) => void;
  disabled?: boolean;          // true while streaming
  onComposingChange?: (composing: boolean) => void; // fire as text becomes non-empty/empty
  placeholder?: string;
}): JSX.Element
// Manages its own text state; clears on send. 44x44 red send button (arrow-up), dim when empty.

// components/orb/OrbChatModal.tsx
export function OrbChatModal(props: {
  visible: boolean;
  onClose: () => void;
  sessionContext?: { title?: string; summary?: string }; // for "continue thread"
}): JSX.Element
// Full-screen modal, slides up, pan-down-to-dismiss (>120px). Top 38%: ReidOrb size 150 driven by useChat orbState.
// Inverted FlatList of ChatBubble. ChatInput pinned bottom (KeyboardAvoidingView).
// useChat({ system: buildChatPrompt(ctx), persist:{profileId, mode:'chat'}, ... }).
// On close with >3 messages: void generateAndSaveSession({messages, profileId, sessionId}).

// components/orb/FloatingOrb.tsx
export function FloatingOrb(): JSX.Element
// Self-contained: 60x60 button, red glow, entrance scale spring, ripple ring (1.0->1.4 scale, opacity 1->0, 2500ms).
// Inner mini ReidOrb size 44 state idle. On press: Haptics.impactAsync(Medium) then opens its own OrbChatModal.
```

## Routing map (expo-router, file-based)

- `app/auth/login.tsx`, `app/auth/signup.tsx`, `app/auth/_layout.tsx` (Stack, headerShown false)
- `app/onboarding/chat.tsx`, `app/onboarding/summary.tsx`, `app/onboarding/_layout.tsx`
- `app/(tabs)/_layout.tsx` (custom TabBar + FloatingOrb), `home/index.tsx`, `plan/index.tsx`, `goals/index.tsx`, `sessions/index.tsx`
- Root `app/_layout.tsx` already redirects based on auth + onboarding_complete. Do not edit it.
- Navigate post-auth/onboarding with `router.replace('/(tabs)/home')`.
