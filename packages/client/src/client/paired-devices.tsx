import { ConnectHealthCard } from './connect-health-card.js';
import type { ConnectHealthStatus } from '../../../core/src/devices/connect-health-contract.js';
import { ConnectAccountHosts } from './connect-account-hosts.js';
import { RelationshipSettings } from './relationship-settings.js';
import { ConnectionProgressLog } from './connection-progress-log.js';
import type { ConnectedHost } from '../../../core/src/devices/connect-account.js';
import { AccountHostConnectionDetails, ConnectionHosts } from './connection-hosts.js';
import { MobileAppDownloads } from './mobile-apps.js';
import { ConnectionGuide } from './connection-guide.js';
import { PrivateRelaySettings } from './private-relay-settings.js';
import {
  PrivateTunnelSettings,
  type PrivateRouteView,
  type PrivateTunnelStep,
  type PrivateTunnelView,
} from './private-tunnel-settings.js';
import { noiseFingerprint } from '../../../core/src/devices/noise/xk.js';
import { keyBytes } from '../../../../apps/mobile/src/host/encrypted-carrier.js';
import { checkRoute, isConnectRoute, isLanRoute } from '../../../../apps/mobile/src/host/route.js';
import { useRef, useState, type ComponentProps, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';

import { Callout } from './ds/callout.js';
import { ConnectPanel, type ConnectAccountStatus } from './connect-panel.js';
import { CopyChip, StatusBlock, StatusDisclosure, StatusStack } from './ds/status-block.js';
import { LanBotSettings } from './lan-bot-settings.js';
import type { LanBotSnapshot } from '../../../core/src/devices/bot-lan-control.js';
import { ChoiceButton } from './ds/choice-button.js';
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
  feedReadAt?: string;
  revokedAt?: string;
}

type RouteStatus = PhoneRouteStatus;

interface ConnectStatus {
  health?: ConnectHealthStatus;
  encryption?: { fingerprint: string; state: string };
  state: 'off' | 'starting' | 'connected' | 'error';
  hostname?: string;
  issue?: string;
  account?: ConnectAccountStatus;
}

interface DevicesSnapshot {
  privateRelay?: { state: string; origin?: string; issue?: string };
  privateTunnel?: PrivateTunnelView;
  privateRoutes?: PrivateRouteView[];
  lanBots?: LanBotSnapshot;
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
  actions: { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: space.x3 },
  meta: {
    margin: 0,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    overflowWrap: 'anywhere',
  },
  stale: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: space.x2 },
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
      <ChoiceButton title={title} description={description} disabled={disabled} onClick={onClick} />
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

function ConnectionPanel({
  inline,
  children,
  ...props
}: ComponentProps<typeof PanelDialog> & { inline?: boolean }): ReactElement {
  return inline ? (
    <section {...props.data} aria-label={props.title}>
      {children}
    </section>
  ) : (
    <PanelDialog {...props}>{children}</PanelDialog>
  );
}

