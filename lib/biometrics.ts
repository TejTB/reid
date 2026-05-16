import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const LAST_ACTIVE_KEY = 'reid-last-active-ts';
const LOCK_THRESHOLD_MS = 5 * 60 * 1000;

export async function shouldRequireBiometric(): Promise<boolean> {
  try {
    const lastStr = await SecureStore.getItemAsync(LAST_ACTIVE_KEY);
    if (!lastStr) return false;
    const last = Number(lastStr);
    if (!Number.isFinite(last)) return false;
    return Date.now() - last > LOCK_THRESHOLD_MS;
  } catch {
    return false;
  }
}

export async function markActive(): Promise<void> {
  try {
    await SecureStore.setItemAsync(LAST_ACTIVE_KEY, String(Date.now()));
  } catch {
  }
}

export async function authenticateWithBiometrics(): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !isEnrolled) return true;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Reid',
      fallbackLabel: 'Use passcode',
      cancelLabel: 'Cancel',
    });
    return result.success;
  } catch {
    return true;
  }
}
