import { type ComponentProps, type ReactElement } from 'react';
import type { PairedDevicesSettingsProps } from './paired-devices.js';
import { Button } from './ds/button.js';
import { Icon } from './ds/icon.js';
import { StatusBlock, StatusStack } from './ds/status-block.js';
import { Note } from './ds/note.js';
import { ConnectionMethods } from './connection-methods.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { MobileAppDownloads } from './mobile-apps.js';
import { ConnectionProgress } from './connection-progress.js';
import { ConnectionProgressLog } from './connection-progress-log.js';
import { ConnectionGuide } from './connection-guide.js';
import { PrivateRelaySettings } from './private-relay-settings.js';
import { PrivateTunnelSettings } from './private-tunnel-settings.js';
import { PhoneRouteSteps, type PhoneRouteStatus } from './phone-route-steps.js';
import { hasPhoneRoute, onTailnet, type usePairedDevices } from './use-paired-devices.js';

export function portOf(routes: PhoneRouteStatus): string {
  const loopback = routes.routes.find((route) => route.kind === 'loopback');
  if (loopback) {
    const port = new URL(loopback.url).port;
    if (port) return port;
  }
  return /(\d+)\s*$/u.exec(routes.serveCommand)?.[1] ?? '';
}

export function ConnectionPanel({
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

export function renderPairedDeviceSetup({
  t,
  standalone,
  pairedDeviceId,
  state,
  setupBack,
  connectControls,
  pairingProps,
  metaProps,
}: Pick<PairedDevicesSettingsProps, 't' | 'pairedDeviceId'> & {
  standalone: boolean;
  state: ReturnType<typeof usePairedDevices>;
  setupBack: ReactElement | undefined;
  connectControls: ReactElement | null;
  pairingProps: Pick<ComponentProps<'div'>, 'className' | 'style'>;
  metaProps: Pick<ComponentProps<'p'>, 'className' | 'style'>;
}): ReactElement {
  const {
    snapshot,
    freshSnapshot,
    busy,
    error,
    setup,
    setSetup,
    tunnelStep,
    setTunnelStep,
    phoneAppReady,
    preparingRelationshipRoute,
    readState,
    load,
    publish,
    open,
    setLan,
    routes,
    tailscaleReady,
    lanReady,
    startQuick,
    setError,
  } = state;
  return (
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
      <div {...pairingProps}>
        {readState === 'loading' ? <Note>{t('devices.list.loading')}</Note> : null}
        {readState === 'stale' ? (
          <>
            <Note tone="warning">{t('devices.connection.stale')}</Note>
            <Button
              variant="outline"
              onClick={() =>
                void load().then((value) => {
                  if (setup === 'quick' && value) void startQuick(value);
                })
              }
            >
              {t('devices.connection.retry')}
            </Button>
          </>
        ) : null}
        {setup !== 'app' && setup !== 'method' && setup !== 'quick' ? (
          <ConnectionProgress t={t} step={1} />
        ) : null}
        {(setup === 'privateRelay' ||
          (setup === 'private' && (snapshot?.privateRelay?.state ?? 'off') !== 'off')) &&
        ((snapshot?.privateTunnel?.state ?? 'off') !== 'off' ||
          (snapshot?.privateRelay?.state ?? 'off') !== 'off') ? (
          <Note tone="warning">{t('connections.privateReplacement')}</Note>
        ) : null}
        {setup === 'app' ? (
          <div data-phone-app-guide="">
            <Button
              type="button"
              variant="primary"
              icon={<Icon name="smartphone" />}
              data-modal-autofocus
              disabled={!freshSnapshot || busy !== undefined}
              onClick={() => {
                phoneAppReady.current = true;
                if (pairedDeviceId) {
                  setSetup('closed');
                  void load();
                } else if (snapshot && (hasPhoneRoute(snapshot.routes) || onTailnet())) {
                  open();
                } else setSetup('method');
              }}
            >
              {t('connections.phoneApp.ready')}
            </Button>
            <MobileAppDownloads t={t} />
          </div>
        ) : setup === 'method' ? (
          <ConnectionMethods t={t} state={state} />
        ) : setup === 'quick' ? (
          <StatusBlock
            icon={error ? 'info' : 'zap'}
            tone={error ? 'warning' : 'accent'}
            title={t(
              error ? 'privateTunnel.panel.failedTitle' : 'privateTunnel.panel.startingTitle',
            )}
            action={
              error && snapshot && freshSnapshot ? (
                <Button
                  variant="primary"
                  disabled={busy !== undefined}
                  onClick={() => void startQuick(snapshot)}
                >
                  {t('devices.connection.retry')}
                </Button>
              ) : undefined
            }
          />
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
              title={t(lanReady ? 'connections.methodStatus.ready' : 'devices.lan.panel.offTitle')}
              body={t('devices.lan.notice')}
              action={
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!freshSnapshot || busy !== undefined}
                  onClick={() =>
                    void setLan(snapshot?.lan?.state === 'listening' ? 'disable' : 'enable', true)
                  }
                >
                  {t(
                    snapshot?.lan?.state === 'listening'
                      ? 'devices.lan.disable'
                      : 'connections.enableContinue',
                  )}
                </Button>
              }
              data={{ 'data-lan-setup': snapshot?.lan?.state ?? 'off' }}
            >
              <p {...metaProps}>{t('devices.lan.network')}</p>
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
                data={{
                  'data-tailscale-setup': routes?.tailscale ?? 'unknown',
                }}
              />
            )}
            {routes?.managed?.enabled || routes?.managed?.owned ? (
              <Button
                variant="outline"
                disabled={!freshSnapshot || busy !== undefined}
                onClick={() =>
                  void publish('disable').then((failure) => setError(failure !== undefined))
                }
              >
                {t('devices.tailscale.disable')}
              </Button>
            ) : null}
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
            {connectControls}
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
        {['quick', 'private', 'privateRelay', 'connect', 'tailscale', 'lan'].includes(setup) ? (
          <ConnectionProgressLog
            key={setup}
            t={t}
            source={
              setup === 'quick' || setup === 'private'
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
  );
}
