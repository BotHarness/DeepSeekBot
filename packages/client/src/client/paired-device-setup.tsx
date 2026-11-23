import { type ComponentProps, type ReactElement } from 'react';
import type { PairedDevicesSettingsProps } from './paired-devices.js';
import { Button } from './ds/button.js';
import { Icon } from './ds/icon.js';
import { StatusBlock, StatusHeading, StatusStack } from './ds/status-block.js';
import { Note } from './ds/note.js';
import { ConnectionMethods } from './connection-methods.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { MobileAppDownloads } from './mobile-apps.js';
import { StepProgress } from './ds/step-progress.js';
import { ConnectionProgressLog } from './connection-progress-log.js';
import { ConnectionGuide } from './connection-guide.js';
import { PrivateRelaySettings } from './private-relay-settings.js';
import { PrivateTunnelSettings } from './private-tunnel-settings.js';
import {
  PhoneRouteSteps,
  TailscaleStaleRoutes,
  type PhoneRouteStatus,
} from './phone-route-steps.js';
import {
  hasPhoneRoute,
  onTailnet,
  quickReady,
  quickRoute,
  type usePairedDevices,
} from './use-paired-devices.js';

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
  const quick = quickRoute(snapshot);
  const configuredQuick = snapshot?.privateRoutes?.find((route) => route.id === 'quick');
  const readyQuick = snapshot !== undefined && freshSnapshot && quickReady(snapshot);
  const readyConnect =
    freshSnapshot && routes?.routes.some((route) => route.kind === 'connect' && route.ready);
  const namedMethod = tunnelStep === 'choose' ? undefined : tunnelStep;
  const blockedByTunnel = Boolean(
    snapshot?.privateRoutes?.length ||
    (snapshot?.privateTunnel && snapshot.privateTunnel.state !== 'off'),
  );
  const blockedByRelay = (snapshot?.privateRelay?.state ?? 'off') !== 'off';
  const setupTitle = {
    app: t('connections.add'),
    method: t('connections.methods'),
    quick: t('connections.quick'),
    quickStart: t('connections.quick'),
    private:
      namedMethod === 'named'
        ? t('connections.method.domain')
        : namedMethod === 'ingress'
          ? t('connections.method.proxy')
          : t('privateTunnel.title'),
    privateRelay: t('connections.method.relay'),
    lan: t('connections.lan'),
    tailscale: t('devices.tailscale.title'),
    connect: 'Tobs Connect',
    closed: t('connections.title'),
  }[setup];
  const tailscaleMemberSignIn = routes?.routes.find(
    (route) => route.kind === 'tailscale' && route.ready,
  )?.memberSignIn;
  return (
    <ConnectionPanel
      inline={standalone}
      title={setupTitle}
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
        {standalone && (setup === 'quick' || setup === 'quickStart') ? (
          <StatusHeading>{setupTitle}</StatusHeading>
        ) : null}
        {setup === 'quick' || setup === 'quickStart' ? (
          <StepProgress
            label={t('privateTunnel.panel.steps')}
            steps={[
              t('privateTunnel.panel.stepStart'),
              t('privateTunnel.panel.stepCheck'),
              t('privateTunnel.panel.stepPair'),
            ]}
            step={setup === 'quick' ? 1 : readyQuick ? 2 : 0}
          />
        ) : null}
        {(setup === 'privateRelay' && blockedByTunnel) ||
        ((setup === 'private' || setup === 'quickStart') && blockedByRelay) ? (
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
        ) : setup === 'quickStart' ? (
          <>
            <Note>{t('connections.quickRequirements')}</Note>
            <Button
              variant="primary"
              disabled={!freshSnapshot || busy !== undefined || blockedByRelay}
              onClick={() => snapshot && void startQuick(snapshot)}
            >
              {t(readyQuick ? 'privateRelay.pair' : 'privateTunnel.panel.quickAction')}
            </Button>
            {quick ? (
              <PrivateTunnelSettings
                t={t}
                status={quick}
                {...(configuredQuick ? { routes: [configuredQuick] } : {})}
                fresh={freshSnapshot}
                refresh={load}
                pair={open}
                advanced={() => setSetup('privateRelay')}
                step="choose"
                setStep={setTunnelStep}
                managementOnly
              />
            ) : null}
          </>
        ) : setup === 'quick' ? (
          <>
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
          </>
        ) : setup === 'private' ? (
          <PrivateTunnelSettings
            t={t}
            {...(snapshot?.privateTunnel ? { status: snapshot.privateTunnel } : {})}
            {...(snapshot?.privateRoutes ? { routes: snapshot.privateRoutes } : {})}
            refresh={load}
            fresh={freshSnapshot}
            pair={() => {
              setSetup('closed');
              open();
            }}
            advanced={() => setSetup('privateRelay')}
            step={tunnelStep}
            setStep={setTunnelStep}
            method={namedMethod}
            locked={blockedByRelay}
          />
        ) : setup === 'privateRelay' ? (
          <PrivateRelaySettings
            t={t}
            {...(snapshot?.privateRelay ? { status: snapshot.privateRelay } : {})}
            refresh={load}
            locked={blockedByTunnel}
            pair={() => {
              setSetup('closed');
              open();
            }}
          />
        ) : setup === 'lan' ? (
          <StatusStack title={t('devices.lan.title')}>
            <StepProgress
              label={t('connections.progress')}
              steps={[t('devices.lan.title'), t('privateTunnel.panel.stepPair')]}
              step={lanReady ? 1 : 0}
            />
            <StatusBlock
              icon="house"
              tone="accent"
              title={t(lanReady ? 'connections.methodStatus.ready' : 'devices.lan.panel.offTitle')}
              body={t('devices.lan.notice')}
              action={
                <>
                  {lanReady ? (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!freshSnapshot || busy !== undefined}
                      onClick={open}
                    >
                      {t('privateRelay.pair')}
                    </Button>
                  ) : null}
                  <Button
                    variant={lanReady ? 'outline' : 'primary'}
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
                </>
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
            {freshSnapshot ? <TailscaleStaleRoutes t={t} routes={routes?.staleRoutes} /> : null}
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
              >
                {tailscaleMemberSignIn ? (
                  <Note tone={tailscaleMemberSignIn === 'managed-tls' ? 'success' : 'warning'}>
                    {t(
                      tailscaleMemberSignIn === 'managed-tls'
                        ? 'devices.tailscale.memberSignIn.trusted'
                        : 'devices.tailscale.memberSignIn.untrusted',
                    )}
                  </Note>
                ) : null}
              </StatusBlock>
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
            {routes ? (
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
            <StepProgress
              label={t('connections.progress')}
              steps={[t('connections.signInConnect'), t('privateTunnel.panel.stepPair')]}
              step={readyConnect ? 1 : 0}
            />
            {connectControls}
            <Button variant="outline" onClick={() => setSetup('quickStart')}>
              {t('connections.useQuickTunnel')}
            </Button>
            <Button
              variant="primary"
              disabled={!readyConnect}
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
