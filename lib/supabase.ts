import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Pinned so lib/api.ts can read the persisted session blob directly
// when getSession()'s in-memory cache hasn't hydrated yet.
export const SUPABASE_STORAGE_KEY = 'reid-native-auth';

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      storageKey: SUPABASE_STORAGE_KEY,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);

supabase.auth.onAuthStateChange((event, session) => {
  console.log(
    '[supabase] auth state change:',
    event,
    session?.access_token ? 'has token' : 'no token',
  );
});
