import { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { router } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';

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

function formatEventDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

export default function GoalsScreen() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [events, setEvents] = useState<GoalEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (!cancelled) router.replace('/login');
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

      if (cancelled) return;
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
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bgDark, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  const activeGoals = goals.filter((g) => !g.completed_at);
  const completedGoals = goals.filter((g) => g.completed_at);
  const primary = activeGoals.find((g) => g.is_primary) ?? activeGoals[0] ?? null;
  const supporting = activeGoals.filter((g) => g.id !== primary?.id);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bgDark }}
      contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 56, paddingBottom: 40 }}
    >
      <Text
        style={{
          fontFamily: Fonts.serifRegular,
          color: Colors.textPrimary,
          fontSize: 36,
          letterSpacing: -0.95,
          lineHeight: 40,
        }}
      >
        Your Goals
      </Text>
      <Text style={{ fontFamily: Fonts.sansRegular, color: Colors.textDim, fontSize: 15, marginTop: 8 }}>
        The numbers Reid is helping you move.
      </Text>

      {activeGoals.length === 0 && completedGoals.length === 0 ? (
        <View
          style={{
            marginTop: 32,
            backgroundColor: Colors.bgCard,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: Colors.border,
            padding: 22,
          }}
        >
          <Text
            style={{
              fontFamily: Fonts.serifItalic,
              color: '#C8D5E3',
              fontSize: 19,
              lineHeight: 29,
            }}
          >
            No goals yet. Open a session and tell Reid the number you{"’"}re trying to move — he{"’"}ll keep score from there.
          </Text>
          <Pressable
            onPress={() => router.push('/(app)/chat')}
            style={{
              marginTop: 18,
              height: 46,
              borderRadius: 9,
              backgroundColor: Colors.accent,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Text style={{ fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.textPrimary, letterSpacing: 0.52 }}>
              Open session with Reid
            </Text>
            <ArrowRight size={16} color={Colors.textPrimary} />
          </Pressable>
        </View>
      ) : (
        <View style={{ marginTop: 28, gap: 16 }}>
          {primary && <PrimaryHero goal={primary} />}
          {supporting.length > 0 && (
            <View style={{ gap: 12 }}>
              {supporting.map((g) => (
                <GoalCard key={g.id} goal={g} />
              ))}
            </View>
          )}
          {completedGoals.length > 0 && (
            <View style={{ marginTop: 8 }}>
              <Text
                style={{
                  fontFamily: Fonts.sansMedium,
                  fontSize: 11,
                  color: Colors.textDim,
                  letterSpacing: 1.4,
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

          {events.length > 0 && (
            <View style={{ marginTop: 24 }}>
              <Text
                style={{
                  fontFamily: Fonts.sansMedium,
                  fontSize: 11,
                  color: Colors.textDim,
                  letterSpacing: 1.4,
                  marginBottom: 12,
                }}
              >
                RECENT
              </Text>
              <View style={{ gap: 8 }}>
                {events.map((e) => (
                  <View
                    key={e.id}
                    style={{
                      flexDirection: 'row',
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      backgroundColor: Colors.bgCard,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: Colors.border,
                      gap: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: Fonts.sansMedium,
                        fontSize: 13,
                        color: e.delta >= 0 ? Colors.accent : Colors.textDim,
                        minWidth: 60,
                      }}
                    >
                      {formatDelta(e.delta, e.goal_unit, e.goal_unit_prefix)}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{ fontFamily: Fonts.sansRegular, fontSize: 13, color: Colors.textPrimary }}
                        numberOfLines={1}
                      >
                        {e.goal_title}
                      </Text>
                      {e.note && (
                        <Text
                          style={{ fontFamily: Fonts.sansRegular, fontSize: 12, color: Colors.textDim, marginTop: 2 }}
                          numberOfLines={2}
                        >
                          {e.note}
                        </Text>
                      )}
                    </View>
                    <Text style={{ fontFamily: Fonts.sansRegular, fontSize: 11, color: '#3A5070' }}>
                      {formatEventDate(e.created_at)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function PrimaryHero({ goal }: { goal: Goal }) {
  const pct = goal.target_value > 0 ? Math.min(100, (goal.current_value / goal.target_value) * 100) : 0;
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
        PRIMARY GOAL
      </Text>
      <Text
        style={{
          fontFamily: Fonts.serifRegular,
          fontSize: 22,
          color: Colors.textPrimary,
          letterSpacing: -0.4,
          lineHeight: 28,
        }}
      >
        {goal.title}
      </Text>
      {goal.description && (
        <Text style={{ fontFamily: Fonts.sansRegular, fontSize: 13, color: Colors.textDim, marginTop: 6 }}>
          {goal.description}
        </Text>
      )}
      <View style={{ marginTop: 20 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}
        >
          <Text style={{ fontFamily: Fonts.serifRegular, fontSize: 32, color: Colors.textPrimary }}>
            {formatGoalValue(goal.current_value, goal.unit, goal.unit_prefix)}
          </Text>
          <Text style={{ fontFamily: Fonts.sansRegular, fontSize: 13, color: Colors.textDim }}>
            of {formatGoalValue(goal.target_value, goal.unit, goal.unit_prefix)}
          </Text>
        </View>
        <View
          style={{
            height: 4,
            backgroundColor: 'rgba(255,255,255,0.05)',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <View style={{ width: `${pct}%`, height: '100%', backgroundColor: Colors.accent }} />
        </View>
      </View>
    </View>
  );
}

function GoalCard({ goal, dim = false }: { goal: Goal; dim?: boolean }) {
  const pct = goal.target_value > 0 ? Math.min(100, (goal.current_value / goal.target_value) * 100) : 0;
  return (
    <View
      style={{
        backgroundColor: Colors.bgCard,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: Colors.border,
        padding: 18,
        opacity: dim ? 0.6 : 1,
      }}
    >
      <Text
        style={{
          fontFamily: Fonts.serifRegular,
          fontSize: 17,
          color: Colors.textPrimary,
          letterSpacing: -0.2,
        }}
      >
        {goal.title}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 10, gap: 8 }}>
        <Text style={{ fontFamily: Fonts.serifRegular, fontSize: 22, color: Colors.textPrimary }}>
          {formatGoalValue(goal.current_value, goal.unit, goal.unit_prefix)}
        </Text>
        <Text style={{ fontFamily: Fonts.sansRegular, fontSize: 12, color: Colors.textDim }}>
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
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: dim ? Colors.textDim : Colors.accent }} />
      </View>
    </View>
  );
}
