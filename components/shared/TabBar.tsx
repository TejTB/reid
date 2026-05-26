import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { theme } from '../../lib/theme';

type FeatherName = keyof typeof Feather.glyphMap;

/** The four tabs we render, in display order, with their Feather icon + label. */
const TABS: { name: string; icon: FeatherName; label: string }[] = [
  { name: 'home', icon: 'home', label: 'Home' },
  { name: 'plan', icon: 'check-square', label: 'Plan' },
  { name: 'goals', icon: 'target', label: 'Goals' },
  { name: 'sessions', icon: 'clock', label: 'Sessions' },
];

const BAR_HEIGHT = 72;
const CENTER_GAP = 68;
const INDICATOR_WIDTH = 2;
const INDICATOR_HEIGHT = 16;

/**
 * Custom bottom tab bar. Renders exactly the home/plan/goals/sessions tabs
 * split into two halves with a center gap reserved for the floating orb (which
 * a separate component renders). A red top indicator slides to the active tab.
 */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  // Build the ordered, filtered list of routes we actually render, paired with
  // each tab's icon/label. Anything not in TABS (e.g. hidden routes) is dropped.
  const items = TABS.map((tab) => {
    const route = state.routes.find((r) => r.name === tab.name);
    return route ? { ...tab, key: route.key } : null;
  }).filter((item): item is { name: string; icon: FeatherName; label: string; key: string } =>
    item !== null,
  );

  const activeRouteName = state.routes[state.index]?.name;

  const left = items.slice(0, 2);
  const right = items.slice(2);

  const onPress = (routeName: string, routeKey: string, isFocused: boolean) => {
    void Haptics.selectionAsync();
    const event = navigation.emit({
      type: 'tabPress',
      target: routeKey,
      canPreventDefault: true,
    });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(routeName);
    }
  };

  const renderTab = (item: { name: string; icon: FeatherName; label: string; key: string }) => {
    const isFocused = item.name === activeRouteName;
    return (
      <Pressable
        key={item.key}
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        accessibilityLabel={item.label}
        onPress={() => onPress(item.name, item.key, isFocused)}
        style={styles.tab}
      >
        {isFocused ? <ActiveIndicator /> : null}
        <Feather
          name={item.icon}
          size={22}
          color={isFocused ? theme.text.primary : theme.text.dim}
        />
        <Text
          style={[styles.label, isFocused ? styles.labelActive : styles.labelInactive]}
          numberOfLines={1}
        >
          {item.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { height: BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom }]}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={styles.row}>
        <View style={styles.side}>{left.map(renderTab)}</View>
        <View style={styles.centerGap} pointerEvents="none" />
        <View style={styles.side}>{right.map(renderTab)}</View>
      </View>
    </View>
  );
}

/** A 2x16 red bar that fades/slides in at the top of the active tab. */
function ActiveIndicator() {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, [progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scaleY: 0.6 + progress.value * 0.4 }],
  }));

  return <Animated.View style={[styles.indicator, style]} />;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.bg.overlay,
    borderTopWidth: 1,
    borderTopColor: theme.border.subtle,
  },
  row: {
    flexDirection: 'row',
    height: BAR_HEIGHT,
  },
  side: {
    flex: 1,
    flexDirection: 'row',
  },
  centerGap: {
    width: CENTER_GAP,
  },
  tab: {
    flex: 1,
    height: BAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicator: {
    position: 'absolute',
    top: 0,
    width: INDICATOR_WIDTH,
    height: INDICATOR_HEIGHT,
    borderRadius: 2,
    backgroundColor: theme.accent.red,
  },
  label: {
    fontSize: 10,
    marginTop: 3,
  },
  labelActive: {
    fontFamily: theme.font.bodyMedium,
    color: theme.text.primary,
  },
  labelInactive: {
    fontFamily: theme.font.body,
    color: theme.text.dim,
  },
});
