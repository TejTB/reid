import { Stack } from 'expo-router';
import { theme } from '../../lib/theme';

/**
 * Auth flow stack. The root layout routes users here when unauthenticated and
 * routes them out the moment auth state flips, so these screens never navigate
 * forward themselves — they only switch between login and signup.
 */
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.bg.primary },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
    </Stack>
  );
}
