import { useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { installedAppVersion } from '../src/host/app-version';
import { useHostSession, useHostSnapshot } from '../src/host/host-session';
import { isConnectRoute, isLanRoute, isLoopbackRoute, isTailscaleRoute } from '../src/host/route';
import { SHEET_GROUP } from '../src/ui/chat/sheet';
import { space } from '../src/ui/design/tokens';
import { SheetHeader } from '../src/ui/primitives/sheet-header';
import { SettingsForm, SettingsFormItem } from '../src/ui/primitives/settings-form';
import { SettingsRow, SettingsSection } from '../src/ui/primitives/settings-row';
import { SheetScreen } from '../src/ui/primitives/sheet-screen';
import { Text } from '../src/ui/primitives/text';
import { useMounted } from '../src/ui/mounted';
import { useStrings } from '../src/ui/strings';
import { PreferenceRow } from '../src/ui/primitives/preference-row';

export default function HostConnectionScreen() {
  const t = useStrings();
  const copy = t.connectionRoutes;
  const router = useRouter();
  const { hostId } = useLocalSearchParams<{ hostId?: string }>();
  const session = useHostSession(hostId);
  const host = session.hosts.find((item) => item.hostId === (hostId ?? session.saved?.hostId));
  const client = session.client;
  const snapshot = useHostSnapshot(client);
  const [busy, setBusy] = useState<string>();
  const [preferenceFailed, setPreferenceFailed] = useState(false);
  const savingPreference = useRef(false);
  const selectRoute = async (value: string) => {
    if (savingPreference.current || !client?.setRoutePreference) return;
    savingPreference.current = true;
    setBusy('preference');
    setPreferenceFailed(false);
    try {
      await client.setRoutePreference(value === 'automatic' ? undefined : value);
    } catch {
      setPreferenceFailed(true);
    } finally {
      savingPreference.current = false;
      setBusy(undefined);
    }
  };
  const [copied, setCopied] = useState<string>();
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mount = useMounted(() => () => clearTimeout(copiedTimer.current), []);
  const showCopied = (url: string) => {
    clearTimeout(copiedTimer.current);
    setCopied(url);
    copiedTimer.current = setTimeout(() => setCopied(undefined), 1500);
  };
  const routes = (
    snapshot.routes ??
    host?.routes.map((url) => ({ url, status: 'unchecked' as const })) ??
    []
  ).filter(({ url }) => host?.encryption?.loopback === 'encrypted' || !isLoopbackRoute(url));
  const hiddenActiveLoopback =
    host?.encryption?.loopback !== 'encrypted' &&
    snapshot.connection.status === 'connected' &&
    isLoopbackRoute(snapshot.connection.route);
  const header = (
    <SheetHeader
      title={copy.title}
      {...(host ? { subtitle: host.hostName } : {})}
      onClose={() => router.back()}
    />
  );
  return (
    <SheetScreen onMount={mount}>
      <SettingsForm header={header} testID="host-connection">
        {host && client ? (
          <SettingsSection on={SHEET_GROUP} footer={copy.preferenceScope}>
            {busy === 'preference' ? (
              <SettingsRow
                on={SHEET_GROUP}
                title={copy.preference}
                detail={snapshot.routePreference ?? copy.autoChoice}
                control={{ kind: 'busy' }}
              />
            ) : (
              <PreferenceRow
                on={SHEET_GROUP}
                title={copy.preference}
                icon="computer"
                testID="connection-route-preference"
                value={snapshot.routePreference ?? 'automatic'}
                options={[
                  { value: 'automatic', label: copy.autoChoice, icon: 'computer' },
                  ...[
                    ...new Set([
                      ...routes.map(({ url }) => url),
                      ...(snapshot.routePreference === undefined ? [] : [snapshot.routePreference]),
                    ]),
                  ].map((url) => ({ value: url, label: url, icon: 'computer' as const })),
                ]}
                onChange={(value) => void selectRoute(value)}
              />
            )}
            {snapshot.routeChangePending ? (
              <SettingsRow on={SHEET_GROUP} title={copy.switchPending} control={{ kind: 'busy' }} />
            ) : null}
            {preferenceFailed ? (
              <SettingsRow on={SHEET_GROUP} title={copy.preferenceFailed} tone="danger" />
            ) : null}
            {snapshot.routePreference === undefined ? null : (
              <SettingsRow
                on={SHEET_GROUP}
                title={copy.returnAutomatic}
                detail={copy.manualHint}
                icon="computer"
                testID="connection-return-automatic"
                onPress={busy ? undefined : () => void selectRoute('automatic')}
              />
            )}
          </SettingsSection>
        ) : null}
        {host && (routes.length > 0 || hiddenActiveLoopback) ? null : (
          <SettingsFormItem>
            <Text tone="muted" style={{ paddingHorizontal: space.x5 }}>
              {host ? copy.automatic : t.hostLookMissing}
            </Text>
          </SettingsFormItem>
        )}
        {host && (snapshot.connection.status !== 'connected' || hiddenActiveLoopback) ? (
          <SettingsSection on={SHEET_GROUP}>
            {hiddenActiveLoopback ? (
              <SettingsRow
                on={SHEET_GROUP}
                icon="computer"
                title={copy.localActive}
                detail={copy.localActiveHint}
              />
            ) : null}
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
              : isTailscaleRoute(url)
                ? (['Tailscale', 'encrypted'] as const)
                : isLoopbackRoute(url)
                  ? ([copy.ssh, 'encrypted'] as const)
                  : ([copy.address, 'computer'] as const);
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
                  void Clipboard.setStringAsync(url).then(() => showCopied(url));
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
        {host ? (
          <SettingsSection
            title={copy.versions}
            on={SHEET_GROUP}
            {...(snapshot.compatibility?.update === 'host'
              ? { footer: t.hostCompatibility.updateHost }
              : snapshot.compatibility?.update === 'app'
                ? { footer: t.hostCompatibility.updateApp }
                : {})}
          >
            <SettingsRow
              on={SHEET_GROUP}
              icon="computer"
              title={t.hostCompatibility.hostVersion}
              testID="connection-host-version"
              detail={
                snapshot.compatibility?.hostVersion ??
                (snapshot.compatibility?.update === 'host' ? t.hostCompatibility.olderThan170 : '—')
              }
            />
            <SettingsRow
              on={SHEET_GROUP}
              icon="version"
              title={t.hostCompatibility.appVersion}
              detail={installedAppVersion() ?? '—'}
            />
          </SettingsSection>
        ) : null}
      </SettingsForm>
    </SheetScreen>
  );
}
