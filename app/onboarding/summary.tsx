/**
 * Onboarding — the revelation.
 *
 * After the conversation, Reid plays back what he now knows: a summary, the
 * goals he heard, the single current focus, and the sharp observations he made.
 * Everything fades in on a stagger so it lands like a reveal, not a form dump.
 *
 * The result arrives via navigation params; if that's ever missing (deep link,
 * reload), we fall back to the persisted profile fields.
 */
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { theme } from '../../lib/theme';
import type { OnboardingResult } from '../../lib/prompts';
import type { OrbState } from '../../lib/types';
import { getProfile } from '../../lib/supabase';
import { ReidOrb } from '../../components/orb/ReidOrb';
import { GlowCard } from '../../components/cards/GlowCard';

const EMPTY_RESULT: OnboardingResult = {
  summary: '',
  goals: [],
  currentFocus: '',
  observations: [],
  nudge: '',
};

function parseParam(data: string | string[] | undefined): OnboardingResult | null {
  const raw = Array.isArray(data) ? data[0] : data;
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as Partial<OnboardingResult>;
    return {
      summary: obj.summary ?? '',
      goals: Array.isArray(obj.goals) ? obj.goals : [],
      currentFocus: obj.currentFocus ?? '',
      observations: Array.isArray(obj.observations) ? obj.observations : [],
      nudge: obj.nudge ?? '',
    };
  } catch {
    return null;
  }
}

/** A small reusable fade-up wrapper for staggered reveals. */
function FadeIn({
  delay,
  duration = 600,
  style,
  children,
}: {
  delay: number;
  duration?: number;
  style?: object;
  children: React.ReactNode;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration }));
  }, [progress, delay, duration]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: 12 * (1 - progress.value) }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

