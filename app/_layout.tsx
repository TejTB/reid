import { useEffect, useRef, useState } from 'react';
import { Stack, router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useFonts,
  PlayfairDisplay_400Regular,
  PlayfairDisplay_400Regular_Italic,
  PlayfairDisplay_700Bold_Italic,
} from '@expo-google-fonts/playfair-display';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { View, AppState, Text, Pressable } from 'react-native';
import type { AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { C, F } from '@/constants/theme';
import LogoMark from '@/components/LogoMark';
import {
  authenticateWithBiometrics,
  markActive,
  shouldRequireBiometric,
} from '@/lib/biometrics';

void SplashScreen.preventAutoHideAsync();

// Routes that must never gate-redirect to /login (the auth flow itself).
const PUBLIC_PREFIXES = ['/login'];

function isPublicRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default function RootLayout() {
  const pathname = usePathname();
  const [sessionReady, setSessionReady] = useState(false);
  const sessionRef = useRef<Session | null>(null);
  const [locked, setLocked] = useState(false);
  const lastState = useRef<AppStateStatus>(AppState.currentState);
  const [fontsLoaded] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_400Regular_Italic,
    PlayfairDisplay_700Bold_Italic,
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
  });

  // Initial session hydrate + ongoing auth state changes.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      sessionRef.current = session;
      setSessionReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      sessionRef.current = next;
      // If the user signed out, kick them back to login.
      if (!next && !isPublicRoute(pathname)) {
        router.replace('/login');
      }
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
    // pathname intentionally omitted: the subscription closes over the latest
    // pathname via the outer scope; we only want to subscribe/unsubscribe once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Route-level auth guard: any time the route changes AND we have a known
  // session state, kick unauthenticated users to /login (except on public
  // routes).
  useEffect(() => {
    if (!sessionReady) return;
    const session = sessionRef.current;
    if (!session && !isPublicRoute(pathname)) {
      router.replace('/login');
    }
  }, [pathname, sessionReady]);

  // Hide the splash once fonts are ready and we know the auth state.
  useEffect(() => {
    if (fontsLoaded && sessionReady) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, sessionReady]);

  // Foreground/background transition + biometric re-lock.
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

  // Notification tap → deep-link into the requested in-app route.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data && typeof data === 'object' && 'route' in data) {
        const route = (data as { route?: unknown }).route;
        if (typeof route === 'string' && route.startsWith('/')) {
          // Cast through unknown to keep typedRoutes strict at the type
          // level while allowing dynamic notification payloads.
          router.push(route as unknown as Parameters<typeof router.push>[0]);
        }
      }
    });
    return () => sub.remove();
  }, []);

  async function tryUnlock() {
    const ok = await authenticateWithBiometrics();
    if (ok) {
      await markActive();
      setLocked(false);
    }
  }

  if (!fontsLoaded || !sessionReady) {
    return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: C.bg },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="upgrade" options={{ presentation: 'modal' }} />
        <Stack.Screen name="voice" options={{ presentation: 'fullScreenModal' }} />
      </Stack>
      {locked && <LockedOverlay onUnlock={tryUnlock} />}
    </SafeAreaProvider>
  );
}

function LockedOverlay({ onUnlock }: { onUnlock: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: C.bg,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 24,
        gap: 22,
      }}
    >
      <LogoMark size={56} />
      <Text style={{ fontFamily: F.serifItalic, color: C.text, fontSize: 22 }}>Locked</Text>
      <Pressable
        onPress={onUnlock}
        style={{
          height: 44,
          paddingHorizontal: 24,
          borderRadius: 9,
          backgroundColor: C.red,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            color: C.text,
            fontFamily: F.sansMed,
            fontSize: 13,
            letterSpacing: 0.5,
          }}
        >
          Unlock
        </Text>
      </Pressable>
    </View>
  );
}
