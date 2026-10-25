import { noiseFingerprint } from '../../../core/src/devices/noise/xk.js';
import { keyBytes } from '../../../../apps/mobile/src/host/encrypted-carrier.js';
import { checkRoute, isConnectRoute, isLanRoute } from '../../../../apps/mobile/src/host/route.js';
import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';

import { Callout } from './ds/callout.js';
import { Note } from './ds/note.js';
import { Tooltip } from './ds/tooltip.js';
import { AddRemoteHostDialog } from './host-tabs.js';
import { ConnectionProgress } from './connection-progress.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import { formatRelativeTime } from './labels.js';
import { useMountedResource } from './mounted-resource.js';
import {
  PhoneRouteSteps,
  type PhoneRouteStatus,
  type PublishFailure,
} from './phone-route-steps.js';

const PATH = './api/botharness/devices';
const LIST_POLL_MS = 2000;
const ROUTE_POLL_MS = 3000;
const NEW_DEVICE_MS = 24 * 60 * 60 * 1000;

interface PairedDevice {
  id: string;
  name: string;
  pairedAt: string;
  lastSeenAt?: string;
  revokedAt?: string;
}

type RouteStatus = PhoneRouteStatus;

interface ConnectAccountStatus {
  state: 'signed-out' | 'signing-in' | 'signed-in' | 'error';
  email?: string;
  userCode?: string;
  verificationUri?: string;
  issue?: string;
}

interface ConnectStatus {
  encryption?: { fingerprint: string; state: string };
  state: 'off' | 'starting' | 'connected' | 'error';
  hostname?: string;
  issue?: string;
  account?: ConnectAccountStatus;
}

interface DevicesSnapshot {
  lan?: { state: 'off' | 'listening' | 'error'; issue?: string };
  host: { id: string; name: string };
  devices: PairedDevice[];
  pendingKeys?: { receipt: string; publicKey: string; name: string; approved: boolean }[];
  routes: RouteStatus;
  connect?: ConnectStatus;
}

interface PairingOffer {
  receipt: string;
  link: string;
  qr: { size: number; path: string };
  expiresAt: string;
  routes: string[];
  reachable: boolean;
}

type PairingView =
  | { state: 'closed' | 'loading' | 'failed' | 'changed' | 'invalid' }
  | { state: 'ready'; offer: PairingOffer }
  | { state: 'paired'; device: PairedDevice };

function routeKey(urls: string[]): string {
  return [
    ...new Set(
      urls.filter((url) => {
        try {
          const name = new URL(url).hostname;
          return name !== 'localhost' && name !== '[::1]' && !name.startsWith('127.');
        } catch {
          return false;
        }
      }),
    ),
  ]
    .sort()
    .join('\n');
}

const styles = stylex.create({
  pairing: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: space.x4,
    minWidth: 0,
  },
  qr: {
    width: '220px',
    height: '220px',
    padding: space.x3,
    borderRadius: radius.md,
    backgroundColor: 'white',
  },
  code: {
    fontFamily: 'var(--dsw-font-mono, ui-monospace, monospace)',
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    overflowWrap: 'anywhere',
  },
  actions: { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: space.x3 },
  choice: { width: '100%', justifyContent: 'space-between', paddingBlock: space.x4 },
  method: { height: 'auto', whiteSpace: 'normal', textAlign: 'start', gap: space.x4 },
  methodCopy: { display: 'flex', flexDirection: 'column', gap: space.x1, minWidth: 0, flexGrow: 1 },
  methodDescription: {
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontWeight: text.regular,
  },
  email: {
    color: color.fg,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
  },
  notYou: { color: color.muted, fontSize: text.metaSize, lineHeight: text.metaLine },
  switchAccount: { marginBlock: space.x3 },
});

function ConnectionMethod({
  title,
  description,
  detail,
  disabled,
  onClick,
}: {
  title: string;
  description: string;
  detail: string;
  disabled: boolean;
  onClick(): void;
}): ReactElement {
  return (
    <Tooltip label={detail} side="right" portal delayMs={0} focusDelayMs={0} maxWidth={360}>
      <Button
        variant="outline"
        aria-label={title}
        disabled={disabled}
        onClick={onClick}
        {...stylex.props(styles.choice, styles.method)}
      >
        <span {...stylex.props(styles.methodCopy)}>
          <span>{title}</span>
          <span {...stylex.props(styles.methodDescription)}>{description}</span>
        </span>
        <ChannelSidebarIcon name="chevron-right" />
      </Button>
    </Tooltip>
  );
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
  return (await response.json()) as T;
}

