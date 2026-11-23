import { useState, type ComponentProps, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { PairedDevicesSettingsProps } from './paired-devices.js';
import { Button } from './ds/button.js';
import { Icon } from './ds/icon.js';
import { CopyChip, StatusBlock, StatusDisclosure, StatusStack } from './ds/status-block.js';
import { Note } from './ds/note.js';
import { ChoiceButton } from './ds/choice-button.js';
import { Tooltip } from './ds/tooltip.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { MobileAppDownloads } from './mobile-apps.js';
import { ConnectionProgress } from './connection-progress.js';
import { ConnectionProgressLog } from './connection-progress-log.js';
import { ConnectionGuide } from './connection-guide.js';
import { PrivateRelaySettings } from './private-relay-settings.js';
import { PrivateTunnelSettings } from './private-tunnel-settings.js';
import { PhoneRouteSteps, type PhoneRouteStatus } from './phone-route-steps.js';
import { hasPhoneRoute, onTailnet, type usePairedDevices } from './use-paired-devices.js';
import { teamHttpsRoute } from '@botharness/host-protocol/team-invitation';
import type { BridgeCall } from './bridge-transport.js';
import { loadTeamMode } from './team-bridge.js';
import { OwnerPasswordSignInSettings } from './owner-password-sign-in-settings.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';

export function ConnectionMethod({
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

const phoneAddressStyles = stylex.create({
  body: { minWidth: 0, width: '100%' },
});

function PhoneAddress({
  call,
  t,
}: {
  call?: BridgeCall | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const [read, setRead] = useState<
    { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; urls: string[] }
  >({ kind: call ? 'loading' : 'failed' });
  const [retry, setRetry] = useState(0);
  const mount = useMountedResource<HTMLDivElement>(() => {
    if (call === undefined) return;
    const controller = new AbortController();
    void loadTeamMode(call, controller.signal).then(
      ({ memberUrls }) => {
        if (controller.signal.aborted) return;
        const urls = [
          ...new Set(memberUrls.filter(teamHttpsRoute).map((url) => new URL(url).origin)),
        ];
        setRead({ kind: 'ready', urls });
      },
      () => {
        if (!controller.signal.aborted) setRead({ kind: 'failed' });
      },
    );
    return () => controller.abort();
  }, [call, retry]);
  return (
    <div ref={mount} data-phone-address="" {...stylex.props(phoneAddressStyles.body)}>
      <StatusStack>
        {read.kind === 'loading' ? (
          <Note>{t('devices.list.loading')}</Note>
        ) : read.kind === 'failed' ? (
          <>
            <Note tone="warning">{t('connections.phone.addressReadFailed')}</Note>
            {call === undefined ? null : (
              <Button
                variant="outline"
                onClick={() => {
                  setRead({ kind: 'loading' });
                  setRetry(retry + 1);
                }}
              >
                {t('devices.connection.retry')}
              </Button>
            )}
          </>
        ) : read.urls.length === 0 ? (
          <Note>{t('connections.phone.noHttps')}</Note>
        ) : (
          <>
            <Note>{t('connections.phone.addressHint')}</Note>
            {read.urls.map((url) => (
              <CopyChip
                key={url}
                value={url}
                copyLabel={t('connections.phone.copyAddress')}
                copiedLabel={t('devices.pair.copied')}
              />
            ))}
          </>
        )}
        {call === undefined ? null : <OwnerPasswordSignInSettings call={call} t={t} showStatus />}
      </StatusStack>
    </div>
  );
}

export function renderPairedDeviceSetup({
  t,
  standalone,
  pairedDeviceId,
  ownerPasswordSignInCall,
  state,
  setupBack,
  connectControls,
  renderDirectionChoices,
  renderConnectMethod,
  pairingProps,
  metaProps,
}: Pick<PairedDevicesSettingsProps, 't' | 'pairedDeviceId' | 'ownerPasswordSignInCall'> & {
  standalone: boolean;
  state: ReturnType<typeof usePairedDevices>;
  setupBack: ReactElement | undefined;
  connectControls: ReactElement | null;
  renderDirectionChoices(): ReactElement;
  renderConnectMethod(): ReactElement;
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
    createOffer,
    open,
    setLan,
    routes,
    tailscaleReady,
    lanReady,
    ready,
    advancedMethods,
    setAdvancedMethods,
  } = state;
  const phoneSetup = setup === 'phoneWays' || setup === 'phoneAddress';
  return (
    <ConnectionPanel
      inline={standalone}
      title={t(phoneSetup ? 'connections.invite' : 'connections.add')}
      secondary={setupBack}
      closeLabel={t('common.close')}
      size="small"
      onClose={() => {
        preparingRelationshipRoute.current = false;
        setSetup('closed');
      }}
    >
      <div {...pairingProps}>
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
        {!phoneSetup && setup !== 'direction' && setup !== 'app' ? (
          <ConnectionProgress t={t} step={setup === 'method' ? 0 : 1} />
        ) : null}
        {!phoneSetup && setup !== 'app' ? (
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
        ) : setup === 'phoneWays' ? (
          <StatusStack>
            <ChoiceButton
              title={t('connections.phone.scan')}
              description={t('connections.phone.recommended')}
              leading={<Icon name="smartphone" />}
              disabled={!ready}
              onClick={() => void createOffer()}
            />
            <ChoiceButton
              title={t('connections.phone.address')}
              leading={<Icon name="link" />}
              disabled={!ready}
              onClick={() => setSetup('phoneAddress')}
            />
          </StatusStack>
        ) : setup === 'phoneAddress' ? (
          ready ? (
            <PhoneAddress
              key={snapshot?.routes.routes
                .filter((route) => route.ready)
                .map((route) => route.url)
                .join('\n')}
              call={ownerPasswordSignInCall}
              t={t}
            />
          ) : (
            <Note>{t('devices.connection.prepare')}</Note>
          )
        ) : setup === 'direction' ? (
          renderDirectionChoices()
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
            {renderConnectMethod()}
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
  );
}
