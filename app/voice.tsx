import { useEffect } from "react";
import { View, Text, Pressable } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MessageCircle } from "lucide-react-native";
import { C, F } from "@/constants/theme";
import LogoMark from "@/components/LogoMark";
import ReidOrb from "@/components/ReidOrb";
import { useVoiceSession } from "@/hooks/useVoiceSession";
import { useOrbState } from "@/hooks/useOrbState";
import { reidFetch } from "@/lib/api";
import * as convo from "@/lib/conversationStore";

export default function VoiceScreen() {
  const insets = useSafeAreaInsets();
  const vs = useVoiceSession();
  const orb = useOrbState({
    sessionState: vs.sessionState,
    micAmplitude: vs.micAmplitude,
    playbackAmplitude: vs.playbackAmplitude,
  });

  // Recap on exit (fire-and-forget) if this visit had a voice exchange.
  useEffect(() => {
    return () => {
      const sid = convo.getSnapshot().sessionId;
      const hadVoice = convo.getSnapshot().messages.some((m) => m.role === "assistant");
      if (sid && hadVoice) {
        void reidFetch("/api/session-recap", {
          method: "POST",
          body: JSON.stringify({ session_id: sid }),
        }).catch(() => {});
      }
    };
  }, []);

  const status =
    vs.voiceBlocked ? "upgrade to continue"
    : vs.sessionState === "recording" ? "listening…"
    : vs.sessionState === "processing" ? "thinking…"
    : vs.sessionState === "playing" ? "" : "tap to speak";

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="light" hidden />
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, height: 56 + insets.top, flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1 }}><LogoMark size={28} /></View>
        <Pressable onPress={() => router.back()} hitSlop={16}>
          <MessageCircle size={24} color={C.muted} />
        </Pressable>
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

      <View style={{ height: 64, alignItems: "center", justifyContent: "center", paddingBottom: insets.bottom }}>
        <Pressable disabled={!vs.voiceBlocked} onPress={() => router.push("/upgrade")}>
          <Text style={{ fontFamily: F.sans, fontSize: 12, color: vs.voiceBlocked ? C.red : C.muted, letterSpacing: 0.5 }}>
            {status}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
