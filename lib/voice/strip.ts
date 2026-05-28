/** The web /api/reid stream appends trailing `\x1e`-prefixed control markers
 *  (REID_ACTIONS / REID_SESSION_END) after the visible text. Return only the
 *  text before the first record separator. No-op when there is none. */
export function stripReidStream(raw: string): string {
  const i = raw.indexOf("\x1e");
  return i === -1 ? raw : raw.slice(0, i);
}

/** The `/api/reid` onboarding stream emits an `[ONBOARDING_COMPLETE]` sentinel
 *  when Reid finishes onboarding. Returns the visible text with the sentinel
 *  removed and whether it fired. */
export const ONBOARDING_SENTINEL = "[ONBOARDING_COMPLETE]";

export function splitOnboardingComplete(raw: string): { body: string; complete: boolean } {
  const i = raw.indexOf(ONBOARDING_SENTINEL);
  if (i === -1) return { body: raw, complete: false };
  const body = (raw.slice(0, i) + raw.slice(i + ONBOARDING_SENTINEL.length)).trim();
  return { body, complete: true };
}
