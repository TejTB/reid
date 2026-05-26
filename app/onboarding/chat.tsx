/**
 * Onboarding — the first conversation.
 *
 * A full-screen, distraction-free chat with Reid. No back button, no progress
 * bar: this is a one-way door. The orb anchors the top 40%; messages stream
 * below; the composer pins to the bottom.
 *
 * Reid drives the pace and, when he has genuinely earned it, emits the
 * [ONBOARDING_COMPLETE] sentinel + a JSON payload. We strip that from the
 * transcript, persist it, refresh the profile, and reveal the summary screen.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { theme } from '../../lib/theme';
import type { OrbState, UIMessage } from '../../lib/types';
import {
  ONBOARDING_PROMPT,
  hasOnboardingComplete,
  parseOnboardingComplete,
  stripOnboardingComplete,
} from '../../lib/prompts';
import { getProfile } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useChat } from '../../hooks/useChat';
import { persistOnboarding } from '../../hooks/useOnboarding';
import { ReidOrb } from '../../components/orb/ReidOrb';
import { ChatBubble } from '../../components/chat/ChatBubble';
import { ChatInput } from '../../components/chat/ChatInput';

const INITIAL_LINE =
  "I'm Reid. Let's start where it matters. What is it you're actually trying to build?";

/** The conversation surface. Only mounts once we have a stable profileId so
 *  useChat's persist target never changes underneath it. */
function OnboardingChat({ profileId }: { profileId: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refreshProfile } = useAuth();

  const listRef = useRef<FlatList<UIMessage>>(null);
  const completedRef = useRef(false);

  // Premium intro flourish: hold the orb in a soft "responding" state on mount,
  // then defer entirely to the chat-driven orb state once it settles.
  const [introActive, setIntroActive] = useState(true);
  const [persistError, setPersistError] = useState(false);

  const persist = useMemo(
    () => ({ profileId, mode: 'onboarding' as const }),
    [profileId],
  );

  const handleAssistantComplete = useCallback(
    async (fullText: string) => {
      if (completedRef.current) return;
      if (!hasOnboardingComplete(fullText)) return;

      const parsed = parseOnboardingComplete(fullText);
      // Sentinel present but unparseable — let the conversation continue.
      if (!parsed) return;

      completedRef.current = true;

      try {
        await persistOnboarding(profileId, parsed, chatRef.current?.sessionId ?? null);
      } catch {
        // Non-blocking: surface a quiet note but still reveal the summary.
        setPersistError(true);
      }

      try {
        await refreshProfile();
      } catch {
        // refreshProfile failures shouldn't trap the user on this screen.
      }

      router.push({
        pathname: '/onboarding/summary',
        params: { data: JSON.stringify(parsed) },
      });
    },
    [profileId, refreshProfile, router],
  );

  const chat = useChat({
    system: ONBOARDING_PROMPT,
    persist,
    maxTokens: 1024,
    initialAssistantMessage: INITIAL_LINE,
    onAssistantComplete: (fullText) => {
      void handleAssistantComplete(fullText);
    },
  });

  // Keep a ref to chat so the completion handler can read sessionId without
  // re-creating itself every time the chat object changes.
  const chatRef = useRef(chat);
  chatRef.current = chat;

  // End the intro flourish after ~1.5s.
  useEffect(() => {
    const t = setTimeout(() => setIntroActive(false), 1500);
    return () => clearTimeout(t);
  }, []);

  // Once the user starts interacting (or Reid starts working), drop the intro.
  useEffect(() => {
    if (chat.orbState !== 'idle' || chat.messages.length > 1) {
      setIntroActive(false);
    }
  }, [chat.orbState, chat.messages.length]);

  // While completing, hold the orb in a "thinking" beat.
  const orbState: OrbState = completedRef.current
    ? 'thinking'
    : introActive
      ? 'responding'
      : chat.orbState;

  // Strip the sentinel/JSON tail for display, and drop any bubble that becomes
  // empty after stripping (the completing turn).
  const visibleMessages = useMemo(
    () =>
      chat.messages
        .map((m) =>
          m.role === 'assistant'
            ? { ...m, content: stripOnboardingComplete(m.content) }
            : m,
        )
        .filter((m) => m.content.trim().length > 0),
    [chat.messages],
  );

  const scrollToEnd = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [visibleMessages.length, scrollToEnd]);

  // Map back to the message's real index in the full transcript so ChatBubble's
  // font-parity cadence stays stable as bubbles are stripped.
  const indexOf = useCallback(
    (item: UIMessage) => chat.messages.findIndex((m) => m.id === item.id),
    [chat.messages],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* TOP — the orb anchors the experience. */}
        <View style={styles.orbZone}>
          <ReidOrb size={170} state={orbState} />
          <Text style={styles.wordmark}>Reid</Text>
        </View>

        {/* MIDDLE — the conversation. */}
        <FlatList
          ref={listRef}
          style={styles.flex}
          data={visibleMessages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ChatBubble message={item} index={Math.max(0, indexOf(item))} />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollToEnd}
          keyboardShouldPersistTaps="handled"
        />

        {persistError ? (
          <Text style={styles.persistNote}>
            Couldn't save everything just now — your summary is still ready below.
          </Text>
        ) : null}

        {/* BOTTOM — composer. */}
        <View style={{ paddingBottom: insets.bottom }}>
          <ChatInput
            onSend={chat.send}
            disabled={chat.isStreaming}
            onComposingChange={chat.setComposing}
            placeholder="Type your answer…"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function OnboardingChatScreen() {
  const { profile } = useAuth();
  const [resolvedId, setResolvedId] = useState<string | null>(profile?.id ?? null);

  // Prefer the auth-provided profile id; fall back to a direct fetch so we don't
  // mount the chat (and create a session) without a stable persist target.
  useEffect(() => {
    if (profile?.id) {
      setResolvedId(profile.id);
      return;
    }
    let mounted = true;
    (async () => {
      const p = await getProfile();
      if (mounted && p?.id) setResolvedId(p.id);
    })();
    return () => {
      mounted = false;
    };
  }, [profile?.id]);

  if (!resolvedId) {
    return (
      <SafeAreaView style={styles.loadingSafe}>
        <View style={styles.loadingCenter}>
          <ReidOrb size={80} state="idle" />
        </View>
      </SafeAreaView>
    );
  }

  // Remount cleanly if the id ever resolves anew — keyed for safety.
  return <OnboardingChat key={resolvedId} profileId={resolvedId} />;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.bg.primary,
  },
  flex: {
    flex: 1,
  },
  loadingSafe: {
    flex: 1,
    backgroundColor: theme.bg.primary,
  },
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbZone: {
    height: '40%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    fontFamily: theme.font.displayItalic,
    color: theme.text.dim,
    fontSize: 13,
    letterSpacing: 3,
    textAlign: 'center',
    marginTop: -theme.spacing.sm,
  },
  listContent: {
    paddingHorizontal: theme.spacing.lg - 4, // 20
    paddingBottom: theme.spacing.md,
  },
  persistNote: {
    fontFamily: theme.font.body,
    color: theme.text.dim,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
});
