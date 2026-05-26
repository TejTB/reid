/**
 * Goals — the founder's targets.
 *
 * Goals carry numeric current/target values (no status/progress columns), so
 * status and progress are derived via goalStatus() / goalProgress(). Each goal
 * is a GlowCard with a derived status badge and an on-mount-animated progress
 * bar that mirrors the CurrentFocusCard visual.
 */
import { useCallback, useEffect } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { theme } from '../../../lib/theme';
import { goalProgress, goalStatus, type Goal } from '../../../lib/supabase';
import { useGoals } from '../../../hooks/useGoals';
import { GlowCard } from '../../../components/cards/GlowCard';
import { ReidOrb } from '../../../components/orb/ReidOrb';

function formatDeadline(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function GoalCard({ goal }: { goal: Goal }) {
  const status = goalStatus(goal);
  const progress = goalProgress(goal);

  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withTiming(progress, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [progress, fill]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fill.value}%`,
  }));

  const valueLine = `${goal.current_value} / ${goal.target_value}${goal.unit ? ` ${goal.unit}` : ''}`;

  return (
    <GlowCard style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {goal.title}
        </Text>
        <View style={[styles.badge, status === 'complete' ? styles.badgeComplete : styles.badgeActive]}>
          <Text style={[styles.badgeText, status === 'complete' ? styles.badgeTextComplete : styles.badgeTextActive]}>
            {status === 'complete' ? 'complete' : 'active'}
          </Text>
        </View>
      </View>

      {goal.description ? (
        <Text style={styles.description}>{goal.description}</Text>
      ) : null}

      {goal.deadline ? (
        <Text style={styles.deadline}>{formatDeadline(goal.deadline)}</Text>
      ) : null}

      <View style={styles.progressSection}>
        <Text style={styles.progressValue}>{valueLine}</Text>
        <View style={styles.track}>
          <Animated.View style={[styles.fill, fillStyle]} />
        </View>
      </View>
    </GlowCard>
  );
}

export default function GoalsScreen() {
  const insets = useSafeAreaInsets();
  const { goals, loading, refresh } = useGoals();

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const isEmpty = !loading && goals.length === 0;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Text style={[styles.title, { paddingTop: theme.spacing.sm }]}>Goals</Text>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={theme.accent.red} />
        </View>
      ) : isEmpty ? (
        <View style={styles.centerFill}>
          <ReidOrb size={60} state="idle" />
          <Text style={styles.emptyText}>
            Your goals will appear here once you and Reid set them.
          </Text>
        </View>
      ) : (
        <FlatList
          data={goals}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <GoalCard goal={item} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: theme.spacing.md,
            paddingBottom: insets.bottom + 120,
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg.primary,
  },
  title: {
    fontFamily: theme.font.displayBold,
    fontSize: 28,
    color: theme.text.primary,
    paddingHorizontal: 20,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  emptyText: {
    fontFamily: theme.font.body,
    fontSize: 15,
    color: theme.text.secondary,
    textAlign: 'center',
    marginTop: theme.spacing.md,
    lineHeight: 22,
  },
  card: {
    marginBottom: theme.spacing.md - theme.spacing.xs,
    marginHorizontal: 20,
    padding: theme.spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  cardTitle: {
    flex: 1,
    fontFamily: theme.font.bodySemiBold,
    fontSize: 16,
    color: theme.text.primary,
  },
  badge: {
    borderRadius: theme.radius.full,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  badgeActive: {
    backgroundColor: theme.accent.redDim,
  },
  badgeComplete: {
    backgroundColor: 'rgba(34,197,94,0.12)',
  },
  badgeText: {
    fontFamily: theme.font.bodySemiBold,
    fontSize: 11,
  },
  badgeTextActive: {
    color: theme.accent.red,
  },
  badgeTextComplete: {
    color: '#22C55E',
  },
  description: {
    fontFamily: theme.font.body,
    fontSize: 14,
    color: theme.text.secondary,
    marginTop: theme.spacing.xs + 2,
    lineHeight: 21,
  },
  deadline: {
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.text.dim,
    marginTop: theme.spacing.xs,
  },
  progressSection: {
    marginTop: theme.spacing.sm + 2,
  },
  progressValue: {
    fontFamily: theme.font.body,
    fontSize: 12,
    color: theme.text.dim,
    marginBottom: theme.spacing.sm,
  },
  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.border.subtle,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: theme.accent.red,
  },
});
