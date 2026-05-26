/**
 * ChatBubble — one message row.
 *
 * Reid (assistant): no bubble, text only. Font alternates by index parity —
 * even → Playfair italic (display), odd → Inter (body) — for an editorial,
 * "thinking aloud" cadence. Shows a thin trailing cursor while streaming.
 *
 * User: red-tinted right-aligned bubble.
 *
 * Both fade + slide in on mount (Reid from the left, user from the right).
 */
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { theme } from '../../lib/theme';
import { UIMessage } from '../../lib/types';

type ChatBubbleProps = {
  message: UIMessage;
  index: number;
};

export function ChatBubble({ message, index }: ChatBubbleProps) {
  const isUser = message.role === 'user';

  // Entrance: opacity 0→1 + translateX (Reid -8→0, user +8→0).
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, {
      duration: 250,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress]);

  const fromX = isUser ? 8 : -8;
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateX: fromX * (1 - progress.value) }],
  }));

  if (isUser) {
    return (
      <Animated.View style={[styles.row, styles.userRow, animatedStyle]}>
        <View style={styles.userBubble}>
          <Text style={styles.userText}>{message.content}</Text>
        </View>
      </Animated.View>
    );
  }

  // Reid / assistant — alternate display vs body font by index parity.
  const reidFont = index % 2 === 0 ? theme.font.displayItalic : theme.font.body;

  return (
    <Animated.View style={[styles.row, styles.reidRow, animatedStyle]}>
      <Text style={[styles.reidText, { fontFamily: reidFont }]}>
        {message.content}
        {message.streaming ? (
          <Text style={styles.cursor}>{'▍'}</Text>
        ) : null}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginVertical: theme.spacing.xs + 2, // ~6
  },
  reidRow: {
    alignSelf: 'flex-start',
    maxWidth: '85%',
    paddingVertical: theme.spacing.xs,
  },
  userRow: {
    alignSelf: 'flex-end',
    maxWidth: '80%',
  },
  reidText: {
    color: theme.text.primary,
    fontSize: 16,
    lineHeight: 26,
  },
  cursor: {
    color: theme.accent.red,
    fontSize: 16,
    fontFamily: theme.font.body,
  },
  userBubble: {
    backgroundColor: theme.accent.redDim,
    borderWidth: 1,
    borderColor: theme.accent.redBorder,
    borderRadius: theme.radius.lg,
    borderTopRightRadius: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2, // ~10
  },
  userText: {
    color: theme.text.primary,
    fontFamily: theme.font.body,
    fontSize: 16,
    lineHeight: 24,
  },
});
