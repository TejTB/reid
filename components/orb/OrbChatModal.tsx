/**
 * OrbChatModal — Reid's full-screen, persistent chat surface.
 *
 * A transparent RN <Modal> that slides up from the bottom and can be dragged
 * back down to dismiss. The top ~38% holds the live ReidOrb (driven by the
 * chat's orbState); the middle is an inverted FlatList of ChatBubbles (newest
 * at the bottom); the input is pinned to the bottom inside a
 * KeyboardAvoidingView with the safe-area inset respected.
 *
 * Context is gathered once on open via getProfile() + a couple of lightweight
 * Supabase reads, then folded into buildChatPrompt(). On close — if the
 * conversation has real substance — we fire-and-forget a session summary so the
 * dismiss never blocks.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  ListRenderItemInfo,
  Modal,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatBubble } from '../chat/ChatBubble';
import { ChatInput } from '../chat/ChatInput';
import { ReidOrb } from './ReidOrb';
import { useChat } from '../../hooks/useChat';
import { buildChatPrompt } from '../../lib/prompts';
import { generateAndSaveSession } from '../../lib/session-engine';
import { getProfile, supabase, type Profile } from '../../lib/supabase';
import { theme } from '../../lib/theme';
import type { UIMessage } from '../../lib/types';

type SessionContext = { title?: string; summary?: string };

type OrbChatModalProps = {
  visible: boolean;
  onClose: () => void;
  sessionContext?: SessionContext;
};

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;
const SLIDE_DURATION = 320;

/** Compose the chat context from a profile + a couple of lightweight reads. */
function useChatContext(
  visible: boolean,
  sessionContext?: SessionContext,
): { profileId: string | null; system: string | null } {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [goalsText, setGoalsText] = useState<string>('');
  const [latestSummary, setLatestSummary] = useState<string>('');
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!visible || loadedRef.current) return;
    loadedRef.current = true;
    let cancelled = false;

    (async () => {
      const p = await getProfile();
      if (cancelled || !p) return;
      setProfile(p);

      // A few goal titles for context (best-effort).
      const { data: goals } = await supabase
        .from('goals')
        .select('title')
        .eq('user_id', p.id)
        .limit(5);
      if (!cancelled && goals && goals.length > 0) {
        setGoalsText(
          (goals as { title: string }[])
            .map((g) => `- ${g.title}`)
            .join('\n'),
        );
      }

      // Most recent prior session summary (best-effort).
      const { data: sessions } = await supabase
        .from('sessions')
        .select('summary')
        .eq('user_id', p.id)
        .not('summary', 'is', null)
        .order('started_at', { ascending: false })
        .limit(1);
      if (!cancelled && sessions && sessions.length > 0) {
        const s = (sessions[0] as { summary: string | null }).summary;
        if (s) setLatestSummary(s);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible]);

  const system = useMemo(() => {
    if (!profile) return null;

    // Fold any explicit "continue this thread" context in front of the most
    // recent session summary so Reid can genuinely pick up where it left off.
    const sessionParts: string[] = [];
    if (sessionContext?.title) sessionParts.push(`Thread: ${sessionContext.title}`);
    if (sessionContext?.summary) sessionParts.push(sessionContext.summary);
    const baseLastSession =
      latestSummary || profile.onboarding_summary || '';
    const lastSessionSummary = [sessionParts.join(' — '), baseLastSession]
      .filter(Boolean)
      .join('\n\n');

    return buildChatPrompt({
      name: profile.name,
      goals: goalsText,
      observations: '',
      currentFocus: profile.onboarding_task,
      lastSessionSummary: lastSessionSummary || null,
    });
  }, [profile, goalsText, latestSummary, sessionContext]);

  return { profileId: profile?.id ?? null, system };
}

