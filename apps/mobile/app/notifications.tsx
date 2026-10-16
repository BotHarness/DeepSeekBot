import { useMemo } from 'react';
import { Linking } from 'react-native';

import {
  hostPush,
  hostSession,
  useHostSession,
  useHostSnapshot,
  usePushStatus,
  pushSession,
} from '../src/host/host-session';
import {
  NotificationSettings,
  type NotificationSettingsPort,
} from '../src/ui/notification-settings';
import { CompatibilityNotice } from '../src/ui/shell/compatibility-notice';

export default function NotificationsScreen() {
  const { saved, client } = useHostSession();
  const { compatibility } = useHostSnapshot(client);
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
  if (
    compatibility?.status === 'incompatible' ||
    (compatibility?.status === 'compatible' && !compatibility.features.push)
  )
    return <CompatibilityNotice info={compatibility} onRetry={() => client?.retryNow()} />;
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
