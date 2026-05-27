import { useEffect } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { ensureUserRowSynced } from '@/lib/api';
import { C } from '@/constants/theme';
import ReidPulse from '@/components/ReidPulse';

export default function Index() {
  useEffect(() => {
    let cancelled = false;

    async function decide() {
      try {
        const { data: { session }, error: sessionError } =
          await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (cancelled) return;

        if (!session) {
          router.replace('/login');
          return;
        }

        // Make sure the public.users row exists (DB trigger usually creates
        // it; this covers races and pre-trigger accounts). Server-side via
        // /api/auth/sync because RLS blocks client inserts.
        const synced = await ensureUserRowSynced();
        if (cancelled) return;
        if (!synced) {
          router.replace('/login');
          return;
        }

        const { data: user, error: userError } = await supabase
          .from('users')
          .select('onboarding_complete')
          .eq('auth_id', session.user.id)
          .maybeSingle();
        if (cancelled) return;
        if (userError) throw userError;

        if (!user) {
          // Sync said ok but row still not visible — bail to login rather
          // than spin forever.
          router.replace('/login');
          return;
        }

        if (user.onboarding_complete) {
          router.replace('/voice');
        } else {
          router.replace('/onboarding');
        }
      } catch (err) {
        console.error('[index] routing decision failed:', err);
        if (!cancelled) router.replace('/login');
      }
    }

    void decide();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: C.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <ReidPulse size={56} />
    </View>
  );
}
