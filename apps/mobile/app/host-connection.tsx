import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { createHostClient } from '../src/host/client';
import { useHostSession, useHostSnapshot } from '../src/host/host-session';
import { nativeCarrier } from '../src/host/native-carrier';
import { isConnectRoute, isLanRoute } from '../src/host/route';
import { space } from '../src/ui/design/tokens';
import { SheetHeader } from '../src/ui/primitives/sheet-header';
import { SettingsRow, SettingsSection } from '../src/ui/primitives/settings-row';
import { SheetScreen } from '../src/ui/primitives/sheet-screen';
import { Text } from '../src/ui/primitives/text';
import { useStrings } from '../src/ui/strings';

export default function HostConnectionScreen() {
  const t = useStrings();
  const copy = t.connectionRoutes;
  const router = useRouter();
  const { hostId } = useLocalSearchParams<{ hostId?: string }>();
  const session = useHostSession();
  const host = session.hosts.find((item) => item.hostId === (hostId ?? session.saved?.hostId));
  const active = host?.hostId === session.saved?.hostId ? session.client : undefined;
  const client = useMemo(
    () => active ?? (host ? createHostClient({ ...host, carrier: nativeCarrier() }) : undefined),
    [active, host?.hostId, host?.credential],
  );
  useFocusEffect(
    useCallback(() => {
      if (!client || client === active) return;
      client.start();
      return () => client.stop();
    }, [client, active]),
  );
  const snapshot = useHostSnapshot(client);
  const [busy, setBusy] = useState<string>();
  const [copied, setCopied] = useState<string>();
  const routes =
    snapshot.routes ?? host?.routes.map((url) => ({ url, status: 'unchecked' as const })) ?? [];
  return (
    <SheetScreen>
      <SheetHeader
        title={copy.title}
        {...(host ? { subtitle: host.hostName } : {})}
        onClose={() => router.back()}
      />
      <ScrollView contentContainerStyle={{ padding: space.x5, gap: space.x5 }}>
        <Text tone="muted">{host ? copy.automatic : t.hostLookMissing}</Text>
        {host && snapshot.connection.status !== 'connected' ? (
          <SettingsSection>
            <SettingsRow
              title={copy.scan}
              detail={copy.scanHint}
              testID="connection-scan-update"
              onPress={() => router.push('/pair/tailscale')}
            />
          </SettingsSection>
        ) : null}
        {routes.map(({ url, status }, index) => {
          const current =
            snapshot.connection.status === 'connected' && snapshot.connection.route === url;
          const kind = isLanRoute(url)
            ? copy.lan
            : isConnectRoute(url)
              ? 'Connect'
              : new URL(url).hostname.endsWith('.ts.net')
                ? 'Tailscale'
                : copy.local;
          return (
            <SettingsSection key={url} title={kind}>
              <SettingsRow title={current ? copy.current : copy[status]} detail={url} />
              <SettingsRow
                title={copied === url ? copy.copied : copy.copy}
                testID={`connection-copy-${index}`}
                onPress={() => {
                  void Clipboard.setStringAsync(url).then(() => setCopied(url));
                }}
              />
              <SettingsRow
                title={busy === url ? copy.testing : copy.test}
                testID={`connection-test-${index}`}
                onPress={
                  busy
                    ? undefined
                    : () => {
                        setBusy(url);
                        void client?.testRoute?.(url).finally(() => setBusy(undefined));
                      }
                }
              />
            </SettingsSection>
          );
        })}
      </ScrollView>
    </SheetScreen>
  );
}
