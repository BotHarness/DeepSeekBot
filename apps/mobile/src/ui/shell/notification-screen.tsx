import { useMemo } from 'react';
import { Linking } from 'react-native';

import {
  hostPush,
  hostSession,
  useHostSession,
  usePushStatus,
  pushSession,
} from '../../host/host-session';
import { NotificationSettings, type NotificationSettingsPort } from '../notification-settings';

export default function NotificationsScreen() {
  const { saved } = useHostSession();
  const status = usePushStatus();
  const port = useMemo<NotificationSettingsPort | undefined>(
    () =>
      saved === null || saved === undefined
        ? undefined
        : {
            load: () => hostPush.settings(saved),
            set: (preferences) => hostPush.setPreferences(saved, preferences),
            test: () => hostPush.test(saved),
          },
    [saved],
  );
  if (saved === null || saved === undefined || port === undefined) return null;
  return (
    <NotificationSettings
      status={status}
      hostName={saved.hostName}
      port={port}
      onEnable={() => void pushSession.enable(hostSession.getState().hosts)}
      onOpenSettings={() => void Linking.openSettings()}
      key={saved.hostId}
    />
  );
}
