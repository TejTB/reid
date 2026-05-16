import { Tabs } from 'expo-router';
import { Home, Target, MessageCircle, LayoutList, CheckSquare } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.bgDark,
          borderTopColor: Colors.border,
          height: 60,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textDim,
        tabBarLabelStyle: {
          fontFamily: Fonts.sansRegular,
          fontSize: 10,
          letterSpacing: 0.5,
        },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color }) => <Home size={20} color={color} /> }} />
      <Tabs.Screen name="goals" options={{ title: 'Goals', tabBarIcon: ({ color }) => <Target size={20} color={color} /> }} />
      <Tabs.Screen name="chat" options={{ title: 'Reid', tabBarIcon: ({ color }) => <MessageCircle size={20} color={color} /> }} />
      <Tabs.Screen name="plan" options={{ title: 'Plan', tabBarIcon: ({ color }) => <LayoutList size={20} color={color} /> }} />
      <Tabs.Screen name="tasks" options={{ title: 'Tasks', tabBarIcon: ({ color }) => <CheckSquare size={20} color={color} /> }} />
    </Tabs>
  );
}
