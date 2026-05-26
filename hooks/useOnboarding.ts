import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { OnboardingResult } from '../lib/prompts';

/**
 * Persists the parsed onboarding result onto the REAL schema:
 *  - users: onboarding_complete, onboarding_summary, onboarding_task (focus),
 *    onboarding_goals (jsonb snapshot)
 *  - goals: one row per goal (qualitative goals modelled as 0/100 % progress)
 *  - observations: one row per observation, plus the nudge
 *
 * The billing-protection trigger allows these columns; we never touch billing.
 */
export async function persistOnboarding(
  profileId: string,
  result: OnboardingResult,
  sessionId: string | null,
): Promise<void> {
  await supabase
    .from('users')
    .update({
      onboarding_complete: true,
      onboarding_summary: result.summary,
      onboarding_task: result.currentFocus,
      onboarding_goals: result.goals,
    })
    .eq('id', profileId);

  if (result.goals.length > 0) {
    const goalRows = result.goals.map((g, i) => ({
      user_id: profileId,
      title: g.title,
      description: g.description || null,
      target_value: 100,
      current_value: 0,
      unit: '%',
      unit_prefix: false,
      is_primary: i === 0,
      deadline: null as string | null,
    }));
    await supabase.from('goals').insert(goalRows);
  }

  const obsRows: Array<{
    user_id: string;
    text: string;
    confidence: 'medium';
    category: 'pattern' | null;
    session_id: string | null;
  }> = result.observations.map((text) => ({
    user_id: profileId,
    text,
    confidence: 'medium' as const,
    category: null,
    session_id: sessionId,
  }));
  if (result.nudge) {
    obsRows.push({
      user_id: profileId,
      text: result.nudge,
      confidence: 'medium',
      category: 'pattern',
      session_id: sessionId,
    });
  }
  if (obsRows.length > 0) {
    await supabase.from('observations').insert(obsRows);
  }
}

export function useOnboarding() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async (profileId: string, result: OnboardingResult, sessionId: string | null) => {
      setSaving(true);
      setError(null);
      try {
        await persistOnboarding(profileId, result, sessionId);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save onboarding.');
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  return { save, saving, error };
}
