import { useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ConnectedHost } from '../../../core/src/devices/connect-account.js';
import type { BotHarnessTranslate } from './locale.js';
import { remoteHosts, type RemoteHost } from './remote-hosts.js';
import {
  connectionRows,
  manageConnections,
  observedHost,
  type ManagedHost,
} from './connection-management.js';
import { parseConnectedHosts } from './connect-account-hosts.js';
import { useMountedResource } from './mounted-resource.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { StatusDisclosure } from './ds/status-block.js';
import { Note } from './ds/note.js';
import { ConfirmDialog } from './ds/form-dialog.js';

function HostDetails({ remote, t }: { remote: RemoteHost; t: BotHarnessTranslate }) {
  const [managed, setManaged] = useState<ManagedHost>();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{
    action: 'forget-host' | 'revoke-device' | 'stop-route';
    deviceId?: string;
    kind?: string;
    label: string;
  }>();
  const live = useRef(false);
  const abort = useRef<AbortController>();
  const source = remoteHosts();
  const run = (input: Record<string, unknown>) =>
    manageConnections(
      source,
      { ...input, hostId: remote.host.hostId },
      {
        expiresAt: Date.now() + 30_000,
        signal: abort.current?.signal ?? AbortSignal.abort(),
      },
    );
  const load = async () => {
    setFailed(false);
    try {
      const result = await run({ action: 'inspect-host' });
      if (live.current && 'devices' in result) setManaged(result);
    } catch {
      if (live.current) setFailed(true);
    }
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    live.current = true;
    abort.current = new AbortController();
    void load();
    return () => {
      live.current = false;
      abort.current?.abort();
    };
  }, [remote.host.hostId]);
  const perform = async (input: Record<string, unknown>) => {
    setBusy(true);
    setFailed(false);
    try {
      await run(input);
      if (live.current) {
        setConfirm(undefined);
        await load();
      }
    } catch {
      if (live.current) setFailed(true);
    } finally {
      if (live.current) setBusy(false);
    }
  };
  const observed = observedHost(remote);
  return (
    <div ref={mount}>
      {observed.routes.map((route) => (
        <SettingsRow
          key={route.address}
          title={route.address}
          description={t(
            route.current
              ? 'connections.hosts.current'
              : route.status === 'verified'
                ? 'connections.hosts.verified'
                : route.status === 'unreachable'
                  ? 'connections.hosts.unreachable'
                  : 'connections.hosts.unchecked',
          )}
          control={
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void perform({ action: 'test-route', route: route.address })}
            >
              {t('connections.hosts.testRoute')}
            </Button>
          }
        />
      ))}
      {failed ? <Note tone="warning">{t('connections.hosts.failed')}</Note> : null}
      <Button variant="outline" size="sm" disabled={busy} onClick={() => void load()}>
        {t('devices.connection.retry')}
      </Button>
      {managed?.devices
        .filter((device) => !device.revoked)
        .map((device) => (
          <SettingsRow
            key={device.id}
            title={device.name}
            description={device.current ? t('connections.hosts.thisClient') : undefined}
            control={
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  setConfirm({ action: 'revoke-device', deviceId: device.id, label: device.name })
                }
              >
                {t('connections.hosts.revoke')}
              </Button>
            }
          />
        ))}
      {managed?.stops.map((kind) => (
        <SettingsRow
          key={kind}
          title={t(kind === 'lan' ? 'connections.lan' : 'privateTunnel.title')}
          control={
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                setConfirm({
                  action: 'stop-route',
                  kind,
                  label: t(kind === 'lan' ? 'connections.lan' : 'privateTunnel.title'),
                })
              }
            >
              {t('connections.hosts.stop')}
            </Button>
          }
        />
      ))}
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => setConfirm({ action: 'forget-host', label: remote.host.hostName })}
      >
        {t('connections.hosts.remove')}
      </Button>
      {confirm ? (
        <ConfirmDialog
          title={t(
            confirm.action === 'forget-host'
              ? 'connections.hosts.removeTitle'
              : confirm.action === 'revoke-device'
                ? 'connections.hosts.revokeTitle'
                : 'connections.hosts.stopTitle',
            { name: confirm.label },
          )}
          description={t(
            confirm.action === 'forget-host'
              ? 'connections.hosts.removeHint'
              : 'connections.hosts.targetHint',
            { name: remote.host.hostName },
          )}
          labels={{ close: t('common.close'), cancel: t('common.cancel') }}
          confirmLabel={t(
            confirm.action === 'forget-host'
              ? 'connections.hosts.remove'
              : confirm.action === 'revoke-device'
                ? 'connections.hosts.revoke'
                : 'connections.hosts.stop',
          )}
          busy={busy}
          error={failed ? t('connections.hosts.failed') : undefined}
          onCancel={() => setConfirm(undefined)}
          onConfirm={() => {
            if (!busy) void perform({ ...confirm, confirm: true });
          }}
        />
      ) : null}
    </div>
  );
}

