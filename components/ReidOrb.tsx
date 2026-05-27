import { useEffect } from "react";
import { Pressable } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  interpolate,
  interpolateColor,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";
import type { OrbVisual } from "@/lib/voice/orbState";

const RED = "#B91C1C";
const CREAM = "#F2EDE3";
const BASE = 200;

type Props = { state: OrbVisual; amplitude: number; onPress?: () => void };

export default function ReidOrb({ state, amplitude, onPress }: Props) {
  const amp = useSharedValue(0);
  const breath = useSharedValue(0);
  const contract = useSharedValue(0);

  useEffect(() => {
    amp.value = withTiming(amplitude, { duration: 90, easing: Easing.out(Easing.quad) });
  }, [amplitude, amp]);

  useEffect(() => {
    cancelAnimation(breath);
    cancelAnimation(contract);
    if (state === "idle") {
      breath.value = 0;
      breath.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
      contract.value = withTiming(0, { duration: 300 });
    } else if (state === "thinking") {
      contract.value = withTiming(1, { duration: 300, easing: Easing.in(Easing.ease) });
      breath.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    } else {
      contract.value = withTiming(0, { duration: 200 });
      breath.value = withTiming(0, { duration: 200 });
    }
  }, [state, breath, contract]);

  const coreStyle = useAnimatedStyle(() => {
    let scale = 1;
    if (state === "idle") scale = interpolate(breath.value, [0, 1], [1.0, 1.05]);
    else if (state === "listening") scale = 1.0 + amp.value * 0.3;
    else if (state === "thinking") scale = interpolate(contract.value, [0, 1], [1.0, 0.88]);
    else if (state === "speaking") scale = 1.0 + amp.value * 0.12;
    const colorT = state === "speaking" ? amp.value : 0;
    return {
      transform: [{ scale }],
      backgroundColor: interpolateColor(colorT, [0, 1], [RED, CREAM]),
    };
  });

  const innerStyle = useAnimatedStyle(() => {
    let opacity = 1;
    if (state === "idle") opacity = interpolate(breath.value, [0, 1], [0.6, 1.0]);
    else if (state === "thinking") opacity = interpolate(breath.value, [0, 1], [0.35, 0.6]);
    else if (state === "listening") opacity = 0.85 + amp.value * 0.15;
    else if (state === "speaking") opacity = 0.9;
    return { opacity };
  });

  const glowStyle = useAnimatedStyle(() => {
    const base = state === "listening" ? 0.15 + amp.value * 0.25 : 0.15;
    return { opacity: state === "thinking" ? 0.1 : base };
  });

  const ring1Style = useAnimatedStyle(() => {
    if (state === "listening") {
      return { transform: [{ scale: 1.3 + amp.value * 0.4 }], opacity: amp.value };
    }
    if (state === "speaking") {
      return { transform: [{ scale: 1.2 + amp.value * 0.5 }], opacity: 0.15 + amp.value * 0.5 };
    }
    return { transform: [{ scale: 1.2 }], opacity: 0 };
  });

  const ring2Style = useAnimatedStyle(() => {
    if (state === "listening") {
      return { transform: [{ scale: 1.6 + amp.value * 0.3 }], opacity: amp.value * 0.6 };
    }
    if (state === "speaking") {
      return { transform: [{ scale: 1.5 + amp.value * 0.5 }], opacity: amp.value * 0.4 };
    }
    return { transform: [{ scale: 1.5 }], opacity: 0 };
  });

  const ring = (sizeMul: number) => ({
    position: "absolute" as const,
    width: BASE * sizeMul,
    height: BASE * sizeMul,
    borderRadius: (BASE * sizeMul) / 2,
    borderWidth: 1.5,
    borderColor: RED,
  });

  return (
    <Pressable
      onPress={onPress}
      hitSlop={24}
      style={{ alignItems: "center", justifyContent: "center", width: BASE * 1.8, height: BASE * 1.8 }}
    >
      <Animated.View style={[ring(1.0), ring2Style]} />
      <Animated.View style={[ring(1.0), ring1Style]} />
      <Animated.View
        style={[
          {
            position: "absolute",
            width: BASE * 1.3,
            height: BASE * 1.3,
            borderRadius: (BASE * 1.3) / 2,
            backgroundColor: RED,
            shadowColor: RED,
            shadowOpacity: 1,
            shadowRadius: 60,
            shadowOffset: { width: 0, height: 0 },
          },
          glowStyle,
        ]}
      />
      <Animated.View
        style={[
          { width: BASE, height: BASE, borderRadius: BASE / 2, backgroundColor: RED },
          coreStyle,
        ]}
      >
        <Animated.View
          style={[{ flex: 1, borderRadius: BASE / 2, backgroundColor: RED }, innerStyle]}
        />
      </Animated.View>
    </Pressable>
  );
}
