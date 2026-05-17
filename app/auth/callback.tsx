// reid://auth/callback — the deep link Supabase opens after the founder
// clicks a magic-link email on this device.
//
// Three formats may land here:
//   1. code  — PKCE flow (the default in current supabase-js). Resolve via
//      supabase.auth.exchangeCodeForSession(code).
//   2. token_hash + type  — older email-OTP / magic-link format. Resolve
//      via supabase.auth.verifyOtp().
//   3. access_token + refresh_token in either query or fragment — implicit
//      flow. Resolve via supabase.auth.setSession().
//
// On success we redirect to `/`, which decides whether to continue
// onboarding or land in /(app)/home based on the user's onboarding_complete
// flag. We confirm the session is persisted with getSession() before
// navigating — without that, the root layout's auth guard can race the
// route change and kick the user back to /login.

import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { C } from '@/constants/theme';

type Params = {
  code?: string | null;
  token_hash?: string | null;
  type?: string | null;
  access_token?: string | null;
  refresh_token?: string | null;
};

function parseAll(url: string): Params {
  const parsed = Linking.parse(url);
  const qp = (parsed.queryParams ?? {}) as Record<string, unknown>;
  const out: Params = {
    code: typeof qp.code === 'string' ? qp.code : null,
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
    if (!out.code) {
      const c = sp.get('code');
      if (c) out.code = c;
    }
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
        const { code, access_token, refresh_token, token_hash, type } = parseAll(target);

        let established = false;
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          established = !error;
        } else if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          established = !error;
        } else if (token_hash && type) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash,
            type: type as 'email' | 'magiclink',
          });
          established = !error;
        }

        if (cancelled) return;
        if (!established) {
          router.replace('/login');
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        router.replace(session ? '/' : '/login');
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
