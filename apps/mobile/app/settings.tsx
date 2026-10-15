import { useRouter } from 'expo-router';

import { fullClientParams } from '../src/host/full-client';
import { hostSession, useHostSession, useHostSnapshot } from '../src/host/host-session';
import { SettingsView } from '../src/ui/settings-view';
import { openHostDrawer } from '../src/ui/shell/host-drawer';

export default function SettingsScreen() {
  const router = useRouter();
  const { saved, client } = useHostSession();
  const { connection } = useHostSnapshot(client);
  return (
    <SettingsView
      hostName={saved?.hostName}
      connection={connection}
      actions={{
        onClose: () => router.back(),
        onOpenFullClient: () =>
          router.push({ pathname: '/full-client', params: fullClientParams({ kind: 'home' }) }),
        onComputers: () => {
          router.back();
          openHostDrawer();
        },
        onHostLook: () => router.push('/host-look'),
        onAppIcon: () => router.push('/app-icon'),
        onNotifications: () => router.push('/notifications'),
        onUnpair: () => hostSession.unpair().then(() => router.dismissTo('/')),
      }}
    />
  );
}
