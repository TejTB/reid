import { useEffect } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { MessageCircle } from "lucide-react-native";
import { C, R } from "@/constants/theme";

// Segmented voice⇄text switch — an Apple-style "liquid glass" slider. A frosted
// pill slides under the active side (transform only, ~200ms, no bounce). The
// active icon tints to the accent so the current mode is obvious. Used on both
// the voice (Reid) and text (chat) surfaces; it switches modes on the SAME
// continuous conversation — the parent just navigates, the conversationStore is
// shared so nothing restarts.
export type ConvMode = "voice" | "text";

const SEG_W = 44; // width of each segment / the sliding pill
const SEG_H = 30; // height of the sliding pill
const PAD = 3; // inner padding around the pill
const TRACK_W = SEG_W * 2 + PAD * 2;
const TRACK_H = SEG_H + PAD * 2;

type Props = { mode: ConvMode; onChange: (next: ConvMode) => void };

export default function ModeToggle({ mode, onChange }: Props) {
  // 0 = voice (left), 1 = text (right).
  const pos = useSharedValue(mode === "text" ? 1 : 0);

  // Settle to the active side when the surface's mode is known/changes.
  useEffect(() => {
    pos.value = withTiming(mode === "text" ? 1 : 0, {
      duration: 200,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [mode, pos]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: PAD + pos.value * SEG_W }],
  }));

  // Tap the inactive side → slide the pill across, then hand control to the
  // parent (which navigates) exactly when the 200ms slide finishes.
  const select = (next: ConvMode) => {
    if (next === mode) return;
    pos.value = withTiming(
      next === "text" ? 1 : 0,
      { duration: 200, easing: Easing.inOut(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(onChange)(next);
      },
    );
  };

  const voiceActive = mode === "voice";
  const textActive = mode === "text";

  return (
    <View
      style={{
        width: TRACK_W,
        height: TRACK_H,
        borderRadius: R.pill,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: C.border,
      }}
    >
      {/* Frosted backdrop — real backdrop-blur via expo-blur, tinted with the
          design-system glass surface on top. */}
      <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: C.surfaceGlass }]} />

      {/* The sliding "liquid glass" pill. */}
      <Animated.View
        style={[
          {
            position: "absolute",
            top: PAD,
            left: 0,
            width: SEG_W,
            height: SEG_H,
            borderRadius: R.pill,
            backgroundColor: "rgba(255,255,255,0.10)",
            borderWidth: 1,
            borderColor: C.border,
          },
          indicatorStyle,
        ]}
      />

      <View style={{ flexDirection: "row", paddingHorizontal: PAD, paddingVertical: PAD }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voice mode"
          accessibilityState={{ selected: voiceActive }}
          onPress={() => select("voice")}
          hitSlop={6}
          style={{ width: SEG_W, height: SEG_H, alignItems: "center", justifyContent: "center" }}
        >
          {/* The orb, as a small glowing crimson dot. */}
          <View
            style={{
              width: 13,
              height: 13,
              borderRadius: 7,
              backgroundColor: C.red,
              opacity: voiceActive ? 1 : 0.4,
              shadowColor: C.red,
              shadowOpacity: voiceActive ? 0.9 : 0,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 0 },
            }}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Text mode"
          accessibilityState={{ selected: textActive }}
          onPress={() => select("text")}
          hitSlop={6}
          style={{ width: SEG_W, height: SEG_H, alignItems: "center", justifyContent: "center" }}
        >
          <MessageCircle
            size={16}
            color={textActive ? C.red : C.textDim}
            strokeWidth={2.2}
          />
        </Pressable>
      </View>
    </View>
  );
}
