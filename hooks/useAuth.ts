import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, getProfile, type Profile } from '../lib/supabase';

export type UseAuth = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<Profile | null>;
};

/**
 * Auth state for the app. Auth *decisions* always come from getUser() (verified
 * server-side), never getSession(). onAuthStateChange is used only as a trigger
 * to re-verify.
 */
export function useAuth(): UseAuth {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    const p = await getProfile();
    setProfile(p);
    return p;
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const verified = await supabase.auth.getUser();
      if (!mounted) return;
      const u = verified.data.user ?? null;
      setUser(u);
      setProfile(u ? await getProfile() : null);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async () => {
      const verified = await supabase.auth.getUser();
      if (!mounted) return;
      const u = verified.data.user ?? null;
      setUser(u);
      setProfile(u ? await getProfile() : null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const cleanEmail = email.trim();
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: { data: { name: name.trim() } },
    });
    if (error) throw error;

    // If email confirmation is enabled there's no session yet — try to sign in.
    if (!data.session) {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (signInErr) {
        throw new Error('Account created — confirm your email, then sign in.');
      }
    }

    // The on_auth_user_created trigger inserts the profile row (auth_id + email)
    // but not the name. Set it once the row is visible.
    for (let attempt = 0; attempt < 5; attempt++) {
      const p = await getProfile();
      if (p) {
        if (name.trim() && p.name !== name.trim()) {
          await supabase.from('users').update({ name: name.trim() }).eq('id', p.id);
        }
        break;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return { user, profile, loading, signIn, signUp, signOut, refreshProfile };
}
