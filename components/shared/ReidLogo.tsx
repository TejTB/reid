import { StyleSheet, Text, View, ViewStyle, StyleProp } from 'react-native';
import { theme } from '../../lib/theme';

type ReidLogoProps = {
  /** Font size of the wordmark. The orb mark scales with it. */
  size?: number;
  style?: StyleProp<ViewStyle>;
  /** Show the small glowing orb mark beside the wordmark. */
  showMark?: boolean;
};

/**
 * The Reid wordmark: white Playfair italic "Reid" with a small red glow orb.
 */
export function ReidLogo({ size = 44, style, showMark = true }: ReidLogoProps) {
  const dot = Math.max(8, size * 0.22);
  return (
    <View style={[styles.row, style]}>
      <Text
        style={[
          styles.word,
          { fontSize: size, lineHeight: size * 1.1 },
        ]}
      >
        Reid
      </Text>
      {showMark && (
        <View
          style={[
            styles.mark,
            {
              width: dot,
              height: dot,
              borderRadius: dot / 2,
              marginLeft: dot * 0.5,
              marginBottom: size * 0.12,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  word: {
    fontFamily: theme.font.displayItalic,
    color: theme.text.primary,
    letterSpacing: 0.5,
  },
  mark: {
    backgroundColor: theme.orb.bright,
    ...theme.shadow.red,
  },
});
