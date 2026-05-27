import type { VoiceState } from "./machine.ts";

export type OrbVisual = "idle" | "listening" | "thinking" | "speaking";

/** Map the session state + live amplitudes to the orb's visual state and the
 *  single amplitude value that drives it. */
export function mapOrbState(
  sessionState: VoiceState,
  micAmplitude: number,
  playbackAmplitude: number,
): { state: OrbVisual; amplitude: number } {
  switch (sessionState) {
    case "recording":
      return { state: "listening", amplitude: micAmplitude };
    case "processing":
      return { state: "thinking", amplitude: 0 };
    case "playing":
      return { state: "speaking", amplitude: playbackAmplitude };
    case "idle":
    default:
      return { state: "idle", amplitude: 0 };
  }
}
