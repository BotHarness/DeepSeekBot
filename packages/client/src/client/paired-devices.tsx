import { Button } from './ds/button.js';
import { Switch } from './ds/switch.js';
import { ConnectHealthCard } from './connect-health-card.js';
import type { ConnectHealthStatus } from '../../../core/src/devices/connect-health-contract.js';
import { ConnectAccountHosts } from './connect-account-hosts.js';
import { RelationshipSettings } from './relationship-settings.js';
import type { ConnectedHost } from '../../../core/src/devices/connect-account.js';
import { AccountHostConnectionDetails, ConnectionHosts } from './connection-hosts.js';
import {
  PrivateTunnelSettings,
  type PrivateRouteView,
  type PrivateTunnelView,
} from './private-tunnel-settings.js';
import { noiseFingerprint } from '@botharness/host-protocol/noise/xk';
import { keyBytes } from '@botharness/host-client/encrypted-carrier';
import { type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';

import { Callout } from './ds/callout.js';
import { ConnectPanel, type ConnectAccountStatus } from './connect-panel.js';
import { StatusBlock, StatusDisclosure, StatusStack } from './ds/status-block.js';
import { LanBotSettings } from './lan-bot-settings.js';
import type { LanBotSnapshot } from '../../../core/src/devices/bot-lan-control.js';
import { ChoiceButton } from './ds/choice-button.js';
import { Note } from './ds/note.js';
import { AddRemoteHostDialog } from './host-tabs.js';
import { ConnectionProgress } from './connection-progress.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import { formatRelativeTime } from './labels.js';
import type { PhoneRouteStatus } from './phone-route-steps.js';

import {
  renderPairedDeviceSetup,
  ConnectionMethod,
  ConnectionPanel,
} from './paired-device-setup.js';
import { renderPairedDeviceNetworkStatus } from './paired-device-network-status.js';
import { json, PATH, usePairedDevices } from './use-paired-devices.js';
import { OwnerPasswordSignInSettings } from './owner-password-sign-in-settings.js';
import type { BridgeCall } from './bridge-transport.js';

export type { ConnectedHost };

export interface PairedDevice {
  id: string;
  name: string;
  pairedAt: string;
  lastSeenAt?: string;
  feedReadAt?: string;
  revokedAt?: string;
}

export type RouteStatus = PhoneRouteStatus;

interface ConnectStatus {
  health?: ConnectHealthStatus;
  encryption?: { fingerprint: string; state: string };
  state: 'off' | 'starting' | 'connected' | 'error';
  hostname?: string;
  issue?: string;
  account?: ConnectAccountStatus;
}

export interface DevicesSnapshot {
  privateRelay?: { state: string; origin?: string; issue?: string };
  privateTunnel?: PrivateTunnelView;
  privateRoutes?: PrivateRouteView[];
  lanBots?: LanBotSnapshot;
  lan?: { state: 'off' | 'listening' | 'error'; issue?: string };
  host: { id: string; name: string };
  devices: PairedDevice[];
  pendingKeys?: {
    receipt: string;
    publicKey: string;
    name: string;
    approved: boolean;
  }[];
  routes: RouteStatus;
  connect?: ConnectStatus;
}

export interface PairingOffer {
  receipt: string;
  link: string;
  qr: { size: number; path: string };
  expiresAt: string;
  routes: string[];
  reachable: boolean;
}

export type PairingView =
  | { state: 'closed' | 'loading' | 'failed' | 'changed' | 'invalid' }
  | { state: 'ready'; offer: PairingOffer }
  | { state: 'paired'; device: PairedDevice };

const styles = stylex.create({
  page: { display: 'flex', flexDirection: 'column', gap: space.x5, minWidth: 0 },
  pageBar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: space.x3,
  },
  pageSpacer: { flexGrow: 1 },
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
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space.x3,
  },
  memberSignIn: {
    display: 'block',
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  meta: {
    margin: 0,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    overflowWrap: 'anywhere',
  },
  stale: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: space.x2,
  },
});

function tailscaleBody(
  routes: RouteStatus | undefined,
  t: PropsLocale<'botharness'>['t'],
): ReactNode {
  const route = routes?.routes.find((entry) => entry.kind === 'tailscale');
  if (!route) return t('devices.tailscale.stopped');
  if (route.memberSignIn === undefined) return route.url;
  return (
    <>
      {route.url}
      <span {...stylex.props(styles.memberSignIn)} data-member-sign-in={route.memberSignIn}>
        {t(
          route.memberSignIn === 'managed-tls'
            ? 'devices.tailscale.memberSignIn.trusted'
            : 'devices.tailscale.memberSignIn.untrusted',
        )}
      </span>
    </>
  );
}

