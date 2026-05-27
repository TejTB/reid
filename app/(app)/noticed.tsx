import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { C, F, S, OBSERVATION_BADGE } from '@/constants/theme';
import ReidPulse from '@/components/ReidPulse';

type Observation = {
  id: string;
  text: string;
  category: string | null;
  created_at: string;
};

function badgeLabel(category: string | null): string {
  if (!category) return 'NOTED';
  return category.toUpperCase();
}

function badgeColor(category: string | null): string {
  if (!category) return C.muted;
  return OBSERVATION_BADGE[category] ?? C.muted;
}

export default function NoticedScreen() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Observation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    const { data } = await supabase
      .from('observations')
      .select('id, text, category, created_at')
      .order('created_at', { ascending: false });
    setItems((data ?? []) as Observation[]);
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
        style={{
          flex: 1,
          backgroundColor: C.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ReidPulse size={48} />
      </View>
    );
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
      <Text
        style={{
          fontFamily: F.serifReg,
          color: C.text,
          fontSize: 28,
          letterSpacing: -0.5,
          lineHeight: 34,
        }}
      >
        What Reid{"'"}s Noticed
      </Text>
      <Text
        style={{
          fontFamily: F.sans,
          color: C.muted,
          fontSize: 14,
          marginTop: 6,
        }}
      >
        Patterns you might have missed.
      </Text>

      {items.length === 0 ? (
        <View
          style={{
            marginTop: 120,
            alignItems: 'center',
            paddingHorizontal: S.lg,
          }}
        >
          <Text
            style={{
              fontFamily: F.serifItalic,
              fontSize: 18,
              color: C.muted,
              textAlign: 'center',
            }}
          >
            Nothing yet.
          </Text>
          <Text
            style={{
              fontFamily: F.sans,
              fontSize: 14,
              color: C.muted,
              marginTop: 10,
              maxWidth: 320,
              textAlign: 'center',
              lineHeight: 20,
            }}
          >
            Reid logs observations as he gets to know you. Have a few real sessions.
          </Text>
        </View>
      ) : (
        <View style={{ marginTop: 24, gap: 12 }}>
          {items.map((obs, i) => {
            const color = badgeColor(obs.category);
            return (
              <Animated.View
                key={obs.id}
                entering={FadeInUp.duration(380).delay(i * 60)}
                style={{
                  backgroundColor: C.surfaceGlass,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: C.border,
                  borderLeftWidth: 2,
                  borderLeftColor: color,
                  padding: 20,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 12,
                  }}
                >
                  <View
                    style={{
                      paddingVertical: 3,
                      paddingHorizontal: 9,
                      backgroundColor: color,
                      borderRadius: 999,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: F.sansMed,
                        fontSize: 10,
                        color: '#FFFFFF',
                        letterSpacing: 0.88,
                      }}
                    >
                      {badgeLabel(obs.category)}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontFamily: F.sans,
                      fontSize: 12,
                      color: C.muted,
                    }}
                  >
                    {format(new Date(obs.created_at), 'MMM d')}
                  </Text>
                </View>
                <Text
                  style={{
                    fontFamily: F.serifItalic,
                    fontSize: 17,
                    lineHeight: 26,
                    color: C.text,
                  }}
                >
                  {obs.text}
                </Text>
              </Animated.View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}
