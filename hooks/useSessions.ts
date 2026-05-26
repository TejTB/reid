import { useCallback, useEffect, useState } from 'react';
import { supabase, getProfile, type Session } from '../lib/supabase';

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const profile = await getProfile();
    if (!profile) {
      setSessions([]);
      setLoading(false);
      return;
    }
    // Only surface sessions that produced a real summary (a closed conversation).
    const { data } = await supabase
      .from('sessions')
      .select('*')
      .eq('user_id', profile.id)
      .not('summary', 'is', null)
      .order('started_at', { ascending: false });
    setSessions((data as Session[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { sessions, loading, refresh: load };
}
