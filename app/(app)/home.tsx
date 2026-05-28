import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  FadeInUp,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { Check, Settings } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { reidFetch } from '@/lib/api';
import ReidPulse from '@/components/ReidPulse';
import GlowCard from '@/components/GlowCard';
import PicksCarousel from '@/components/PicksCarousel';
import { registerPushToken } from '@/lib/notifications';
import { C, F, R } from '@/constants/theme';

// The user row shape — the real Supabase table is `users` (keyed by auth_id),
// not `profiles`. We mirror the spec's pattern (single fetch + error state)
// against the actual schema.
type Profile = {
  id: string;
  name: string | null;
  onboarding_complete: boolean;
  onboarding_summary: string | null;
  onboarding_task: string | null;
  onboarding_task_completed_at: string | null;
  last_session_at: string | null;
  session_count: number;
  streak_days: number;
  created_at: string | null;
};

type Observation = {
  id: string;
  text: string;
  created_at: string;
};

type PrimaryGoal = {
  id: string;
  title: string;
  generated_take: string | null;
};

type LastSession = {
  title: string | null;
  reid_note: string | null;
  mood: string | null;
  ended_at: string | null;
};

// Free plan caps at 3 sessions — surfaces the progress bar status in the
// "Your Focus" card.
const FREE_SESSION_LIMIT = 3;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

type Status = 'good' | 'neutral' | 'warn' | 'critical';

function focusStatus(sessionCount: number): Status {
  // Critical = at/over free limit, warn = drifting toward it, good = active,
  // neutral = no history yet.
  if (sessionCount >= FREE_SESSION_LIMIT) return 'critical';
  if (sessionCount >= 2) return 'warn';
  if (sessionCount >= 1) return 'good';
  return 'neutral';
}

function focusLabel(sessionCount: number): string {
  if (sessionCount <= 0) return 'Getting started';
  if (sessionCount === 1) return 'Building momentum';
  if (sessionCount === 2) return 'Almost there';
  if (sessionCount >= FREE_SESSION_LIMIT) return 'Free limit reached';
  return 'In motion';
}

function colorForStatus(status: Status): string {
  switch (status) {
    case 'good':
      return C.success;
    case 'warn':
      return C.amber;
    case 'critical':
      return C.red;
    default:
      return C.muted;
  }
}

function dimForStatus(status: Status): string {
  switch (status) {
    case 'good':
      return C.successDim;
    case 'warn':
      return C.amberDim;
    case 'critical':
      return C.redDim;
    default:
      return C.surfaceGlass;
  }
}

function tasksDoneCount(profile: Profile): number {
  // Right now `users.onboarding_task_completed_at` is the only "task" wired
  // up. When we add a tasks table we'll sum here.
  return profile.onboarding_task_completed_at ? 1 : 0;
}

