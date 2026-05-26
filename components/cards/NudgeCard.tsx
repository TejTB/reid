import { StyleSheet, Text, View } from 'react-native';
import { GlowCard } from './GlowCard';
import { theme } from '../../lib/theme';

type NudgeCardProps = {
  text: string;
  onPress?: () => void;
};

/**
 * A Reid "nudge" — a short prompt in display italic over a red tint. Tapping it
 * opens chat (the parent wires `onPress`).
 */
export function NudgeCard({ text, onPress }: NudgeCardProps) {
  return (
    <GlowCard style={styles.card} onPress={onPress}>
      <View style={styles.accent} />
      <Text style={styles.text}>{text}</Text>
    </GlowCard>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: theme.spacing.md,
    backgroundColor: theme.accent.redDim,
  },
  accent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: theme.accent.red,
  },
  text: {
    fontFamily: theme.font.displayItalic,
    fontSize: 16,
    lineHeight: 26,
    color: theme.text.secondary,
  },
});