export default function OnboardingSummaryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ data?: string }>();

  const [result, setResult] = useState<OnboardingResult>(
    () => parseParam(params.data) ?? EMPTY_RESULT,
  );
  const [orbState, setOrbState] = useState<OrbState>('responding');

  // Settle the orb from "responding" to "idle" after the reveal lands.
  useEffect(() => {
    const t = setTimeout(() => setOrbState('idle'), 2000);
    return () => clearTimeout(t);
  }, []);

  // Fallback: if no params arrived, pull what was persisted to the profile.
  useEffect(() => {
    if (parseParam(params.data)) return;
    let mounted = true;
    (async () => {
      const p = await getProfile();
      if (!mounted || !p) return;
      setResult({
        summary: p.onboarding_summary ?? '',
        goals: (p.onboarding_goals ?? []).map((g) => ({
          title: g.title ?? '',
          description: g.description ?? '',
          timeframe: g.timeframe ?? '',
        })),
        currentFocus: p.onboarding_task ?? '',
        observations: [],
        nudge: '',
      });
    })();
    return () => {
      mounted = false;
    };
  }, [params.data]);

  const handleBuild = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/(tabs)/home');
  };

  // Goals stagger after the focus copy; observations after the goals.
  const goalsBaseDelay = 1000;
  const focusBaseDelay = goalsBaseDelay + result.goals.length * 100 + 200;
  const observationsBaseDelay = focusBaseDelay + 300;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + theme.spacing.xl, paddingBottom: insets.bottom + 96 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.orbWrap}>
          <ReidOrb size={80} state={orbState} />
        </View>

        <FadeIn delay={600} style={styles.headingWrap}>
          <Text style={styles.heading}>Here's what I know.</Text>
        </FadeIn>

        {result.summary ? (
          <FadeIn delay={800} duration={700} style={styles.summaryWrap}>
            <Text style={styles.summary}>{result.summary}</Text>
          </FadeIn>
        ) : null}

        {result.goals.length > 0 ? (
          <>
            <FadeIn delay={goalsBaseDelay - 200} style={styles.labelWrap}>
              <Text style={styles.label}>YOUR GOALS</Text>
            </FadeIn>
            {result.goals.map((goal, i) => (
              <FadeIn
                key={`goal-${i}`}
                delay={goalsBaseDelay + i * 100}
                style={styles.goalWrap}
              >
                <GlowCard style={styles.goalCard}>
                  <Text style={styles.goalTitle}>{goal.title}</Text>
                  {goal.description ? (
                    <Text style={styles.goalDescription}>{goal.description}</Text>
                  ) : null}
                  {goal.timeframe ? (
                    <Text style={styles.goalTimeframe}>{goal.timeframe}</Text>
                  ) : null}
                </GlowCard>
              </FadeIn>
            ))}
          </>
        ) : null}

        {result.currentFocus ? (
          <>
            <FadeIn delay={focusBaseDelay - 200} style={styles.labelWrap}>
              <Text style={styles.label}>CURRENT FOCUS</Text>
            </FadeIn>
            <FadeIn delay={focusBaseDelay} style={styles.focusWrap}>
              <GlowCard glow style={styles.focusCard}>
                <Text style={styles.focusText}>{result.currentFocus}</Text>
              </GlowCard>
            </FadeIn>
          </>
        ) : null}

        {result.observations.length > 0 ? (
          <>
            <FadeIn delay={observationsBaseDelay - 200} style={styles.labelWrap}>
              <Text style={styles.label}>WHAT REID SEES</Text>
            </FadeIn>
            {result.observations.map((obs, i) => (
              <FadeIn
                key={`obs-${i}`}
                delay={observationsBaseDelay + i * 100}
                style={styles.observationWrap}
              >
                <Text style={styles.observation}>{`— ${obs}`}</Text>
              </FadeIn>
            ))}
          </>
        ) : null}
      </ScrollView>

      {/* FIXED — the one action that matters. */}
      <View
        style={[
          styles.buttonOverlay,
          { paddingBottom: insets.bottom + theme.spacing.md },
        ]}
        pointerEvents="box-none"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Let's build"
          onPress={handleBuild}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>Let's build.</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg.deep,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  orbWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headingWrap: {
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.xl,
  },
  heading: {
    fontFamily: theme.font.displayBoldItalic,
    fontSize: 32,
    color: theme.text.primary,
  },
  summaryWrap: {
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
  },
  summary: {
    fontFamily: theme.font.body,
    fontSize: 16,
    lineHeight: 26,
    color: theme.text.secondary,
  },
  labelWrap: {
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.xl,
  },
  label: {
    fontFamily: theme.font.bodySemiBold,
    fontSize: 11,
    letterSpacing: 2,
    color: theme.text.dim,
  },
  goalWrap: {
    marginTop: theme.spacing.sm,
  },
  goalCard: {
    borderLeftWidth: 3,
    borderLeftColor: theme.accent.red,
    padding: theme.spacing.md,
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  goalTitle: {
    fontFamily: theme.font.bodySemiBold,
    fontSize: 16,
    color: theme.text.primary,
  },
  goalDescription: {
    fontFamily: theme.font.body,
    fontSize: 14,
    lineHeight: 21,
    color: theme.text.secondary,
    marginTop: theme.spacing.xs,
  },
  goalTimeframe: {
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.text.dim,
    marginTop: theme.spacing.xs + 2,
  },
  focusWrap: {
    marginTop: theme.spacing.sm,
  },
  focusCard: {
    padding: theme.spacing.md + 2,
    marginHorizontal: theme.spacing.lg,
  },
  focusText: {
    fontFamily: theme.font.displayItalic,
    fontSize: 18,
    lineHeight: 28,
    color: theme.text.primary,
  },
  observationWrap: {
    marginTop: theme.spacing.sm,
  },
  observation: {
    fontFamily: theme.font.displayItalic,
    fontSize: 15,
    lineHeight: 24,
    color: theme.text.secondary,
    paddingHorizontal: theme.spacing.lg,
  },
  buttonOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: theme.spacing.lg,
  },
  button: {
    height: 56,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.accent.red,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadow.red,
  },
  buttonPressed: {
    backgroundColor: theme.accent.redHover,
  },
  buttonText: {
    fontFamily: theme.font.bodyBold,
    fontSize: 17,
    color: theme.text.primary,
  },
});
