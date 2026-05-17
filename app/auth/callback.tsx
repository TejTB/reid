// reid://auth/callback — the deep link Supabase opens after the founder
// clicks a magic-link email on this device.
//
// Two formats may land here:
//   1. token_hash + type  — Supabase magic-link/email OTP. Resolve via
//      supabase.auth.verifyOtp().
//   2. access_token + refresh_token in either query or fragment — the
//      direct-session format used by some Supabase setups. Resolve via
//      supabase.auth.setSession().
//
// On success we route into the root index.tsx, which decides whether to
// continue onboarding or land in /(app)/home based on the user's
// onboarding_complete flag.

import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { C } from '@/constants/theme';

type Params = {
  token_hash?: string | null;
  type?: string | null;
  access_token?: string | null;
  refresh_token?: string | null;
};

function parseAll(url: string): Params {
  const parsed = Linking.parse(url);
  const qp = (parsed.queryParams ?? {}) as Record<string, unknown>;
  const out: Params = {
    token_hash: typeof qp.token_hash === 'string' ? qp.token_hash : null,
    type: typeof qp.type === 'string' ? qp.type : null,
    access_token: typeof qp.access_token === 'string' ? qp.access_token : null,
    refresh_token: typeof qp.refresh_token === 'string' ? qp.refresh_token : null,
  };
  // Supabase sometimes returns the tokens in the URL fragment (#...).
  const hashIdx = url.indexOf('#');
  if (hashIdx !== -1) {
    const fragment = url.slice(hashIdx + 1);
    const sp = new URLSearchParams(fragment);
    const at = sp.get('access_token');
    const rt = sp.get('refresh_token');
    if (at) out.access_token = at;
    if (rt) out.refresh_token = rt;
    if (!out.token_hash) {
      const th = sp.get('token_hash');
      if (th) out.token_hash = th;
    }
    if (!out.type) {
      const t = sp.get('type');
      if (t) out.type = t;
    }
  }
  return out;
}

export default function AuthCallback() {
  const url = Linking.useURL();

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      try {
        const target = url ?? (await Linking.getInitialURL());
        if (!target) {
          if (!cancelled) router.replace('/login');
          return;
        }
        const { access_token, refresh_token, token_hash, type } = parseAll(target);

        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (cancelled) return;
          router.replace(error ? '/login' : '/');
          return;
        }

        if (token_hash && type) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash,
            type: type as 'email' | 'magiclink',
          });
          if (cancelled) return;
          router.replace(error ? '/login' : '/');
          return;
        }

        if (!cancelled) router.replace('/login');
      } catch {
        if (!cancelled) router.replace('/login');
      }
    }
    void resolve();
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: C.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <ActivityIndicator color={C.red} />
    </View>
  );
}
