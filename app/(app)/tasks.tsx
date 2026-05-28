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
  withSpring,
  FadeInUp,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Check, CheckCircle } from 'lucide-react-native';
import { format } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { reidFetch } from '@/lib/api';
import { C, F, R, S } from '@/constants/theme';
import ReidPulse from '@/components/ReidPulse';

function formatAssignedDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return format(d, 'MMM d');
}

type Task = {
  id: string;
  text: string;
  source: string;
  assignedDate: string;
  completedAt: string | null;
};

export default function TasksScreen() {
  const insets = useSafeAreaInsets();
  const [userId, setUserId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    const { data: row } = await supabase
      .from('users')
      .select('id, onboarding_task, onboarding_task_completed_at, created_at')
      .eq('auth_id', session.user.id)
      .maybeSingle();
    const collected: Task[] = [];
    const id = (row?.id as string | undefined) ?? null;
    if (row) {
      const seed = (row.onboarding_task as string | null)?.trim();
      if (seed) {
        collected.push({
          id: 'onboarding',
          text: seed,
          source: 'Session 1',
          assignedDate: formatAssignedDate(row.created_at as string | null),
          completedAt: (row.onboarding_task_completed_at as string | null) ?? null,
        });
      }
    }
    setUserId(id);
    setTasks(collected);
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

  async function toggle(task: Task) {
    if (!userId || pending[task.id]) return;
    const wasDone = !!task.completedAt;
    const next = !wasDone;
    setPending((p) => ({ ...p, [task.id]: true }));
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id ? { ...t, completedAt: next ? new Date().toISOString() : null } : t,
      ),
    );
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      if (task.id === 'onboarding') {
        const { error } = await supabase
          .from('users')
          .update({ onboarding_task_completed_at: next ? new Date().toISOString() : null })
          .eq('id', userId);
        if (error) {
          setTasks((prev) =>
            prev.map((t) =>
              t.id === task.id ? { ...t, completedAt: wasDone ? task.completedAt : null } : t,
            ),
          );
          return;
        }
      }
      if (next) {
        // Fire and forget — surface a toast either way so the user knows
        // something happened.
        reidFetch('/api/reid', {
          method: 'POST',
          body: JSON.stringify({
            mode: 'chat',
            messages: [
              {
                role: 'user',
                content: `[system: I completed the task you set: "${task.text}"]`,
              },
            ],
          }),
        })
          .then(() => {
            setToast('Reid responded →');
            setTimeout(() => setToast(null), 4000);
          })
          .catch(() => {
            // Quiet failure — task is still marked done.
          });
      }
    } finally {
      setPending((p) => {
        const copy = { ...p };
        delete copy[task.id];
        return copy;
      });
    }
  }

  if (!loaded) {
    return (
      <View
        style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}
      >
        <ReidPulse size={48} />
      </View>
    );
  }

  const active = tasks.filter((t) => !t.completedAt);
  const done = tasks.filter((t) => t.completedAt);
  const total = tasks.length;
  const doneCount = done.length;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 16, paddingBottom: 80 }}
        contentInsetAdjustmentBehavior="never"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.red} />
        }
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          }}
        >
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
              Tasks
            </Text>
            <Text style={{ fontFamily: F.sans, color: C.muted, fontSize: 14, marginTop: 6 }}>
              What Reid has asked you to do.
            </Text>
          </View>
          {total > 0 && (
            <Text
              style={{
                fontFamily: F.sans,
                color: C.muted,
                fontSize: 12,
                marginLeft: 12,
              }}
            >
              {total} {total === 1 ? 'task' : 'tasks'} · {doneCount} done
            </Text>
          )}
        </View>

        <View style={{ marginTop: S.lg }}>
          {tasks.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 80 }}>
              <CheckCircle size={48} color={C.muted} strokeWidth={1.4} />
              <Text
                style={{
                  fontFamily: F.serifItalic,
                  fontSize: 20,
                  color: C.muted,
                  marginTop: 18,
                }}
              >
                No tasks yet.
              </Text>
              <Text
                style={{
                  fontFamily: F.sans,
                  fontSize: 13,
                  color: C.muted,
                  marginTop: 8,
                  maxWidth: 320,
                  textAlign: 'center',
                  lineHeight: 20,
                }}
              >
                Reid will assign tasks at the end of your first conversation.
              </Text>
            </View>
          ) : (
            <>
              {active.length > 0 && (
                <View style={{ gap: 12 }}>
                  {active.map((t, i) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      onToggle={() => toggle(t)}
                      disabled={!!pending[t.id]}
                      delay={i * 60}
                    />
                  ))}
                </View>
              )}
              {done.length > 0 && (
                <View style={{ marginTop: S.lg }}>
                  <Text
                    style={{
                      fontFamily: F.sansMed,
                      fontSize: 11,
                      color: C.muted,
                      letterSpacing: 0.88,
                      marginBottom: 12,
                      textTransform: 'uppercase',
                    }}
                  >
                    DONE
                  </Text>
                  <View style={{ gap: 10 }}>
                    {done.map((t, i) => (
                      <TaskCard
                        key={t.id}
                        task={t}
                        onToggle={() => toggle(t)}
                        disabled
                        delay={i * 40}
                      />
                    ))}
                  </View>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
      <Toast text={toast} onPress={() => router.push('/(app)/reid')} />
    </View>
  );
}

