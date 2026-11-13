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
  type ConnectionPlan,
} from './connection-management.js';
import { parseConnectedHosts } from './connect-account-hosts.js';
import { useMountedResource } from './mounted-resource.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { StatusDisclosure } from './ds/status-block.js';
import { Note } from './ds/note.js';
import { ConfirmDialog } from './ds/form-dialog.js';
import { Select } from './ds/select.js';
import { useHostLook } from './host-looks.js';
import {
  isLanRoute,
  isTailscaleRoute,
  isConnectRoute,
  isLoopbackRoute,
} from '../../../../apps/mobile/src/host/route.js';
import { shownHostName } from '../../../../apps/mobile/src/ui/design/host-look.js';

function routeLabel(route: string, t: BotHarnessTranslate) {
  if (isLanRoute(route)) return t('connections.lan');
  if (isTailscaleRoute(route)) return 'Tailscale';
  if (isConnectRoute(route)) return 'Tobs Connect';
  return t(isLoopbackRoute(route) ? 'connections.hosts.loopback' : 'connections.hosts.private');
}

export function HostDetails({ remote, t }: { remote: RemoteHost; t: BotHarnessTranslate }) {
  const name = shownHostName(useHostLook(remote.host.hostId), remote.host.hostName);
  const [managed, setManaged] = useState<ManagedHost>();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{
    action: 'forget-host' | 'revoke-device' | 'stop-route' | 'sign-out';
    deviceId?: string;
    kind?: string;
    routeId?: string;
    label: string;
  }>();
  const [plan, setPlan] = useState<ConnectionPlan>();
  const [handover, setHandover] = useState('');
  const [unknown, setUnknown] = useState(false);
  const [lockUnavailable, setLockUnavailable] = useState(false);
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
      const result = await run(input);
      if (live.current) {
        setUnknown('outcome' in result && result.outcome === 'unknown');
        setLockUnavailable(false);
        setConfirm(undefined);
        if (input.action !== 'select-route') await load();
      }
    } catch (error) {
      if (live.current) {
        setFailed(true);
        setLockUnavailable(
          error instanceof Error && error.message === 'connection-operation-lock-unavailable',
        );
        setConfirm(undefined);
        setUnknown(
          source
            .getSnapshot()
            .hosts.some(
              (entry) => entry.host.hostId === remote.host.hostId && entry.host.pendingConnection,
            ),
        );
      }
    } finally {
      if (live.current) setBusy(false);
    }
  };
  const prepare = async (next: NonNullable<typeof confirm>) => {
    if (busy || (remote.host.pendingConnection && next.action !== 'forget-host')) return;
    setBusy(true);
    setFailed(false);
    try {
      if (next.action !== 'forget-host') {
        const result = await run({ action: 'plan-operation', operation: next });
        if (!('disconnects' in result)) return;
        if (live.current) setPlan(result);
      } else setPlan(undefined);
      if (live.current) {
        setHandover('');
        setConfirm(next);
      }
    } catch {
      if (live.current) setFailed(true);
    } finally {
      if (live.current) setBusy(false);
    }
  };
  const observed = observedHost(remote);
  const mutationBlocked =
    busy ||
    remote.host.pendingConnection !== undefined ||
    remote.host.connectionOwnerChanged === true ||
    remote.host.connectionOperationUnavailable === true ||
    remote.snapshot.connection.status !== 'connected';
  return (
    <div ref={mount}>
      {remote.snapshot.connection.status !== 'connected' ? (
        <Note tone="danger">{t('remoteHosts.offline', { name })}</Note>
      ) : null}
      {remote.host.connectionOperationUnavailable ? (
        <Note tone="warning">{t('connections.remote.storageUnavailable')}</Note>
      ) : null}
      {remote.host.connectionOwnerChanged ? (
        <>
          <Note tone="warning">{t('connections.remote.ownerChanged', { name })}</Note>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void perform({ action: 'read-previous-operation' })}
          >
            {t('connections.remote.readPrevious')}
          </Button>
        </>
      ) : null}
      <SettingsRow
        title={t('connections.hosts.preference')}
        description={t('connections.hosts.preferenceScope')}
        control={
          <Select
            label={t('connections.hosts.preference')}
            value={observed.routePreference}
            disabled={busy}
            options={[
              { value: 'automatic', label: t('connections.hosts.automatic') },
              ...[
                ...new Set([
                  ...observed.routes.map((route) => route.address),
                  ...(observed.routePreference === 'automatic' ? [] : [observed.routePreference]),
                ]),
              ].map((route) => ({ value: route, label: `${routeLabel(route, t)} · ${route}` })),
            ]}
            onChange={(route) => void perform({ action: 'select-route', route, confirm: true })}
          />
        }
      />
      {observed.routeChangePending ? <Note>{t('connections.hosts.switchPending')}</Note> : null}
      {observed.routePreference !== 'automatic' ? (
        <>
          <Note>{t('connections.hosts.manualHint')}</Note>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              void perform({ action: 'select-route', route: 'automatic', confirm: true })
            }
          >
            {t('connections.hosts.returnAutomatic')}
          </Button>
        </>
      ) : null}
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
      {unknown || remote.host.pendingConnection ? (
        <>
          <Note tone="warning">{t('connections.remote.unknown', { name })}</Note>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void perform({ action: 'read-operation' })}
          >
            {t('connections.remote.readback')}
          </Button>
        </>
      ) : lockUnavailable ? (
        <Note tone="warning">{t('connections.remote.lockUnavailable')}</Note>
      ) : failed ? (
        <Note tone="warning">{t('connections.hosts.failed')}</Note>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() =>
          remote.host.connectionOperationUnavailable
            ? void perform({ action: 'read-operation' })
            : void load()
        }
      >
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
                disabled={mutationBlocked}
                onClick={() =>
                  void prepare({ action: 'revoke-device', deviceId: device.id, label: device.name })
                }
              >
                {t('connections.hosts.revoke')}
              </Button>
            }
          />
        ))}
      {[
        ...(managed?.stops.includes('lan')
          ? [{ kind: 'lan', routeId: undefined, label: t('connections.lan') }]
          : []),
        ...(managed?.privateRoutes
          .filter((route) => route.state !== 'off')
          .map((route) => ({
            kind: 'private-tunnel',
            routeId: route.id,
            label: route.origin || route.id,
          })) ?? []),
      ].map(({ kind, routeId, label }) => (
        <SettingsRow
          key={`${kind}-${routeId ?? ''}`}
          title={label}
          control={
            <Button
              variant="outline"
              size="sm"
              disabled={mutationBlocked}
              onClick={() =>
                void prepare({
                  action: 'stop-route',
                  kind,
                  ...(routeId === undefined ? {} : { routeId }),
                  label,
                })
              }
            >
              {t('connections.hosts.stop')}
            </Button>
          }
        />
      ))}
      {managed?.accountState === 'signed-in' ? (
        <SettingsRow
          title="Tobs Connect"
          description={t('connections.remote.signOutScope')}
          control={
            <Button
              variant="outline"
              size="sm"
              disabled={mutationBlocked}
              onClick={() => void prepare({ action: 'sign-out', label: name })}
            >
              {t('connections.remote.signOut')}
            </Button>
          }
        />
      ) : null}
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => void prepare({ action: 'forget-host', label: name })}
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
                : confirm.action === 'sign-out'
                  ? 'connections.remote.signOutTitle'
                  : 'connections.hosts.stopTitle',
            { name: confirm.label },
          )}
          description={t(
            confirm.action === 'forget-host'
              ? 'connections.hosts.removeHint'
              : plan?.disconnects
                ? 'connections.remote.disconnectHint'
                : 'connections.hosts.targetHint',
            { name },
          )}
          labels={{ close: t('common.close'), cancel: t('common.cancel') }}
          confirmLabel={t(
            confirm.action === 'forget-host'
              ? 'connections.hosts.remove'
              : confirm.action === 'revoke-device'
                ? 'connections.hosts.revoke'
                : confirm.action === 'sign-out'
                  ? 'connections.remote.signOut'
                  : 'connections.hosts.stop',
          )}
          busy={busy}
          error={failed ? t('connections.hosts.failed') : undefined}
          onCancel={() => setConfirm(undefined)}
          onConfirm={() => {
            if (!busy)
              void perform({
                ...confirm,
                confirm: true,
                ...(plan?.disconnects
                  ? handover
                    ? { handover }
                    : { confirmDisconnect: true }
                  : {}),
              });
          }}
        >
          {plan?.disconnects && plan.alternatives.length ? (
            <Select
              label={t('connections.remote.handover')}
              value={handover}
              disabled={busy}
              options={[
                { value: '', label: t('connections.remote.disconnect') },
                ...plan.alternatives.map((route) => ({ value: route, label: route })),
              ]}
              onChange={setHandover}
            />
          ) : null}
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

