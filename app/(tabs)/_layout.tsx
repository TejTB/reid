/**
 * Tab navigator shell.
 *
 * Renders the four primary tabs (home / plan / goals / sessions) with our custom
 * blurred TabBar, and overlays the always-present FloatingOrb centered in the
 * tab bar's reserved center gap. The orb is self-contained (it opens its own
 * chat modal); we only position it. `pointerEvents="box-none"` lets taps pass
 * through the wrapper everywhere except on the orb itself.
 */
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabBar } from '../../components/shared/TabBar';
import { FloatingOrb } from '../../components/orb/FloatingOrb';
import { theme } from '../../lib/theme';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: theme.bg.primary },
      }}
      tabBar={(props) => (
        <>
          <TabBar {...props} />
          <View
            pointerEvents="box-none"
            style={[styles.orbLayer, { bottom: insets.bottom + 14 }]}
          >
            <FloatingOrb />
          </View>
        </>
      )}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="plan" />
      <Tabs.Screen name="goals" />
      <Tabs.Screen name="sessions" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  orbLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
  },
});
