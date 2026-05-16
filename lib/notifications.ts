import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
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
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    await reidFetch('/api/push/subscribe-native', {
      method: 'POST',
      body: JSON.stringify({ expoPushToken: token }),
    });
  } catch {
  }
}
