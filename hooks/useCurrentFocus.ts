import { useCallback, useEffect, useState } from 'react';
import { supabase, getProfile, goalProgress, type Goal } from '../lib/supabase';

export type CurrentFocus = {
  /** The thing to show as the headline focus. */
  title: string;
  /** The primary goal backing it, if any. */
  goal: Goal | null;
  /** 0–100 progress of the primary goal. */
  progress: number;
  /** Count of open (incomplete) tasks. */
  openTaskCount: number;
};

/**
 * The schema has no `current_focus` column, so we derive it: the primary goal's
 * title (is_primary = true), falling back to the user's onboarding_task.
 */
export function useCurrentFocus() {
  const [focus, setFocus] = useState<CurrentFocus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const profile = await getProfile();
    if (!profile) {
      setFocus(null);
      setLoading(false);
      return;
    }

    const [{ data: goalsData }, { count }] = await Promise.all([
      supabase
        .from('goals')
        .select('*')
        .eq('user_id', profile.id)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .eq('completed', false),
    ]);

    const goals = (goalsData as Goal[]) ?? [];
    const primary = goals.find((g) => g.is_primary) ?? goals[0] ?? null;
    const title = primary?.title ?? profile.onboarding_task ?? 'Set your focus';

    setFocus({
      title,
      goal: primary,
      progress: primary ? goalProgress(primary) : 0,
      openTaskCount: count ?? 0,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { focus, loading, refresh: load };
}
