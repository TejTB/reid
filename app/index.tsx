import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';

export default function Index() {
  useEffect(() => {
    async function decide() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }
      const { data: user } = await supabase
        .from('users')
        .select('onboarding_complete')
        .eq('auth_id', session.user.id)
        .maybeSingle();
      if (!user?.onboarding_complete) {
        router.replace('/onboarding');
      } else {
        router.replace('/(app)/home');
      }
    }
    decide();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bgDark, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={Colors.accent} />
    </View>
  );
}
