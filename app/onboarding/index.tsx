import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import LogoMark from '@/components/LogoMark';

const BEGIN_DELAY_MS = 6000;

export default function OnboardingIntro() {
  const insets = useSafeAreaInsets();
  const [revealed, setRevealed] = useState(false);
  const [pressed, setPressed] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const t = setTimeout(() => {
      setRevealed(true);
      Animated.timing(fade, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }).start();
    }, BEGIN_DELAY_MS);
    return () => clearTimeout(t);
  }, [fade]);

  function handleBegin() {
    if (pressed) return;
    setPressed(true);
    // Voice-first: Reid's first contact is spoken. The Begin tap is the user
    // gesture that anchors audio playback. Text onboarding is the fallback.
    router.push('/onboarding/voice');
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: Colors.bgDark,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 32,
      }}
    >
      <View style={{ width: '100%', maxWidth: 360, alignItems: 'center' }}>
        <LogoMark size={48} />

        <Text
          style={{
            fontFamily: Fonts.serifRegular,
            color: Colors.textPrimary,
            fontSize: 34,
            letterSpacing: -0.68,
            lineHeight: 39,
            marginTop: 20,
            textAlign: 'center',
          }}
        >
          Reid
        </Text>

        <View style={{ width: '100%', alignItems: 'center', marginTop: 28, gap: 12 }}>
          <Text
            style={{
              fontFamily: Fonts.serifRegular,
              color: Colors.textPrimary,
              fontSize: 34,
              lineHeight: 40,
              letterSpacing: -0.5,
              textAlign: 'center',
              maxWidth: 320,
            }}
          >
            Your co-founder. Always on.
          </Text>

          <Text
            style={{
              fontFamily: Fonts.serifItalic,
              color: Colors.textDim,
              fontSize: 16,
              lineHeight: 22,
              textAlign: 'center',
              marginTop: 12,
            }}
          >
            I{"’"}ve been waiting.
          </Text>

          <Animated.View style={{ opacity: fade, marginTop: 22, width: '100%' }}>
            <Pressable
              onPress={handleBegin}
              disabled={!revealed || pressed}
              style={{
                height: 46,
                width: '100%',
                borderRadius: 9,
                backgroundColor: Colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 24,
                opacity: pressed ? 0.6 : 1,
              }}
            >
              <Text
                style={{
                  fontFamily: Fonts.sansMedium,
                  fontSize: 13,
                  color: Colors.textPrimary,
                  letterSpacing: 0.52,
                }}
              >
                Begin
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}
