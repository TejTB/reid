import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { C, F, R, S, OBSERVATION_BADGE } from '@/constants/theme';

type Observation = {
  id: string;
  text: string;
  category: string | null;
  created_at: string;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

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
        <ActivityIndicator color={C.red} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: insets.top + 16,
        paddingBottom: 32,
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={C.red}
        />
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
        Noticed
      </Text>
      <Text
        style={{
          fontFamily: F.sans,
          color: C.muted,
          fontSize: 14,
          marginTop: 6,
        }}
      >
        What Reid is picking up on.
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
              fontSize: 22,
              color: C.muted,
              textAlign: 'center',
            }}
          >
            Nothing yet.
          </Text>
          <Text
            style={{
              fontFamily: F.sans,
              fontSize: 13,
              color: C.muted,
              marginTop: 10,
              maxWidth: 320,
              textAlign: 'center',
              lineHeight: 20,
            }}
          >
            Reid logs observations as he gets to know you. Have a few sessions.
          </Text>
        </View>
      ) : (
        <View style={{ marginTop: 28, gap: 14 }}>
          {items.map((obs) => (
            <View
              key={obs.id}
              style={{
                backgroundColor: C.surface,
                borderRadius: R.md,
                borderWidth: 1,
                borderColor: C.border,
                padding: 18,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 14,
                }}
              >
                <View
                  style={{
                    paddingVertical: 4,
                    paddingHorizontal: 10,
                    backgroundColor: badgeColor(obs.category),
                    borderRadius: R.sm,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: F.sansMed,
                      fontSize: 10,
                      color: '#FFFFFF',
                      letterSpacing: 1.1,
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
                  {formatDate(obs.created_at)}
                </Text>
              </View>
              <Text
                style={{
                  fontFamily: F.serifItalic,
                  fontSize: 16,
                  lineHeight: 24,
                  color: C.text,
                }}
              >
                {obs.text}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
