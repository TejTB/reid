import { useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
  FadeIn,
} from 'react-native-reanimated';
import { C, F } from '@/constants/theme';

// Picks the right "Reid is thinking" phrase from what the user just said.
// Keep this pure so the component can stay dumb.
export function getThinkingPhrase(lastMessage: string): string {
  const msg = lastMessage.toLowerCase();
  if (/scared|afraid|worried|anxious/.test(msg)) return 'sitting with that.';
  if (/plan|strategy|roadmap|next/.test(msg)) return 'mapping this out.';
  if (/money|revenue|price|charge/.test(msg)) return 'running the numbers.';
  if (/user|customer|people|market/.test(msg)) return 'thinking about who matters here.';
  return 'thinking.';
}

type Props = {
  lastUserMessage: string;
};

// The thinking indicator lives where Reid's reply will land — a pulsing red
// dot plus a contextual italic phrase. Replaced (not amended) once the real
// assistant message arrives.
export default function ReidThinking({ lastUserMessage }: Props) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: 600, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 600, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [pulse]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const phrase = getThinkingPhrase(lastUserMessage);

  return (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingRight: 24,
        marginBottom: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <Animated.View
        style={[
          {
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: C.red,
          },
          dotStyle,
        ]}
      />
      <Animated.View entering={FadeIn.duration(300).delay(300)}>
        <Text
          style={{
            fontFamily: F.serifItalic,
            fontSize: 18,
            lineHeight: 26,
            color: C.muted,
          }}
        >
          {phrase}
        </Text>
      </Animated.View>
    </View>
  );
}
