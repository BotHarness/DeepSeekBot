import { useCallback, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { ConnectedHost } from '../../../core/src/devices/connect-account.js';
import { SettingsRow } from './ds/settings-row.js';
import { StatusBlock, StatusStack } from './ds/status-block.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { Note } from './ds/note.js';
import { useMountedResource } from './mounted-resource.js';

const PATH = './api/botharness/devices/account-hosts';

export function parseConnectedHosts(value: unknown): ConnectedHost[] {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('hosts' in value) ||
    !Array.isArray(value.hosts)
  )
    throw new Error('invalid-host-list');
  const hosts: ConnectedHost[] = [];
  for (const host of value.hosts) {
    if (
      typeof host !== 'object' ||
      host === null ||
      typeof host.id !== 'string' ||
      typeof host.name !== 'string' ||
      typeof host.hostname !== 'string' ||
      typeof host.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(host.createdAt)) ||
      typeof host.current !== 'boolean' ||
      typeof host.sessionKnown !== 'boolean' ||
      (host.connected !== undefined && typeof host.connected !== 'boolean')
    )
      throw new Error('invalid-host-list');
    const identity = host.botNetwork;
    if (
      identity !== undefined &&
      (typeof identity !== 'object' ||
        identity === null ||
        typeof identity.hostId !== 'string' ||
        !identity.hostId ||
        typeof identity.publicKey !== 'string' ||
        !/^[a-f0-9]{64}$/u.test(identity.publicKey))
    )
      throw new Error('invalid-host-list');
    hosts.push({
      ...(identity === undefined
        ? {}
        : { botNetwork: { hostId: identity.hostId, publicKey: identity.publicKey } }),
      id: host.id,
      name: host.name,
      hostname: host.hostname,
      createdAt: host.createdAt,
      current: host.current,
      sessionKnown: host.sessionKnown,
      ...(host.connected === undefined ? {} : { connected: host.connected }),
    });
  }
  return hosts;
}

