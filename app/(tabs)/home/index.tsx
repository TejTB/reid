/**
 * Home — the founder's daily landing.
 *
 * A time-aware greeting, the current focus, Reid's latest nudge, and Reid's
 * Picks. Data refreshes on focus so anything that came out of a chat (new goal,
 * fresh observation) shows up when the founder returns to this tab.
 */
import { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';

import { theme } from '../../../lib/theme';
import { supabase, getProfile } from '../../../lib/supabase';
import { useAuth } from '../../../hooks/useAuth';
import { useCurrentFocus } from '../../../hooks/useCurrentFocus';
import { CurrentFocusCard } from '../../../components/cards/CurrentFocusCard';
import { NudgeCard } from '../../../components/cards/NudgeCard';
import { PicksCarousel } from '../../../components/picks/PicksCarousel';
import { OrbChatModal } from '../../../components/orb/OrbChatModal';

function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function firstName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return 'Founder';
  return trimmed.split(' ')[0] || 'Founder';
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, signOut } = useAuth();
  const { focus, loading: focusLoading, refresh: refreshFocus } = useCurrentFocus();

  const [chatVisible, setChatVisible] = useState(false);
  const [nudge, setNudge] = useState<string | null>(null);
  const [nudgeLoading, setNudgeLoading] = useState(true);

  const loadNudge = useCallback(async () => {
    const p = await getProfile();
    if (!p) {
      setNudge(null);
      setNudgeLoading(false);
      return;
    }
    const { data } = await supabase
      .from('observations')
      .select('text')
      .eq('user_id', p.id)
      .order('created_at', { ascending: false })
      .limit(1);
    const row = (data as { text: string }[] | null)?.[0];
    setNudge(row?.text ?? null);
    setNudgeLoading(false);
  }, []);

  // Re-pull focus + nudge each time the tab regains focus.
  useFocusEffect(
    useCallback(() => {
      void refreshFocus();
      void loadNudge();
    }, [refreshFocus, loadNudge]),
  );

  const handleSettings = () => {
    Alert.alert('Settings', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Sign out', 'Are you sure you want to sign out?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
          ]);
        },
      },
    ]);
  };

  const greeting = greetingFor(new Date().getHours());
  const name = firstName(profile?.name);
  const nudgeText = nudge ?? 'Tell me what you shipped this week.';

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={[styles.header, { paddingTop: theme.spacing.md }]}>
        <View style={styles.greetingWrap}>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={handleSettings}
          hitSlop={12}
          style={({ pressed }) => (pressed ? styles.iconPressed : undefined)}
        >
          <Feather name="settings" size={22} color={theme.text.dim} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.flex}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 120 },
        ]}
      >
        {/* CURRENT FOCUS */}
        <Text style={styles.sectionLabel}>CURRENT FOCUS</Text>
        {focusLoading ? (
          <View style={styles.focusPlaceholder} />
        ) : focus ? (
          <CurrentFocusCard
            title={focus.title}
            subtitle={`${focus.openTaskCount} open ${focus.openTaskCount === 1 ? 'task' : 'tasks'}`}
            progress={focus.progress}
            onPress={() => router.push('/(tabs)/plan')}
          />
        ) : (
          <Text style={styles.emptyHint}>
            Set your focus with Reid and it&apos;ll live here.
          </Text>
        )}

        {/* REID NUDGE */}
        <Text style={[styles.sectionLabel, styles.sectionSpacing]}>
          REID HAS BEEN THINKING
        </Text>
        {nudgeLoading ? (
          <View style={styles.nudgePlaceholder} />
        ) : (
          <NudgeCard text={nudgeText} onPress={() => setChatVisible(true)} />
        )}

        {/* REID'S PICKS */}
        <View style={[styles.picksHeader, styles.sectionSpacing]}>
          <Text style={styles.sectionLabel}>REID&apos;S PICKS</Text>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => {}}>
            <Text style={styles.seeAll}>See all</Text>
          </Pressable>
        </View>
        <View style={styles.picksBleed}>
          <PicksCarousel />
        </View>
      </ScrollView>

      <OrbChatModal visible={chatVisible} onClose={() => setChatVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg.primary,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  greetingWrap: {
    flex: 1,
  },
  greeting: {
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.text.dim,
  },
  name: {
    fontFamily: theme.font.bodySemiBold,
    fontSize: 22,
    color: theme.text.primary,
    marginTop: 2,
  },
  iconPressed: {
    opacity: 0.6,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: theme.spacing.lg,
  },
  sectionLabel: {
    fontFamily: theme.font.bodySemiBold,
    fontSize: 11,
    color: theme.text.dim,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  sectionSpacing: {
    marginTop: theme.spacing.lg,
  },
  focusPlaceholder: {
    height: 96,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.bg.card,
    borderWidth: 1,
    borderColor: theme.border.subtle,
  },
  nudgePlaceholder: {
    height: 72,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.accent.redDim,
  },
  emptyHint: {
    fontFamily: theme.font.body,
    fontSize: 14,
    color: theme.text.secondary,
    lineHeight: 21,
  },
  picksHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  seeAll: {
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.accent.red,
  },
  picksBleed: {
    marginHorizontal: -20,
  },
});