export function PairedDevicesSettings({
  t,
  section = 'devices',
  standalone = false,
  initialPairing = false,
  initialRemote = false,
  onDevicePaired,
  onFeedRead,
  pairedDeviceId,
  onClose,
}: PropsLocale<'botharness'> & {
  section?: 'devices' | 'connect' | 'requests';
  standalone?: boolean;
  initialPairing?: boolean;
  initialRemote?: boolean;
  pairedDeviceId?: string | undefined;
  onDevicePaired?: ((deviceId: string) => void) | undefined;
  onFeedRead?: ((deviceId: string) => void) | undefined;
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
  const [advancedMethods, setAdvancedMethods] = useState(false);
  const [manage, setManage] = useState(false);
  const [lanDetails, setLanDetails] = useState(false);
  const [accountHosts, setAccountHosts] = useState<ConnectedHost[]>([]);
  type Setup =
    | 'app'
    | 'private'
    | 'privateRelay'
    | 'closed'
    | 'direction'
    | 'method'
    | 'lan'
    | 'tailscale'
    | 'connect'
    | 'remote';
  const [setup, setSetupState] = useState<Setup>(
    initialRemote ? 'remote' : initialPairing ? 'app' : 'closed',
  );
  const [remoteFooter, setRemoteFooter] = useState<HTMLDivElement | null>(null);
  const [tunnelStep, setTunnelStep] = useState<PrivateTunnelStep>('choose');
  const phoneAppReady = useRef(false);
  const preparingRelationshipRoute = useRef(false);
  const setupVersion = useRef(0);
  const setSetup = (next: Setup) => {
    if (next === 'direction' || next === 'app' || next === 'remote')
      preparingRelationshipRoute.current = false;
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
        if (
          pairedDeviceId &&
          (!initialPairing || phoneAppReady.current) &&
          pairViewRef.current.state === 'closed'
        ) {
          const previous = value.devices.find(
            (device) => device.id === pairedDeviceId && !device.revokedAt,
          );
          if (previous) {
            updatePairing({ state: 'paired', device: previous });
            setSetup('closed');
          }
        }
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
          if (paired !== undefined) {
            updatePairing({ state: 'paired', device: paired });
            onDevicePaired?.(paired.id);
          } else if (['expired', 'refused', 'superseded', 'unknown'].includes(status.state))
            updatePairing({ state: 'invalid' });
          else if (routeKey(view.offer.routes) !== availableRouteKey(value))
            updatePairing({ state: 'changed' });
        }
        const pairedId =
          pairViewRef.current.state === 'paired' ? pairViewRef.current.device.id : pairedDeviceId;
        const readDevice = value.devices.find(
          (device) => device.id === pairedId && !device.revokedAt && device.feedReadAt,
        );
        if (readDevice && (!initialPairing || phoneAppReady.current)) onFeedRead?.(readDevice.id);
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
    if (preparingRelationshipRoute.current) {
      preparingRelationshipRoute.current = false;
      setSetup('closed');
      return;
    }
    if (!phoneAppReady.current) {
      setSetup('app');
      return;
    }
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
      <ConnectPanel
        t={t}
        account={signIn}
        tunnel={connect}
        fresh={freshSnapshot}
        busy={busy}
        onAccount={(action) => void account(action)}
        reloadSnapshot={load}
        signInLabel={t(
          setup === 'connect' ? 'connections.signInConnect' : 'devices.connect.signIn',
        )}
      />
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

  const setupBack =
    setup !== 'closed' && setup !== 'direction' ? (
      <Button
        variant="outline"
        icon={<ChannelSidebarIcon name="arrow-left" size={16} />}
        onClick={() =>
          setup === 'private' && tunnelStep !== 'choose'
            ? setTunnelStep('choose')
            : setSetup(
                setup === 'method' || setup === 'app' || setup === 'remote'
                  ? 'direction'
                  : 'method',
              )
        }
      >
        {t('connections.back')}
      </Button>
    ) : undefined;
  const pairingBack = pairing ? (
    <Button
      variant="outline"
      icon={<ChannelSidebarIcon name="arrow-left" size={16} />}
      onClick={close}
    >
      {t('connections.back')}
    </Button>
  ) : undefined;
  const overview = !standalone || (setup === 'closed' && !pairing && !reviewing);
  const content = (
    <div ref={mount} data-paired-devices="">
      {section === 'devices' && setup !== 'remote' ? (
        <RelationshipSettings
          t={t}
          onPrepareRoute={() => {
            preparingRelationshipRoute.current = true;
            setSetup('method');
          }}
        />
      ) : null}
      {!standalone && section === 'devices' && overview ? (
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
            description={
              snapshot ? t('connections.hosts.local', { name: snapshot.host.name }) : undefined
            }
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
      {standalone && section === 'devices' && overview ? (
        <StatusStack title={t('connections.manage.existing')}>
          {snapshot ? (
            <StatusBlock
              icon="monitor"
              tone="accent"
              title={snapshot.host.name}
              body={t('devices.connect.thisComputer')}
            />
          ) : null}
          <PrivateTunnelSettings
            t={t}
            routes={snapshot?.privateRoutes ?? []}
            managementOnly
            fresh={freshSnapshot}
            step={tunnelStep}
            setStep={setTunnelStep}
            refresh={load}
            pair={open}
            advanced={() => setSetup('privateRelay')}
          />
          {tailscaleReady || routes?.managed?.enabled || routes?.managed?.owned ? (
            <StatusBlock
              icon="shield-check"
              tone={tailscaleReady ? 'success' : 'neutral'}
              title="Tailscale"
              body={
                routes?.routes.find((route) => route.kind === 'tailscale')?.url ??
                t('devices.tailscale.stopped')
              }
              action={
                <>
                  {routes?.managed?.enabled || routes?.managed?.owned ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!freshSnapshot || busy !== undefined}
                      onClick={() =>
                        void publish('disable').then((failure) => setError(failure !== undefined))
                      }
                    >
                      {t('devices.tailscale.disable')}
                    </Button>
                  ) : null}
                  <Button variant="outline" size="sm" onClick={() => setSetup('tailscale')}>
                    {t('privateTunnel.panel.manage')}
                  </Button>
                </>
              }
            />
          ) : null}
          {snapshot?.privateRelay && snapshot.privateRelay.state !== 'off' ? (
            <StatusBlock
              icon="server"
              tone="neutral"
              title={t('privateRelay.title')}
              body={snapshot.privateRelay.origin}
              action={
                <Button variant="outline" size="sm" onClick={() => setSetup('privateRelay')}>
                  {t('privateTunnel.panel.manage')}
                </Button>
              }
            />
          ) : null}
          {signIn && (signIn.state === 'signed-in' || signIn.issue === 'host-limit') ? (
            <StatusStack title="Tobs Connect">
              <Note>{signIn.email}</Note>
              <ConnectHealthCard
                t={t}
                health={snapshot?.connect?.health}
                reloadSnapshot={load}
                fresh={freshSnapshot}
              />
              <ConnectAccountHosts
                t={t}
                account={signIn}
                reloadSnapshot={load}
                refreshOn={
                  snapshot?.connect?.health && 'checkedAt' in snapshot.connect.health
                    ? snapshot.connect.health.checkedAt
                    : undefined
                }
                allowCurrentSignOut
                onHostsChanged={setAccountHosts}
                details={(host) => <AccountHostConnectionDetails host={host} t={t} />}
              />
            </StatusStack>
          ) : null}
          <ConnectionHosts
            key={signIn?.email ?? 'signed-out'}
            managedAccountHosts={accountHosts}
            t={t}
            accountLinked={signIn?.state === 'signed-in' || signIn?.issue === 'host-limit'}
          />
          {error ? <Note tone="danger">{t('devices.error')}</Note> : null}
        </StatusStack>
      ) : null}
      {standalone && section === 'devices' && overview ? (
        <SettingsSection title={t('connections.manage.switches')}>
          {snapshot?.lan ? (
            <SettingsRow
              title={t('devices.lan.title')}
              description={t('devices.lan.notice')}
              control={
                <Switch
                  label={t('devices.lan.title')}
                  checked={snapshot.lan.state === 'listening'}
                  disabled={!freshSnapshot || busy !== undefined}
                  onChange={() =>
                    void setLan(snapshot.lan?.state === 'listening' ? 'disable' : 'enable')
                  }
                />
              }
            />
          ) : null}
          {snapshot?.pendingKeys?.some((item) => !item.approved) ? (
            <SettingsRow
              title={t('connections.pending')}
              control={
                <Button variant="outline" onClick={() => setReviewing(true)}>
                  {t('connections.review')}
                </Button>
              }
            />
          ) : null}
          {snapshot?.lanBots ? (
            <StatusDisclosure
              icon="house"
              title={t('connections.manage.nearby')}
              open={lanDetails}
              onToggle={() => setLanDetails(!lanDetails)}
            >
              <LanBotSettings
                t={t}
                snapshot={snapshot.lanBots}
                fresh={freshSnapshot && busy === undefined}
                onChanged={() => void load()}
              />
            </StatusDisclosure>
          ) : null}
        </SettingsSection>
      ) : null}
      {reviewing && !pairing ? (
        <ConnectionPanel
          inline={standalone}
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
        </ConnectionPanel>
      ) : null}
      {setup === 'remote' ? (
        <AddRemoteHostDialog
          t={t}
          inline={standalone}
          footerContainer={standalone ? remoteFooter : undefined}
          onBack={() => setSetup('direction')}
          onClose={() => setSetup('closed')}
        />
      ) : null}
      {setup !== 'closed' && setup !== 'remote' ? (
        <ConnectionPanel
          inline={standalone}
          title={t('connections.add')}
          secondary={setupBack}
          closeLabel={t('common.close')}
          size="small"
          onClose={() => {
            preparingRelationshipRoute.current = false;
            setSetup('closed');
          }}
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
            {setup !== 'direction' && setup !== 'app' ? (
              <ConnectionProgress t={t} step={setup === 'method' ? 0 : 1} />
            ) : null}
            {setup !== 'app' ? (
              <Note>
                {t(
                  setup === 'direction'
                    ? 'connections.direction'
                    : setup === 'method'
                      ? 'connections.choose'
                      : 'connections.prepare',
                )}
              </Note>
            ) : null}
            {(setup === 'privateRelay' ||
              (setup === 'private' && (snapshot?.privateRelay?.state ?? 'off') !== 'off')) &&
            ((snapshot?.privateTunnel?.state ?? 'off') !== 'off' ||
              (snapshot?.privateRelay?.state ?? 'off') !== 'off') ? (
              <Note tone="warning">{t('connections.privateReplacement')}</Note>
            ) : null}
            {setup === 'app' ? (
              <div data-phone-app-guide="">
                <button
                  type="button"
                  className="bh-mobile-apps-link bh-mobile-apps-connect"
                  data-modal-autofocus
                  disabled={!freshSnapshot || busy !== undefined}
                  onClick={() => {
                    phoneAppReady.current = true;
                    if (pairedDeviceId) {
                      setSetup('closed');
                      void load();
                    } else if (snapshot && (hasPhoneRoute(snapshot.routes) || onTailnet())) {
                      setSetup('closed');
                      void createOffer();
                    } else setSetup('method');
                  }}
                >
                  <ChannelSidebarIcon name="smartphone" size={16} />
                  <span>{t('connections.phoneApp.ready')}</span>
                  <ChannelSidebarIcon name="chevron-right" size={14} />
                </button>
                <MobileAppDownloads t={t} />
              </div>
            ) : setup === 'direction' ? (
              <>
                <ChoiceButton
                  leading={<ChannelSidebarIcon name="smartphone" />}
                  title={t('connections.invite')}
                  onClick={() => setSetup('app')}
                />
                <ChoiceButton
                  leading={<ChannelSidebarIcon name="monitor" />}
                  title={t('connections.join')}
                  description={t('connections.joinHint')}
                  onClick={() => setSetup('remote')}
                />
              </>
            ) : setup === 'method' ? (
              <>
                <ConnectionMethod
                  title={t(
                    snapshot?.privateTunnel?.mode && snapshot.privateTunnel.mode !== 'quick'
                      ? 'privateTunnel.title'
                      : 'privateTunnel.quickEntry',
                  )}
                  description={t(
                    snapshot?.privateTunnel?.mode && snapshot.privateTunnel.mode !== 'quick'
                      ? 'privateTunnel.description'
                      : 'privateTunnel.quickEntryDescription',
                  )}
                  detail={t('privateTunnel.intro')}
                  disabled={!freshSnapshot}
                  onClick={() => {
                    setTunnelStep('choose');
                    setSetup('private');
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
                <StatusDisclosure
                  icon="settings"
                  title={t('connections.advancedMethods')}
                  fullWidth
                  open={advancedMethods}
                  onToggle={() => setAdvancedMethods(!advancedMethods)}
                >
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
                      setSetup('tailscale');
                    }}
                  />
                  <ConnectionMethod
                    title={t('privateTunnel.namedTitle')}
                    description={t('privateTunnel.namedDescription')}
                    detail={t('connections.namedRequirements')}
                    disabled={!freshSnapshot}
                    onClick={() => {
                      setTunnelStep('named');
                      setSetup('private');
                    }}
                  />
                  <ConnectionMethod
                    title={t('privateTunnel.ingressTitle')}
                    description={t('privateTunnel.ingressDescription')}
                    detail={t('connections.ingressRequirements')}
                    disabled={!freshSnapshot}
                    onClick={() => {
                      setTunnelStep('ingress');
                      setSetup('private');
                    }}
                  />
                  <ConnectionMethod
                    title={t('privateRelay.title')}
                    description={t('privateRelay.description')}
                    detail={t('privateRelay.requirement')}
                    disabled={!freshSnapshot}
                    onClick={() => setSetup('privateRelay')}
                  />
                </StatusDisclosure>
              </>
            ) : (setup === 'private' ||
                (setup === 'privateRelay' &&
                  snapshot?.privateTunnel?.state !== undefined &&
                  snapshot.privateTunnel.state !== 'off')) &&
              (snapshot?.privateRelay?.state ?? 'off') === 'off' ? (
              <PrivateTunnelSettings
                t={t}
                {...(snapshot?.privateTunnel ? { status: snapshot.privateTunnel } : {})}
                {...(snapshot?.privateRoutes ? { routes: snapshot.privateRoutes } : {})}
                refresh={load}
                pair={() => {
                  setSetup('closed');
                  open();
                }}
                advanced={() => setSetup('privateRelay')}
                step={tunnelStep}
                setStep={setTunnelStep}
              />
            ) : setup === 'private' || setup === 'privateRelay' ? (
              <PrivateRelaySettings
                t={t}
                {...(snapshot?.privateRelay ? { status: snapshot.privateRelay } : {})}
                refresh={load}
                pair={() => {
                  setSetup('closed');
                  open();
                }}
              />
            ) : setup === 'lan' ? (
              <StatusStack title={t('devices.lan.title')}>
                <StatusBlock
                  icon="house"
                  tone="accent"
                  title={t('devices.lan.panel.offTitle')}
                  body={t('devices.lan.notice')}
                  action={
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!freshSnapshot || busy !== undefined}
                      onClick={() => void setLan('enable', true)}
                    >
                      {t('connections.enableContinue')}
                    </Button>
                  }
                  data={{ 'data-lan-setup': snapshot?.lan?.state ?? 'off' }}
                >
                  <p {...stylex.props(styles.meta)}>{t('devices.lan.network')}</p>
                </StatusBlock>
                {error ? (
                  <StatusBlock
                    icon="info"
                    tone="warning"
                    title={t('devices.lan.panel.failedTitle')}
                    body={t('devices.error')}
                  />
                ) : snapshot?.lan?.state === 'listening' && !lanReady ? (
                  <StatusBlock
                    icon="info"
                    tone="warning"
                    title={t('devices.lan.panel.noAddressTitle')}
                    body={t('devices.lan.noAddress')}
                  />
                ) : null}
              </StatusStack>
            ) : setup === 'tailscale' ? (
              <StatusStack title={t('devices.tailscale.title')}>
                <Note tone="warning">{t('connections.tailscaleVpn')}</Note>
                <ConnectionGuide t={t} method="tailscale" />
                {tailscaleReady ? (
                  <StatusBlock
                    icon="check"
                    tone="success"
                    title={t('devices.tailscale.panel.readyTitle')}
                    body={t('devices.tailscale.ready')}
                    action={
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={busy !== undefined}
                        onClick={() => {
                          setSetup('closed');
                          open();
                        }}
                      >
                        {t('connections.continue')}
                      </Button>
                    }
                    data={{ 'data-tailscale-setup': 'ready' }}
                  />
                ) : (
                  <StatusBlock
                    icon="shield-check"
                    tone={routes?.tailscale === 'stopped' ? 'warning' : 'accent'}
                    title={t(
                      routes?.tailscale === 'stopped'
                        ? 'devices.tailscale.panel.stoppedTitle'
                        : 'devices.tailscale.panel.offTitle',
                    )}
                    body={t(
                      routes?.tailscale === 'stopped'
                        ? 'devices.tailscale.stopped'
                        : 'devices.tailscale.notice',
                    )}
                    data={{ 'data-tailscale-setup': routes?.tailscale ?? 'unknown' }}
                  />
                )}
                {routes && !tailscaleReady ? (
                  <PhoneRouteSteps
                    t={t}
                    status={routes}
                    reachable={tailscaleReady}
                    port={portOf(routes)}
                    onPublish={() => publish()}
                  />
                ) : null}
              </StatusStack>
            ) : (
              <>
                {connectControls ?? <Note>{t('connections.connectUnavailable')}</Note>}
                <Button
                  variant="outline"
                  onClick={() => {
                    setTunnelStep('choose');
                    setSetup('private');
                  }}
                >
                  {t('connections.useQuickTunnel')}
                </Button>
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
            {['private', 'privateRelay', 'connect', 'tailscale', 'lan'].includes(setup) ? (
              <ConnectionProgressLog
                key={setup}
                t={t}
                source={
                  setup === 'private'
                    ? 'private-tunnel'
                    : setup === 'privateRelay'
                      ? 'private-relay'
                      : setup === 'connect'
                        ? 'device-connect'
                        : setup === 'tailscale'
                          ? 'device-tailscale'
                          : 'device-lan'
                }
              />
            ) : null}
          </div>
        </ConnectionPanel>
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
      {!standalone && section === 'devices' && overview && manage ? (
        <StatusStack title={t('devices.connection.title')}>
          {snapshot?.lan ? (
            <StatusBlock
              icon="house"
              tone={
                !freshSnapshot
                  ? 'neutral'
                  : snapshot.lan.state === 'error' ||
                      (snapshot.lan.state === 'listening' && !lanReady)
                    ? 'warning'
                    : snapshot.lan.state === 'listening'
                      ? 'success'
                      : 'neutral'
              }
              title={t('devices.lan.title')}
              body={t(
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
              action={
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
              <p {...stylex.props(styles.meta)}>{t('devices.lan.network')}</p>
            </StatusBlock>
          ) : null}
          <StatusBlock
            icon="shield-check"
            tone={
              !freshSnapshot
                ? 'neutral'
                : routes?.staleRoutes?.length ||
                    (!tailscaleReady && routes?.tailscale === 'stopped')
                  ? 'warning'
                  : tailscaleReady
                    ? 'success'
                    : 'neutral'
            }
            title={t('devices.tailscale.title')}
            body={t(
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
            action={
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
            {freshSnapshot && routes?.staleRoutes?.length ? (
              <div data-tailscale-stale="" {...stylex.props(styles.stale)}>
                <p {...stylex.props(styles.meta)}>{t('devices.tailscale.stale')}</p>
                {routes.staleRoutes.map((route) => (
                  <div key={route.url} {...stylex.props(styles.stale)}>
                    <CopyChip
                      value={route.url}
                      copyLabel={t('devices.route.copy')}
                      copiedLabel={t('devices.pair.copied')}
                    />
                    <p {...stylex.props(styles.meta)}>
                      {t('devices.tailscale.localPort', { port: route.targetPort })}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </StatusBlock>
          {showTailscale && routes && freshSnapshot ? (
            <div {...stylex.props(styles.stale)}>
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
        </StatusStack>
      ) : null}
      {!standalone && section === 'devices' && overview && manage ? (
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
      {!standalone && section === 'devices' && overview && manage && snapshot?.connect?.account
        ? connectControls
        : null}
      {!standalone && section === 'devices' && overview && manage && snapshot?.lanBots ? (
        <LanBotSettings
          t={t}
          snapshot={snapshot.lanBots}
          fresh={freshSnapshot && busy === undefined}
          onChanged={() => void load()}
        />
      ) : null}
      {section === 'connect' ? connectControls : null}
      {section === 'devices' && overview ? (
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
        <ConnectionPanel
          inline={standalone}
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      close();
                      setSetup('method');
                    }}
                  >
                    {t('connections.methods')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void copy(offer.link)}>
                    {copied ? t('devices.pair.copied') : t('devices.pair.copy')}
                  </Button>
                </div>
              </>
            )}
          </div>
        </ConnectionPanel>
      ) : null}
    </div>
  );
  return standalone ? (
    <PanelDialog
      title={t('connections.title')}
      secondary={
        pairingBack ??
        setupBack ?? (
          <Button
            variant="outline"
            icon={<ChannelSidebarIcon name="arrow-left" size={16} />}
            onClick={() => {
              if (overview) onClose?.();
              else {
                setReviewing(false);
                preparingRelationshipRoute.current = false;
                setSetup('closed');
              }
            }}
          >
            {t('connections.back')}
          </Button>
        )
      }
      actions={
        setup === 'remote' ? (
          <div ref={setRemoteFooter} />
        ) : overview ? (
          <Button
            variant="primary"
            icon={<ChannelSidebarIcon name="plus" size={16} />}
            onClick={() => setSetup('direction')}
          >
            {t('connections.add')}
          </Button>
        ) : undefined
      }
      closeLabel={t('common.close')}
      scroll
      onClose={() => {
        close();
        onClose?.();
      }}
    >
      {content}
    </PanelDialog>
  ) : (
    content
  );
}
