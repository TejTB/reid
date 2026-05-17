import { View, Text, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ArrowLeft } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';

const PRICING_URL = 'https://reid-app.vercel.app/pricing';

export default function UpgradeScreen() {
  const insets = useSafeAreaInsets();

  async function openPricing() {
    await WebBrowser.openBrowserAsync(PRICING_URL);
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bgDark }}>
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 22, paddingBottom: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={16} color={Colors.textDim} />
          <Text style={{ fontFamily: Fonts.sansRegular, fontSize: 13, color: Colors.textDim }}>Back</Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 40 + insets.bottom, paddingTop: 8 }}
      >
        <Text
          style={{
            fontFamily: Fonts.serifRegular,
            color: Colors.textPrimary,
            fontSize: 36,
            letterSpacing: -0.95,
            lineHeight: 40,
          }}
        >
          Reid Pro
        </Text>
        <Text
          style={{
            fontFamily: Fonts.serifItalic,
            color: Colors.textPrimary,
            fontSize: 20,
            lineHeight: 30,
            marginTop: 18,
          }}
        >
          Unlimited sessions. His voice. Every observation.
        </Text>
        <Text style={{ fontFamily: Fonts.sansRegular, color: Colors.textDim, fontSize: 14, marginTop: 12, lineHeight: 22 }}>
          Reid keeps score, hears you out, and pushes back when you{"’"}re drifting. Pro removes the daily limit and unlocks voice playback.
        </Text>

        <View style={{ marginTop: 32, gap: 14 }}>
          <PriceCard
            label="MONTHLY"
            price="$19"
            cadence="per month"
            note="Cancel anytime."
            onPress={openPricing}
          />
          <PriceCard
            label="ANNUAL"
            price="$180"
            cadence="per year"
            note="Save $48."
            onPress={openPricing}
            highlight
          />
        </View>

        <Text
          style={{
            fontFamily: Fonts.sansRegular,
            color: Colors.textDim,
            fontSize: 12,
            marginTop: 24,
            textAlign: 'center',
            lineHeight: 19,
          }}
        >
          Checkout opens in your browser. Once payment clears, Pro unlocks here automatically.
        </Text>
      </ScrollView>
    </View>
  );
}

function PriceCard({
  label,
  price,
  cadence,
  note,
  onPress,
  highlight = false,
}: {
  label: string;
  price: string;
  cadence: string;
  note: string;
  onPress: () => void;
  highlight?: boolean;
}) {
  return (
    <View
      style={{
        backgroundColor: Colors.bgCard,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: highlight ? Colors.accent : Colors.border,
        padding: 22,
      }}
    >
      <Text
        style={{
          fontFamily: Fonts.sansMedium,
          fontSize: 11,
          color: highlight ? Colors.accent : Colors.textDim,
          letterSpacing: 1.4,
        }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 12, gap: 8 }}>
        <Text style={{ fontFamily: Fonts.serifRegular, fontSize: 36, color: Colors.textPrimary, letterSpacing: -1 }}>
          {price}
        </Text>
        <Text style={{ fontFamily: Fonts.sansRegular, fontSize: 13, color: Colors.textDim }}>{cadence}</Text>
      </View>
      <Text style={{ fontFamily: Fonts.sansRegular, fontSize: 13, color: Colors.textDim, marginTop: 6 }}>{note}</Text>
      <Pressable
        onPress={onPress}
        style={{
          marginTop: 18,
          height: 44,
          borderRadius: 9,
          backgroundColor: Colors.accent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: Colors.textPrimary, fontFamily: Fonts.sansMedium, fontSize: 13, letterSpacing: 0.5 }}>
          Open in browser
        </Text>
      </Pressable>
    </View>
  );
}
