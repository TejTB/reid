import { router } from 'expo-router';
import { supabase } from './supabase';

const BASE = process.env.EXPO_PUBLIC_API_URL!;

async function getAccessToken(): Promise<string | null> {
  // Try in-memory session first
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    console.log('[reidFetch] token from getSession');
    return session.access_token;
  }

  // Force refresh from storage
  const { data: { session: refreshed } } = await supabase.auth.refreshSession();
  if (refreshed?.access_token) {
    console.log('[reidFetch] token from refreshSession');
    return refreshed.access_token;
  }

  console.log('[reidFetch] no token found');
  return null;
}

export async function reidFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  if (!token) {
    router.replace('/login');
    throw new Error('Not signed in');
  }
  return fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
}
