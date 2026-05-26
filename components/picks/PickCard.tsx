import { StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { GlowCard } from '../cards/GlowCard';
import { theme } from '../../lib/theme';
import type { Pick } from '../../lib/picks';

type PickCardProps = {
  pick: Pick;
};

/** A single tool in Reid's Picks. Opens its URL in an in-app browser on tap. */
export function PickCard({ pick }: PickCardProps) {
  const onPress = () => {
    void Haptics.selectionAsync();
    void WebBrowser.openBrowserAsync(pick.url);
  };

  return (
    <GlowCard style={styles.card} onPress={onPress}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{pick.category}</Text>
      </View>
      <Text style={styles.emoji}>{pick.emoji}</Text>
      <Text style={styles.name} numberOfLines={1}>
        {pick.name}
      </Text>
      <Text style={styles.tagline} numberOfLines={2}>
        {pick.tagline}
      </Text>
    </GlowCard>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 110,
    height: 130,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: theme.spacing.sm,
    backgroundColor: theme.border.subtle,
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  badgeText: {
    fontFamily: theme.font.body,
    fontSize: 10,
    color: theme.text.dim,
  },
  emoji: {
    fontSize: 28,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  name: {
    fontFamily: theme.font.bodySemiBold,
    fontSize: 13,
    color: theme.text.primary,
    textAlign: 'center',
  },
  tagline: {
    fontFamily: theme.font.body,
    fontSize: 11,
    color: theme.text.dim,
    textAlign: 'center',
    marginTop: 2,
  },
});
