import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { reidFetch } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Resolves the EAS projectId from expo-constants. SDK 54 requires this be
 *  passed explicitly to `getExpoPushTokenAsync` when running in a development
 *  build or production binary. */
function resolveProjectId(): string | undefined {
  const fromEas =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as unknown as {
      easConfig?: { projectId?: string };
    }).easConfig?.projectId;
  return typeof fromEas === 'string' ? fromEas : undefined;
}

export async function registerPushToken(): Promise<void> {
  try {
    if (!Device.isDevice) return;
    const { status: existing } = await Notifications.getPermissionsAsync();
    let final = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      final = status;
    }
    if (final !== 'granted') return;

    const projectId = resolveProjectId();
    const tokenResponse = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    const token = tokenResponse.data;
    if (!token) return;

    // Upserts the token into `push_subscriptions` (endpoint=token,
    // platform='expo') for the authenticated user. The cron reads from
    // that table when fanning out re-engagement nags.
    await reidFetch('/api/push/subscribe-native', {
      method: 'POST',
      body: JSON.stringify({ expoPushToken: token }),
    });
  } catch {
  }
}
