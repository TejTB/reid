export type VoiceState = "idle" | "recording" | "processing" | "playing" | "error";

export type VoiceEvent =
  | { type: "TAP" }
  | { type: "SILENCE" }
  | { type: "OPENING" }
  | { type: "REPLY_READY" }
  | { type: "PLAYBACK_DONE" }
  | { type: "ERROR" }
  | { type: "RESET" };

/** Pure transition function for the voice turn loop. Unknown transitions are
 *  no-ops (return the current state). */
export function voiceReducer(state: VoiceState, event: VoiceEvent): VoiceState {
  // RESET clears back to a clean idle. ERROR parks the FSM in a recoverable
  // `error` state from ANY state — never a dead/stuck orb. The orb shows an
  // error visual and TAP (or OPENING for speak-first) retries from there.
  if (event.type === "RESET") return "idle";
  if (event.type === "ERROR") return "error";
  switch (state) {
    case "idle":
      // TAP → user records first. OPENING → Reid speaks first (onboarding /
      // speak-first), skipping the recording step.
      if (event.type === "TAP") return "recording";
      if (event.type === "OPENING") return "processing";
      return "idle";
    case "recording":
      return event.type === "TAP" || event.type === "SILENCE" ? "processing" : "recording";
    case "processing":
      return event.type === "REPLY_READY" ? "playing" : "processing";
    case "playing":
      return event.type === "PLAYBACK_DONE" ? "idle" : "playing";
    case "error":
      // Recoverable: a tap retries a recording turn, OPENING retries the
      // speak-first kickoff. Anything else holds the error state.
      if (event.type === "TAP") return "recording";
      if (event.type === "OPENING") return "processing";
      return "error";
    default:
      return state;
  }
}
