/**
 * useMicAmplitude — live microphone loudness as a Reanimated
 * `SharedValue<number>` in the 0–1 range, ready to drive UI-thread animations
 * (e.g. the orb) without crossing the bridge on every frame.
 *
 * Built for voice Sprint 3. NOT wired into any screen yet — mount it with
 * `enabled` true to begin metering. It requests microphone permission, records
 * with metering on, maps each dBFS reading to 0–1, and tears the recording down
 * on unmount or when disabled.
 *
 * Uses `expo-av` (the SDK 54 audio API). expo-av reports metering through a
 * JS-thread status callback — there is no UI-thread metering API — so we write
 * `amplitude.value` from that callback, which is the canonical way to push a
 * value from JS to the UI thread. Consumers read it on the UI thread.
 */
import { useEffect } from 'react';
import { Audio } from 'expo-av';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

// Quietest level we treat as "0". Mic metering is dBFS: 0 = loudest, ~-160 =
// silence. -60 is a practical noise floor for speech visualisation.
const MIN_DB = -60;

// How often expo-av reports a metering sample. ~20Hz reads smooth for amplitude
// visualisation and is lighter than per-frame polling; consumers interpolate.
const METERING_INTERVAL_MS = 50;

/** Map a dBFS metering reading to a clamped 0–1 amplitude. */
function dbToAmplitude(db: number): number {
  if (!Number.isFinite(db)) return 0;
  const norm = (db - MIN_DB) / (0 - MIN_DB);
  return Math.min(1, Math.max(0, norm));
}

/**
 * @param enabled  When false, the hook holds the value at 0 and acquires no
 *                 microphone. Lets Sprint 3 gate metering without remounting.
 * @returns        A Reanimated shared value in [0, 1] tracking mic loudness.
 */
export function useMicAmplitude(enabled: boolean = true): SharedValue<number> {
  const amplitude = useSharedValue(0);

  useEffect(() => {
    if (!enabled) {
      amplitude.value = 0;
      return;
    }

    let cancelled = false;
    let recording: Audio.Recording | null = null;

    async function start() {
      try {
        const { granted } = await Audio.requestPermissionsAsync();
        if (cancelled || !granted) return;

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });

        const { recording: rec } = await Audio.Recording.createAsync(
          { ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true },
          (status: { metering?: number }) => {
            if (cancelled) return;
            if (typeof status.metering === 'number') {
              amplitude.value = dbToAmplitude(status.metering);
            }
          },
          METERING_INTERVAL_MS,
        );

        if (cancelled) {
          // Unmounted while preparing — don't leak the recording.
          await rec.stopAndUnloadAsync().catch(() => {});
          return;
        }
        recording = rec;
      } catch {
        // Mic unavailable, permission race, or an in-flight recording: hold at
        // 0 rather than throwing out of an effect.
        if (!cancelled) amplitude.value = 0;
      }
    }

    void start();

    return () => {
      cancelled = true;
      amplitude.value = 0;
      if (recording) {
        recording.stopAndUnloadAsync().catch(() => {});
        recording = null;
      }
      // Release the iOS recording session so playback returns to normal.
      Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
    };
  }, [enabled, amplitude]);

  return amplitude;
}
