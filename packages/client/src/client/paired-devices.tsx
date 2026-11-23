import { Button } from './ds/button.js';
import { ConnectHealthCard } from './connect-health-card.js';
import type { ConnectHealthStatus } from '../../../core/src/devices/connect-health-contract.js';
import { ConnectAccountHosts } from './connect-account-hosts.js';
import { RelationshipSettings } from './relationship-settings.js';
import type { ConnectedHost } from '../../../core/src/devices/connect-account.js';
import { AccountHostConnectionDetails } from './connection-hosts.js';
import { ConnectionMethods } from './connection-methods.js';
import { useMountedResource } from './mounted-resource.js';
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
import { StatusDisclosure, StatusHeading, StatusStack } from './ds/status-block.js';
import { LanBotSettings } from './lan-bot-settings.js';
import type { LanBotSnapshot } from '../../../core/src/devices/bot-lan-control.js';
import { Note } from './ds/note.js';
import { Icon } from './ds/icon.js';
import { ListCard, ListCardItem } from './ds/list-card.js';
import { ConnectionProgress } from './connection-progress.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { style, space, type as typeScale, ink } from './ds/tobs.stylex.js';
import { formatRelativeTime } from './labels.js';
import type { PhoneRouteStatus } from './phone-route-steps.js';

import { renderPairedDeviceSetup, ConnectionPanel } from './paired-device-setup.js';
import { renderPairedDeviceNetworkStatus } from './paired-device-network-status.js';
import { json, PATH, usePairedDevices } from './use-paired-devices.js';
import { PhonePairingAddress } from './phone-pairing-address.js';
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
  pairing: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: space.x4,
    minWidth: 0,
  },
  qr: {
    width: '220px',
    maxWidth: '100%',
    height: 'auto',
    aspectRatio: '1',
    padding: space.x3,
    borderRadius: style.radiusCard,
    backgroundColor: 'white',
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space.x3,
  },
  ready: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: space.x5,
    minWidth: 0,
  },
  readyAddress: { flex: '1 1 15rem', minWidth: 0 },
  readyCode: { flex: '1 1 auto', minWidth: 0 },
  meta: {
    margin: 0,
    color: ink.secondary,
    fontSize: typeScale.captionSize,
    lineHeight: typeScale.captionLine,
    overflowWrap: 'anywhere',
  },
  stale: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: space.x2,
  },
});

