import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';

const BEGIN_DELAY_MS = 6000;

export default function OnboardingIntro() {
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
    router.push('/onboarding/chat');
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: Colors.bgDark,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
      }}
    >
      <View style={{ width: '100%', maxWidth: 360, alignItems: 'center' }}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: Colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: Colors.textPrimary, fontFamily: Fonts.serifRegular, fontSize: 24 }}>R</Text>
        </View>

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

        <View style={{ width: '100%', alignItems: 'center', marginTop: 28, gap: 22 }}>
          <Text
            style={{
              fontFamily: Fonts.serifItalic,
              color: Colors.textPrimary,
              fontSize: 20,
              lineHeight: 30,
              textAlign: 'center',
              maxWidth: 320,
            }}
          >
            I{"’"}m Reid. I help founders cut the noise.
          </Text>
          <Text
            style={{
              fontFamily: Fonts.sansRegular,
              color: Colors.textDim,
              fontSize: 14,
              lineHeight: 22,
              textAlign: 'center',
              maxWidth: 320,
            }}
          >
            Ten questions. Then we get to work.
          </Text>

          <Animated.View style={{ opacity: fade, marginTop: 6 }}>
            <Pressable
              onPress={handleBegin}
              disabled={!revealed || pressed}
              style={{
                height: 46,
                minWidth: 180,
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
