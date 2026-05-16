import { useEffect, useRef, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  PlayfairDisplay_400Regular,
  PlayfairDisplay_400Regular_Italic,
} from '@expo-google-fonts/playfair-display';
import { Inter_400Regular, Inter_500Medium } from '@expo-google-fonts/inter';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { View, AppState, Text, Pressable } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { Colors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { authenticateWithBiometrics, markActive, shouldRequireBiometric } from '@/lib/biometrics';

export default function RootLayout() {
  const [, setSession] = useState<Session | null>(null);
  const [locked, setLocked] = useState(false);
  const lastState = useRef<AppStateStatus>(AppState.currentState);
  const [fontsLoaded] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_400Regular_Italic,
    Inter_400Regular,
    Inter_500Medium,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (next) => {
      const prev = lastState.current;
      lastState.current = next;
      if (prev === 'active' && next.match(/inactive|background/)) {
        await markActive();
        return;
      }
      if (next === 'active') {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const needs = await shouldRequireBiometric();
        if (needs) {
          setLocked(true);
          const ok = await authenticateWithBiometrics();
          if (ok) {
            await markActive();
            setLocked(false);
          }
        }
      }
    });
    return () => {
      sub.remove();
    };
  }, []);

  async function tryUnlock() {
    const ok = await authenticateWithBiometrics();
    if (ok) {
      await markActive();
      setLocked(false);
    }
  }

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: Colors.bgDark }} />;
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bgDark } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="auth-callback" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="upgrade" />
      </Stack>
      {locked && (
        <View
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: Colors.bgDark,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            gap: 22,
          }}
        >
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
          <Text style={{ fontFamily: Fonts.serifItalic, color: Colors.textPrimary, fontSize: 22 }}>
            Locked
          </Text>
          <Pressable
            onPress={tryUnlock}
            style={{
              height: 44,
              paddingHorizontal: 22,
              borderRadius: 9,
              backgroundColor: Colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: Colors.textPrimary, fontFamily: Fonts.sansMedium, fontSize: 13, letterSpacing: 0.52 }}>
              Unlock
            </Text>
          </Pressable>
        </View>
      )}
    </>
  );
}
