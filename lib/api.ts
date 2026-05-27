import { router } from 'expo-router';
import { supabase } from './supabase';

const BASE = process.env.EXPO_PUBLIC_API_URL!;

async function getAccessToken(): Promise<string | null> {
  // Try in-memory session first
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) return session.access_token;

  // Force refresh from storage
  const { data: { session: refreshed } } = await supabase.auth.refreshSession();
  if (refreshed?.access_token) return refreshed.access_token;

  return null;
}

export async function reidFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  if (!token) {
    router.replace('/login');
    throw new Error('Not signed in');
  }
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  return fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
}

// Asks the web app's admin-backed sync endpoint to ensure a public.users
// row exists for the current auth user. Safe to call repeatedly: the server
// is idempotent. Returns true on success.
export async function ensureUserRowSynced(): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) return false;
  try {
    const res = await fetch(`${BASE}/api/auth/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    return res.ok;
  } catch (err) {
    console.error('[ensureUserRowSynced] failed:', err);
    return false;
  }
}
