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

import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { C, F } from '@/constants/theme';

// DIAGNOSTIC BUILD — remove once magic-link auth is confirmed working.
// Logs every signal we receive and displays them on screen because
// console.log is not visible in an EAS-built release on a physical
// device unless wired to Metro/Xcode. Tap "Continue to /" to manually
// trigger the post-resolve navigation.

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

function preview(v: string | null | undefined, n = 20): string {
  if (!v) return 'null';
  return v.length > n ? `${v.slice(0, n)}…(${v.length})` : v;
}

export default function AuthCallback() {
  const url = Linking.useURL();
  const routeParams = useLocalSearchParams<{
    code?: string;
    token_hash?: string;
    type?: string;
    access_token?: string;
    refresh_token?: string;
  }>();

  const [log, setLog] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const append = (line: string) => {
    console.log('[auth/callback]', line);
    setLog((prev) => [...prev, line]);
  };

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      try {
        append(`Linking.useURL() = ${url ?? 'null'}`);
        append(
          `useLocalSearchParams = ${JSON.stringify({
            code: preview(routeParams.code, 12),
            token_hash: preview(routeParams.token_hash, 12),
            type: routeParams.type ?? null,
            access_token: preview(routeParams.access_token, 12),
            refresh_token: preview(routeParams.refresh_token, 12),
          })}`,
        );

        const initial = await Linking.getInitialURL();
        append(`Linking.getInitialURL() = ${initial ?? 'null'}`);

        const target = url ?? initial;
        const fromLinkingParse = target ? parseAll(target) : null;
        append(
          `parseAll(target) = ${
            fromLinkingParse
              ? JSON.stringify({
                  code: preview(fromLinkingParse.code, 12),
                  token_hash: preview(fromLinkingParse.token_hash, 12),
                  type: fromLinkingParse.type ?? null,
                  access_token: preview(fromLinkingParse.access_token, 12),
                  refresh_token: preview(fromLinkingParse.refresh_token, 12),
                })
              : 'no target URL'
          }`,
        );

        // Prefer expo-router params (Hypothesis 2: Linking.useURL may be null
        // because expo-router consumed the URL). Fall back to Linking parsing.
        const code = routeParams.code ?? fromLinkingParse?.code ?? null;
        const token_hash =
          routeParams.token_hash ?? fromLinkingParse?.token_hash ?? null;
        const type = routeParams.type ?? fromLinkingParse?.type ?? null;
        const access_token =
          routeParams.access_token ?? fromLinkingParse?.access_token ?? null;
        const refresh_token =
          routeParams.refresh_token ?? fromLinkingParse?.refresh_token ?? null;

        let established = false;
        if (code) {
          append(`Branch: CODE (PKCE). Calling exchangeCodeForSession…`);
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            append(`exchangeCodeForSession ERROR: ${error.message}`);
          } else {
            append(
              `exchangeCodeForSession OK. user=${data?.user?.id ?? 'null'} session=${data?.session ? 'present' : 'null'}`,
            );
          }
          established = !error;
        } else if (access_token && refresh_token) {
          append(`Branch: ACCESS_TOKEN. Calling setSession…`);
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (error) append(`setSession ERROR: ${error.message}`);
          else append(`setSession OK`);
          established = !error;
        } else if (token_hash && type) {
          append(`Branch: TOKEN_HASH (${type}). Calling verifyOtp…`);
          const { error } = await supabase.auth.verifyOtp({
            token_hash,
            type: type as 'email' | 'magiclink',
          });
          if (error) append(`verifyOtp ERROR: ${error.message}`);
          else append(`verifyOtp OK`);
          established = !error;
        } else {
          append(`Branch: NONE — no usable params. Will redirect to /login.`);
        }

        if (cancelled) return;
        if (!established) {
          append(`Not established. Stopping (would redirect to /login).`);
          setDone(true);
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        append(`getSession() after resolve: ${session ? 'present' : 'null'}`);
        if (cancelled) return;
        append(`Ready. Tap "Continue" to navigate.`);
        setDone(true);
      } catch (e) {
        append(`THROWN: ${e instanceof Error ? e.message : String(e)}`);
        setDone(true);
      }
    }
    void resolve();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: 16, paddingTop: 60 }}>
      <Text style={{ color: C.text, fontFamily: F.serifReg, fontSize: 18, marginBottom: 12 }}>
        Auth callback diagnostic
      </Text>
      <ScrollView style={{ flex: 1, backgroundColor: '#0F1E35', borderRadius: 8, padding: 12 }}>
        {log.map((line, i) => (
          <Text
            key={i}
            style={{
              color: C.text,
              fontFamily: F.sans,
              fontSize: 11,
              lineHeight: 16,
              marginBottom: 6,
            }}
          >
            {line}
          </Text>
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <Pressable
          onPress={() => router.replace('/')}
          disabled={!done}
          style={{
            flex: 1,
            backgroundColor: C.red,
            borderRadius: 8,
            paddingVertical: 12,
            alignItems: 'center',
            opacity: done ? 1 : 0.4,
          }}
        >
          <Text style={{ color: C.text, fontFamily: F.sansMed, fontSize: 13 }}>
            Continue to /
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.replace('/login')}
          style={{
            flex: 1,
            backgroundColor: 'transparent',
            borderRadius: 8,
            borderWidth: 1,
            borderColor: C.border,
            paddingVertical: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: C.text, fontFamily: F.sansMed, fontSize: 13 }}>
            Back to /login
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
