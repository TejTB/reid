import { mapOrbState } from "@/lib/voice/orbState";
import type { VoiceState } from "@/lib/voice/machine";

/** Thin hook: derive the orb's visual state + amplitude from the session. */
export function useOrbState(args: {
  sessionState: VoiceState;
  micAmplitude: number;
  playbackAmplitude: number;
}) {
  return mapOrbState(args.sessionState, args.micAmplitude, args.playbackAmplitude);
}
