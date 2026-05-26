/**
 * Sessions — the founder's history with Reid.
 *
 * A reverse-chronological list of closed conversations (the hook already filters
 * to sessions with a real summary, newest first). Each SessionCard expands in
 * place; "Continue this thread" opens the chat modal seeded with that session's
 * title + summary so Reid can pick up where it left off.
 */
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { theme } from '../../../lib/theme';
import type { Session } from '../../../lib/supabase';
import { useSessions } from '../../../hooks/useSessions';
import { SessionCard } from '../../../components/cards/SessionCard';
import { ReidOrb } from '../../../components/orb/ReidOrb';
import { OrbChatModal } from '../../../components/orb/OrbChatModal';

type ActiveContext = { title?: string; summary?: string };

export default function SessionsScreen() {
  const insets = useSafeAreaInsets();
  const { sessions, loading, refresh } = useSessions();

  const [chatVisible, setChatVisible] = useState(false);
  const [context, setContext] = useState<ActiveContext | undefined>(undefined);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const openChatWith = useCallback((session: Session) => {
    setContext({
      title: session.title ?? undefined,
      summary: session.summary ?? undefined,
    });
    setChatVisible(true);
  }, []);

  const isEmpty = !loading && sessions.length === 0;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Text style={[styles.title, { paddingTop: theme.spacing.sm }]}>Sessions</Text>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={theme.accent.red} />
        </View>
      ) : isEmpty ? (
        <View style={styles.centerFill}>
          <ReidOrb size={60} state="idle" />
          <Text style={styles.emptyText}>
            Your sessions with Reid will show up here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SessionCard session={item} onContinue={() => openChatWith(item)} />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: theme.spacing.md,
            paddingBottom: insets.bottom + 120,
          }}
        />
      )}

      <OrbChatModal
        visible={chatVisible}
        onClose={() => setChatVisible(false)}
        sessionContext={context}
      />
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
});
