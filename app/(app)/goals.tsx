import { useCallback, useEffect, useState } from 'react';
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
  withDelay,
  FadeInUp,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { C, F, R, S } from '@/constants/theme';
import ReidPulse from '@/components/ReidPulse';

type Goal = {
  id: string;
  title: string;
  description: string | null;
  target_value: number;
  current_value: number;
  unit: string;
  unit_prefix: boolean;
  is_primary: boolean;
  completed_at: string | null;
  created_at: string;
  // Optional — may not exist on every row; the timeline badge needs a soft
  // deadline. If your `goals` table doesn't have it yet, see TODO at the
  // bottom of the file.
  due_date?: string | null;
};

type GoalEvent = {
  id: string;
  delta: number;
  note: string | null;
  created_at: string;
  goal_title: string;
  goal_unit: string;
  goal_unit_prefix: boolean;
};

function formatGoalValue(value: number, unit: string, prefix: boolean): string {
  const v = Number.isFinite(value) ? value : 0;
  if (prefix) return `${unit}${v}`;
  return `${v} ${unit}`.trim();
}

function formatDelta(delta: number, unit: string, prefix: boolean): string {
  const sign = delta >= 0 ? '+' : '-';
  const abs = Math.abs(delta);
  if (prefix) return `${sign}${unit}${abs}`;
  return `${sign}${abs} ${unit}`.trim();
}

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function goalStatus(goal: Goal): 'good' | 'warn' | 'critical' {
  const pct = goal.target_value > 0 ? (goal.current_value / goal.target_value) * 100 : 0;
  if (pct >= 66) return 'good';
  if (pct >= 33) return 'warn';
  return 'critical';
}

function statusColor(s: 'good' | 'warn' | 'critical'): string {
  if (s === 'good') return C.success;
  if (s === 'warn') return C.amber;
  return C.red;
}

function daysLeftBadge(due: Date | null) {
  if (!due) return null;
  const days = daysBetween(new Date(), due);
  if (days < 0) return { label: 'Overdue', color: C.red, dim: C.redDim };
  if (days < 7) return { label: `${days}d left`, color: C.red, dim: C.redDim };
  if (days < 30) return { label: `${days}d left`, color: C.amber, dim: C.amberDim };
  return { label: `${days}d left`, color: C.success, dim: C.successDim };
}

