import { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatNodeDate(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const sameDay =
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate();
  if (sameDay) return 'Today';
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  const isYesterday =
    then.getFullYear() === y.getFullYear() && then.getMonth() === y.getMonth() && then.getDate() === y.getDate();
  if (isYesterday) return 'Yesterday';
  return `${MONTHS_SHORT[then.getMonth()]} ${then.getDate()}`;
}

type UserData = {
  created_at: string | null;
  onboarding_summary: string | null;
};

type SessionRow = {
  id: string;
  started_at: string;
  summary: string | null;
};

type Row =
  | { kind: 'starting'; label: string; date: string; summary: string }
  | { kind: 'session'; label: string; date: string; summary: string | null }
  | { kind: 'progress'; label: string };

export default function PlanScreen() {
  const [user, setUser] = useState<UserData | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (!cancelled) router.replace('/login');
        return;
      }
      const [userRes, sessionsRes] = await Promise.all([
        supabase
          .from('users')
          .select('created_at, onboarding_summary')
          .eq('auth_id', session.user.id)
          .maybeSingle(),
        supabase
          .from('sessions')
          .select('id, started_at, summary')
          .order('started_at', { ascending: false }),
      ]);
      if (cancelled) return;
      setUser((userRes.data as UserData | null) ?? null);
      setSessions((sessionsRes.data ?? []) as SessionRow[]);
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

  const rows: Row[] = [];
  const onboardingSummary = user?.onboarding_summary?.trim() ?? '';
  if (onboardingSummary) {
    rows.push({
      kind: 'starting',
      label: 'STARTING POINT',
      date: formatNodeDate(user?.created_at),
      summary: onboardingSummary,
    });
    const oldestFirst = [...sessions].reverse();
    oldestFirst.forEach((s, i) => {
      rows.push({
        kind: 'session',
        label: `SESSION ${i + 2}`,
        date: formatNodeDate(s.started_at),
        summary: s.summary?.trim() || null,
      });
    });
  }
  rows.push({ kind: 'progress', label: 'IN PROGRESS' });

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
        Your Plan
      </Text>
      <Text style={{ fontFamily: Fonts.sansRegular, color: Colors.textDim, fontSize: 15, marginTop: 8 }}>
        Built session by session.
      </Text>

      <View style={{ marginTop: 40, position: 'relative' }}>
        {rows.length > 1 && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 5.5,
              top: 10,
              bottom: 10,
              width: 1,
              backgroundColor: 'rgba(185,28,28,0.18)',
            }}
          />
        )}
        <View style={{ gap: 36 }}>
          {rows.map((row, i) => {
            if (row.kind === 'progress') {
              return (
                <TimelineNode key={`progress-${i}`} label={row.label} pulsing>
                  <Text
                    style={{
                      fontFamily: Fonts.sansRegular,
                      fontSize: 13,
                      color: '#C8D5E3',
                      marginTop: 6,
                      lineHeight: 21,
                    }}
                  >
                    Reid is building this with you.
                  </Text>
                  <Text
                    style={{
                      fontFamily: Fonts.serifItalic,
                      fontSize: 15,
                      color: Colors.textDim,
                      marginTop: 4,
                      lineHeight: 22,
                    }}
                  >
                    Keep showing up.
                  </Text>
                </TimelineNode>
              );
            }
            return (
              <TimelineNode key={`row-${i}`} label={row.label} date={row.date}>
                {row.summary ? (
                  <Text
                    style={{
                      fontFamily: Fonts.serifItalic,
                      fontSize: 17,
                      color: Colors.textPrimary,
                      marginTop: 6,
                      lineHeight: 25,
                    }}
                  >
                    {row.summary}
                  </Text>
                ) : (
                  <Text
                    style={{
                      fontFamily: Fonts.sansRegular,
                      fontSize: 13,
                      color: Colors.textDim,
                      marginTop: 6,
                      lineHeight: 20,
                      fontStyle: 'italic',
                    }}
                  >
                    Session in progress
                  </Text>
                )}
              </TimelineNode>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

function TimelineNode({
  label,
  date,
  pulsing = false,
  children,
}: {
  label: string;
  date?: string;
  pulsing?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 18 }}>
      <View style={{ width: 12, marginTop: 6 }}>
        <View
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: Colors.accent,
            opacity: pulsing ? 0.7 : 1,
          }}
        />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12 }}>
          <Text
            style={{
              fontFamily: Fonts.sansMedium,
              fontSize: 11,
              letterSpacing: 1.32,
              color: Colors.textDim,
            }}
          >
            {label}
          </Text>
          {date && (
            <Text style={{ fontFamily: Fonts.sansRegular, fontSize: 12, color: '#3A5070' }}>{date}</Text>
          )}
        </View>
        {children}
      </View>
    </View>
  );
}
