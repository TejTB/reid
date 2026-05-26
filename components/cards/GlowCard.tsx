import { ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { theme } from '../../lib/theme';

type GlowCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  /** Adds the red glow shadow + border (used for emphasis cards). */
  glow?: boolean;
};

/**
 * The app's base surface: a translucent card over a subtle blur with a hairline
 * border. Padding is left to the caller via `style` so each card can match its
 * spec. Tappable when `onPress` is provided.
 */
export function GlowCard({ children, style, onPress, glow }: GlowCardProps) {
  const inner = (
    <View style={[styles.card, glow && styles.glow, style]}>
      <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
      {children}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => (pressed ? styles.pressed : null)}>
        {inner}
      </Pressable>
    );
  }
  return inner;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.bg.card,
    borderWidth: 1,
    borderColor: theme.border.default,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  glow: {
    borderColor: theme.accent.redBorder,
    ...theme.shadow.red,
  },
  pressed: {
    opacity: 0.85,
  },
});
