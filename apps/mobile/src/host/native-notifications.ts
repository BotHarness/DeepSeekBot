import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { NotificationsPort, PermissionState } from './push-session';

export const REQUESTS_CHANNEL = 'requests';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
  const id = extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof id === 'string' && id !== '' ? id : undefined;
}

function state(status: Notifications.NotificationPermissionsStatus): PermissionState {
  if (status.granted) return 'granted';
  return status.canAskAgain ? 'undetermined' : 'denied';
}

let channelReady: Promise<unknown> | undefined;

export function nativeNotifications(channelName: string): NotificationsPort {
  const ensureChannel = (): Promise<unknown> => {
    if (Platform.OS !== 'android') return Promise.resolve();
    channelReady ??= Notifications.setNotificationChannelAsync(REQUESTS_CHANNEL, {
      name: channelName,
      importance: Notifications.AndroidImportance.HIGH,
      showBadge: true,
    }).catch(() => undefined);
    return channelReady;
  };
  return {
    permission: async () => state(await Notifications.getPermissionsAsync()),
    async request() {
      await ensureChannel();
      return state(await Notifications.requestPermissionsAsync());
    },
    async token() {
      const id = projectId();
      if (id === undefined) throw new Error('missing-project-id');
      await ensureChannel();
      return (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
    },
    onTokenChanged(listener) {
      const subscription = Notifications.addPushTokenListener(() => listener());
      return () => subscription.remove();
    },
    async setBadge(count) {
      await Notifications.setBadgeCountAsync(count);
    },
    async presented() {
      return (await Notifications.getPresentedNotificationsAsync()).map((notification) => ({
        id: notification.request.identifier,
        data: notification.request.content.data,
      }));
    },
    async dismiss(id) {
      await Notifications.dismissNotificationAsync(id);
    },
  };
}

export function onNotificationTap(open: (data: unknown) => void): () => void {
  const seen = new Set<string>();
  const handle = (response: Notifications.NotificationResponse | null): void => {
    if (response === null || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER)
      return;
    const id = response.notification.request.identifier;
    if (seen.has(id)) return;
    seen.add(id);
    open(response.notification.request.content.data);
    Notifications.clearLastNotificationResponse();
  };
  try {
    handle(Notifications.getLastNotificationResponse());
  } catch {}
  const subscription = Notifications.addNotificationResponseReceivedListener(handle);
  return () => subscription.remove();
}
