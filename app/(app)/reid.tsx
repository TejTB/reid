import { useCallback } from "react";
import { View, Text, Pressable } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { StatusBar } from "expo-status-bar";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Settings } from "lucide-react-native";
import { C, F } from "@/constants/theme";
import LogoMark from "@/components/LogoMark";
import ReidOrb from "@/components/ReidOrb";
import { useVoiceSession } from "@/hooks/useVoiceSession";
import { useOrbState } from "@/hooks/useOrbState";
import { reidFetch } from "@/lib/api";
import * as convo from "@/lib/conversationStore";

// The orb IS the app: this is the default landing tab. Voice is primary,
// text chat is the quiet "type instead" fallback.
export default function ReidScreen() {
  const insets = useSafeAreaInsets();
  const vs = useVoiceSession();
  const orb = useOrbState({
    sessionState: vs.sessionState,
    micAmplitude: vs.micAmplitude,
    playbackAmplitude: vs.playbackAmplitude,
  });

  const { hadExchangeRef } = vs;
  // Recap on blur (leaving the tab), not on unmount — tabs stay mounted.
  // Fire-and-forget, only if a real voice turn happened this visit.
  useFocusEffect(
    useCallback(() => {
      return () => {
        const sid = convo.getSnapshot().sessionId;
        if (sid && hadExchangeRef.current) {
          void reidFetch("/api/session-recap", {
            method: "POST",
            body: JSON.stringify({ session_id: sid }),
          }).catch(() => {});
          hadExchangeRef.current = false;
        }
      };
    }, [hadExchangeRef]),
  );

  const status =
    vs.voiceBlocked ? "upgrade to continue"
    : vs.sessionState === "recording" ? "listening…"
    : vs.sessionState === "processing" ? "thinking…"
    : vs.sessionState === "playing" ? "" : "tap to speak";

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="light" />
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, height: 56 + insets.top, flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1 }}><LogoMark size={28} /></View>
        <Pressable onPress={() => router.push("/(app)/plan")} hitSlop={16}>
          <Settings size={22} color={C.textDim} />
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

      <View style={{ height: 72, alignItems: "center", justifyContent: "center", gap: 10, paddingBottom: insets.bottom }}>
        <Pressable disabled={!vs.voiceBlocked} onPress={() => router.push("/upgrade")}>
          <Text style={{ fontFamily: F.sans, fontSize: 12, color: vs.voiceBlocked ? C.red : C.muted, letterSpacing: 0.5 }}>
            {status}
          </Text>
        </Pressable>
        <Pressable onPress={() => router.push("/(app)/chat")} hitSlop={12}>
          <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.textDim, letterSpacing: 0.5 }}>
            type instead
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