export function ConnectAccountHosts({
  t,
  account,
  reloadSnapshot,
  allowCurrentSignOut = false,
  onHostsChanged,
  details,
}: PropsLocale<'botharness'> & {
  account: { state: string; issue?: string; hostId?: string };
  reloadSnapshot: () => Promise<unknown>;
  allowCurrentSignOut?: boolean;
  onHostsChanged?: (hosts: ConnectedHost[]) => void;
  details?: (host: ConnectedHost) => ReactNode;
}): ReactElement | null {
  const [hosts, setHosts] = useState<ConnectedHost[]>();
  const [listState, setListState] = useState<'loading' | 'fresh' | 'stale'>('loading');
  const [confirm, setConfirm] = useState<ConnectedHost>();
  const [busy, setBusy] = useState<string>();
  const [actionError, setActionError] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(false);
  const request = useRef<AbortController>();
  const eligible = account.state === 'signed-in' || account.issue === 'host-limit';
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setListState('loading');
    try {
      const response = await fetch(PATH, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]),
      });
      if (!response.ok) throw new Error('host-list-unavailable');
      const next = parseConnectedHosts(await response.json());
      if (!mounted.current || controller.signal.aborted) return;
      setHosts(next);
      onHostsChanged?.(next);
      setListState('fresh');
    } catch {
      if (mounted.current && !controller.signal.aborted) setListState('stale');
    }
  }, [onHostsChanged]);

  const mount = useMountedResource<HTMLDivElement>(() => {
    mounted.current = true;
    setHosts(undefined);
    setConfirm(undefined);
    setActionError(false);
    if (eligible) void load();
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, [eligible, account.state, account.issue, account.hostId, load]);

  const revoke = async (host: ConnectedHost) => {
    if (busyRef.current || (host.current && !allowCurrentSignOut)) return;
    busyRef.current = true;
    setBusy(host.id);
    setActionError(false);
    try {
      if (host.current) {
        const result = await fetch('./api/botharness/devices/connect', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'sign-out' }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!result.ok) throw new Error('sign-out-unavailable');
        if (mounted.current) setConfirm(undefined);
        await reloadSnapshot();
        return;
      }
      const response = await fetch(`${PATH}/revoke`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hostId: host.id, confirm: true }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error('host-revoke-unavailable');
      const receipt: unknown = await response.json();
      if (
        typeof receipt !== 'object' ||
        receipt === null ||
        !('ok' in receipt) ||
        receipt.ok !== true
      )
        throw new Error('invalid-host-revoke');
      if (!mounted.current) return;
      setConfirm(undefined);
      await reloadSnapshot();
      if (mounted.current) await load();
    } catch {
      if (mounted.current) setActionError(true);
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(undefined);
    }
  };

  if (!eligible) return null;
  return (
    <div ref={mount}>
      <StatusStack title={t('devices.connect.computers')}>
        {account.issue === 'host-limit' ? (
          <Note tone="warning">{t('devices.connect.notLinked')}</Note>
        ) : null}
        <SettingsRow
          title={t('devices.connect.computersStatus')}
          control={
            <Button
              variant="outline"
              disabled={listState === 'loading' || busy !== undefined}
              onClick={() => void load()}
            >
              {t('devices.connect.refreshComputers')}
            </Button>
          }
        >
          {listState === 'loading' ? <Note>{t('devices.list.loading')}</Note> : null}
          {listState === 'stale' ? (
            <Note tone="warning">{t('devices.connect.computersUnavailable')}</Note>
          ) : null}
          {listState === 'fresh' && hosts?.length === 0 ? (
            <Note>{t('devices.connect.noComputers')}</Note>
          ) : null}
        </SettingsRow>
        {hosts?.map((host) => (
          <StatusBlock
            key={host.id}
            title={host.current ? `${host.name} · ${t('devices.connect.thisComputer')}` : host.name}
            icon={host.current ? 'monitor' : 'server'}
            tone={host.current ? 'accent' : 'neutral'}
            body={host.hostname}
            data={{ 'data-account-host-current': String(host.current) }}
            action={
              host.current && !allowCurrentSignOut ? (
                <span>{t('devices.connect.thisComputer')}</span>
              ) : (
                <Button
                  variant="outline"
                  disabled={busy !== undefined || listState !== 'fresh'}
                  aria-label={t(
                    host.sessionKnown
                      ? 'devices.connect.signOutNamed'
                      : 'devices.connect.removeNamed',
                    { name: host.name },
                  )}
                  onClick={() => {
                    setActionError(false);
                    setConfirm(host);
                  }}
                >
                  {busy === host.id
                    ? t('devices.connect.computerBusy')
                    : t(
                        host.sessionKnown
                          ? 'devices.connect.signOut'
                          : 'devices.connect.removeComputer',
                      )}
                </Button>
              )
            }
          >
            <Note>
              {t(
                host.connected === undefined
                  ? 'devices.connect.computerUnknown'
                  : host.connected
                    ? 'devices.connect.computerOnline'
                    : 'devices.connect.computerOffline',
              )}
            </Note>
            <Note>
              {t('devices.connect.computerLinked', {
                when: new Date(host.createdAt).toLocaleString(),
              })}
            </Note>
            {details?.(host)}
            {!host.sessionKnown ? (
              <Note tone="warning">{t('devices.connect.legacyComputer')}</Note>
            ) : null}
          </StatusBlock>
        ))}
        {actionError ? (
          <Note tone="danger">{t('devices.connect.computerActionFailed')}</Note>
        ) : null}
        {confirm ? (
          <PanelDialog
            size="small"
            scroll
            title={t(
              confirm.sessionKnown ? 'devices.connect.signOutNamed' : 'devices.connect.removeNamed',
              { name: confirm.name },
            )}
            closeLabel={t('common.close')}
            onClose={() => {
              if (!busyRef.current) setConfirm(undefined);
            }}
            actions={
              <>
                <Button
                  variant="outline"
                  disabled={busy !== undefined}
                  onClick={() => setConfirm(undefined)}
                >
                  {t('common.cancel')}
                </Button>
                <Button disabled={busy !== undefined} onClick={() => void revoke(confirm)}>
                  {t(
                    confirm.sessionKnown
                      ? 'devices.connect.signOut'
                      : 'devices.connect.removeComputer',
                  )}
                </Button>
              </>
            }
          >
            <Note>
              {t(
                confirm.sessionKnown
                  ? 'devices.connect.signOutComputerConfirm'
                  : 'devices.connect.legacyComputer',
              )}
            </Note>
            <Note>{confirm.hostname}</Note>
          </PanelDialog>
        ) : null}
      </StatusStack>
    </div>
  );
}
