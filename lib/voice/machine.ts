export type VoiceState = "idle" | "recording" | "processing" | "playing";

export type VoiceEvent =
  | { type: "TAP" }
  | { type: "SILENCE" }
  | { type: "REPLY_READY" }
  | { type: "PLAYBACK_DONE" }
  | { type: "ERROR" }
  | { type: "RESET" };

/** Pure transition function for the voice turn loop. Unknown transitions are
 *  no-ops (return the current state). */
export function voiceReducer(state: VoiceState, event: VoiceEvent): VoiceState {
  if (event.type === "ERROR" || event.type === "RESET") return "idle";
  switch (state) {
    case "idle":
      return event.type === "TAP" ? "recording" : "idle";
    case "recording":
      return event.type === "TAP" || event.type === "SILENCE" ? "processing" : "recording";
    case "processing":
      return event.type === "REPLY_READY" ? "playing" : "processing";
    case "playing":
      return event.type === "PLAYBACK_DONE" ? "idle" : "playing";
    default:
      return state;
  }
}
