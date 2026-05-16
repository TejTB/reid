import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Check, CheckCircle } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatAssignedDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

type Task = {
  index: number;
  text: string;
  source: string;
  assignedDate: string;
};

export default function TasksScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [doneMap, setDoneMap] = useState<Record<number, boolean>>({});
  const [loaded, setLoaded] = useState(false);

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
        .select('id, onboarding_task, created_at')
        .eq('auth_id', session.user.id)
        .maybeSingle();
      if (cancelled) return;
      const collected: Task[] = [];
      const id = (row?.id as string | undefined) ?? null;
      if (row) {
        const seed = (row.onboarding_task as string | null)?.trim();
        if (seed) {
          collected.push({
            index: 0,
            text: seed,
            source: 'Session 1',
            assignedDate: formatAssignedDate(row.created_at as string | null),
          });
        }
      }
      const map: Record<number, boolean> = {};
      if (id) {
        for (const t of collected) {
          try {
            const v = await AsyncStorage.getItem(`reid:task:${id}:${t.index}:done`);
            map[t.index] = v === 'true';
          } catch {
            map[t.index] = false;
          }
        }
      }
      if (cancelled) return;
      setUserId(id);
      setTasks(collected);
      setDoneMap(map);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(taskIndex: number) {
    if (!userId) return;
    const next = !doneMap[taskIndex];
    setDoneMap((prev) => ({ ...prev, [taskIndex]: next }));
    try {
      await AsyncStorage.setItem(`reid:task:${userId}:${taskIndex}:done`, next ? 'true' : 'false');
    } catch {
    }
  }

  if (!loaded) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bgDark, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  const doneCount = tasks.reduce((n, t) => (doneMap[t.index] ? n + 1 : n), 0);

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
        Tasks
      </Text>
      <Text style={{ fontFamily: Fonts.sansRegular, color: Colors.textDim, fontSize: 15, marginTop: 8 }}>
        What Reid has asked you to do.
      </Text>
      {tasks.length > 0 && (
        <Text
          style={{
            fontFamily: Fonts.sansRegular,
            color: Colors.textDim,
            fontSize: 12,
            marginTop: 12,
            textAlign: 'right',
          }}
        >
          {tasks.length} task{tasks.length === 1 ? '' : 's'} · {doneCount} done
        </Text>
      )}

      <View style={{ marginTop: 28 }}>
        {tasks.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <CheckCircle size={48} color="#3A5070" strokeWidth={1.4} />
            <Text
              style={{
                fontFamily: Fonts.serifItalic,
                fontSize: 22,
                color: Colors.textDim,
                marginTop: 18,
              }}
            >
              No tasks yet.
            </Text>
            <Text
              style={{
                fontFamily: Fonts.sansRegular,
                fontSize: 13,
                color: '#3A5070',
                marginTop: 8,
                maxWidth: 320,
                textAlign: 'center',
                lineHeight: 21,
              }}
            >
              Reid will assign tasks at the end of your first conversation.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {tasks.map((t) => {
              const done = !!doneMap[t.index];
              return (
                <View
                  key={t.index}
                  style={{
                    flexDirection: 'row',
                    backgroundColor: done ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)',
                    borderWidth: 1,
                    borderColor: done ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.07)',
                    borderRadius: 12,
                    paddingVertical: 18,
                    paddingHorizontal: 18,
                    gap: 14,
                  }}
                >
                  <Pressable
                    onPress={() => toggle(t.index)}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      borderWidth: done ? 0 : 1.5,
                      borderColor: 'rgba(255,255,255,0.2)',
                      backgroundColor: done ? Colors.accent : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: 2,
                    }}
                  >
                    {done && <Check size={12} color={Colors.textPrimary} />}
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: Fonts.sansRegular,
                        fontSize: 15,
                        lineHeight: 23,
                        color: done ? Colors.textDim : Colors.textPrimary,
                        textDecorationLine: done ? 'line-through' : 'none',
                      }}
                    >
                      {t.text}
                    </Text>
                    <Text
                      style={{
                        fontFamily: Fonts.sansRegular,
                        fontSize: 12,
                        color: '#3A5070',
                        marginTop: 8,
                      }}
                    >
                      Assigned {t.assignedDate}
                      {t.assignedDate ? '  ·  ' : ''}
                      {t.source}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
