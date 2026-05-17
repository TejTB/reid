import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { Check, CheckCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { reidFetch } from '@/lib/api';
import { C, F, R, S } from '@/constants/theme';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatAssignedDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

type Task = {
  id: string;
  text: string;
  source: string;
  assignedDate: string;
  completedAt: string | null;
};

export default function TasksScreen() {
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
    // Optimistic
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id ? { ...t, completedAt: next ? new Date().toISOString() : null } : t,
      ),
    );
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      // Only `onboarding` task is wired to a real column right now. Future
      // tasks would each have their own row.
      if (task.id === 'onboarding') {
        const { error } = await supabase
          .from('users')
          .update({ onboarding_task_completed_at: next ? new Date().toISOString() : null })
          .eq('id', userId);
        if (error) {
          // Revert
          setTasks((prev) =>
            prev.map((t) =>
              t.id === task.id ? { ...t, completedAt: wasDone ? task.completedAt : null } : t,
            ),
          );
          return;
        }
      }
      if (next) {
        // Tell Reid the task was completed; don't block UI on the response.
        try {
          await reidFetch('/api/reid', {
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
          });
          setToast('Reid responded — Open chat');
          setTimeout(() => setToast(null), 4500);
        } catch {
          // Network errors are non-fatal; the task is already marked done.
        }
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
        <ActivityIndicator color={C.red} />
      </View>
    );
  }

  const active = tasks.filter((t) => !t.completedAt);
  const done = tasks.filter((t) => t.completedAt);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 56, paddingBottom: 60 }}
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
          Tasks
        </Text>
        <Text style={{ fontFamily: F.sans, color: C.muted, fontSize: 14, marginTop: 6 }}>
          What Reid has asked you to do.
        </Text>
        {tasks.length > 0 && (
          <Text
            style={{
              fontFamily: F.sans,
              color: C.muted,
              fontSize: 12,
              marginTop: 12,
              textAlign: 'right',
            }}
          >
            {tasks.length} task{tasks.length === 1 ? '' : 's'} · {done.length} done
          </Text>
        )}

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
                  {active.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      onToggle={() => toggle(t)}
                      disabled={!!pending[t.id]}
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
                      letterSpacing: 1.3,
                      marginBottom: 12,
                    }}
                  >
                    DONE
                  </Text>
                  <View style={{ gap: 10 }}>
                    {done.map((t) => (
                      <TaskCard
                        key={t.id}
                        task={t}
                        onToggle={() => toggle(t)}
                        disabled={!!pending[t.id]}
                      />
                    ))}
                  </View>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
      {toast && (
        <Pressable
          onPress={() => {
            setToast(null);
            router.push('/(app)/chat');
          }}
          style={{
            position: 'absolute',
            bottom: 24,
            left: 20,
            right: 20,
            backgroundColor: C.surfaceRaised,
            borderRadius: R.md,
            borderWidth: 1,
            borderColor: C.borderActive,
            paddingHorizontal: 16,
            paddingVertical: 14,
          }}
        >
          <Text style={{ fontFamily: F.sansMed, fontSize: 14, color: C.text }}>{toast}</Text>
        </Pressable>
      )}
    </View>
  );
}

function TaskCard({
  task,
  onToggle,
  disabled,
}: {
  task: Task;
  onToggle: () => void;
  disabled: boolean;
}) {
  const done = !!task.completedAt;
  const opacity = useSharedValue(done ? 0.5 : 1);

  useEffect(() => {
    opacity.value = withTiming(done ? 0.5 : 1, {
      duration: 200,
      easing: Easing.out(Easing.quad),
    });
  }, [done, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        {
          flexDirection: 'row',
          backgroundColor: C.surface,
          borderWidth: 1,
          borderColor: C.border,
          borderRadius: R.md,
          paddingVertical: 18,
          paddingHorizontal: 18,
          gap: 14,
        },
        style,
      ]}
    >
      <Pressable
        onPress={onToggle}
        disabled={disabled}
        hitSlop={10}
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          borderWidth: done ? 0 : 1.5,
          borderColor: C.borderActive,
          backgroundColor: done ? C.red : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 2,
        }}
      >
        {done && <Check size={14} color={C.text} strokeWidth={2.5} />}
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: F.sans,
            fontSize: 15,
            lineHeight: 23,
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
