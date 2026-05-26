/**
 * ChatInput — composer for the chat surface.
 *
 * Owns its own text state, clears on send, and reports composing transitions so
 * the parent can drive the orb into its "listening" state. The send button is a
 * 44×44 red circle (dim when there's nothing to send). Safe-area insets and the
 * KeyboardAvoidingView are the parent's responsibility.
 */
import React, { useCallback, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { theme } from '../../lib/theme';

type ChatInputProps = {
  onSend: (text: string) => void;
  disabled?: boolean;
  onComposingChange?: (composing: boolean) => void;
  placeholder?: string;
};

export function ChatInput({
  onSend,
  disabled = false,
  onComposingChange,
  placeholder = 'Message Reid…',
}: ChatInputProps) {
  const [text, setText] = useState('');

  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && !disabled;

  const handleChange = useCallback(
    (next: string) => {
      const wasComposing = text.trim().length > 0;
      setText(next);
      const nowComposing = next.trim().length > 0;
      if (wasComposing !== nowComposing) {
        onComposingChange?.(nowComposing);
      }
    },
    [text, onComposingChange],
  );

  const handleSend = useCallback(() => {
    const value = text.trim();
    if (value.length === 0 || disabled) return;
    onSend(value);
    setText('');
    onComposingChange?.(false);
    void Haptics.selectionAsync();
  }, [text, disabled, onSend, onComposingChange]);

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={handleChange}
        placeholder={placeholder}
        placeholderTextColor={theme.text.placeholder}
        multiline
        editable={!disabled}
        cursorColor={theme.accent.red}
        selectionColor={theme.accent.redGlow}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send message"
        accessibilityState={{ disabled: !canSend }}
        disabled={!canSend}
        onPress={handleSend}
        hitSlop={6}
        style={[
          styles.sendButton,
          { backgroundColor: canSend ? theme.accent.red : theme.accent.redDim },
        ]}
      >
        <Feather name="arrow-up" size={22} color={theme.text.primary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.bg.deep,
    borderTopWidth: 1,
    borderTopColor: theme.border.subtle,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md - 4, // 12
    flexDirection: 'row',
    gap: theme.spacing.md - 4, // 12
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: theme.bg.input,
    borderWidth: 1,
    borderColor: theme.border.default,
    borderRadius: 22,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2, // 10
    color: theme.text.primary,
    fontFamily: theme.font.body,
    fontSize: 16,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
