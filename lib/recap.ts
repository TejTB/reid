import { reidFetch } from "@/lib/api";

// De-dupe successful recaps per session per app run. We intentionally allow a
// retry after a failure (delete on catch) so a later lifecycle point can try
// again — a session that ends with no summary is exactly what left Reid with
// no memory of it.
const fired = new Set<string>();

/** Fire a best-effort session recap for `sessionId`. Called at multiple
 *  lifecycle points (tab blur, app backgrounding) so a real conversation is
 *  far less likely to end un-summarised. The server recap endpoint is itself
 *  idempotent, so duplicate fires are safe. */
export function fireRecap(sessionId: string | null | undefined): void {
  if (!sessionId || fired.has(sessionId)) return;
  fired.add(sessionId);
  void reidFetch("/api/session-recap", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId }),
  }).catch(() => {
    // Let a later blur/background retry this session.
    fired.delete(sessionId);
  });
}
