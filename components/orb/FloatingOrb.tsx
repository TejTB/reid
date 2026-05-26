/**
 * FloatingOrb — the always-present entry point to Reid's chat.
 *
 * A self-contained 60×60 button: a mini ReidOrb sitting over a red glow, with a
 * looping ripple ring radiating out of it and a spring entrance on first mount.
 * Tapping fires medium haptics and opens its own OrbChatModal. The parent (the
 * tab bar) is responsible for positioning this component.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { ReidOrb } from './ReidOrb';
import { OrbChatModal } from './OrbChatModal';
import { theme } from '../../lib/theme';

const SIZE = 60;
const RIPPLE_DURATION = 2500;

export function FloatingOrb() {
  const [visible, setVisible] = useState(false);

  // Entrance: scale 0 → 1.15 → 1.0.
  const entrance = useSharedValue(0);
  // Press feedback.
  const press = useSharedValue(1);
  // Idle ripple progress 0 → 1, looping.
  const ripple = useSharedValue(0);

  useEffect(() => {
    entrance.value = withSequence(
      withTiming(1.15, { duration: 360, easing: Easing.out(Easing.cubic) }),
      withSpring(1, { damping: 10, stiffness: 160 }),
    );
    ripple.value = withRepeat(
      withTiming(1, { duration: RIPPLE_DURATION, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
  }, [entrance, ripple]);

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: entrance.value * press.value }],
  }));

  const rippleStyle = useAnimatedStyle(() => ({
    opacity: 1 - ripple.value,
    transform: [{ scale: 1 + ripple.value * 0.4 }],
  }));

  const handlePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setVisible(true);
  };

  return (
    <View style={styles.container}>
      {/* Idle ripple ring (behind the orb). */}
      <Animated.View pointerEvents="none" style={[styles.ripple, rippleStyle]} />

      <Animated.View style={buttonStyle}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Reid"
          onPress={handlePress}
          onPressIn={() => {
            press.value = withTiming(0.92, { duration: 90 });
          }}
          onPressOut={() => {
            press.value = withSpring(1, { damping: 12, stiffness: 220 });
          }}
          style={styles.button}
        >
          <ReidOrb size={44} state="idle" />
        </Pressable>
      </Animated.View>

      <OrbChatModal visible={visible} onClose={() => setVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SIZE,
    height: SIZE,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.bg.deep,
    ...theme.shadow.red,
  },
  ripple: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: theme.radius.full,
    backgroundColor: theme.accent.redGlow,
  },
});
