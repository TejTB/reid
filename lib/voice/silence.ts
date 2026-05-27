/** True when the most recent `silenceMs` worth of samples (each ~`sampleMs`
 *  apart, newest last) are all at/below `thresholdDb`. Requires enough samples
 *  to cover the window. */
export function shouldAutoStop(
  samples: number[],
  thresholdDb: number,
  silenceMs: number,
  sampleMs: number,
): boolean {
  const needed = Math.ceil(silenceMs / sampleMs);
  if (samples.length < needed) return false;
  const window = samples.slice(-needed);
  return window.every((db) => db <= thresholdDb);
}
