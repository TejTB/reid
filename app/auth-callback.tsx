import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';

export default function AuthCallback() {
  const params = useLocalSearchParams();

  useEffect(() => {
    async function handle() {
      const tokenHash = (params.token_hash as string | undefined) ?? null;
      const type = (params.type as string | undefined) ?? null;

      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as 'email' | 'magiclink',
        });
        if (!error) {
          router.replace('/');
          return;
        }
      }
      router.replace('/login');
    }
    handle();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bgDark, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={Colors.accent} />
    </View>
  );
}
