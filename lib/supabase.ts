import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { createClient, type Session as AuthSession } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Surfaced loudly in dev — a missing key means nothing will authenticate.
  console.error('[reid] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No URL-based auth in a native app.
    detectSessionInUrl: false,
  },
});

// Refresh the session only while the app is foregrounded (Supabase RN guidance).
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

// ---------------------------------------------------------------------------
// Access token tracking.
// The project rule is: NEVER use getSession() to gate auth — it reads local
// storage without server verification. We still need the raw access token to
// authorize calls to our own Edge Function, so we capture it from the auth
// state change stream (fired on INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED).
// Auth *decisions* always go through getUser(), which verifies server-side.
// ---------------------------------------------------------------------------
let currentAccessToken: string | null = null;
supabase.auth.onAuthStateChange((_event, session: AuthSession | null) => {
  currentAccessToken = session?.access_token ?? null;
});

export function getAccessToken(): string | null {
  return currentAccessToken;
}

export const SUPABASE_ANON = SUPABASE_ANON_KEY;
export const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1`;

/** Verified current auth user (server-checked). Returns null if not signed in. */
export async function getUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

/** The public.users profile row for the current auth user (joined via auth_id). */
export async function getProfile(): Promise<Profile | null> {
  const user = await getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('auth_id', user.id)
    .maybeSingle();
  if (error) return null;
  return (data as Profile) ?? null;
}

// ---------------------------------------------------------------------------
// Row types — mirror the LIVE schema (verified via MCP), not the original spec.
// Key realities:
//  - public.users links to auth via `auth_id` (not `id`).
//  - RLS uses current_user_id() = users.id for child tables, so every child
//    row's `user_id` must be the PROFILE id (users.id), never the auth uid.
//  - goals have target/current values (no status/progress columns).
//  - tasks use `description` and link to sessions (no goal_id/title/priority).
//  - sessions use `reid_note`; key_points/commitments were added by migration.
//  - messages link to session_id + user_id (no conversation_id).
//  - observations use `text` (not content).
// ---------------------------------------------------------------------------

export type OnboardingGoal = {
  title: string;
  description?: string;
  timeframe?: string;
};

export type Profile = {
  id: string;
  auth_id: string | null;
  email: string | null;
  name: string | null;
  onboarding_complete: boolean | null;
  onboarding_task: string | null;
  onboarding_summary: string | null;
  onboarding_goals: OnboardingGoal[] | null;
  session_count: number;
  streak_days: number;
  last_session_at: string | null;
  last_session_date: string | null;
  avatar_url: string | null;
  created_at: string | null;
  // Billing fields exist but are server-managed — the client must never write them.
  subscription_status: 'free' | 'pro' | 'cancelled' | 'past_due';
};

export type Goal = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  target_value: number;
  current_value: number;
  unit: string;
  unit_prefix: boolean;
  deadline: string | null;
  is_primary: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  generated_take: string | null;
};

export type Task = {
  id: string;
  user_id: string;
  session_id: string | null;
  description: string;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
  generated_take: string | null;
  created_at: string;
};

export type SessionMode = 'chat' | 'onboarding';

export type Session = {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  task_set: string | null;
  message_count: number;
  mode: SessionMode;
  title: string | null;
  reid_note: string | null;
  outcome_captured: boolean;
  key_points: string[] | null;
  commitments: string[] | null;
};

export type ChatRole = 'user' | 'assistant';

export type DBMessage = {
  id: string;
  session_id: string;
  user_id: string;
  role: ChatRole;
  content: string;
  created_at: string;
};

export type Observation = {
  id: string;
  user_id: string;
  session_id: string | null;
  text: string;
  confidence: 'low' | 'medium' | 'high' | null;
  category: 'avoidance' | 'pattern' | 'contradiction' | 'strength' | null;
  generated_take: string | null;
  created_at: string;
};

/** Goal progress as a 0–100 integer, derived from current/target values. */
export function goalProgress(goal: Pick<Goal, 'current_value' | 'target_value'>): number {
  if (!goal.target_value || goal.target_value <= 0) return 0;
  const pct = (goal.current_value / goal.target_value) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/** Derived status, since the schema has no status column. */
export function goalStatus(goal: Pick<Goal, 'completed_at'>): 'active' | 'complete' {
  return goal.completed_at ? 'complete' : 'active';
}
