// Session generation engine (spec Agent 6).
//
// After a chat closes with enough substance, summarise it in the background and
// persist the result. Fully silent — never blocks the UI.

import { complete } from './anthropic';
import { SESSION_SUMMARY_PROMPT, parseSessionSummary } from './prompts';
import { supabase } from './supabase';
import type { UIMessage } from './types';

export type GenerateSessionArgs = {
  messages: UIMessage[];
  profileId: string;
  /** Existing session row to update, or null to create a fresh one. */
  sessionId: string | null;
};

/**
 * Summarise a conversation and write title/summary/keyPoints/commitments/reidNote
 * to the sessions row, plus a standalone observation. Resolves quietly on any
 * failure — summaries are best-effort and must never surface an error to the user.
 */
export async function generateAndSaveSession(args: GenerateSessionArgs): Promise<void> {
  const { messages, profileId } = args;
  let { sessionId } = args;

  // Spec gate: only summarise conversations with real substance (> 3 messages).
  if (messages.length <= 3) return;

  const transcript = messages
    .filter((m) => m.content.trim().length > 0)
    .map((m) => `${m.role === 'user' ? 'Founder' : 'Reid'}: ${m.content}`)
    .join('\n\n');
  if (!transcript) return;

  let raw: string;
  try {
    raw = await complete(
      [{ role: 'user', content: transcript }],
      SESSION_SUMMARY_PROMPT,
      { maxTokens: 700 },
    );
  } catch {
    return;
  }

  const summary = parseSessionSummary(raw);
  if (!summary) return;

  const update = {
    title: summary.title,
    summary: summary.summary,
    key_points: summary.keyPoints,
    commitments: summary.commitments,
    reid_note: summary.reidObservation,
    message_count: messages.length,
    ended_at: new Date().toISOString(),
    outcome_captured: true,
  };

  try {
    if (sessionId) {
      await supabase.from('sessions').update(update).eq('id', sessionId);
    } else {
      const { data } = await supabase
        .from('sessions')
        .insert({ user_id: profileId, mode: 'chat', started_at: new Date().toISOString(), ...update })
        .select('id')
        .single();
      sessionId = (data?.id as string) ?? null;
    }

    if (summary.reidObservation) {
      await supabase.from('observations').insert({
        user_id: profileId,
        text: summary.reidObservation,
        confidence: 'medium',
        category: 'pattern',
        session_id: sessionId,
      });
    }
  } catch {
    // best-effort; swallow
  }
}