function HostRow({
  remote,
  t,
  open,
  onToggle,
}: {
  remote: RemoteHost;
  t: BotHarnessTranslate;
  open: boolean;
  onToggle(): void;
}) {
  const name = shownHostName(useHostLook(remote.host.hostId), remote.host.hostName);
  return (
    <StatusDisclosure
      key={remote.host.hostId}
      icon="monitor"
      title={name}
      hint={`${t(remote.snapshot.connection.status === 'connected' ? 'connections.hosts.current' : remote.snapshot.connection.status === 'unreachable' ? 'connections.hosts.unreachable' : remote.snapshot.connection.status === 'refused' ? 'connections.hosts.refused' : 'connections.hosts.unchecked')} · ${routeLabel(observedHost(remote).currentRoute, t)}`}
      open={open}
      onToggle={onToggle}
      data={{ 'data-connection-host': remote.host.hostId }}
    >
      <HostDetails remote={remote} t={t} />
    </StatusDisclosure>
  );
}

export function AccountHostConnectionDetails({
  host,
  t,
}: {
  host: ConnectedHost;
  t: BotHarnessTranslate;
}) {
  const sources = remoteHosts();
  const snapshot = useSyncExternalStore(sources.subscribe, sources.getSnapshot);
  const [open, setOpen] = useState(false);
  const remote = connectionRows(snapshot.hosts, [host]).account[0]?.remote;
  if (!remote) return null;
  return (
    <StatusDisclosure
      icon="plug"
      title={t('privateTunnel.panel.manage')}
      open={open}
      onToggle={() => setOpen(!open)}
    >
      <HostDetails remote={remote} t={t} />
    </StatusDisclosure>
  );
}

export function ConnectionHosts({
  t,
  accountLinked,
  managedAccountHosts,
}: {
  t: BotHarnessTranslate;
  accountLinked: boolean;
  managedAccountHosts?: ConnectedHost[];
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
    if (!accountLinked || managedAccountHosts !== undefined) {
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
  }, [accountLinked, managedAccountHosts]);
  const rows = connectionRows(
    snapshot.hosts,
    accountLinked ? (managedAccountHosts ?? account) : [],
  );
  const row = (remote: RemoteHost) => (
    <HostRow
      key={remote.host.hostId}
      remote={remote}
      t={t}
      open={expanded === remote.host.hostId}
      onToggle={() => setExpanded(expanded === remote.host.hostId ? undefined : remote.host.hostId)}
    />
  );
  return (
    <div ref={mount}>
      {accountLinked && managedAccountHosts === undefined ? (
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
