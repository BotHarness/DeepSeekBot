import { Stack, useRouter } from 'expo-router';
import { ScrollView } from 'react-native';

import { fullClientParams } from '../../../src/host/full-client';
import { hostSession, useHostSession, useHostSnapshot } from '../../../src/host/host-session';
import { space } from '../../../src/ui/design/tokens';
import { SettingsRow, SettingsSection } from '../../../src/ui/primitives/settings-row';
import { t } from '../../../src/ui/strings';

export default function MeScreen() {
  const router = useRouter();
  const { saved, client } = useHostSession();
  const { connection } = useHostSnapshot(client);
  const status =
    connection.status === 'connected'
      ? t.connected
      : connection.status === 'connecting'
        ? t.connecting
        : connection.status === 'reconnecting'
          ? t.reconnecting
          : connection.status === 'refused'
            ? t.refused
            : connection.status === 'unreachable'
              ? t.unreachable
              : '';
  return (
    <>
      <Stack.Screen options={{ title: t.me }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ gap: space.x6, padding: space.x5 }}
      >
        <SettingsSection title={t.computer}>
          <SettingsRow
            title={saved?.hostName ?? '—'}
            detail={[status, connection.route].filter((part) => part !== '').join(' · ')}
          />
          <SettingsRow
            title={t.openFullClient}
            tone="accent"
            onPress={() =>
              router.push({ pathname: '/full-client', params: fullClientParams({ kind: 'home' }) })
            }
          />
          <SettingsRow
            title={t.computers}
            detail={t.computersHint}
            onPress={() => router.push('/hosts')}
          />
          <SettingsRow title={t.notifications} onPress={() => router.push('/notifications')} />
          <SettingsRow
            title={t.unpair}
            tone="danger"
            onPress={() => void hostSession.unpair().then(() => router.replace('/'))}
          />
        </SettingsSection>
      </ScrollView>
    </>
  );
}
