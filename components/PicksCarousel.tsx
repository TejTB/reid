import { View, Text, ScrollView } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { C, F, S } from "@/constants/theme";
import GlowCard from "@/components/GlowCard";
import { PICKS, type Pick } from "@/lib/picks";

// Reid's Picks: a horizontal carousel of founder tools. Tap → in-app browser.
export default function PicksCarousel({ delay = 0 }: { delay?: number }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, gap: S.sm + 4 }}
      style={{ marginHorizontal: -20 }}
    >
      {PICKS.map((pick, i) => (
        <PickCard key={pick.id} pick={pick} delay={delay + i * 40} />
      ))}
    </ScrollView>
  );
}

function PickCard({ pick, delay }: { pick: Pick; delay: number }) {
  return (
    <GlowCard
      delay={delay}
      onPress={() => void WebBrowser.openBrowserAsync(pick.url)}
      style={{ width: 152, padding: 16 }}
    >
      <View style={{ gap: 6 }}>
        <Text style={{ fontFamily: F.serifReg, fontSize: 17, color: C.text, letterSpacing: -0.3 }}>
          {pick.name}
        </Text>
        <Text style={{ fontFamily: F.sans, fontSize: 12, lineHeight: 17, color: C.muted }}>
          {pick.tagline}
        </Text>
      </View>
    </GlowCard>
  );
}
