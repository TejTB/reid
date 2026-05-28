import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { Pressable } from "react-native";
import Animated, {
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { C, R } from "@/constants/theme";

// The one card pattern: translucent glass surface, hairline border, optional
// red glow. Generalizes the home screen's CardShell so every surface matches.
type Props = {
  children: ReactNode;
  delay?: number;
  glow?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export default function GlowCard({ children, delay = 0, glow = false, onPress, style }: Props) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const press = (to: number) => {
    scale.value = withSpring(to, { damping: 16, stiffness: 220 });
  };

  return (
    <Animated.View
      entering={FadeInUp.duration(400).delay(delay)}
      style={[
        {
          backgroundColor: C.surfaceGlass,
          borderWidth: 1,
          borderColor: C.border,
          borderRadius: R.md,
          padding: 20,
        },
        glow
          ? {
              shadowColor: C.red,
              shadowOpacity: 0.35,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 0 },
            }
          : null,
        animStyle,
        style,
      ]}
    >
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        onPressIn={() => onPress && press(0.985)}
        onPressOut={() => onPress && press(1)}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
