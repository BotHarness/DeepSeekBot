import { useMemo, useSyncExternalStore } from 'react';
import { Linking } from 'react-native';

import {
  hostPush,
  hostSession,
  useHostSession,
  usePushStatus,
  pushSession,
} from '../../host/host-session';
import { NotificationSettings, type NotificationSettingsPort } from '../notification-settings';
import { notificationPreferences } from '../../host/native-notification-preferences';

export default function NotificationsScreen() {
  const { saved } = useHostSession();
  const status = usePushStatus();
  const preference = useSyncExternalStore(
    notificationPreferences.subscribe,
    notificationPreferences.getSnapshot,
  );
  const port = useMemo<NotificationSettingsPort | undefined>(
    () =>
      saved === null || saved === undefined
        ? undefined
        : {
            load: async () => {
              await notificationPreferences.ready;
              const settings = await hostPush.settings(saved);
              return {
                ...settings,
                preferences:
                  notificationPreferences.getSnapshot().preferences ?? settings.preferences,
              };
            },
            set: async (preferences) => {
              await notificationPreferences.set(preferences);
            },
            setEnabled: (enabled) => hostPush.setEnabled(saved, enabled),
            test: () => hostPush.test(saved),
          },
    [saved, status.status],
  );
  if (saved === null || saved === undefined || port === undefined) return null;
  return (
    <NotificationSettings
      status={status}
      hostName={saved.hostName}
      port={port}
      preference={preference}
      onEnable={() => void pushSession.enable(hostSession.getState().hosts)}
      onOpenSettings={() => void Linking.openSettings()}
      key={saved.hostId}
    />
  );
}
