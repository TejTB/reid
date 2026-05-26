import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { GlowCard } from './GlowCard';
import { theme } from '../../lib/theme';

type CurrentFocusCardProps = {
  title: string;
  subtitle?: string;
  /** 0–100 */
  progress: number;
  onPress?: () => void;
};

/**
 * The headline "what matters right now" card. A GlowCard with a solid red left
 * accent and a progress bar that animates from 0 to `progress`% on mount.
 */
export function CurrentFocusCard({ title, subtitle, progress, onPress }: CurrentFocusCardProps) {
  const clamped = Math.max(0, Math.min(100, progress));
  const fill = useSharedValue(0);

  useEffect(() => {
    fill.value = withTiming(clamped, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [clamped, fill]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fill.value}%`,
  }));

  return (
    <GlowCard style={styles.card} onPress={onPress}>
      <View style={styles.accent} />
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <View style={styles.track}>
        <Animated.View style={[styles.fill, fillStyle]} />
      </View>
    </GlowCard>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: theme.spacing.md,
  },
  accent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: theme.accent.red,
  },
  title: {
    fontFamily: theme.font.displayBold,
    fontSize: 18,
    color: theme.text.primary,
  },
  subtitle: {
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.text.dim,
    marginTop: theme.spacing.xs,
  },
  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.border.subtle,
    marginTop: theme.spacing.sm + theme.spacing.xs,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: theme.accent.red,
  },
});
