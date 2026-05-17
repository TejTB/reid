import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { C, F, R, S } from '@/constants/theme';

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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatEventDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export default function GoalsScreen() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [events, setEvents] = useState<GoalEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    const [goalsRes, eventsRes] = await Promise.all([
      supabase
        .from('goals')
        .select('id, title, description, target_value, current_value, unit, unit_prefix, is_primary, completed_at, created_at')
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
        <ActivityIndicator color={C.red} />
      </View>
    );
  }

  const activeGoals = goals.filter((g) => !g.completed_at);
  const completedGoals = goals.filter((g) => g.completed_at);
  const primary = activeGoals.find((g) => g.is_primary) ?? activeGoals[0] ?? null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 56, paddingBottom: 32 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.red} />
      }
    >
      <Text
        style={{
          fontFamily: F.serifReg,
          color: C.text,
          fontSize: 28,
          letterSpacing: -0.6,
          lineHeight: 34,
        }}
      >
        Your Goals
      </Text>
      <Text style={{ fontFamily: F.sans, color: C.muted, fontSize: 14, marginTop: 6 }}>
        The numbers Reid is helping you move.
      </Text>

      {goals.length === 0 ? (
        <View
          style={{
            marginTop: 32,
            backgroundColor: C.surface,
            borderRadius: R.md,
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
            onPress={() => router.push('/(app)/chat')}
            style={{
              marginTop: 18,
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
        </View>
      ) : (
        <View style={{ marginTop: S.lg, gap: S.md }}>
          {primary && <PrimaryHero goal={primary} />}

          {completedGoals.length > 0 && (
            <View style={{ marginTop: 8 }}>
              <Text
                style={{
                  fontFamily: F.sansMed,
                  fontSize: 11,
                  color: C.muted,
                  letterSpacing: 1.3,
                  marginBottom: 12,
                }}
              >
                COMPLETED
              </Text>
              <View style={{ gap: 12 }}>
                {completedGoals.map((g) => (
                  <GoalCard key={g.id} goal={g} dim />
                ))}
              </View>
            </View>
          )}

          <View style={{ marginTop: 4 }}>
            <Text
              style={{
                fontFamily: F.sansMed,
                fontSize: 11,
                color: C.muted,
                letterSpacing: 1.3,
                marginBottom: 12,
              }}
            >
              LIVE ACTIVITY
            </Text>
            {events.length === 0 ? (
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
                    fontFamily: F.serifItalic,
                    color: C.muted,
                    fontSize: 15,
                    lineHeight: 23,
                  }}
                >
                  Updates will appear here as you tell Reid about your progress.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {events.map((e) => (
                  <View
                    key={e.id}
                    style={{
                      flexDirection: 'row',
                      paddingVertical: 12,
                      paddingHorizontal: 14,
                      backgroundColor: C.surface,
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
                        color: e.delta >= 0 ? C.red : C.muted,
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
                      {formatEventDate(e.created_at)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function PrimaryHero({ goal }: { goal: Goal }) {
  const pct =
    goal.target_value > 0 ? Math.min(100, (goal.current_value / goal.target_value) * 100) : 0;
  const remaining = Math.max(0, goal.target_value - goal.current_value);
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
        PRIMARY GOAL
      </Text>
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
      <View style={{ marginTop: 22 }}>
        <Text style={{ fontFamily: F.serifReg, fontSize: 40, color: C.text, letterSpacing: -1 }}>
          {formatGoalValue(goal.current_value, goal.unit, goal.unit_prefix)}
        </Text>
        <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.muted, marginTop: 2 }}>
          of {formatGoalValue(goal.target_value, goal.unit, goal.unit_prefix)}
        </Text>
      </View>
      <View
        style={{
          marginTop: 16,
          height: 4,
          backgroundColor: 'rgba(255,255,255,0.05)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: C.red }} />
      </View>
      <Text style={{ marginTop: 10, fontFamily: F.sans, fontSize: 12, color: C.muted }}>
        {formatGoalValue(remaining, goal.unit, goal.unit_prefix)} to go · {Math.round(pct)}% there
      </Text>
    </View>
  );
}

function GoalCard({ goal, dim = false }: { goal: Goal; dim?: boolean }) {
  const pct =
    goal.target_value > 0 ? Math.min(100, (goal.current_value / goal.target_value) * 100) : 0;
  return (
    <View
      style={{
        backgroundColor: C.surface,
        borderRadius: R.md,
        borderWidth: 1,
        borderColor: C.border,
        padding: 18,
        opacity: dim ? 0.6 : 1,
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
        <Text style={{ fontFamily: F.serifReg, fontSize: 22, color: C.text }}>
          {formatGoalValue(goal.current_value, goal.unit, goal.unit_prefix)}
        </Text>
        <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.muted }}>
          of {formatGoalValue(goal.target_value, goal.unit, goal.unit_prefix)}
        </Text>
      </View>
      <View
        style={{
          marginTop: 12,
          height: 3,
          backgroundColor: 'rgba(255,255,255,0.05)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${pct}%`,
            height: '100%',
            backgroundColor: dim ? C.muted : C.red,
          }}
        />
      </View>
    </View>
  );
}
