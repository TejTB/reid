/** Normalize an audio meter reading in dBFS (≈ -60 quiet .. 0 loud) to 0..1. */
export function meterToAmplitude(db: number, floorDb = -60): number {
  if (!Number.isFinite(db)) return 0;
  if (db >= 0) return 1;
  if (db <= floorDb) return 0;
  return 1 - db / floorDb;
}
