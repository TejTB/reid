import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { ArrowRight, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { reidFetch } from '@/lib/api';
import { registerPushToken } from '@/lib/notifications';
import { C, F, R, S } from '@/constants/theme';

type LoadedUser = {
  id: string;
  name: string | null;
  onboarding_complete: boolean;
  onboarding_summary: string | null;
  onboarding_task: string | null;
  onboarding_task_completed_at: string | null;
  last_session_at: string | null;
  session_count: number;
  streak_days: number;
};

// Free plan caps at 3 sessions. After session 3, the bar is full and the
// upgrade pressure starts on /upgrade.
const FREE_SESSION_LIMIT = 3;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function milestoneFor(sessionCount: number): string {
  if (sessionCount <= 0) return 'Getting started';
  if (sessionCount === 1) return 'Getting started';
  if (sessionCount === 2) return 'Building momentum';
  if (sessionCount >= FREE_SESSION_LIMIT) return 'Free limit reached';
  return 'Almost there';
}

function streakTextFor(user: LoadedUser, now: Date = new Date()): string | null {
  const last = user.last_session_at ? new Date(user.last_session_at) : null;
  if (last && !Number.isNaN(last.getTime())) {
    const sameDay =
      last.getFullYear() === now.getFullYear() &&
      last.getMonth() === now.getMonth() &&
      last.getDate() === now.getDate();
    if (sameDay) return 'Active today';
  }
  if ((user.streak_days ?? 0) > 1) return `${user.streak_days} day streak`;
  if (last && !Number.isNaN(last.getTime())) {
    const dayMs = 1000 * 60 * 60 * 24;
    const days = Math.max(1, Math.floor((now.getTime() - last.getTime()) / dayMs));
    return `Last active ${days} day${days === 1 ? '' : 's'} ago`;
  }
  return null;
}

export default function HomeScreen() {
  const [user, setUser] = useState<LoadedUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [taskDone, setTaskDone] = useState(false);
  const [taskPending, setTaskPending] = useState(false);

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.replace('/login');
      return null;
    }
    const { data: row } = await supabase
      .from('users')
      .select(
        'id, name, onboarding_complete, onboarding_summary, onboarding_task, onboarding_task_completed_at, last_session_at, session_count, streak_days',
      )
      .eq('auth_id', session.user.id)
      .maybeSingle();
    if (!row) {
      router.replace('/login');
      return null;
    }
    const typed = row as LoadedUser;
    if (!typed.onboarding_complete) {
      router.replace('/onboarding');
      return null;
    }
    setUser(typed);
    setTaskDone(Boolean(typed.onboarding_task_completed_at));
    return typed;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (!cancelled) setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    void registerPushToken();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  if (!loaded || !user) {
    return (
      <View
        style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}
      >
        <ActivityIndicator color={C.red} />
      </View>
    );
  }

  const summary = user.onboarding_summary?.trim() ?? '';
  const task = user.onboarding_task?.trim() ?? '';
  const greetName = user.name?.trim() || 'there';
  const sessionCount = user.session_count ?? 0;
  const streakText = streakTextFor(user);
  const milestoneLabel = milestoneFor(sessionCount);
  const progressPct = Math.min(100, (sessionCount / FREE_SESSION_LIMIT) * 100);

  async function toggleTask() {
    if (!user || taskPending) return;
    const next = !taskDone;
    setTaskPending(true);
    setTaskDone(next);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      const completedAt = next ? new Date().toISOString() : null;
      const { error } = await supabase
        .from('users')
        .update({ onboarding_task_completed_at: completedAt })
        .eq('id', user.id);
      if (error) {
        // Revert on failure so the UI stays truthful.
        setTaskDone(!next);
        return;
      }
      // Notify Reid so he can react in the next session.
      if (next) {
        try {
          await reidFetch('/api/reid', {
            method: 'POST',
            body: JSON.stringify({
              mode: 'chat',
              messages: [
                {
                  role: 'user',
                  content: `[system: I completed the task you set: "${task}"]`,
                },
              ],
            }),
          });
        } catch {
          // Best effort — the task completion already persisted.
        }
      }
    } finally {
      setTaskPending(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 32 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.red} />
      }
    >
      <Text
        style={{
          fontFamily: F.serifReg,
          color: C.text,
          fontSize: 30,
          letterSpacing: -0.6,
          lineHeight: 36,
        }}
      >
        {greeting()}, {greetName}.
      </Text>
      <Text
        style={{
          fontFamily: F.sans,
          color: C.muted,
          fontSize: 14,
          marginTop: 6,
        }}
      >
        Here{"'"}s where things stand.
      </Text>
      {sessionCount > 0 && streakText && (
        <Text
          style={{
            fontFamily: F.sans,
            color: C.muted,
            fontSize: 12,
            marginTop: 4,
          }}
        >
          Session {sessionCount} · {streakText}
        </Text>
      )}

      <View style={{ marginTop: S.lg + 8, gap: S.md }}>
        <Card title="YOUR FOCUS">
          {summary ? (
            <Text
              style={{
                fontFamily: F.serifItalic,
                color: C.text,
                fontSize: 17,
                lineHeight: 26,
              }}
            >
              {summary}
            </Text>
          ) : (
            <Text style={{ fontFamily: F.sans, color: C.muted, fontSize: 14 }}>
              Complete your first session with Reid.
            </Text>
          )}
          <View style={{ marginTop: 16 }}>
            <View
              style={{
                height: 3,
                backgroundColor: 'rgba(255,255,255,0.05)',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: `${progressPct}%`,
                  height: '100%',
                  backgroundColor: C.red,
                }}
              />
            </View>
            <Text
              style={{
                marginTop: 8,
                fontFamily: F.sans,
                fontSize: 12,
                color: C.muted,
              }}
            >
              Session {Math.min(sessionCount, FREE_SESSION_LIMIT)} of {FREE_SESSION_LIMIT} — {milestoneLabel}
            </Text>
          </View>
        </Card>

        <Card title="TODAY'S TASK">
          {task ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
              <Pressable
                onPress={toggleTask}
                disabled={taskPending}
                hitSlop={10}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  borderWidth: taskDone ? 0 : 1.5,
                  borderColor: C.border,
                  backgroundColor: taskDone ? C.red : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: taskPending ? 0.6 : 1,
                }}
              >
                {taskDone && <Check size={16} color={C.text} strokeWidth={2.5} />}
              </Pressable>
              <Text
                style={{
                  flex: 1,
                  fontFamily: F.sans,
                  fontSize: 15,
                  lineHeight: 23,
                  color: taskDone ? C.muted : C.text,
                  textDecorationLine: taskDone ? 'line-through' : 'none',
                  paddingTop: 6,
                }}
              >
                {task}
              </Text>
            </View>
          ) : (
            <Text style={{ fontFamily: F.sans, color: C.muted, fontSize: 14 }}>
              Reid will assign your task at the end of your next session.
            </Text>
          )}
        </Card>

        <Card title="CONTINUE">
          <Text
            style={{
              fontFamily: F.serifItalic,
              color: C.text,
              fontSize: 17,
              lineHeight: 26,
              marginBottom: 16,
            }}
          >
            Your co-founder is ready.
          </Text>
          <Pressable
            onPress={() => router.push('/(app)/chat')}
            style={{
              height: 50,
              borderRadius: R.sm,
              backgroundColor: C.red,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Text
              style={{
                fontFamily: F.sansMed,
                fontSize: 13,
                color: C.text,
                letterSpacing: 0.5,
              }}
            >
              Open session
            </Text>
            <ArrowRight size={16} color={C.text} />
          </Pressable>
        </Card>
      </View>
    </ScrollView>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: C.surface,
        borderRadius: R.md,
        borderWidth: 1,
        borderColor: C.border,
        padding: 20,
      }}
    >
      <Text
        style={{
          fontFamily: F.sansMed,
          fontSize: 11,
          color: C.muted,
          letterSpacing: 1.3,
          marginBottom: 14,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}