export type PairedDevicesSettingsProps = PropsLocale<'botharness'> & {
  section?: 'devices' | 'connect' | 'requests';
  standalone?: boolean;
  page?: boolean;
  initialPairing?: boolean;
  initialQuick?: boolean;
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
  initialQuick = false,
  ownerPasswordSignInCall,
  onDevicePaired,
  onFeedRead,
  pairedDeviceId,
  onClose,
}: PairedDevicesSettingsProps): ReactElement {
  const state = usePairedDevices({
    section,
    initialPairing,
    initialQuick,
    page,
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
    setup,
    setSetup,
    preparingRelationshipRoute,
    reviewing,
    setReviewing,
    readState,
    checkedAt,
    load,
    mount,
    watch,
    createOffer,
    begin,
    open,
    close,
    account,
    revoke,
    copy,
    routes,
    freshSnapshot,
    ready,
    expired,
    secondsLeft,
    devices,
  } = state;
  const readyMount = useMountedResource<HTMLDivElement>(() => {
    void createOffer();
  }, []);
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
        ?.filter(
          (item) => !item.approved && (reviewing || !pairing || item.receipt === offer?.receipt),
        )
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
    setup !== 'closed' ? (
      <Button
        variant="outline"
        icon={<ChannelSidebarIcon name="arrow-left" size={16} />}
        onClick={() =>
          setSetup(
            page || setup === 'method' || setup === 'app' || setup === 'quick'
              ? 'closed'
              : 'method',
          )
        }
      >
        {t('connections.back')}
      </Button>
    ) : undefined;
  const pairingBack =
    pairing && !page ? (
      <Button
        variant="outline"
        icon={<ChannelSidebarIcon name="arrow-left" size={16} />}
        onClick={close}
      >
        {t('connections.back')}
      </Button>
    ) : undefined;
  const overview = !standalone || (setup === 'closed' && (page || !pairing) && !reviewing);
  const pageBackMount = useMountedResource<HTMLDivElement>((node) => {
    node.querySelector('button')?.focus();
  }, []);
  const address =
    ready && ownerPasswordSignInCall ? (
      <PhonePairingAddress
        key={routes?.routes
          .filter((route) => route.ready)
          .map((route) => route.url)
          .join('\n')}
        call={ownerPasswordSignInCall}
        t={t}
        switchControl={page || initialQuick}
      />
    ) : null;
  const offeredRoutes = (
    [
      ['lan', 'devices.lan.title'],
      ['tailscale', 'devices.tailscale.title'],
      ['connect', 'devices.connect.title'],
      ['private', 'privateTunnel.title'],
    ] as const
  ).flatMap(([kind, label]) =>
    routes?.routes.some((route) => route.kind === kind && offer?.routes.includes(route.url))
      ? [t(label)]
      : [],
  );
  const pairingPanel = (
    <ConnectionPanel
      inline={standalone}
      title={t('devices.pair.dialogTitle')}
      description={t('devices.pair.dialogDescription')}
      size="small"
      closeLabel={t('devices.pair.close')}
      onClose={close}
      data={{ 'data-pair-dialog': '' }}
    >
      {page ? <StatusHeading>{t('connections.ready.heading')}</StatusHeading> : null}
      <div {...stylex.props(page && styles.ready)}>
        <div ref={watch} {...stylex.props(styles.pairing, page && styles.readyCode)}>
          {page ? null : <ConnectionProgress t={t} step={2} />}
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
              {page || initialQuick ? null : (
                <Note>
                  {t('devices.connection.available', { routes: offeredRoutes.join(' · ') })}
                </Note>
              )}

              {offer.reachable ? null : (
                <Callout tone="warning">{t('devices.pair.loopbackOnly')}</Callout>
              )}
              <div {...stylex.props(styles.actions)}>
                {page ? null : (
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
                )}
                <Button variant="outline" size="sm" onClick={() => void copy(offer.link)}>
                  {copied ? t('devices.pair.copied') : t('devices.pair.copy')}
                </Button>
              </div>
            </>
          )}
          {page ? null : address}
        </div>
        {page && address ? <div {...stylex.props(styles.readyAddress)}>{address}</div> : null}
      </div>
    </ConnectionPanel>
  );
  const accountComputers =
    signIn && (signIn.state === 'signed-in' || signIn.issue === 'host-limit') ? (
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
        details={(host) => <AccountHostConnectionDetails host={host} t={t} />}
      />
    ) : null;
  const pairedDevices = (
    <StatusStack title={t('devices.list.title')}>
      <ListCard label={t('devices.list.title')}>
        {devices.length === 0 ? (
          <ListCardItem
            title={
              snapshot === undefined
                ? t(readState === 'stale' ? 'devices.connection.unchecked' : 'devices.list.loading')
                : t('devices.list.empty')
            }
          />
        ) : (
          devices.map((device) => (
            <ListCardItem
              key={device.id}
              title={device.name}
              data={{
                'data-paired-device': device.id,
                'data-revoked': device.revokedAt === undefined ? undefined : '',
                'data-new-device': fresh(device) ? '' : undefined,
              }}
              leading={<Icon name="smartphone" />}
              summary={[
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
              trailing={
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
      </ListCard>
      {error ? <Note tone="danger">{t('devices.error')}</Note> : null}
    </StatusStack>
  );
  const content = (
    <div ref={mount} data-paired-devices="" {...stylex.props(page && styles.page)}>
      {page && overview && ready && !pairing ? <div ref={readyMount} /> : null}
      {page && overview && pairing ? pairingPanel : null}
      {!standalone && section === 'devices' && overview ? (
        <SettingsSection>
          <SettingsRow
            title={t('connections.title')}
            control={
              <Button variant="primary" size="sm" onClick={begin}>
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
          {page ? (
            <>
              <ConnectionMethods t={t} state={state} />
              <StatusStack
                title={t('connections.manage.existing')}
                data={{ 'data-connections-management': '' }}
              >
                <ConnectionMethods management t={t} state={state} />
                {pairedDevices}
                {accountComputers ?? (
                  <StatusStack title={t('devices.connect.computers')}>
                    <ListCard label={t('devices.connect.computers')}>
                      <ListCardItem title={t('connections.accountSignInRequired')} />
                    </ListCard>
                  </StatusStack>
                )}
              </StatusStack>
            </>
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
        </>
      ) : null}
      {reviewing && (page || !pairing) ? (
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
      {setup !== 'closed'
        ? renderPairedDeviceSetup({
            t,
            standalone,
            pairedDeviceId,
            state,
            setupBack,
            connectControls: (
              <>
                {connectControls ?? <Note>{t('connections.connectUnavailable')}</Note>}
                {signIn && (signIn.state === 'signed-in' || signIn.issue === 'host-limit') ? (
                  <StatusStack title="Tobs Connect">
                    <ConnectHealthCard
                      t={t}
                      health={snapshot?.connect?.health}
                      reloadSnapshot={load}
                      fresh={freshSnapshot}
                    />
                    {accountComputers}
                  </StatusStack>
                ) : null}
              </>
            ),
            pairingProps: stylex.props(styles.pairing),
            metaProps: stylex.props(styles.meta),
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
      {section === 'devices' ? (
        <RelationshipSettings
          t={t}
          onPrepareRoute={() => {
            close();
            preparingRelationshipRoute.current = true;
            setSetup('method');
          }}
        />
      ) : null}
      {!page && section === 'devices' && overview ? pairedDevices : null}
      {page && overview && !ready && ownerPasswordSignInCall ? (
        <OwnerPasswordSignInSettings call={ownerPasswordSignInCall} t={t} />
      ) : null}
      {!page && pairing ? pairingPanel : null}
    </div>
  );
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
        {back === undefined ? null : <div ref={pageBackMount}>{back}</div>}
        {content}
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
        overview ? (
          <Button
            variant="primary"
            icon={<ChannelSidebarIcon name="plus" size={16} />}
            onClick={begin}
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
