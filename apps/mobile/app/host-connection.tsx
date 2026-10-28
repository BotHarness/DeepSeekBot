import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { createHostClient } from '../src/host/client';
import { useHostSession, useHostSnapshot } from '../src/host/host-session';
import { nativeCarrier } from '../src/host/native-carrier';
import { isConnectRoute, isLanRoute } from '../src/host/route';
import { SHEET_GROUP } from '../src/ui/chat/sheet';
import { space } from '../src/ui/design/tokens';
import { SheetHeader } from '../src/ui/primitives/sheet-header';
import { SettingsForm, SettingsFormItem } from '../src/ui/primitives/settings-form';
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
  const header = (
    <SheetHeader
      title={copy.title}
      {...(host ? { subtitle: host.hostName } : {})}
      onClose={() => router.back()}
    />
  );
  return (
    <SheetScreen>
      <SettingsForm header={header} testID="host-connection">
        {host && routes.length > 0 ? null : (
          <SettingsFormItem>
            <Text tone="muted" style={{ paddingHorizontal: space.x5 }}>
              {host ? copy.automatic : t.hostLookMissing}
            </Text>
          </SettingsFormItem>
        )}
        {host && snapshot.connection.status !== 'connected' ? (
          <SettingsSection on={SHEET_GROUP}>
            <SettingsRow
              on={SHEET_GROUP}
              icon="qr"
              title={copy.scan}
              detail={copy.scanHint}
              disclosure
              testID="connection-scan-update"
              onPress={() => router.push('/pair/tailscale')}
            />
          </SettingsSection>
        ) : null}
        {routes.map(({ url, status }, index) => {
          const current =
            snapshot.connection.status === 'connected' && snapshot.connection.route === url;
          const [kind, icon] = isLanRoute(url)
            ? ([copy.lan, 'lan'] as const)
            : isConnectRoute(url)
              ? (['Connect', 'encrypted'] as const)
              : new URL(url).hostname.endsWith('.ts.net')
                ? (['Tailscale', 'encrypted'] as const)
                : ([copy.local, 'computer'] as const);
          return (
            <SettingsSection
              key={url}
              title={kind}
              on={SHEET_GROUP}
              {...(index === routes.length - 1 ? { footer: copy.automatic } : {})}
            >
              <SettingsRow
                on={SHEET_GROUP}
                icon={icon}
                title={current ? copy.current : copy[status]}
                tone={status === 'unreachable' && !current ? 'danger' : 'fg'}
                detail={url}
                control={busy === url ? { kind: 'busy' } : current ? { kind: 'check' } : undefined}
              />
              <SettingsRow
                on={SHEET_GROUP}
                icon="copy"
                title={copied === url ? copy.copied : copy.copy}
                testID={`connection-copy-${index}`}
                onPress={() => {
                  void Clipboard.setStringAsync(url).then(() => {
                    setCopied(url);
                    setTimeout(
                      () => setCopied((value) => (value === url ? undefined : value)),
                      1500,
                    );
                  });
                }}
              />
              <SettingsRow
                on={SHEET_GROUP}
                icon="testRoute"
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
      </SettingsForm>
    </SheetScreen>
  );
}
