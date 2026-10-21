import { useRouter } from 'expo-router';
import { useMemo } from 'react';

import { fullClientParams } from '../../src/host/full-client';
import { hostSession, useHostSession, useHostSnapshot } from '../../src/host/host-session';
import { loadUsage } from '../../src/host/usage';
import { appBuildLabel } from '../../src/ui/app-build';
import { copyMessage } from '../../src/ui/chat/message-menu';
import { currentAppBuild } from '../../src/ui/native-app-build';
import { StatisticsSettings } from '../../src/ui/shell/statistics-settings';
import { MessageDisplaySettings } from '../../src/ui/shell/message-display-settings';
import { ActivityCountLink } from '../../src/ui/shell/activity-count-settings';
import { SHEET_GROUP } from '../../src/ui/chat/sheet';
import { RowIcon } from '../../src/ui/primitives/row-icon';
import { SettingsRow } from '../../src/ui/primitives/settings-row';
import { t } from '../../src/ui/strings';
import { SettingsView } from '../../src/ui/settings-view';
import { openHostDrawer } from '../../src/ui/shell/host-drawer';
import { noticeHostKept } from '../../src/ui/unpair-notice';

export default function SettingsScreen() {
  const router = useRouter();
  const { saved, client } = useHostSession();
  const { connection } = useHostSnapshot(client);
  const usage = useMemo(
    () => (client === undefined ? undefined : () => loadUsage(client, 'week')),
    [client],
  );
  return (
    <SettingsView
      statistics={<StatisticsSettings />}
      messageDisplay={<MessageDisplaySettings />}
      activityCount={<ActivityCountLink />}
      chatBackground={
        <SettingsRow
          on={SHEET_GROUP}
          title={t.chatBackground.global}
          leading={<RowIcon name="background" />}
          disclosure
          onPress={() => router.push('/settings/chat-background')}
        />
      }
      key={saved?.hostId}
      hostName={saved?.hostName}
      connection={connection}
      loadUsage={usage}
      version={appBuildLabel(currentAppBuild())}
      actions={{
        onUsage: () => router.push('/settings/usage'),
        onOpenFullClient: () =>
          router.push({
            pathname: '/full-client',
            params: fullClientParams({ kind: 'home' }),
          }),
        onComputers: () => {
          router.back();
          openHostDrawer();
        },
        onAppIcon: () => router.push('/settings/app-icon'),
        onNotifications: () => router.push('/settings/notifications'),
        onStorage: () => router.push('/settings/storage'),
        onModels: () => router.push('/settings/models'),
        onCopyVersion: copyMessage,
        onUnpair: () =>
          hostSession.unpair().then((result) => {
            router.dismissTo('/');
            noticeHostKept(result, saved?.hostName ?? '');
          }),
      }}
    />
  );
}
