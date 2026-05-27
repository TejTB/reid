import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  FadeInUp,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { format, isToday, isYesterday } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { C, F, S } from '@/constants/theme';
import ReidPulse from '@/components/ReidPulse';

function formatNodeDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMM d');
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
  status?: string | null;
};

type Node =
  | { kind: 'start'; index: number; label: string; date: string; summary: string }
  | {
      kind: 'session';
      index: number;
      label: string;
      date: string;
      summary: string | null;
      active: boolean;
    }
  | { kind: 'future'; index: number; label: string };

const FUTURE_SLOTS = 2;

function PulsingDot() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.55);

  useEffect(() => {
    // 1 → 1.4 → 1, looping at 1500ms total.
    scale.value = withRepeat(
      withSequence(
        withTiming(1.4, { duration: 750, easing: Easing.out(Easing.cubic) }),
        withTiming(1, { duration: 750, easing: Easing.in(Easing.cubic) }),
      ),
      -1,
      false,
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 750, easing: Easing.out(Easing.cubic) }),
        withTiming(0.55, { duration: 750, easing: Easing.in(Easing.cubic) }),
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
        width: 12,
        height: 12,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: C.red,
          },
          ring,
        ]}
      />
      <View
        style={{
          width: 12,
          height: 12,
          borderRadius: 6,
          backgroundColor: C.red,
        }}
      />
    </View>
  );
}

export default function PlanScreen() {
  const insets = useSafeAreaInsets();
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
        .select('id, started_at, ended_at, summary, status')
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
        <ReidPulse size={48} />
      </View>
    );
  }

  const onboardingSummary = user?.onboarding_summary?.trim() ?? '';
  const nodes: Node[] = [];

  if (onboardingSummary) {
    nodes.push({
      kind: 'start',
      index: 0,
      label: 'STARTING POINT',
      date: formatNodeDate(user?.created_at),
      summary: onboardingSummary,
    });
  }

  sessions.forEach((s, i) => {
    // Active = status explicitly 'active'. Fall back to "no end + last row"
    // ONLY if the schema doesn't include `status` yet.
    const active = s.status === 'active' || (!s.status && !s.ended_at && i === sessions.length - 1);
    nodes.push({
      kind: 'session',
      index: nodes.length,
      label: `SESSION ${i + (onboardingSummary ? 2 : 1)}`,
      date: formatNodeDate(s.started_at),
      summary: s.summary?.trim() || null,
      active,
    });
  });

  const realCount = nodes.length;
  for (let i = 0; i < FUTURE_SLOTS; i++) {
    nodes.push({
      kind: 'future',
      index: realCount + i,
      label: `SESSION ${realCount + i + 1}`,
    });
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 16, paddingBottom: 56 }}
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
        Your Plan
      </Text>
      <Text style={{ fontFamily: F.sans, color: C.muted, fontSize: 14, marginTop: 6 }}>
        Built session by session.
      </Text>

      {/* Timeline. Vertical line at x=11, content offset to x=32. */}
      <View style={{ marginTop: 32, position: 'relative' }}>
        {nodes.length > 1 && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 11,
              top: 6,
              bottom: 6,
              width: 1,
              backgroundColor: 'rgba(255,255,255,0.10)',
            }}
          />
        )}
        <View style={{ gap: S.xl }}>
          {nodes.map((node, i) => (
            <TimelineRow key={`n-${i}`} node={node} delay={i * 60} />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function TimelineRow({ node, delay = 0 }: { node: Node; delay?: number }) {
  return (
    <Animated.View
      entering={FadeInUp.duration(360).delay(delay)}
      style={{ flexDirection: 'row', alignItems: 'flex-start' }}
    >
      {/* Dot column — width 22, dot centered at x=11. Content sits at x=32. */}
      <View style={{ width: 22, alignItems: 'center', marginTop: 4 }}>
        {node.kind === 'future' ? (
          <View
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.15)',
              backgroundColor: 'transparent',
            }}
          />
        ) : node.kind === 'session' && node.active ? (
          <PulsingDot />
        ) : (
          <View
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: C.red,
            }}
          />
        )}
      </View>
      <View style={{ flex: 1, marginLeft: 10 }}>
        {node.kind === 'future' ? (
          <Text
            style={{
              fontFamily: F.sans,
              fontSize: 13,
              color: C.textDim,
              letterSpacing: 0.88,
            }}
          >
            {node.label}
          </Text>
        ) : node.kind === 'session' && node.active ? (
          <Text
            style={{
              fontFamily: F.sans,
              fontSize: 13,
              color: C.red,
            }}
          >
            {node.label} — Active now
          </Text>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <Text
              style={{
                fontFamily: F.sansMed,
                fontSize: 11,
                letterSpacing: 0.88,
                color: C.muted,
                textTransform: 'uppercase',
              }}
            >
              {node.label}
            </Text>
            {'date' in node && node.date ? (
              <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.muted }}>· {node.date}</Text>
            ) : null}
          </View>
        )}
        {node.kind === 'start' ? (
          <Text
            style={{
              fontFamily: F.serifItalic,
              fontSize: 16,
              color: C.text,
              marginTop: 6,
              lineHeight: 24,
            }}
          >
            {node.summary}
          </Text>
        ) : node.kind === 'session' && node.summary && !node.active ? (
          <Text
            style={{
              fontFamily: F.serifItalic,
              fontSize: 16,
              color: C.text,
              marginTop: 6,
              lineHeight: 24,
            }}
          >
            {node.summary}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

/*
 TODO (db): sessions.status column (text) with values:
   - 'active'    — exactly one row at a time
   - 'completed' — has ended_at
   We fall back to "no end + most recent row" when status is missing.
*/
