import { useEffect, useRef } from "react";
import { View, Text, Pressable } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, F } from "@/constants/theme";
import LogoMark from "@/components/LogoMark";
import ReidPulse from "@/components/ReidPulse";
import Orb from "@/components/Orb";
import { useVoiceSession } from "@/hooks/useVoiceSession";
import { useOrbState } from "@/hooks/useOrbState";
import * as convo from "@/lib/conversationStore";

// Voice-first onboarding: Reid SPEAKS first, the user answers by voice.
// Text onboarding (/onboarding/chat) is the quiet fallback — and continues the
// SAME conversation (shared conversationStore + session), it does not restart.
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
  const { kickoff, hadExchangeRef } = vs;
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    convo.reset();
    void kickoff();
  }, [kickoff]);

  // Tap-to-act. In the error state, retry the right thing: if Reid never even
  // opened (no exchange yet), retry the speak-first kickoff; otherwise let the
  // user answer by recording.
  const onOrbPress = () => {
    if (vs.sessionState === "recording") return vs.stopRecording();
    if (vs.sessionState === "error" && !hadExchangeRef.current) return vs.kickoff();
    return vs.startSession();
  };

  const status =
    vs.error ? vs.error
    : vs.sessionState === "recording" ? "listening…"
    : vs.sessionState === "processing" ? "thinking…"
    : vs.sessionState === "playing" ? ""
    : "tap to answer";

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="light" />
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, height: 56 + insets.top, flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1 }}><LogoMark size={28} /></View>
        {/* Voice⇄text toggle — switch onboarding to text WITHOUT restarting it
            (the text screen seeds from the shared conversation + session). */}
        <Pressable
          accessibilityLabel="Type instead"
          onPress={() => router.replace("/onboarding/chat")}
          hitSlop={12}
          style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border, backgroundColor: C.surface }}
        >
          <ReidPulse size={22} />
        </Pressable>
      </View>

      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Orb
          state={orb.state}
          amplitude={orb.amplitude}
          onPress={onOrbPress}
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

      <View style={{ height: 72, alignItems: "center", justifyContent: "center", paddingBottom: insets.bottom }}>
        <Text style={{ fontFamily: F.sans, fontSize: 12, color: vs.error ? C.red : C.muted, letterSpacing: 0.5, textAlign: "center" }}>
          {status}
        </Text>
      </View>
    </View>
  );
}