function Toast({ text, onPress }: { text: string | null; onPress: () => void }) {
  const translate = useSharedValue(80);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (text) {
      translate.value = withSpring(0, { damping: 16, stiffness: 180 });
      opacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
    } else {
      translate.value = withTiming(80, { duration: 220, easing: Easing.in(Easing.cubic) });
      opacity.value = withTiming(0, { duration: 200 });
    }
  }, [text, translate, opacity]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translate.value }],
    opacity: opacity.value,
  }));

  // Render whenever text exists OR has just cleared (so the slide-out plays).
  // We hold the last text in state so the animation can finish on its way out.
  const [latest, setLatest] = useState<string | null>(text);
  useEffect(() => {
    if (text) setLatest(text);
    else {
      const t = setTimeout(() => setLatest(null), 260);
      return () => clearTimeout(t);
    }
  }, [text]);

  if (!latest) return null;

  return (
    <Animated.View
      pointerEvents={text ? 'auto' : 'none'}
      style={[
        {
          position: 'absolute',
          bottom: 24,
          left: 20,
          right: 20,
        },
        style,
      ]}
    >
      <Pressable
        onPress={onPress}
        style={{
          backgroundColor: C.surfaceRaised,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: C.borderActive,
          paddingHorizontal: 16,
          paddingVertical: 14,
        }}
      >
        <Text style={{ fontFamily: F.sansMed, fontSize: 14, color: C.text }}>{latest}</Text>
      </Pressable>
    </Animated.View>
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
  const fill = useSharedValue(done ? 1 : 0);

  useEffect(() => {
    fill.value = withTiming(done ? 1 : 0, {
      duration: 300,
      easing: Easing.out(Easing.cubic),
    });
    if (done) {
      scale.value = withSpring(1.12, { damping: 8 }, () => {
        scale.value = withSpring(1, { damping: 10 });
      });
    }
  }, [done, fill, scale]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: fill.value > 0.5 ? C.red : 'transparent',
    borderColor: fill.value > 0.5 ? C.red : 'rgba(255,255,255,0.20)',
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

function TaskCard({
  task,
  onToggle,
  disabled,
  delay = 0,
}: {
  task: Task;
  onToggle: () => void;
  disabled: boolean;
  delay?: number;
}) {
  const done = !!task.completedAt;

  return (
    <Animated.View
      entering={FadeInUp.duration(360).delay(delay)}
      style={{
        flexDirection: 'row',
        backgroundColor: C.surfaceGlass,
        borderWidth: 1,
        borderColor: C.border,
        borderRadius: 12,
        paddingVertical: 18,
        paddingHorizontal: 18,
        gap: 16,
        opacity: done ? 0.5 : 1,
      }}
    >
      <TaskCheckbox done={done} disabled={disabled} onPress={onToggle} />
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: F.sans,
            fontSize: 15,
            lineHeight: 22,
            color: done ? C.muted : C.text,
            textDecorationLine: done ? 'line-through' : 'none',
          }}
        >
          {task.text}
        </Text>
        <Text
          style={{
            fontFamily: F.sans,
            fontSize: 12,
            color: C.muted,
            marginTop: 8,
          }}
        >
          Assigned {task.assignedDate}
          {task.assignedDate ? ' · ' : ''}
          {task.source}
        </Text>
      </View>
    </Animated.View>
  );
}

// Keep `R` import live so future task layouts using the new bubble/button radii
// continue without re-import churn.
void R;
