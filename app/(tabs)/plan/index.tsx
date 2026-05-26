/**
 * Plan — the founder's tasks.
 *
 * The real schema: tasks carry `description` and a `completed` flag, and are NOT
 * linked to goals. So we group purely by ACTIVE vs DONE. Toggling a task pops the
 * checkbox, fires haptics, and persists optimistically (the hook handles the
 * write + revert). Empty state invites a chat with Reid.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { theme } from '../../../lib/theme';
import type { Task } from '../../../lib/supabase';
import { useTasks } from '../../../hooks/useTasks';
import { ReidOrb } from '../../../components/orb/ReidOrb';
import { OrbChatModal } from '../../../components/orb/OrbChatModal';

type Section = { title: string; data: Task[] };

function TaskRow({ task, onToggle }: { task: Task; onToggle: (t: Task) => void }) {
  const scale = useSharedValue(1);

  const boxStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSequence(
      withTiming(1.2, { duration: 120 }),
      withTiming(1, { duration: 120 }),
    );
    onToggle(task);
  };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: task.completed }}
      accessibilityLabel={task.description}
      style={styles.row}
    >
      <Animated.View
        style={[
          styles.checkbox,
          task.completed ? styles.checkboxDone : styles.checkboxOpen,
          boxStyle,
        ]}
      >
        {task.completed ? (
          <Feather name="check" size={15} color={theme.text.primary} />
        ) : null}
      </Animated.View>
      <Text
        style={[styles.taskText, task.completed && styles.taskTextDone]}
        numberOfLines={3}
      >
        {task.description}
      </Text>
    </Pressable>
  );
}

export default function PlanScreen() {
  const insets = useSafeAreaInsets();
  const { tasks, loading, refresh, toggle } = useTasks();
  const [chatVisible, setChatVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const sections = useMemo<Section[]>(() => {
    const active = tasks.filter((t) => !t.completed);
    const done = tasks.filter((t) => t.completed);
    const out: Section[] = [];
    if (active.length > 0) out.push({ title: 'ACTIVE', data: active });
    if (done.length > 0) out.push({ title: 'DONE', data: done });
    return out;
  }, [tasks]);

  const isEmpty = !loading && tasks.length === 0;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Text style={[styles.title, { paddingTop: theme.spacing.sm }]}>Plan</Text>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={theme.accent.red} />
        </View>
      ) : isEmpty ? (
        <Pressable style={styles.centerFill} onPress={() => setChatVisible(true)}>
          <ReidOrb size={60} state="idle" />
          <Text style={styles.emptyText}>
            Start a conversation with Reid to build your plan.
          </Text>
        </Pressable>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <TaskRow task={item} onToggle={toggle} />}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => void refresh()}
              tintColor={theme.text.dim}
            />
          }
        />
      )}

      <OrbChatModal visible={chatVisible} onClose={() => setChatVisible(false)} />
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
  sectionHeader: {
    fontFamily: theme.font.bodySemiBold,
    fontSize: 13,
    color: theme.text.dim,
    letterSpacing: 1.5,
    paddingHorizontal: 20,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md - theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.border.subtle,
    paddingHorizontal: 20,
    paddingVertical: theme.spacing.sm,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOpen: {
    borderWidth: 1.5,
    borderColor: theme.border.strong,
  },
  checkboxDone: {
    backgroundColor: theme.accent.red,
  },
  taskText: {
    flex: 1,
    fontFamily: theme.font.body,
    fontSize: 15,
    color: theme.text.primary,
    lineHeight: 21,
  },
  taskTextDone: {
    textDecorationLine: 'line-through',
    color: theme.text.dim,
  },
});
