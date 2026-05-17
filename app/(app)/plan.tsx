import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { C, F, S } from '@/constants/theme';

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
    then.getFullYear() === y.getFullYear() &&
    then.getMonth() === y.getMonth() &&
    then.getDate() === y.getDate();
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
  ended_at: string | null;
  summary: string | null;
};

type Node =
  | { kind: 'start'; label: string; date: string; summary: string; active: false; locked: false }
  | { kind: 'session'; label: string; date: string; summary: string | null; active: boolean; locked: false }
  | { kind: 'future'; label: string; date: ''; summary: null; active: false; locked: true };

const FUTURE_SLOTS = 2;

function PulsingDot() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.6);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.4, { duration: 800, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 0 }),
      ),
      -1,
      false,
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 800, easing: Easing.out(Easing.quad) }),
        withTiming(0.6, { duration: 0 }),
      ),
      -1,
      false,
    );
  }, [scale, opacity]);

  const ring = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View
      style={{
        width: 10,
        height: 10,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: C.red,
          },
          ring,
        ]}
      />
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: C.red,
        }}
      />
    </View>
  );
}

export default function PlanScreen() {
  const [user, setUser] = useState<UserData | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.replace('/login');
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
        .select('id, started_at, ended_at, summary')
        .order('started_at', { ascending: true }),
    ]);
    setUser((userRes.data as UserData | null) ?? null);
    setSessions((sessionsRes.data ?? []) as SessionRow[]);
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

  // Build the timeline. NEVER fabricate "session in progress" — only show real
  // sessions plus a fixed number of dim future placeholders.
  const onboardingSummary = user?.onboarding_summary?.trim() ?? '';
  const nodes: Node[] = [];

  if (onboardingSummary) {
    nodes.push({
      kind: 'start',
      label: 'STARTING POINT',
      date: formatNodeDate(user?.created_at),
      summary: onboardingSummary,
      active: false,
      locked: false,
    });
  }

  sessions.forEach((s, i) => {
    const completed = !!s.ended_at;
    const active = !completed && i === sessions.length - 1;
    nodes.push({
      kind: 'session',
      label: `SESSION ${i + (onboardingSummary ? 2 : 1)}`,
      date: formatNodeDate(s.started_at),
      summary: s.summary?.trim() || null,
      active,
      locked: false,
    });
  });

  const baseSession = nodes.filter((n) => n.kind !== 'future').length + (onboardingSummary ? 0 : 0);
  for (let i = 0; i < FUTURE_SLOTS; i++) {
    nodes.push({
      kind: 'future',
      label: `SESSION ${baseSession + i + 1}`,
      date: '',
      summary: null,
      active: false,
      locked: true,
    });
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 56, paddingBottom: 40 }}
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
        Your Plan
      </Text>
      <Text style={{ fontFamily: F.sans, color: C.muted, fontSize: 14, marginTop: 6 }}>
        Built session by session.
      </Text>

      <View style={{ marginTop: 36, position: 'relative' }}>
        {nodes.length > 1 && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 4.5,
              top: 6,
              bottom: 6,
              width: 1,
              backgroundColor: 'rgba(255,255,255,0.12)',
            }}
          />
        )}
        <View style={{ gap: S.xl }}>
          {nodes.map((node, i) => (
            <TimelineRow key={`n-${i}`} node={node} />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function TimelineRow({ node }: { node: Node }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 18 }}>
      <View style={{ width: 10, marginTop: 6, alignItems: 'center' }}>
        {node.locked ? (
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              borderWidth: 2,
              borderColor: C.border,
              backgroundColor: C.bg,
            }}
          />
        ) : node.active ? (
          <PulsingDot />
        ) : (
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: C.red,
            }}
          />
        )}
      </View>
      <View style={{ flex: 1, opacity: node.locked ? 0.4 : 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12 }}>
          <Text
            style={{
              fontFamily: F.sansMed,
              fontSize: 11,
              letterSpacing: 1.3,
              color: C.muted,
            }}
          >
            {node.label}
          </Text>
          {node.date && (
            <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.muted }}>· {node.date}</Text>
          )}
        </View>
        {node.kind === 'start' ? (
          <Text
            style={{
              fontFamily: F.serifItalic,
              fontSize: 17,
              color: C.text,
              marginTop: 6,
              lineHeight: 26,
            }}
          >
            {node.summary}
          </Text>
        ) : node.kind === 'session' ? (
          node.summary ? (
            <Text
              style={{
                fontFamily: F.serifItalic,
                fontSize: 17,
                color: C.text,
                marginTop: 6,
                lineHeight: 26,
              }}
            >
              {node.summary}
            </Text>
          ) : (
            <Text
              style={{
                fontFamily: F.sans,
                fontSize: 13,
                color: C.muted,
                marginTop: 6,
                lineHeight: 20,
              }}
            >
              {node.active ? 'In session with Reid right now.' : 'No summary yet.'}
            </Text>
          )
        ) : (
          <Text
            style={{
              fontFamily: F.sans,
              fontSize: 13,
              color: C.muted,
              marginTop: 6,
              fontStyle: 'italic',
            }}
          >
            Not yet
          </Text>
        )}
      </View>
    </View>
  );
}
