import { useCallback, useEffect } from "react";
import { View, Text, Pressable, AppState } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { StatusBar } from "expo-status-bar";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Settings } from "lucide-react-native";
import { C, F } from "@/constants/theme";
import LogoMark from "@/components/LogoMark";
import ModeToggle from "@/components/ModeToggle";
import Orb from "@/components/Orb";
import { useVoiceSession } from "@/hooks/useVoiceSession";
import { useOrbState } from "@/hooks/useOrbState";
import { fireRecap } from "@/lib/recap";
import * as convo from "@/lib/conversationStore";

// The orb IS the app: this is the default landing tab. Voice is primary; the
// top-right toggle drops into the SAME conversation as text ("type instead").
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
  // Only if a real voice turn happened this visit.
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (hadExchangeRef.current) {
          fireRecap(convo.getSnapshot().sessionId);
          hadExchangeRef.current = false;
        }
      };
    }, [hadExchangeRef]),
  );

  // Recap on app background too. A session that ends because the user
  // backgrounds (or force-quits) the app must still be summarised — otherwise
  // Reid has no memory of it next time. Fired early on the background
  // transition so the request has a chance to leave before suspension.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if ((next === "background" || next === "inactive") && hadExchangeRef.current) {
        fireRecap(convo.getSnapshot().sessionId);
      }
    });
    return () => sub.remove();
  }, [hadExchangeRef]);

  const status =
    vs.error ? vs.error
    : vs.voiceBlocked ? "upgrade to continue"
    : vs.sessionState === "recording" ? "listening…"
    : vs.sessionState === "processing" ? "thinking…"
    : vs.sessionState === "playing" ? ""
    : "tap to speak";

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="light" />
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, height: 56 + insets.top, flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1 }}><LogoMark size={28} /></View>
        <Pressable onPress={() => router.push("/(app)/plan")} hitSlop={12} style={{ marginRight: 16 }}>
          <Settings size={22} color={C.textDim} />
        </Pressable>
        {/* Voice⇄text toggle. Same continuous conversation (shared
            conversationStore + session) — switching only changes modality. */}
        <ModeToggle
          mode="voice"
          onChange={(m) => {
            if (m === "text") router.push("/(app)/chat");
          }}
        />
      </View>

      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Orb
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

      <View style={{ height: 72, alignItems: "center", justifyContent: "center", paddingBottom: insets.bottom }}>
        <Pressable disabled={!vs.voiceBlocked} onPress={() => router.push("/upgrade")}>
          <Text style={{ fontFamily: F.sans, fontSize: 12, color: vs.error || vs.voiceBlocked ? C.red : C.muted, letterSpacing: 0.5, textAlign: "center" }}>
            {status}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