export function OrbChatModal({ visible, onClose, sessionContext }: OrbChatModalProps) {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();

  const { profileId, system } = useChatContext(visible, sessionContext);

  const initialAssistantMessage = useMemo(
    () => (sessionContext ? 'Picking up where we left off.' : "What's on your mind?"),
    [sessionContext],
  );

  // useChat must be called unconditionally; pass a placeholder system until the
  // real one resolves. We only persist once a profileId exists.
  const chat = useChat({
    system: system ?? 'You are Reid, an AI co-founder. Keep the founder moving forward.',
    maxTokens: 1024,
    persist: profileId ? { profileId, mode: 'chat' } : undefined,
    initialAssistantMessage,
  });

  // ── Slide / drag animation ────────────────────────────────────────────────
  const translateY = useSharedValue(screenHeight);

  const animateIn = useCallback(() => {
    translateY.value = withTiming(0, { duration: SLIDE_DURATION });
  }, [translateY]);

  const finishClose = useCallback(() => {
    // Fire-and-forget summary; never block the dismiss.
    if (chat.messages.length > 3 && profileId) {
      void generateAndSaveSession({
        messages: chat.messages,
        profileId,
        sessionId: chat.sessionId,
      });
    }
    onClose();
  }, [chat.messages, chat.sessionId, profileId, onClose]);

  const animateOut = useCallback(() => {
    translateY.value = withTiming(screenHeight, { duration: SLIDE_DURATION }, (finished) => {
      if (finished) runOnJS(finishClose)();
    });
  }, [translateY, screenHeight, finishClose]);

  // Slide in whenever the modal becomes visible; reset offscreen on hide.
  useEffect(() => {
    if (visible) {
      translateY.value = screenHeight;
      animateIn();
    } else {
      translateY.value = screenHeight;
    }
  }, [visible, screenHeight, translateY, animateIn]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(12)
        .failOffsetY(-12)
        .onUpdate((e) => {
          // Only allow dragging downward.
          translateY.value = Math.max(0, e.translationY);
        })
        .onEnd((e) => {
          if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
            translateY.value = withTiming(
              screenHeight,
              { duration: SLIDE_DURATION },
              (finished) => {
                if (finished) runOnJS(finishClose)();
              },
            );
          } else {
            translateY.value = withSpring(0, { damping: 18, stiffness: 180 });
          }
        }),
    [translateY, screenHeight, finishClose],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // ── Inverted list data: newest first, stable original index for each row ────
  const reversed = useMemo(() => {
    const total = chat.messages.length;
    return chat.messages
      .map((message, i) => ({ message, originalIndex: i, total }))
      .reverse();
  }, [chat.messages]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<{ message: UIMessage; originalIndex: number }>) => (
      <ChatBubble message={item.message} index={item.originalIndex} />
    ),
    [],
  );

  const keyExtractor = useCallback(
    (item: { message: UIMessage }) => item.message.id,
    [],
  );

  const topSectionHeight = Math.round(screenHeight * 0.38);

  return (
    <Modal
      transparent
      animationType="none"
      visible={visible}
      onRequestClose={animateOut}
      statusBarTranslucent
    >
      <StatusBar hidden />
      <Animated.View style={[styles.sheet, sheetStyle]}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Drag handle + orb live inside the pan zone so the top is grabbable. */}
          <GestureDetector gesture={panGesture}>
            <View style={[styles.topSection, { height: topSectionHeight, paddingTop: insets.top + theme.spacing.sm }]}>
              <View style={styles.handle} />
              <View style={styles.orbWrap}>
                <ReidOrb size={150} state={chat.orbState} />
                <Text style={styles.reidLabel}>Reid</Text>
              </View>
            </View>
          </GestureDetector>

          {/* Messages */}
          <View style={styles.messages}>
            <FlatList
              data={reversed}
              inverted
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.listContent}
            />
          </View>

          {/* Composer */}
          <View style={{ paddingBottom: insets.bottom + theme.spacing.md - 4 }}>
            <ChatInput
              onSend={chat.send}
              disabled={chat.isStreaming}
              onComposingChange={chat.setComposing}
            />
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  sheet: {
    flex: 1,
    backgroundColor: theme.bg.deep,
  },
  topSection: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: theme.radius.full,
    backgroundColor: theme.border.strong,
    marginBottom: theme.spacing.sm,
  },
  orbWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reidLabel: {
    fontFamily: theme.font.displayItalic,
    color: theme.text.dim,
    fontSize: 14,
    marginTop: -theme.spacing.sm,
  },
  messages: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
});