export default function GoalsScreen() {
  const insets = useSafeAreaInsets();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [events, setEvents] = useState<GoalEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }
      const [goalsRes, eventsRes] = await Promise.all([
        supabase
          .from('goals')
          .select(
            'id, title, description, target_value, current_value, unit, unit_prefix, is_primary, completed_at, created_at, due_date',
          )
          .order('is_primary', { ascending: false })
          .order('created_at', { ascending: true }),
        supabase
          .from('goal_events')
          .select('id, delta, note, created_at, goals(title, unit, unit_prefix)')
          .order('created_at', { ascending: false })
          .limit(30),
      ]);

      setGoals((goalsRes.data ?? []) as Goal[]);

      const eventRows = (eventsRes.data ?? []).map((e) => {
        const joinedRaw = e.goals as unknown as
          | { title: string; unit: string; unit_prefix: boolean }
          | { title: string; unit: string; unit_prefix: boolean }[]
          | null;
        const joined = Array.isArray(joinedRaw) ? joinedRaw[0] ?? null : joinedRaw;
        return {
          id: e.id as string,
          delta: e.delta as number,
          note: (e.note as string | null) ?? null,
          created_at: e.created_at as string,
          goal_title: joined?.title ?? '',
          goal_unit: joined?.unit ?? '',
          goal_unit_prefix: joined?.unit_prefix ?? true,
        };
      });
      setEvents(eventRows);
      setError(false);
    } catch {
      setError(true);
    }
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  if (!loaded) {
    return (
      <View
        style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}
      >
        <ReidPulse size={48} />
      </View>
    );
  }

  const activeGoals = goals.filter((g) => !g.completed_at);
  const completedGoals = goals.filter((g) => g.completed_at);
  const primary = activeGoals.find((g) => g.is_primary) ?? activeGoals[0] ?? null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 16, paddingBottom: 48 }}
      contentInsetAdjustmentBehavior="never"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.red} />
      }
    >
      <Text
        style={{
          fontFamily: F.serifReg,
          color: C.text,
          fontSize: 28,
          letterSpacing: -0.5,
          lineHeight: 34,
        }}
      >
        Your Goals
      </Text>
      <Text style={{ fontFamily: F.sans, color: C.muted, fontSize: 14, marginTop: 6 }}>
        The numbers Reid is helping you move.
      </Text>

      {error && goals.length === 0 ? (
        <ErrorBlock onRetry={() => { setLoaded(false); load().finally(() => setLoaded(true)); }} />
      ) : goals.length === 0 ? (
        <EmptyBlock />
      ) : (
        <View style={{ marginTop: S.lg, gap: S.md }}>
          {primary && <PrimaryHero goal={primary} />}

          {completedGoals.length > 0 && (
            <View style={{ marginTop: 8 }}>
              <SectionHeader text="COMPLETED" />
              <View style={{ gap: 12 }}>
                {completedGoals.map((g, i) => (
                  <GoalCard key={g.id} goal={g} dim delay={i * 60} />
                ))}
              </View>
            </View>
          )}

          <View style={{ marginTop: 4 }}>
            <SectionHeader text="LIVE ACTIVITY" color={C.blue} />
            {events.length === 0 ? (
              <View
                style={{
                  backgroundColor: C.surfaceGlass,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: C.border,
                  padding: 20,
                }}
              >
                <Text
                  style={{
                    fontFamily: F.serifItalic,
                    color: C.muted,
                    fontSize: 15,
                    lineHeight: 23,
                  }}
                >
                  Updates will appear as you report progress to Reid.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {events.map((e, i) => (
                  <Animated.View
                    key={e.id}
                    entering={FadeInUp.duration(360).delay(i * 40)}
                    style={{
                      flexDirection: 'row',
                      paddingVertical: 12,
                      paddingHorizontal: 14,
                      backgroundColor: C.surfaceGlass,
                      borderRadius: R.sm,
                      borderWidth: 1,
                      borderColor: C.border,
                      gap: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: F.sansMed,
                        fontSize: 13,
                        color: e.delta >= 0 ? C.success : C.amber,
                        minWidth: 56,
                      }}
                    >
                      {formatDelta(e.delta, e.goal_unit, e.goal_unit_prefix)}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{ fontFamily: F.sans, fontSize: 13, color: C.text }}
                        numberOfLines={1}
                      >
                        {e.goal_title}
                      </Text>
                      {e.note && (
                        <Text
                          style={{
                            fontFamily: F.sans,
                            fontSize: 12,
                            color: C.muted,
                            marginTop: 2,
                          }}
                          numberOfLines={2}
                        >
                          {e.note}
                        </Text>
                      )}
                    </View>
                    <Text style={{ fontFamily: F.sans, fontSize: 11, color: C.muted }}>
                      {format(new Date(e.created_at), 'MMM d')}
                    </Text>
                  </Animated.View>
                ))}
              </View>
            )}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function SectionHeader({ text, color }: { text: string; color?: string }) {
  return (
    <Text
      style={{
        fontFamily: F.sansMed,
        fontSize: 11,
        color: color ?? C.muted,
        letterSpacing: 0.88,
        marginBottom: 12,
        textTransform: 'uppercase',
      }}
    >
      {text}
    </Text>
  );
}

function EmptyBlock() {
  return (
    <View
      style={{
        marginTop: 32,
        backgroundColor: C.surfaceGlass,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: C.border,
        padding: 20,
      }}
    >
      <Text
        style={{
          fontFamily: F.serifItalic,
          color: C.text,
          fontSize: 17,
          lineHeight: 26,
        }}
      >
        No goals yet. Open a session and tell Reid the number you{"'"}re trying to move.
      </Text>
      <Pressable
        onPress={() => router.push('/voice')}
        style={{
          marginTop: 18,
          height: 50,
          borderRadius: 12,
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
            fontSize: 14,
            color: '#FFFFFF',
            letterSpacing: 0.5,
          }}
        >
          Open session
        </Text>
        <ArrowRight size={16} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

function ErrorBlock({ onRetry }: { onRetry: () => void }) {
  return (
    <View
      style={{
        marginTop: 32,
        backgroundColor: C.surfaceGlass,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: C.border,
        padding: 20,
      }}
    >
      <Text style={{ fontFamily: F.serifItalic, color: C.text, fontSize: 17, lineHeight: 26 }}>
        Couldn{"'"}t load your goals.
      </Text>
      <Pressable
        onPress={onRetry}
        style={{
          marginTop: 18,
          backgroundColor: C.red,
          paddingVertical: 12,
          alignItems: 'center',
          borderRadius: 12,
        }}
      >
        <Text style={{ fontFamily: F.sansMed, fontSize: 14, color: '#FFFFFF' }}>Retry</Text>
      </Pressable>
    </View>
  );
}

function AnimatedBar({ pct, color, height = 6 }: { pct: number; color: string; height?: number }) {
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withDelay(
      120,
      withTiming(pct, { duration: 1200, easing: Easing.out(Easing.cubic) }),
    );
  }, [pct, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.value}%` }));
  return (
    <View
      style={{
        height,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 3,
        overflow: 'hidden',
      }}
    >
      <Animated.View style={[{ height: '100%', backgroundColor: color, borderRadius: 3 }, fill]} />
    </View>
  );
}

function PrimaryHero({ goal }: { goal: Goal }) {
  const pct =
    goal.target_value > 0 ? Math.min(100, (goal.current_value / goal.target_value) * 100) : 0;
  const remaining = Math.max(0, goal.target_value - goal.current_value);
  const status = goalStatus(goal);
  const color = statusColor(status);
  const due = goal.due_date ? new Date(goal.due_date) : null;
  const dueBadge = daysLeftBadge(due);

  return (
    <Animated.View
      entering={FadeInUp.duration(420)}
      style={{
        backgroundColor: C.surfaceGlass,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: C.border,
        padding: 20,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 14,
        }}
      >
        <Text
          style={{
            fontFamily: F.sansMed,
            fontSize: 11,
            color: C.muted,
            letterSpacing: 0.88,
            textTransform: 'uppercase',
          }}
        >
          PRIMARY GOAL
        </Text>
        {dueBadge && (
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 3,
              backgroundColor: dueBadge.dim,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: dueBadge.color,
            }}
          >
            <Text
              style={{
                fontFamily: F.sansMed,
                fontSize: 10,
                color: dueBadge.color,
                letterSpacing: 0.5,
              }}
            >
              {dueBadge.label}
            </Text>
          </View>
        )}
      </View>
      <Text
        style={{
          fontFamily: F.serifReg,
          fontSize: 22,
          color: C.text,
          letterSpacing: -0.4,
          lineHeight: 28,
        }}
      >
        {goal.title}
      </Text>
      {goal.description && (
        <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.muted, marginTop: 6 }}>
          {goal.description}
        </Text>
      )}
      <View style={{ marginTop: 22, flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
        <Text
          style={{
            fontFamily: F.sansBold,
            fontSize: 48,
            color,
            letterSpacing: -1.2,
            lineHeight: 52,
          }}
        >
          {formatGoalValue(goal.current_value, goal.unit, goal.unit_prefix)}
        </Text>
        <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.muted, marginBottom: 4 }}>
          of {formatGoalValue(goal.target_value, goal.unit, goal.unit_prefix)}
        </Text>
      </View>
      <View style={{ marginTop: 16 }}>
        <AnimatedBar pct={pct} color={color} height={6} />
      </View>
      <Text style={{ marginTop: 10, fontFamily: F.sans, fontSize: 12, color: C.muted }}>
        {formatGoalValue(remaining, goal.unit, goal.unit_prefix)} to go · {Math.round(pct)}% there
      </Text>
    </Animated.View>
  );
}

function GoalCard({ goal, dim = false, delay = 0 }: { goal: Goal; dim?: boolean; delay?: number }) {
  const pct =
    goal.target_value > 0 ? Math.min(100, (goal.current_value / goal.target_value) * 100) : 0;
  const status = goalStatus(goal);
  const color = dim ? C.muted : statusColor(status);
  return (
    <Animated.View
      entering={FadeInUp.duration(360).delay(delay)}
      style={{
        backgroundColor: C.surfaceGlass,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: C.border,
        padding: 18,
        opacity: dim ? 0.55 : 1,
      }}
    >
      <Text
        style={{
          fontFamily: F.serifReg,
          fontSize: 17,
          color: C.text,
          letterSpacing: -0.2,
        }}
      >
        {goal.title}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 10, gap: 8 }}>
        <Text style={{ fontFamily: F.sansBold, fontSize: 22, color }}>
          {formatGoalValue(goal.current_value, goal.unit, goal.unit_prefix)}
        </Text>
        <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.muted }}>
          of {formatGoalValue(goal.target_value, goal.unit, goal.unit_prefix)}
        </Text>
      </View>
      <View style={{ marginTop: 12 }}>
        <AnimatedBar pct={pct} color={color} height={3} />
      </View>
    </Animated.View>
  );
}

/*
 TODO (db):
   - `goals.due_date` (timestamptz nullable) — drives the days-left badge.
   - `goal_events.user_id` (uuid) — optional; today we trust RLS on goals.
*/
