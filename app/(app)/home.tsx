import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { ArrowRight, Check } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { registerPushToken } from '@/lib/notifications';

type LoadedUser = {
  id: string;
  name: string | null;
  onboarding_complete: boolean;
  onboarding_summary: string | null;
  onboarding_task: string | null;
  last_session_at: string | null;
  session_count: number;
  streak_days: number;
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function milestoneFor(sessionCount: number): string {
  if (sessionCount <= 2) return 'Getting started';
  if (sessionCount <= 4) return 'Building momentum';
  if (sessionCount <= 9) return 'Pattern emerging';
  return 'First checkpoint';
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
  const [taskDone, setTaskDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (!cancelled) router.replace('/login');
        return;
      }
      const { data: row } = await supabase
        .from('users')
        .select('id, name, onboarding_complete, onboarding_summary, onboarding_task, last_session_at, session_count, streak_days')
        .eq('auth_id', session.user.id)
        .maybeSingle();
      if (cancelled) return;
      if (!row) {
        router.replace('/login');
        return;
      }
      if (!row.onboarding_complete) {
        router.replace('/onboarding');
        return;
      }
      setUser(row as LoadedUser);
      try {
        const done = await AsyncStorage.getItem(`reid:task:${row.id}:0:done`);
        if (!cancelled) setTaskDone(done === 'true');
      } catch {
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void registerPushToken();
  }, []);

  if (!loaded || !user) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bgDark, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  const summary = user.onboarding_summary?.trim() ?? '';
  const task = user.onboarding_task?.trim() ?? '';
  const greetName = user.name?.trim() || 'there';
  const sessionCount = user.session_count ?? 0;
  const streakText = streakTextFor(user);
  const milestoneLabel = milestoneFor(sessionCount);
  const progressPct = Math.min(100, (sessionCount / 10) * 100);

  async function toggleTask() {
    if (!user) return;
    const next = !taskDone;
    setTaskDone(next);
    try {
      await AsyncStorage.setItem(`reid:task:${user.id}:0:done`, next ? 'true' : 'false');
    } catch {
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bgDark }}
      contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 60, paddingBottom: 40 }}
    >
      <Text
        style={{
          fontFamily: Fonts.serifRegular,
          color: Colors.textPrimary,
          fontSize: 36,
          letterSpacing: -1.08,
          lineHeight: 40,
        }}
      >
        {greeting()}, {greetName}.
      </Text>
      <Text
        style={{
          fontFamily: Fonts.sansRegular,
          color: Colors.textDim,
          fontSize: 16,
          marginTop: 10,
        }}
      >
        Here{"’"}s where things stand.
      </Text>
      {sessionCount > 0 && streakText && (
        <Text
          style={{
            fontFamily: Fonts.sansRegular,
            color: Colors.textDim,
            fontSize: 13,
            marginTop: 12,
          }}
        >
          Session {sessionCount} · {streakText}
        </Text>
      )}

      <View style={{ marginTop: 36, gap: 16 }}>
        <Card title="YOUR FOCUS">
          {summary ? (
            <Text
              style={{
                fontFamily: Fonts.serifItalic,
                color: Colors.textPrimary,
                fontSize: 19,
                lineHeight: 29,
              }}
            >
              {summary}
            </Text>
          ) : (
            <Text style={{ fontFamily: Fonts.sansRegular, color: Colors.textDim, fontSize: 14 }}>
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
                  backgroundColor: Colors.accent,
                }}
              />
            </View>
            <Text style={{ marginTop: 8, fontFamily: Fonts.sansRegular, fontSize: 11, color: Colors.textDim }}>
              Session {sessionCount} of 10 — {milestoneLabel}
            </Text>
          </View>
        </Card>

        <Card title="TODAY'S TASK">
          {task ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
              <Pressable
                onPress={toggleTask}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  borderWidth: taskDone ? 0 : 1.5,
                  borderColor: 'rgba(255,255,255,0.2)',
                  backgroundColor: taskDone ? Colors.accent : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 2,
                }}
              >
                {taskDone && <Check size={12} color={Colors.textPrimary} />}
              </Pressable>
              <Text
                style={{
                  flex: 1,
                  fontFamily: Fonts.sansRegular,
                  fontSize: 16,
                  lineHeight: 25,
                  color: taskDone ? Colors.textDim : Colors.textPrimary,
                  textDecorationLine: taskDone ? 'line-through' : 'none',
                }}
              >
                {task}
              </Text>
            </View>
          ) : (
            <Text style={{ fontFamily: Fonts.sansRegular, color: Colors.textDim, fontSize: 14 }}>
              Reid will assign your task at the end of your next session.
            </Text>
          )}
        </Card>

        <Card title="CONTINUE">
          <Text style={{ fontFamily: Fonts.sansRegular, color: Colors.textDim, fontSize: 14, marginBottom: 18 }}>
            Your co-founder is ready.
          </Text>
          <Pressable
            onPress={() => router.push('/(app)/chat')}
            style={{
              height: 46,
              borderRadius: 9,
              backgroundColor: Colors.accent,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Text
              style={{
                fontFamily: Fonts.sansMedium,
                fontSize: 13,
                color: Colors.textPrimary,
                letterSpacing: 0.52,
              }}
            >
              Open session
            </Text>
            <ArrowRight size={16} color={Colors.textPrimary} />
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
        backgroundColor: Colors.bgCard,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: Colors.border,
        padding: 22,
      }}
    >
      <Text
        style={{
          fontFamily: Fonts.sansMedium,
          fontSize: 11,
          color: Colors.textDim,
          letterSpacing: 1.4,
          marginBottom: 14,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}