function activeDaysCount(profile: Profile): number {
  // Best-effort: streak_days is the closest signal we have.
  return Math.max(0, profile.streak_days ?? 0);
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [observation, setObservation] = useState<Observation | null>(null);
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal | null>(null);
  const [lastSession, setLastSession] = useState<LastSession | null>(null);
  const [sessionsThisWeek, setSessionsThisWeek] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [taskDone, setTaskDone] = useState(false);
  const [taskPending, setTaskPending] = useState(false);
  const [authId, setAuthId] = useState<string | null>(null);

  // Single-attempt fetch. On failure we surface a Retry button — never a loop
  // and never a white screen.
  const mountedRef = useRef(true);
  const fetchProfile = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }
      if (mountedRef.current) setAuthId(session.user.id);
      const { data, error: profileError } = await supabase
        .from('users')
        .select(
          'id, name, onboarding_complete, onboarding_summary, onboarding_task, onboarding_task_completed_at, last_session_at, session_count, streak_days, created_at',
        )
        .eq('auth_id', session.user.id)
        .maybeSingle();
      if (!mountedRef.current) return;
      if (profileError || !data) {
        setError(true);
        setLoading(false);
        return;
      }
      const row = data as Profile;
      if (!row.onboarding_complete) {
        router.replace('/onboarding');
        return;
      }
      setProfile(row);
      setTaskDone(Boolean(row.onboarding_task_completed_at));

      // Reid's Read — pull most recent observation. Non-fatal on failure.
      const { data: obsRow } = await supabase
        .from('observations')
        .select('id, text, created_at')
        .eq('user_id', row.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!mountedRef.current) return;
      setObservation((obsRow as Observation | null) ?? null);

      // Current focus (primary goal), last completed session, and a real
      // sessions-this-week count. All non-fatal — Home renders without them.
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [goalRes, sessRes, weekRes] = await Promise.all([
        supabase
          .from('goals')
          .select('id, title, generated_take')
          .eq('user_id', row.id)
          .eq('is_primary', true)
          .limit(1)
          .maybeSingle(),
        supabase
          .from('sessions')
          .select('title, reid_note, mood, ended_at')
          .eq('user_id', row.id)
          .not('ended_at', 'is', null)
          .order('ended_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('sessions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', row.id)
          .gte('started_at', weekAgo),
      ]);
      if (!mountedRef.current) return;
      setPrimaryGoal((goalRes.data as PrimaryGoal | null) ?? null);
      setLastSession((sessRes.data as LastSession | null) ?? null);
      setSessionsThisWeek(weekRes.count ?? 0);
    } catch {
      if (mountedRef.current) setError(true);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void fetchProfile();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchProfile]);

  useEffect(() => {
    void registerPushToken();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchProfile();
    } finally {
      setRefreshing(false);
    }
  }, [fetchProfile]);

  const onRetry = useCallback(() => {
    setError(false);
    setLoading(true);
    void fetchProfile();
  }, [fetchProfile]);

  if (loading) {
    return (
      <View
        style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}
      >
        <ReidPulse size={48} />
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: C.bg,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 32,
        }}
      >
        <Text
          style={{
            fontFamily: F.serifItalic,
            color: C.text,
            fontSize: 22,
            textAlign: 'center',
            lineHeight: 30,
          }}
        >
          Couldn{"'"}t load your briefing.
        </Text>
        <Text
          style={{
            fontFamily: F.sans,
            color: C.muted,
            fontSize: 14,
            textAlign: 'center',
            marginTop: 10,
            lineHeight: 20,
          }}
        >
          Check your connection and try again.
        </Text>
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => ({
            marginTop: 28,
            backgroundColor: C.red,
            borderRadius: 12,
            paddingHorizontal: 28,
            paddingVertical: 14,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text
            style={{
              fontFamily: F.sansMed,
              color: '#FFFFFF',
              fontSize: 14,
              letterSpacing: 0.5,
            }}
          >
            Retry
          </Text>
        </Pressable>
      </View>
    );
  }

  const summary = profile.onboarding_summary?.trim() ?? '';
  const task = profile.onboarding_task?.trim() ?? '';
  const greetName = profile.name?.trim();
  const sessionCount = profile.session_count ?? 0;
  const status = focusStatus(sessionCount);
  const statusColor = colorForStatus(status);
  const milestoneLabel = focusLabel(sessionCount);
  const progressPct = Math.min(100, (sessionCount / FREE_SESSION_LIMIT) * 100);
  const tasksDone = tasksDoneCount(profile);
  const daysActive = activeDaysCount(profile);
  // Current focus: the primary goal if set, else the onboarding summary.
  const focusText = primaryGoal?.title?.trim() || summary;
  const focusTake = primaryGoal?.generated_take?.trim() ?? '';

  async function toggleTask() {
    if (!profile || taskPending) return;
    const next = !taskDone;
    setTaskPending(true);
    setTaskDone(next);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      const completedAt = next ? new Date().toISOString() : null;
      const { error: updateErr } = await supabase
        .from('users')
        .update({ onboarding_task_completed_at: completedAt })
        .eq('id', profile.id);
      if (updateErr) {
        setTaskDone(!next);
        return;
      }
      if (next) {
        // Fire-and-forget — Reid will react in the next session.
        reidFetch('/api/reid', {
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
        }).catch(() => {});
      }
    } finally {
      setTaskPending(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: insets.top + 16,
        paddingBottom: 48,
      }}
      contentInsetAdjustmentBehavior="never"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.red} />
      }
    >
      {/* HEADER */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: F.serifReg,
              color: C.text,
              fontSize: 28,
              letterSpacing: -0.5,
              lineHeight: 34,
            }}
          >
            {greeting()}{greetName ? `, ${greetName}` : ''}.
          </Text>
          <Text
            style={{
              fontFamily: F.sans,
              color: C.muted,
              fontSize: 13,
              marginTop: 4,
            }}
          >
            {format(new Date(), 'EEEE, MMMM d')}
          </Text>
        </View>
        <Pressable onPress={() => router.push('/(app)/plan')} hitSlop={12} style={{ paddingTop: 4 }}>
          <Settings size={22} color={C.textDim} />
        </Pressable>
      </View>

      {/* MOMENTUM STRIP */}
      <View style={{ marginTop: 20, marginHorizontal: -20 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
        >
          <MomentumPill
            label={`Sessions this week · ${sessionsThisWeek}`}
            status={sessionsThisWeek >= 2 ? 'good' : sessionsThisWeek >= 1 ? 'neutral' : 'warn'}
          />
          <MomentumPill
            label={`Tasks done · ${tasksDone}`}
            status={tasksDone >= 1 ? 'good' : 'neutral'}
          />
          <MomentumPill
            label={`Days active · ${daysActive}`}
            status={daysActive >= 3 ? 'good' : daysActive >= 1 ? 'neutral' : 'warn'}
          />
        </ScrollView>
      </View>

      {/* CARDS */}
      <View style={{ marginTop: 20, gap: 12 }}>
        {/* YOUR FOCUS */}
        <CardShell delay={0}>
          <CardLabel text="CURRENT FOCUS" color={statusColor} />
          {focusText ? (
            <>
              <Text
                style={{
                  fontFamily: F.serifItalic,
                  color: C.text,
                  fontSize: 17,
                  lineHeight: 24,
                }}
              >
                {focusText}
              </Text>
              {focusTake ? (
                <Text style={{ fontFamily: F.sans, color: C.muted, fontSize: 13, lineHeight: 20, marginTop: 8 }}>
                  {focusTake}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={{ fontFamily: F.sans, color: C.muted, fontSize: 14, lineHeight: 22 }}>
              Open a session — Reid will set the focus.
            </Text>
          )}
          <View style={{ marginTop: 18 }}>
            <ProgressBar pct={progressPct} color={statusColor} />
            <Text
              style={{
                marginTop: 8,
                fontFamily: F.sans,
                fontSize: 12,
                color: C.muted,
              }}
            >
              Session {Math.min(sessionCount, FREE_SESSION_LIMIT)} · {milestoneLabel}
            </Text>
          </View>
        </CardShell>

        {/* TODAY'S TASK */}
        <CardShell delay={60}>
          {task ? (
            <>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 14,
                }}
              >
                <CardLabel
                  text="TODAY'S TASK"
                  color={taskDone ? C.success : isOverdueTask(profile) ? C.amber : C.text}
                  inline
                />
                {taskDone ? (
                  <StatusBadge label="Done" color={C.success} dim={C.successDim} />
                ) : isOverdueTask(profile) ? (
                  <StatusBadge label="Overdue" color={C.amber} dim={C.amberDim} />
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
                <TaskCheckbox done={taskDone} disabled={taskPending} onPress={toggleTask} />
                <Text
                  style={{
                    flex: 1,
                    fontFamily: F.sans,
                    fontSize: 15,
                    lineHeight: 22,
                    color: taskDone ? C.muted : C.text,
                    textDecorationLine: taskDone ? 'line-through' : 'none',
                    opacity: taskDone ? 0.5 : 1,
                    paddingTop: 6,
                  }}
                >
                  {task}
                </Text>
              </View>
            </>
          ) : (
            <>
              <CardLabel text="TODAY'S TASK" color={C.muted} />
              <Text style={{ fontFamily: F.sans, color: C.muted, fontSize: 14, lineHeight: 22 }}>
                Reid will assign your task at the end of your next session.
              </Text>
            </>
          )}
        </CardShell>

        {/* REID'S READ */}
        <CardShell delay={120}>
          <CardLabel text="REID'S READ" color={C.blue} />
          {observation ? (
            <View
              style={{
                borderLeftWidth: 2,
                borderLeftColor: C.blue,
                paddingLeft: 14,
              }}
            >
              <Text
                style={{
                  fontFamily: F.serifItalic,
                  color: C.text,
                  fontSize: 16,
                  lineHeight: 24,
                }}
              >
                {observation.text}
              </Text>
            </View>
          ) : (
            <Text
              style={{
                fontFamily: F.serifItalic,
                color: C.muted,
                fontSize: 16,
                lineHeight: 24,
              }}
            >
              Reid is still getting to know you.
            </Text>
          )}
        </CardShell>

        {/* REID'S BEEN THINKING — last-session nudge (Sessions list is Sprint 5) */}
        {lastSession && (lastSession.reid_note || lastSession.title) ? (
          <GlowCard delay={150} glow onPress={() => router.push('/(app)/reid')}>
            <CardLabel text="REID'S BEEN THINKING ABOUT…" color={C.muted} />
            <Text style={{ fontFamily: F.serifItalic, color: C.text, fontSize: 16, lineHeight: 24 }}>
              {lastSession.reid_note?.trim() || lastSession.title?.trim()}
            </Text>
            <Text style={{ fontFamily: F.sans, color: C.textDim, fontSize: 12, marginTop: 10 }}>
              Pick up where you left off →
            </Text>
          </GlowCard>
        ) : null}

        {/* CONTINUE button */}
        <ContinueButton onPress={() => router.push('/(app)/reid')} delay={180} />
      </View>

      {/* REID'S PICKS */}
      <View style={{ marginTop: 28 }}>
        <CardLabel text="REID'S PICKS" color={C.muted} />
        <PicksCarousel delay={200} />
      </View>

      {/* Avoid an unused-var lint if authId isn't read elsewhere. */}
      {authId ? null : null}
    </ScrollView>
  );
}

function isOverdueTask(profile: Profile): boolean {
  // An overdue task = assigned >24h ago and still not done.
  if (profile.onboarding_task_completed_at) return false;
  if (!profile.created_at) return false;
  const ms = Date.now() - new Date(profile.created_at).getTime();
  return ms > 1000 * 60 * 60 * 24;
}

function CardLabel({
  text,
  color,
  inline = false,
}: {
  text: string;
  color: string;
  inline?: boolean;
}) {
  return (
    <Text
      style={{
        fontFamily: F.sansMed,
        fontSize: 11,
        color,
        letterSpacing: 0.88, // ~0.08em at 11px
        textTransform: 'uppercase',
        marginBottom: inline ? 0 : 12,
      }}
    >
      {text}
    </Text>
  );
}

function StatusBadge({ label, color, dim }: { label: string; color: string; dim: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        backgroundColor: dim,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: color,
      }}
    >
      <Text
        style={{
          fontFamily: F.sansMed,
          fontSize: 10,
          color,
          letterSpacing: 0.4,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function MomentumPill({
  label,
  status,
}: {
  label: string;
  status: Status;
}) {
  const color = colorForStatus(status);
  const dim = dimForStatus(status);
  return (
    <View
      style={{
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: status === 'neutral' ? C.border : color,
        backgroundColor: status === 'neutral' ? C.surfaceGlass : dim,
      }}
    >
      <Text
        style={{
          fontFamily: F.sansMed,
          fontSize: 11,
          color: status === 'neutral' ? C.muted : color,
          letterSpacing: 0.88,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const width = useSharedValue(0);
  useEffect(() => {
    width.value = withTiming(pct, {
      duration: 800,
      easing: Easing.out(Easing.cubic),
    });
  }, [pct, width]);
  const fill = useAnimatedStyle(() => ({
    width: `${width.value}%`,
  }));
  return (
    <View
      style={{
        height: 3,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      <Animated.View
        style={[
          {
            height: '100%',
            backgroundColor: color,
            borderRadius: 2,
          },
          fill,
        ]}
      />
    </View>
  );
}

function TaskCheckbox({
  done,
  disabled,
  onPress,
}: {
  done: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const fillProgress = useSharedValue(done ? 1 : 0);

  useEffect(() => {
    fillProgress.value = withTiming(done ? 1 : 0, {
      duration: 300,
      easing: Easing.out(Easing.cubic),
    });
    if (done) {
      scale.value = withSpring(1.08, { damping: 8 }, () => {
        scale.value = withSpring(1, { damping: 10 });
      });
    }
  }, [done, fillProgress, scale]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: fillProgress.value > 0.5 ? C.red : 'transparent',
    borderColor: fillProgress.value > 0.5 ? C.red : 'rgba(255,255,255,0.20)',
  }));

  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={10}>
      <Animated.View
        style={[
          {
            width: 32,
            height: 32,
            borderRadius: 16,
            borderWidth: 2,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: disabled ? 0.6 : 1,
          },
          style,
        ]}
      >
        {done && <Check size={16} color="#FFFFFF" strokeWidth={2.6} />}
      </Animated.View>
    </Pressable>
  );
}

function CardShell({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  const pressScale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));
  return (
    <Animated.View
      entering={FadeInUp.duration(400).delay(delay)}
      style={[
        {
          backgroundColor: C.surfaceGlass,
          borderWidth: 1,
          borderColor: C.border,
          borderRadius: 12,
          padding: 20,
        },
        style,
      ]}
      onTouchStart={() => {
        pressScale.value = withSpring(0.985, { damping: 18, stiffness: 220 });
      }}
      onTouchEnd={() => {
        pressScale.value = withSpring(1, { damping: 14, stiffness: 200 });
      }}
      onTouchCancel={() => {
        pressScale.value = withSpring(1, { damping: 14, stiffness: 200 });
      }}
    >
      {children}
    </Animated.View>
  );
}

function ContinueButton({ onPress, delay = 0 }: { onPress: () => void; delay?: number }) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View entering={FadeInUp.duration(400).delay(delay)} style={{ marginTop: 6 }}>
      <Animated.View style={style}>
        <Pressable
          onPressIn={() => {
            scale.value = withSpring(0.97, { damping: 14, stiffness: 240 });
          }}
          onPressOut={() => {
            scale.value = withSpring(1, { damping: 12, stiffness: 200 });
          }}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onPress();
          }}
          style={{
            backgroundColor: C.red,
            borderRadius: 12,
            paddingVertical: 16,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              fontFamily: F.sansMed,
              fontSize: 15,
              color: '#FFFFFF',
              letterSpacing: 0.5,
            }}
          >
            Open session →
          </Text>
        </Pressable>
      </Animated.View>
      <Text
        style={{
          marginTop: 6,
          textAlign: 'center',
          fontFamily: F.sans,
          fontSize: 12,
          color: C.muted,
        }}
      >
        Your co-founder is ready.
      </Text>
    </Animated.View>
  );
}

// Reanimated `withDelay` is imported but not always used directly — keep the
// import grouped with the rest of the API surface to avoid drift if we add
// chained delays later.
void withDelay;