function hasPhoneRoute(routes: RouteStatus): boolean {
  return routes.routes.some((route) => route.kind !== 'loopback' && route.ready);
}

function portOf(routes: RouteStatus): string {
  return /(\d+)\s*$/u.exec(routes.serveCommand)?.[1] ?? '';
}

function onTailnet(): boolean {
  return location.protocol === 'https:' && location.hostname.endsWith('.ts.net');
}

export function PairedDevicesSettings({
  t,
  section = 'devices',
  onClose,
}: PropsLocale<'botharness'> & {
  section?: 'devices' | 'connect' | 'requests';
  onClose?: () => void;
}): ReactElement {
  const [snapshot, setSnapshot] = useState<DevicesSnapshot>();
  const [pairView, setPairView] = useState<PairingView>({ state: 'closed' });
  const pairViewRef = useRef<PairingView>({ state: 'closed' });
  const offerRequest = useRef(0);
  const offerAbort = useRef<AbortController>();
  const [readState, setReadState] = useState<'loading' | 'fresh' | 'stale'>('loading');
  const [checkedAt, setCheckedAt] = useState<number>();
  const reading = useRef<Promise<DevicesSnapshot | undefined>>();
  const latestSnapshot = useRef<DevicesSnapshot>();
  const updatePairing = (value: PairingView): void => {
    pairViewRef.current = value;
    setPairView(value);
  };
  const pairing = pairView.state !== 'closed';
  const offer = pairView.state === 'ready' ? pairView.offer : undefined;
  const [now, setNow] = useState(Date.now());
  const fresh = (device: PairedDevice): boolean =>
    device.revokedAt === undefined && now - Date.parse(device.pairedAt) < NEW_DEVICE_MS;
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showTailscale, setShowTailscale] = useState(false);
  const [manage, setManage] = useState(false);
  type Setup = 'closed' | 'direction' | 'method' | 'lan' | 'tailscale' | 'connect' | 'remote';
  const [setup, setSetupState] = useState<Setup>('closed');
  const setupVersion = useRef(0);
  const setSetup = (next: Setup) => {
    setupVersion.current += 1;
    setSetupState(next);
  };
  const [reviewing, setReviewing] = useState(section === 'requests');
  const mounted = useRef(false);

  const load = (signal?: AbortSignal): Promise<DevicesSnapshot | undefined> => {
    if (reading.current) return reading.current;
    const request = (async () => {
      try {
        const deadline = AbortSignal.timeout(12_000);
        const value = await json<DevicesSnapshot>(
          await fetch(PATH, {
            signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
          }),
        );
        if (!mounted.current || signal?.aborted) return undefined;
        latestSnapshot.current = value;
        setSnapshot(value);
        setReadState('fresh');
        setCheckedAt(Date.now());
        setNow(Date.now());
        const view = pairViewRef.current;
        if (view.state === 'ready') {
          const status = await json<{ state: string; deviceId?: string }>(
            await fetch(`${PATH}/offer-status`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ receipt: view.offer.receipt }),
              signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
            }),
          );
          if (!mounted.current || signal?.aborted || pairViewRef.current !== view) return value;
          const paired =
            status.state === 'redeemed'
              ? value.devices.find((device) => device.id === status.deviceId && !device.revokedAt)
              : undefined;
          if (paired !== undefined) updatePairing({ state: 'paired', device: paired });
          else if (['expired', 'refused', 'superseded', 'unknown'].includes(status.state))
            updatePairing({ state: 'invalid' });
          else if (routeKey(view.offer.routes) !== availableRouteKey(value))
            updatePairing({ state: 'changed' });
        }
        return value;
      } catch {
        if (mounted.current && !signal?.aborted) setReadState('stale');
        return undefined;
      } finally {
        reading.current = undefined;
      }
    })();
    reading.current = request;
    return request;
  };

  const availableRouteKey = (value: DevicesSnapshot): string =>
    routeKey([
      ...value.routes.routes.filter((route) => route.ready).map((route) => route.url),
      ...(onTailnet() ? [location.origin] : []),
    ]);

  const mount = useMountedResource<HTMLDivElement>(() => {
    mounted.current = true;
    const controller = new AbortController();
    void load(controller.signal);
    const timer = setInterval(() => {
      setNow(Date.now());
      void load(controller.signal);
    }, ROUTE_POLL_MS);
    return () => {
      mounted.current = false;
      controller.abort();
      offerAbort.current?.abort();
      offerRequest.current += 1;
      clearInterval(timer);
    };
  }, []);

  const watch = useMountedResource<HTMLDivElement>(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, LIST_POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const publish = async (
    action: 'enable' | 'disable' = 'enable',
  ): Promise<PublishFailure | undefined> => {
    setBusy('tailscale');
    try {
      const response = await fetch(`${PATH}/serve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: true, action }),
      });
      const value = (await response.json()) as PublishFailure & {
        routes?: RouteStatus;
      };
      if (mounted.current && value.routes !== undefined)
        setSnapshot((current) =>
          current === undefined ? current : { ...current, routes: value.routes! },
        );
      return response.ok ? undefined : value;
    } catch {
      return { code: 'serve-failed' };
    } finally {
      if (mounted.current) setBusy(undefined);
    }
  };

  const createOffer = async (): Promise<void> => {
    const request = ++offerRequest.current;
    offerAbort.current?.abort();
    const controller = new AbortController();
    offerAbort.current = controller;
    updatePairing({ state: 'loading' });
    setBusy('offer');
    setError(false);
    setCopied(false);
    try {
      const value = await json<PairingOffer>(
        await fetch(`${PATH}/offer`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ origin: location.origin }),
          signal: controller.signal,
        }),
      );
      if (mounted.current && request === offerRequest.current) {
        const current = latestSnapshot.current;
        updatePairing(
          current && routeKey(value.routes) !== availableRouteKey(current)
            ? { state: 'changed' }
            : { state: 'ready', offer: value },
        );
        setNow(Date.now());
      }
    } catch {
      if (mounted.current && request === offerRequest.current && !controller.signal.aborted)
        updatePairing({ state: 'failed' });
    } finally {
      if (mounted.current && request === offerRequest.current) setBusy(undefined);
    }
  };

  const open = (): void => {
    void createOffer();
  };

  const setLan = async (action: 'enable' | 'disable', proceed = false): Promise<void> => {
    const version = setupVersion.current;
    setBusy('lan');
    setError(false);
    try {
      await json(
        await fetch(`${PATH}/lan`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action, confirm: true }),
        }),
      );
      await reading.current;
      const current = await load();
      if (
        proceed &&
        mounted.current &&
        setupVersion.current === version &&
        current?.routes.routes.some((route) => route.kind === 'lan' && route.ready)
      ) {
        setSetup('closed');
        await createOffer();
      }
    } catch {
      if (mounted.current) setError(true);
    } finally {
      if (mounted.current) setBusy(undefined);
    }
  };

  const close = (): void => {
    offerRequest.current += 1;
    offerAbort.current?.abort();
    updatePairing({ state: 'closed' });
    setBusy((current) => (current === 'offer' ? undefined : current));
  };

  const account = async (action: 'sign-in' | 'sign-out'): Promise<void> => {
    setBusy(action);
    setError(false);
    try {
      await json(
        await fetch(`${PATH}/connect`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action }),
        }),
      );
      await load();
    } catch {
      if (mounted.current) setError(true);
    } finally {
      if (mounted.current) setBusy(undefined);
    }
  };

  const revoke = async (device: PairedDevice): Promise<void> => {
    setBusy(device.id);
    setError(false);
    try {
      await json(
        await fetch(`${PATH}/revoke`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ deviceId: device.id }),
        }),
      );
      await load();
    } catch {
      if (mounted.current) setError(true);
    } finally {
      if (mounted.current) setBusy(undefined);
    }
  };

  const copy = async (link: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const routes = snapshot?.routes;
  const freshSnapshot = readState === 'fresh';
  const ready = freshSnapshot && routes !== undefined && (hasPhoneRoute(routes) || onTailnet());
  const tailscaleReady =
    freshSnapshot &&
    routes !== undefined &&
    (onTailnet() || routes.routes.some((route) => route.kind === 'tailscale' && route.ready));
  const lanReady = routes?.routes.some((route) => route.kind === 'lan' && route.ready) === true;
  const offerKinds = new Set(
    offer?.routes.map((route) => {
      if (!checkRoute(route).ok) return undefined;
      if (isLanRoute(route)) return 'lan';
      if (isConnectRoute(route)) return 'connect';
      const url = new URL(route);
      if (
        url.hostname === 'localhost' ||
        url.hostname.startsWith('127.') ||
        url.hostname === '[::1]'
      )
        return 'loopback';
      return 'tailscale';
    }),
  );

  const expired = offer !== undefined && Date.parse(offer.expiresAt) <= now;
  const secondsLeft =
    offer === undefined ? 0 : Math.max(0, Math.ceil((Date.parse(offer.expiresAt) - now) / 1000));
  const devices = snapshot?.devices ?? [];
  const connect = snapshot?.connect;
  const signIn = connect?.account;

  const connectControls =
    signIn === undefined ? null : (
      <div data-connect="">
        <SettingsSection title={t('devices.connect.title')}>
          <SettingsRow
            title={t('devices.connect.account')}
            description={
              signIn.state === 'signed-in' ? (
                <>
                  <span {...stylex.props(styles.email)} data-connect-email="">
                    {signIn.email}
                  </span>
                  <br />
                  {t('devices.connect.signedIn')}
                </>
              ) : (
                t('devices.connect.description')
              )
            }
            data={{ 'data-connect-account': signIn.state }}
            control={
              signIn.state === 'signed-in' ? (
                <>
                  <span {...stylex.props(styles.notYou)}>{t('devices.connect.notYou')}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy === 'sign-out'}
                    onClick={() => void account('sign-out')}
                  >
                    {t('devices.connect.signOut')}
                  </Button>
                </>
              ) : signIn.state === 'signing-in' ? undefined : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy === 'sign-in'}
                  onClick={() => void account('sign-in')}
                >
                  {t('devices.connect.signIn')}
                </Button>
              )
            }
          >
            {signIn.state === 'signing-in' && signIn.verificationUri !== undefined ? (
              <Callout data={{ 'data-connect-code': '' }}>
                {t('devices.connect.confirm')}{' '}
                <code {...stylex.props(styles.code)}>{signIn.userCode}</code>
                <div {...stylex.props(styles.switchAccount)} data-connect-switch="">
                  {t('devices.connect.switchAccount')}{' '}
                  <code {...stylex.props(styles.code)}>{signIn.verificationUri}</code>
                </div>
                <div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => window.open(signIn.verificationUri, '_blank', 'noopener')}
                  >
                    {t('devices.connect.openPage')}
                  </Button>
                </div>
              </Callout>
            ) : signIn.state === 'error' ? (
              <Callout tone="warning" data={{ 'data-connect-issue': signIn.issue ?? '' }}>
                {t(
                  signIn.issue === 'account-not-allowed'
                    ? 'devices.connect.notAllowed'
                    : signIn.issue === 'host-limit'
                      ? 'devices.connect.hostLimit'
                      : signIn.issue === 'session-expired' ||
                          signIn.issue === 'sign-in-expired' ||
                          signIn.issue === 'sign-in-denied'
                        ? 'devices.connect.signInAgain'
                        : 'devices.connect.relayDown',
                )}
              </Callout>
            ) : null}
          </SettingsRow>
          {signIn.state === 'signed-in' && connect?.hostname !== undefined ? (
            <SettingsRow
              title={t('devices.connect.tunnel')}
              description={connect.hostname}
              data={{ 'data-connect-tunnel': freshSnapshot ? connect.state : 'unknown' }}
              control={
                <Note
                  tone={
                    !freshSnapshot
                      ? 'muted'
                      : connect.state === 'connected'
                        ? 'success'
                        : connect.state === 'error'
                          ? 'warning'
                          : 'muted'
                  }
                >
                  {t(
                    !freshSnapshot
                      ? 'devices.connection.unchecked'
                      : connect.state === 'connected'
                        ? 'devices.connect.connected'
                        : connect.state === 'error'
                          ? 'devices.connect.reconnecting'
                          : 'devices.connect.starting',
                  )}
                </Note>
              }
            >
              {freshSnapshot && connect.state === 'error' ? (
                <Note tone="warning">{t('devices.connect.recovery')}</Note>
              ) : null}
            </SettingsRow>
          ) : null}
        </SettingsSection>
      </div>
    );

  const verification = (
    <>
      {snapshot?.connect?.encryption ? (
        <Note>
          {t('connect.fingerprint')}: <code>{snapshot.connect.encryption.fingerprint}</code>
        </Note>
      ) : null}
      {snapshot?.pendingKeys
        ?.filter((item) => !item.approved && (!pairing || item.receipt === offer?.receipt))
        .map((item) => (
          <SettingsRow
            key={`${item.receipt}:${item.publicKey}`}
            title={item.name}
            description={noiseFingerprint(keyBytes(item.publicKey))}
            control={
              <Button
                size="sm"
                variant="primary"
                disabled={!freshSnapshot || busy !== undefined}
                onClick={() => {
                  setBusy(item.receipt);
                  setError(false);
                  void fetch(`${PATH}/approve-key`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                      receipt: item.receipt,
                      publicKey: item.publicKey,
                      confirm: true,
                    }),
                  })
                    .then(json)
                    .then(
                      () => load(),
                      () => setError(true),
                    )
                    .finally(() => setBusy(undefined));
                }}
              >
                {t('connect.approve')}
              </Button>
            }
          />
        ))}
    </>
  );

  return (
    <div ref={mount} data-paired-devices="">
      {section === 'devices' ? (
        <SettingsSection>
          <SettingsRow
            title={t('connections.title')}
            control={
              <Button variant="primary" size="sm" onClick={() => setSetup('direction')}>
                {t('connections.add')}
              </Button>
            }
          />
          <SettingsRow
            title={t('connections.methods')}
            control={
              <Button
                variant="outline"
                size="sm"
                aria-expanded={manage}
                onClick={() => setManage(!manage)}
              >
                {t(manage ? 'connections.hide' : 'connections.manage')}
              </Button>
            }
          />
          {snapshot?.pendingKeys?.some((item) => !item.approved) ? (
            <SettingsRow
              title={t('connections.pending')}
              control={
                <Button variant="outline" size="sm" onClick={() => setReviewing(true)}>
                  {t('connections.review')}
                </Button>
              }
            />
          ) : null}
        </SettingsSection>
      ) : null}
      {reviewing && !pairing ? (
        <PanelDialog
          title={t('connections.pending')}
          closeLabel={t('common.close')}
          size="small"
          onClose={() => {
            setReviewing(false);
            onClose?.();
          }}
        >
          {snapshot === undefined ? (
            <Note>
              {t(readState === 'stale' ? 'devices.connection.unchecked' : 'devices.list.loading')}
            </Note>
          ) : snapshot.pendingKeys?.some((item) => !item.approved) ? (
            verification
          ) : (
            <Note>{t('connections.noPending')}</Note>
          )}
          {error ? <Note tone="danger">{t('devices.error')}</Note> : null}
          {readState === 'stale' ? (
            <Button variant="outline" onClick={() => void load()}>
              {t('devices.connection.retry')}
            </Button>
          ) : null}
        </PanelDialog>
      ) : null}
      {setup === 'remote' ? <AddRemoteHostDialog t={t} onClose={() => setSetup('closed')} /> : null}
      {setup !== 'closed' && setup !== 'remote' ? (
        <PanelDialog
          title={t('connections.add')}
          closeLabel={t('common.close')}
          size="small"
          onClose={() => setSetup('closed')}
        >
          <div {...stylex.props(styles.pairing)}>
            {readState === 'loading' && setup !== 'direction' ? (
              <Note>{t('devices.list.loading')}</Note>
            ) : null}
            {readState === 'stale' ? (
              <>
                <Note tone="warning">{t('devices.connection.stale')}</Note>
                <Button variant="outline" onClick={() => void load()}>
                  {t('devices.connection.retry')}
                </Button>
              </>
            ) : null}
            {setup !== 'direction' ? (
              <ConnectionProgress t={t} step={setup === 'method' ? 0 : 1} />
            ) : null}
            <Note>
              {t(
                setup === 'direction'
                  ? 'connections.direction'
                  : setup === 'method'
                    ? 'connections.choose'
                    : 'connections.prepare',
              )}
            </Note>
            {setup === 'direction' ? (
              <>
                <Button
                  variant="outline"
                  {...stylex.props(styles.choice)}
                  onClick={() => setSetup('method')}
                >
                  {t('connections.invite')}
                  <ChannelSidebarIcon name="chevron-right" />
                </Button>
                <Button
                  variant="outline"
                  {...stylex.props(styles.choice)}
                  onClick={() => setSetup('remote')}
                >
                  {t('connections.join')}
                  <ChannelSidebarIcon name="chevron-right" />
                </Button>
              </>
            ) : setup === 'method' ? (
              <>
                <ConnectionMethod
                  title={t('connections.lan')}
                  description={t('connections.lanDescription')}
                  detail={t('connections.lanDetail')}
                  disabled={!freshSnapshot}
                  onClick={() => {
                    if (lanReady) {
                      setSetup('closed');
                      open();
                    } else setSetup('lan');
                  }}
                />
                <ConnectionMethod
                  title="Tailscale"
                  description={t('connections.tailscaleDescription')}
                  detail={t('connections.tailscaleDetail')}
                  disabled={!freshSnapshot}
                  onClick={() => {
                    if (tailscaleReady) {
                      setSetup('closed');
                      open();
                    } else setSetup('tailscale');
                  }}
                />
                <ConnectionMethod
                  title="Tobs Connect"
                  description={t('connections.connectDescription')}
                  detail={t('connections.connectDetail')}
                  disabled={!freshSnapshot}
                  onClick={() => {
                    if (routes?.routes.some((route) => route.kind === 'connect' && route.ready)) {
                      setSetup('closed');
                      open();
                    } else setSetup('connect');
                  }}
                />
              </>
            ) : setup === 'lan' ? (
              <>
                <Note>{t('devices.lan.notice')}</Note>
                {error ? <Note tone="danger">{t('devices.error')}</Note> : null}
                {snapshot?.lan?.state === 'listening' && !lanReady ? (
                  <Note>{t('devices.lan.noAddress')}</Note>
                ) : null}
                <Button
                  variant="primary"
                  disabled={!freshSnapshot || busy !== undefined}
                  onClick={() => void setLan('enable', true)}
                >
                  {t('connections.enableContinue')}
                </Button>
              </>
            ) : setup === 'tailscale' ? (
              <>
                {routes ? (
                  <PhoneRouteSteps
                    t={t}
                    status={routes}
                    reachable={tailscaleReady}
                    port={portOf(routes)}
                    onPublish={() => publish()}
                  />
                ) : null}
                <Button
                  variant="primary"
                  disabled={!tailscaleReady || busy !== undefined}
                  onClick={() => {
                    setSetup('closed');
                    open();
                  }}
                >
                  {t('connections.continue')}
                </Button>
              </>
            ) : (
              <>
                {connectControls}
                <Button
                  variant="primary"
                  disabled={
                    !freshSnapshot ||
                    !routes?.routes.some((route) => route.kind === 'connect' && route.ready)
                  }
                  onClick={() => {
                    setSetup('closed');
                    open();
                  }}
                >
                  {t('connections.continue')}
                </Button>
              </>
            )}
            {setup !== 'direction' ? (
              <Button
                variant="outline"
                onClick={() => setSetup(setup === 'method' ? 'direction' : 'method')}
              >
                {t('connections.back')}
              </Button>
            ) : null}
          </div>
        </PanelDialog>
      ) : null}
      {readState === 'stale' && section !== 'requests' ? (
        <Callout tone="warning" data={{ 'data-device-status': 'stale' }}>
          {t('devices.connection.stale')}
          {checkedAt === undefined
            ? null
            : ` ${t('devices.connection.checked', {
                when: formatRelativeTime(checkedAt, now, t),
              })}`}
          <Button variant="outline" size="sm" onClick={() => void load()}>
            {t('devices.connection.retry')}
          </Button>
        </Callout>
      ) : null}
      {section === 'devices' && manage ? (
        <SettingsSection title={t('devices.connection.title')}>
          {snapshot?.lan ? (
            <SettingsRow
              title={t('devices.lan.title')}
              description={t(
                !freshSnapshot
                  ? 'devices.connection.unchecked'
                  : snapshot.lan.state === 'error'
                    ? 'devices.lan.failed'
                    : snapshot.lan.state === 'listening'
                      ? lanReady
                        ? 'devices.lan.enabled'
                        : 'devices.lan.noAddress'
                      : 'devices.lan.notice',
              )}
              data={{ 'data-device-lan': snapshot.lan.state }}
              control={
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!freshSnapshot || busy !== undefined}
                  onClick={() =>
                    void setLan(snapshot.lan?.state === 'listening' ? 'disable' : 'enable')
                  }
                >
                  {t(
                    snapshot.lan.state === 'listening'
                      ? 'devices.lan.disable'
                      : 'devices.lan.enable',
                  )}
                </Button>
              }
            >
              <Note>{t('devices.lan.network')}</Note>
            </SettingsRow>
          ) : null}
          <SettingsRow
            title={t('devices.tailscale.title')}
            description={t(
              !freshSnapshot
                ? 'devices.connection.unchecked'
                : tailscaleReady
                  ? 'devices.tailscale.ready'
                  : routes?.tailscale === 'stopped'
                    ? 'devices.tailscale.stopped'
                    : 'devices.tailscale.notice',
            )}
            data={{
              'data-device-tailscale': !freshSnapshot
                ? 'unknown'
                : tailscaleReady
                  ? 'ready'
                  : 'unprepared',
            }}
            control={
              <Button
                variant="outline"
                size="sm"
                aria-expanded={showTailscale}
                disabled={!freshSnapshot}
                onClick={() => setShowTailscale(!showTailscale)}
              >
                {t(showTailscale ? 'devices.tailscale.hide' : 'devices.tailscale.setup')}
              </Button>
            }
          >
            {showTailscale && routes && freshSnapshot ? (
              <div>
                {routes.managed?.enabled || routes.managed?.owned ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy !== undefined}
                    onClick={() => {
                      void publish('disable').then((failure) => setError(failure !== undefined));
                    }}
                  >
                    {t('devices.tailscale.disable')}
                  </Button>
                ) : tailscaleReady ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy !== undefined}
                    onClick={() => {
                      void publish().then((failure) => setError(failure !== undefined));
                    }}
                  >
                    {t('devices.tailscale.manage')}
                  </Button>
                ) : null}
                {error ? <Note tone="danger">{t('devices.error')}</Note> : null}
                <PhoneRouteSteps
                  t={t}
                  status={routes}
                  reachable={tailscaleReady}
                  port={portOf(routes)}
                  onPublish={() => publish()}
                />
              </div>
            ) : null}
          </SettingsRow>
        </SettingsSection>
      ) : null}
      {section === 'devices' && manage ? (
        <SettingsSection title={t('devices.connection.pairStep')}>
          <SettingsRow
            title={t('devices.pair.title')}
            description={t('devices.pair.description')}
            data={{ 'data-pair-phone': '' }}
            control={
              <Button
                variant="outline"
                size="sm"
                disabled={!ready || busy !== undefined}
                onClick={open}
              >
                {t('devices.pair.open')}
              </Button>
            }
          >
            {!ready ? (
              <Note>
                {t(
                  !snapshot && readState === 'loading'
                    ? 'devices.list.loading'
                    : freshSnapshot
                      ? 'devices.connection.prepare'
                      : 'devices.connection.unchecked',
                )}
              </Note>
            ) : null}
          </SettingsRow>
        </SettingsSection>
      ) : null}
      {section === 'devices' && manage && snapshot?.connect?.account ? connectControls : null}
      {section === 'connect' ? connectControls : null}
      {section === 'devices' ? (
        <SettingsSection title={t('devices.list.title')}>
          {devices.length === 0 ? (
            <Note>
              {snapshot === undefined
                ? t(readState === 'stale' ? 'devices.connection.unchecked' : 'devices.list.loading')
                : t('devices.list.empty')}
            </Note>
          ) : (
            devices.map((device) => (
              <SettingsRow
                key={device.id}
                title={device.name}
                data={{
                  'data-paired-device': device.id,
                  'data-revoked': device.revokedAt === undefined ? undefined : '',
                  'data-new-device': fresh(device) ? '' : undefined,
                }}
                description={[
                  t('devices.list.paired', {
                    when: formatRelativeTime(Date.parse(device.pairedAt), now, t),
                  }),
                  device.revokedAt !== undefined
                    ? t('devices.list.revoked', {
                        when: formatRelativeTime(Date.parse(device.revokedAt), now, t),
                      })
                    : device.lastSeenAt !== undefined
                      ? t('devices.list.lastSeen', {
                          when: formatRelativeTime(Date.parse(device.lastSeenAt), now, t),
                        })
                      : t('devices.list.neverSeen'),
                  ...(fresh(device) ? [t('devices.list.new')] : []),
                ].join(' · ')}
                control={
                  device.revokedAt === undefined ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy === device.id}
                      onClick={() => void revoke(device)}
                    >
                      {t('devices.list.revoke')}
                    </Button>
                  ) : undefined
                }
              />
            ))
          )}
          {error ? <Note tone="danger">{t('devices.error')}</Note> : null}
        </SettingsSection>
      ) : null}
      {pairing ? (
        <PanelDialog
          title={t('devices.pair.dialogTitle')}
          description={t('devices.pair.dialogDescription')}
          size="small"
          closeLabel={t('devices.pair.close')}
          onClose={close}
          data={{ 'data-pair-dialog': '' }}
        >
          <div ref={watch} {...stylex.props(styles.pairing)}>
            <ConnectionProgress t={t} step={2} />
            {verification}
            {pairView.state === 'paired' ? (
              <Note tone="success">{t('devices.pair.done', { name: pairView.device.name })}</Note>
            ) : pairView.state === 'failed' ||
              pairView.state === 'changed' ||
              pairView.state === 'invalid' ? (
              <>
                <Note tone="warning">
                  {t(
                    !freshSnapshot
                      ? 'devices.connection.stale'
                      : pairView.state === 'invalid'
                        ? 'connections.invitationInvalid'
                        : pairView.state === 'changed'
                          ? 'devices.pair.routeChanged'
                          : 'devices.error',
                  )}
                </Note>
                {freshSnapshot && !ready ? <Note>{t('devices.connection.prepare')}</Note> : null}
                <Button
                  variant="primary"
                  size="sm"
                  disabled={freshSnapshot && !ready}
                  onClick={() => void (freshSnapshot ? createOffer() : load())}
                >
                  {t(
                    freshSnapshot && pairView.state === 'changed'
                      ? 'devices.pair.renew'
                      : 'devices.connection.retry',
                  )}
                </Button>
              </>
            ) : !freshSnapshot ? (
              <>
                <Note tone="warning">{t('devices.connection.stale')}</Note>
                <Button variant="outline" size="sm" onClick={() => void load()}>
                  {t('devices.connection.retry')}
                </Button>
              </>
            ) : offer === undefined ? (
              <Note>{t('devices.list.loading')}</Note>
            ) : expired ? (
              <>
                <Note>{t('devices.pair.expired')}</Note>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!ready}
                  onClick={() => void createOffer()}
                >
                  {t('devices.pair.renew')}
                </Button>
              </>
            ) : (
              <>
                <svg
                  viewBox={`0 0 ${String(offer.qr.size)} ${String(offer.qr.size)}`}
                  shapeRendering="crispEdges"
                  role="img"
                  aria-label={t('devices.pair.qrLabel')}
                  data-pair-qr=""
                  {...stylex.props(styles.qr)}
                >
                  <path d={offer.qr.path} fill="black" />
                </svg>
                <Note>{t('devices.pair.expires', { seconds: secondsLeft })}</Note>
                <Note>
                  {t('devices.connection.available', {
                    routes: [
                      ...(offerKinds.has('lan') ? [t('devices.lan.title')] : []),
                      ...(offerKinds.has('tailscale') ? [t('devices.tailscale.title')] : []),
                      ...(offerKinds.has('connect') ? [t('devices.connect.title')] : []),
                    ].join(' · '),
                  })}
                </Note>
                {offer.reachable ? null : (
                  <Callout tone="warning">{t('devices.pair.loopbackOnly')}</Callout>
                )}
                <div {...stylex.props(styles.actions)}>
                  <Button variant="outline" size="sm" onClick={() => void copy(offer.link)}>
                    {copied ? t('devices.pair.copied') : t('devices.pair.copy')}
                  </Button>
                </div>
              </>
            )}
          </div>
        </PanelDialog>
      ) : null}
    </div>
  );
}