export function ConnectionHosts({
  t,
  accountLinked,
}: {
  t: BotHarnessTranslate;
  accountLinked: boolean;
}) {
  const sources = remoteHosts();
  const snapshot = useSyncExternalStore(sources.subscribe, sources.getSnapshot);
  const [account, setAccount] = useState<ConnectedHost[]>([]);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState<string>();
  const mounted = useRef(false);
  const abort = useRef<AbortController>();
  const load = async () => {
    abort.current?.abort();
    const request = new AbortController();
    abort.current = request;
    setFailed(false);
    if (!accountLinked) {
      setAccount([]);
      return;
    }
    try {
      const reply = await fetch('./api/botharness/devices/account-hosts', {
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(12_000)]),
      });
      if (!reply.ok) throw Error('account-hosts-unavailable');
      const hosts = parseConnectedHosts(await reply.json());
      if (mounted.current && !request.signal.aborted) setAccount(hosts);
    } catch {
      if (mounted.current && !request.signal.aborted) {
        setAccount([]);
        setFailed(true);
      }
    }
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      abort.current?.abort();
    };
  }, [accountLinked]);
  const rows = connectionRows(snapshot.hosts, account);
  const row = (remote: RemoteHost) => (
    <StatusDisclosure
      key={remote.host.hostId}
      icon="monitor"
      title={remote.host.hostName}
      hint={`${t(remote.snapshot.connection.status === 'connected' ? 'connections.hosts.current' : remote.snapshot.connection.status === 'unreachable' ? 'connections.hosts.unreachable' : remote.snapshot.connection.status === 'refused' ? 'connections.hosts.refused' : 'connections.hosts.unchecked')} · ${observedHost(remote).currentRoute}`}
      open={expanded === remote.host.hostId}
      onToggle={() => setExpanded(expanded === remote.host.hostId ? undefined : remote.host.hostId)}
      data={{ 'data-connection-host': remote.host.hostId }}
    >
      <HostDetails remote={remote} t={t} />
    </StatusDisclosure>
  );
  return (
    <div ref={mount}>
      {accountLinked ? (
        <SettingsSection title={t('connections.hosts.account')}>
          {rows.account.map(({ remote }) => row(remote))}
          {rows.discovered.map((host) => (
            <SettingsRow
              key={host.id}
              title={host.name}
              description={t('connections.hosts.unpaired')}
            />
          ))}
          {failed ? <Note tone="warning">{t('connections.hosts.accountUnavailable')}</Note> : null}
          <Button variant="outline" size="sm" onClick={() => void load()}>
            {t('devices.connect.refreshComputers')}
          </Button>
        </SettingsSection>
      ) : null}
      {rows.other.length ? (
        <SettingsSection title={t('connections.hosts.other')}>
          {rows.other.map(({ remote }) => row(remote))}
        </SettingsSection>
      ) : null}
    </div>
  );
}
