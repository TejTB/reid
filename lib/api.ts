import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, SUPABASE_STORAGE_KEY } from './supabase';

const BASE = process.env.EXPO_PUBLIC_API_URL!;

type PersistedSession = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
};

async function getAccessToken(): Promise<string | null> {
  // Primary path — the in-memory client cache.
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    // DIAGNOSTIC — remove once 401s are confirmed gone.
    console.log('[reidFetch] session via getSession()', {
      user: session.user?.id,
      expires_at: session.expires_at,
    });
    return session.access_token;
  }
  // Fallback — read the persisted blob from AsyncStorage. Covers the case
  // where the in-memory cache hasn't hydrated yet at first fetch after launch.
  try {
    const raw = await AsyncStorage.getItem(SUPABASE_STORAGE_KEY);
    if (!raw) {
      console.log('[reidFetch] no session — getSession() null AND no AsyncStorage row');
      return null;
    }
    const parsed = JSON.parse(raw) as PersistedSession;
    if (parsed.access_token) {
      console.log('[reidFetch] session via AsyncStorage fallback', {
        expires_at: parsed.expires_at,
      });
      return parsed.access_token;
    }
    console.log('[reidFetch] AsyncStorage row has no access_token');
    return null;
  } catch (e) {
    console.log('[reidFetch] AsyncStorage read threw', e);
    return null;
  }
}

export async function reidFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  return fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
}
