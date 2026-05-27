import { useEffect, useState } from 'react';
import { Tabs, usePathname } from 'expo-router';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Home,
  Target,
  MessageCircle,
  Eye,
  LayoutList,
  CheckSquare,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { C, F } from '@/constants/theme';

const LAST_SEEN_KEY = 'reid:lastSeenReidMessageAt';
const INACTIVE_COLOR = 'rgba(242,237,227,0.35)';

// Wraps each icon to:
//   1. Draw the 2px red rail above when focused
//   2. Pulse-scale (1 → 1.15 → 1) every time `focused` flips to true
function TabIconShell({
  focused,
  children,
}: {
  focused: boolean;
  children: React.ReactNode;
}) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (focused) {
      scale.value = withSequence(
        withSpring(1.15, { damping: 10, stiffness: 260 }),
        withSpring(1, { damping: 12, stiffness: 220 }),
      );
    }
  }, [focused, scale]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={{ alignItems: 'center', justifyContent: 'flex-start', height: 28, paddingTop: 4 }}>
      <View
        style={{
          width: 18,
          height: 2,
          borderRadius: 1,
          backgroundColor: focused ? C.red : 'transparent',
          marginBottom: 4,
        }}
      />
      <Animated.View style={style}>{children}</Animated.View>
    </View>
  );
}

function ReidIcon({ color, focused, badge }: { color: string; focused: boolean; badge: boolean }) {
  return (
    <TabIconShell focused={focused}>
      <View>
        <MessageCircle size={20} color={color} />
        {badge && (
          <View
            style={{
              position: 'absolute',
              top: -2,
              right: -3,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: C.red,
              borderWidth: 1,
              borderColor: C.bg,
            }}
          />
        )}
      </View>
    </TabIconShell>
  );
}

export default function AppLayout() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const [unread, setUnread] = useState(false);

  // Refresh the unread-Reid badge whenever the route changes. Cheap: a single
  // Supabase query for the latest assistant turn + one AsyncStorage read.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          if (!cancelled) setUnread(false);
          return;
        }
        const { data: userRow } = await supabase
          .from('users')
          .select('id')
          .eq('auth_id', session.user.id)
          .maybeSingle();
        const uid = (userRow?.id as string | undefined) ?? null;
        if (!uid) {
          if (!cancelled) setUnread(false);
          return;
        }
        const { data: lastMsg } = await supabase
          .from('conversations')
          .select('created_at')
          .eq('user_id', uid)
          .eq('role', 'assistant')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const lastIso = (lastMsg?.created_at as string | undefined) ?? null;
        const seenIso = await AsyncStorage.getItem(LAST_SEEN_KEY);
        if (cancelled) return;
        if (!lastIso) {
          setUnread(false);
          return;
        }
        if (!seenIso) {
          setUnread(true);
          return;
        }
        setUnread(new Date(lastIso).getTime() > new Date(seenIso).getTime());
      } catch {
        if (!cancelled) setUnread(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // When the user lands on the Reid tab, clear the badge.
  useEffect(() => {
    if (pathname?.endsWith('/chat')) {
      void AsyncStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
      setUnread(false);
    }
  }, [pathname]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: C.bg,
          borderTopColor: C.border,
          borderTopWidth: 1,
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 8,
        },
        tabBarActiveTintColor: C.text,
        tabBarInactiveTintColor: INACTIVE_COLOR,
        tabBarLabelStyle: {
          fontFamily: F.sans,
          fontSize: 10,
          letterSpacing: 0.4,
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <TabIconShell focused={focused}>
              <Home size={20} color={color} />
            </TabIconShell>
          ),
        }}
      />
      <Tabs.Screen
        name="goals"
        options={{
          title: 'Goals',
          tabBarIcon: ({ color, focused }) => (
            <TabIconShell focused={focused}>
              <Target size={20} color={color} />
            </TabIconShell>
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Reid',
          tabBarIcon: ({ color, focused }) => (
            <ReidIcon color={color} focused={focused} badge={unread} />
          ),
        }}
      />
      <Tabs.Screen
        name="noticed"
        options={{
          title: 'Noticed',
          tabBarIcon: ({ color, focused }) => (
            <TabIconShell focused={focused}>
              <Eye size={20} color={color} />
            </TabIconShell>
          ),
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: 'Plan',
          tabBarIcon: ({ color, focused }) => (
            <TabIconShell focused={focused}>
              <LayoutList size={20} color={color} />
            </TabIconShell>
          ),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tasks',
          tabBarIcon: ({ color, focused }) => (
            <TabIconShell focused={focused}>
              <CheckSquare size={20} color={color} />
            </TabIconShell>
          ),
        }}
      />
    </Tabs>
  );
}