export type PairedDevicesSettingsProps = PropsLocale<'botharness'> & {
  section?: 'devices' | 'connect' | 'requests';
  standalone?: boolean;
  page?: boolean;
  initialPairing?: boolean;
  initialRemote?: boolean;
  ownerPasswordSignInCall?: BridgeCall | undefined;
  pairedDeviceId?: string | undefined;
  onDevicePaired?: ((deviceId: string) => void) | undefined;
  onFeedRead?: ((deviceId: string) => void) | undefined;
  onClose?: () => void;
};

export function PairedDevicesSettings({
  t,
  section = 'devices',
  standalone = false,
  page = false,
  initialPairing = false,
  initialRemote = false,
  ownerPasswordSignInCall,
  onDevicePaired,
  onFeedRead,
  pairedDeviceId,
  onClose,
}: PairedDevicesSettingsProps): ReactElement {
  const state = usePairedDevices({
    section,
    initialPairing,
    initialRemote,
    pairedDeviceId,
    onDevicePaired,
    onFeedRead,
  });
  const {
    snapshot,
    pairView,
    pairing,
    offer,
    now,
    fresh,
    busy,
    setBusy,
    error,
    setError,
    copied,
    manage,
    setManage,
    lanDetails,
    setLanDetails,
    accountHosts,
    setAccountHosts,
    setup,
    setSetup,
    remoteFooter,
    setRemoteFooter,
    tunnelStep,
    setTunnelStep,
    preparingRelationshipRoute,
    reviewing,
    setReviewing,
    readState,
    checkedAt,
    load,
    mount,
    watch,
    publish,
    createOffer,
    open,
    setLan,
    close,
    account,
    revoke,
    copy,
    routes,
    freshSnapshot,
    ready,
    tailscaleReady,
    lanReady,
    offerKinds,
    expired,
    secondsLeft,
    devices,
  } = state;
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
                setup === 'phoneAddress'
                  ? 'phoneWays'
                  : setup === 'method' || setup === 'app' || setup === 'remote'
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
      onClick={() => {
        close();
        if (ready && pairView.state !== 'paired') setSetup('phoneWays');
      }}
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
            close();
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
        <>
          <SettingsSection title={t('connections.manage.existing')}>
            {snapshot ? (
              <StatusBlock
                icon="monitor"
                tone="accent"
                title={snapshot.host.name}
                body={t('devices.connect.thisComputer')}
              />
            ) : null}
            {tailscaleReady || routes?.managed?.enabled || routes?.managed?.owned ? (
              <StatusBlock
                icon="shield-check"
                tone={tailscaleReady ? 'success' : 'neutral'}
                title="Tailscale"
                body={tailscaleBody(routes, t)}
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
          </SettingsSection>
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
        </>
      ) : null}
      {standalone && section === 'devices' && overview ? (
        <SettingsSection title={t('connections.manage.switches')}>
          {ownerPasswordSignInCall === undefined ? null : (
            <OwnerPasswordSignInSettings t={t} call={ownerPasswordSignInCall} />
          )}
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
      {setup !== 'closed' && setup !== 'remote'
        ? renderPairedDeviceSetup({
            t,
            standalone,
            pairedDeviceId,
            ownerPasswordSignInCall,
            state,
            setupBack,
            connectControls,
            pairingProps: stylex.props(styles.pairing),
            metaProps: stylex.props(styles.meta),
            renderDirectionChoices: () => (
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
            ),
            renderConnectMethod: () => (
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
            ),
          })
        : null}
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

      {!standalone && section === 'devices' && overview && manage
        ? renderPairedDeviceNetworkStatus({
            t,
            state,
            metaProps: stylex.props(styles.meta),
            staleProps: stylex.props(styles.stale),
          })
        : null}
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
            <SettingsRow
              title={
                snapshot === undefined
                  ? t(
                      readState === 'stale'
                        ? 'devices.connection.unchecked'
                        : 'devices.list.loading',
                    )
                  : t('devices.list.empty')
              }
            />
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
  const footer =
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
    ) : undefined;
  const back = overview
    ? undefined
    : (pairingBack ??
      setupBack ?? (
        <Button
          variant="outline"
          icon={<ChannelSidebarIcon name="arrow-left" size={16} />}
          onClick={() => {
            setReviewing(false);
            preparingRelationshipRoute.current = false;
            setSetup('closed');
          }}
        >
          {t('connections.back')}
        </Button>
      ));
  if (page)
    return (
      <div {...stylex.props(styles.page)} data-connections-page="">
        {content}
        {back === undefined && footer === undefined ? null : (
          <div {...stylex.props(styles.pageBar)}>
            {back}
            <span {...stylex.props(styles.pageSpacer)} />
            {footer}
          </div>
        )}
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
