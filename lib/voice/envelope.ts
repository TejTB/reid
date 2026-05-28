// Shaped speech-envelope for the SPEAKING orb state.
//
// Replaces the old `Math.random()` pulse with a smooth, naturally-varying
// amplitude curve driven by elapsed playback time. expo-audio does not expose
// real output-level metering, so this is a *shaped* envelope (layered sines +
// an attack ramp) — deterministic, no randomness. True buffer-analysed
// amplitude is Sprint 5 polish.

const MIN = 0.12;
const MAX = 0.95;
const ATTACK_MS = 250;

/** Amplitude in [0, MAX] for the given milliseconds since playback started.
 *  Swells in from ~0 over the first {@link ATTACK_MS}, then oscillates in
 *  [MIN, MAX] with organic, syllable-like variation. */
export function speechEnvelope(tMs: number): number {
  const ms = Math.max(0, tMs);
  const t = ms / 1000;
  // Layered sines at incommensurate rates → non-repeating, speech-like motion.
  const fast = Math.sin(t * 11.0);
  const mid = Math.sin(t * 5.3 + 1.7);
  const slow = Math.sin(t * 2.1 + 0.5);
  const shaped = 0.5 + 0.26 * fast + 0.16 * mid + 0.1 * slow; // ~[0, 1]
  const attack = Math.min(1, ms / ATTACK_MS); // 0→1 over the first 250ms
  const v = shaped * attack;
  return Math.max(MIN * attack, Math.min(MAX, v));
}
