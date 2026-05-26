import { useState } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import { GlowCard } from './GlowCard';
import { theme } from '../../lib/theme';
import type { Session } from '../../lib/supabase';

type SessionCardProps = {
  session: Session;
  onContinue?: () => void;
};

/** Compact, human relative time: "just now", "5m ago", "2 days ago", etc. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  if (sec < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day === 1) return 'yesterday';
  if (day < 7) return `${day} days ago`;
  const wk = Math.round(day / 7);
  if (wk < 5) return `${wk}w ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.round(day / 365);
  return `${yr}y ago`;
}

/**
 * A past conversation, collapsible. Collapsed shows date / message count / title
 * / a 2-line preview. Expanded reveals the full summary, key points, commitments,
 * Reid's noted observation, and a continue-thread action.
 */
export function SessionCard({ session, onContinue }: SessionCardProps) {
  const [expanded, setExpanded] = useState(false);

  const keyPoints = session.key_points ?? [];
  const commitments = session.commitments ?? [];
  const summary = session.summary ?? '';
  const title = session.title ?? 'Untitled session';
  const reidNote = session.reid_note ?? '';

  const toggle = () => {
    LayoutAnimation.easeInEaseOut();
    setExpanded((prev) => !prev);
  };

  return (
    <GlowCard style={styles.card} onPress={toggle}>
      <View style={styles.headerRow}>
        <Text style={styles.meta}>{relativeTime(session.started_at)}</Text>
        <Text style={styles.meta}>{`${session.message_count} messages`}</Text>
      </View>

      <Text style={styles.title} numberOfLines={expanded ? undefined : 2}>
        {title}
      </Text>

      {summary ? (
        <Text style={styles.preview} numberOfLines={expanded ? undefined : 2}>
          {summary}
        </Text>
      ) : null}

      {expanded ? (
        <View style={styles.expanded}>
          {keyPoints.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.label}>KEY POINTS</Text>
              {keyPoints.map((point, i) => (
                <Text key={`kp-${i}`} style={styles.listItem}>
                  {`— ${point}`}
                </Text>
              ))}
            </View>
          ) : null}

          {commitments.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.label}>COMMITMENTS</Text>
              {commitments.map((item, i) => (
                <Text key={`cm-${i}`} style={styles.listItem}>
                  {`— ${item}`}
                </Text>
              ))}
            </View>
          ) : null}

          {reidNote ? (
            <View style={styles.section}>
              <Text style={styles.label}>REID NOTED</Text>
              <View style={styles.noteRow}>
                <View style={styles.noteAccent} />
                <Text style={styles.noteText}>{reidNote}</Text>
              </View>
            </View>
          ) : null}

          <Pressable
            onPress={onContinue}
            style={({ pressed }) => [styles.continueBtn, pressed && styles.continuePressed]}
          >
            <Text style={styles.continueText}>Continue this thread →</Text>
          </Pressable>
        </View>
      ) : null}
    </GlowCard>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  meta: {
    fontFamily: theme.font.body,
    fontSize: 12,
    color: theme.text.dim,
  },
  title: {
    fontFamily: theme.font.displayBoldItalic,
    fontSize: 17,
    color: theme.text.primary,
    marginTop: theme.spacing.xs,
  },
  preview: {
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.text.secondary,
    marginTop: theme.spacing.xs,
    lineHeight: 20,
  },
  expanded: {
    marginTop: theme.spacing.md,
  },
  section: {
    marginBottom: theme.spacing.md,
  },
  label: {
    fontFamily: theme.font.bodySemiBold,
    fontSize: 11,
    color: theme.text.dim,
    letterSpacing: 2,
    marginBottom: theme.spacing.sm,
  },
  listItem: {
    fontFamily: theme.font.body,
    fontSize: 14,
    color: theme.text.secondary,
    lineHeight: 22,
  },
  noteRow: {
    flexDirection: 'row',
  },
  noteAccent: {
    width: 2,
    borderRadius: 2,
    backgroundColor: theme.accent.red,
    marginRight: theme.spacing.sm + theme.spacing.xs,
  },
  noteText: {
    flex: 1,
    fontFamily: theme.font.displayItalic,
    fontSize: 15,
    color: theme.text.secondary,
    lineHeight: 24,
  },
  continueBtn: {
    alignSelf: 'flex-start',
    backgroundColor: theme.accent.redDim,
    borderWidth: 1,
    borderColor: theme.accent.redBorder,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  continuePressed: {
    opacity: 0.85,
  },
  continueText: {
    fontFamily: theme.font.bodyMedium,
    fontSize: 14,
    color: theme.accent.red,
  },
});
