import { useEffect, useRef } from "react";
import { View, Text, Pressable } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, F } from "@/constants/theme";
import LogoMark from "@/components/LogoMark";
import ReidOrb from "@/components/ReidOrb";
import { useVoiceSession } from "@/hooks/useVoiceSession";
import { useOrbState } from "@/hooks/useOrbState";
import * as convo from "@/lib/conversationStore";

// Voice-first onboarding: Reid SPEAKS first, the user answers by voice.
// Text onboarding (/onboarding/chat) is the quiet fallback.
export default function OnboardingVoice() {
  const insets = useSafeAreaInsets();
  const vs = useVoiceSession({
    mode: "onboarding",
    gate: false, // first contact is always free
    onComplete: () => router.replace("/(app)/reid"),
  });
  const orb = useOrbState({
    sessionState: vs.sessionState,
    micAmplitude: vs.micAmplitude,
    playbackAmplitude: vs.playbackAmplitude,
  });

  // On mount: fresh conversation, then Reid opens (speak-first).
  const started = useRef(false);
  const { kickoff } = vs;
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    convo.reset();
    void kickoff();
  }, [kickoff]);

  const status =
    vs.sessionState === "recording" ? "listening…"
    : vs.sessionState === "processing" ? "thinking…"
    : vs.sessionState === "playing" ? ""
    : "tap to answer";

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="light" />
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, height: 56 + insets.top, justifyContent: "center" }}>
        <LogoMark size={28} />
      </View>

      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ReidOrb
          state={orb.state}
          amplitude={orb.amplitude}
          onPress={vs.sessionState === "recording" ? vs.stopRecording : vs.startSession}
        />
      </View>

      <View style={{ minHeight: 120, paddingHorizontal: 28, gap: 10 }}>
        {vs.transcript ? (
          <Animated.Text entering={FadeIn.duration(250)} exiting={FadeOut.duration(300)}
            style={{ fontFamily: F.sans, fontSize: 14, color: C.muted, textAlign: "center" }}>
            {vs.transcript}
          </Animated.Text>
        ) : null}
        {vs.reidResponse ? (
          <Animated.Text entering={FadeIn.duration(300)} exiting={FadeOut.duration(300)}
            style={{ fontFamily: F.serifItalic, fontSize: 20, lineHeight: 28, color: C.text, textAlign: "center" }}>
            {vs.reidResponse}
          </Animated.Text>
        ) : null}
      </View>

      <View style={{ height: 72, alignItems: "center", justifyContent: "center", gap: 10, paddingBottom: insets.bottom }}>
        <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.muted, letterSpacing: 0.5 }}>
          {status}
        </Text>
        <Pressable onPress={() => router.replace("/onboarding/chat")} hitSlop={12}>
          <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.textDim, letterSpacing: 0.5 }}>
            type instead
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
