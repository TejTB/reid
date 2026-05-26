import { FlatList, StyleSheet } from 'react-native';
import { PickCard } from './PickCard';
import { PICKS, type Pick } from '../../lib/picks';
import { theme } from '../../lib/theme';

type PicksCarouselProps = {
  picks?: Pick[];
};

/** Horizontal, swipeable row of Reid's Picks. */
export function PicksCarousel({ picks = PICKS }: PicksCarouselProps) {
  return (
    <FlatList
      data={picks}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyExtractor={(pick) => pick.id}
      renderItem={({ item }) => <PickCard pick={item} />}
      contentContainerStyle={styles.content}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    gap: theme.spacing.sm + theme.spacing.xs,
    paddingHorizontal: theme.spacing.lg - theme.spacing.xs,
    paddingBottom: theme.spacing.xs,
  },
});
