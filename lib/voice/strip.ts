/** The web /api/reid stream appends trailing `\x1e`-prefixed control markers
 *  (REID_ACTIONS / REID_SESSION_END) after the visible text. Return only the
 *  text before the first record separator. No-op when there is none. */
export function stripReidStream(raw: string): string {
  const i = raw.indexOf("\x1e");
  return i === -1 ? raw : raw.slice(0, i);
}
