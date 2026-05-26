import 'react-native-gesture-handler';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SplashScreen, Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import {
  PlayfairDisplay_400Regular,
  PlayfairDisplay_700Bold,
  PlayfairDisplay_400Regular_Italic,
  PlayfairDisplay_700Bold_Italic,
} from '@expo-google-fonts/playfair-display';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { theme } from '../lib/theme';
import { ReidLogo } from '../components/shared/ReidLogo';
import { useAuth } from '../hooks/useAuth';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Splash() {
  return (
    <View style={styles.splash}>
      <ReidLogo size={56} />
      <ActivityIndicator color={theme.accent.red} style={{ marginTop: theme.spacing.xl }} />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_700Bold,
    PlayfairDisplay_400Regular_Italic,
    PlayfairDisplay_700Bold_Italic,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  const ready = (fontsLoaded || !!fontError) && !loading;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const group = segments[0]; // 'auth' | 'onboarding' | '(tabs)' | undefined

    if (!user) {
      if (group !== 'auth') router.replace('/auth/login');
      return;
    }

    const onboarded = !!profile?.onboarding_complete;
    if (!onboarded) {
      if (group !== 'onboarding') router.replace('/onboarding/chat');
      return;
    }

    // Onboarded: keep them out of auth/onboarding and off the bare entry.
    if (group === 'auth' || group === 'onboarding' || group === undefined) {
      router.replace('/(tabs)/home');
    }
  }, [ready, user, profile, segments, router]);

  if (!ready) {
    return (
      <GestureHandlerRootView style={styles.flex}>
        <StatusBar style="light" />
        <Splash />
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.bg.primary },
            animation: 'fade',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="auth" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  splash: {
    flex: 1,
    backgroundColor: theme.bg.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
