import { Stack } from 'expo-router';
import { theme } from '../../lib/theme';

/**
 * Onboarding flow stack. This is a one-way revelation: it cannot be skipped or
 * swiped back. The root layout routes users in here until onboarding_complete
 * flips, and the summary screen `router.replace`s into the app on finish, so
 * these screens never need a back affordance.
 */
export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
        contentStyle: { backgroundColor: theme.bg.primary },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="chat" />
      <Stack.Screen name="summary" />
    </Stack>
  );
}
