import { useCallback, useEffect, useState } from 'react';
import { supabase, getProfile, type Goal } from '../lib/supabase';

export function useGoals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const profile = await getProfile();
    if (!profile) {
      setGoals([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', profile.id)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: false });
    setGoals((data as Goal[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { goals, loading, refresh: load };
}
