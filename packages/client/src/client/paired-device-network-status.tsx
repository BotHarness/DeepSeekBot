import type { ComponentProps, ReactElement } from 'react';
import type { PairedDevicesSettingsProps } from './paired-devices.js';
import { Button } from './ds/button.js';
import { CopyChip, StatusBlock, StatusStack } from './ds/status-block.js';
import { Note } from './ds/note.js';
import { PhoneRouteSteps } from './phone-route-steps.js';
import { portOf } from './paired-device-setup.js';
import type { usePairedDevices } from './use-paired-devices.js';

export function renderPairedDeviceNetworkStatus({
  t,
  state,
  metaProps,
  staleProps,
}: Pick<PairedDevicesSettingsProps, 't'> & {
  state: ReturnType<typeof usePairedDevices>;
  metaProps: Pick<ComponentProps<'p'>, 'className' | 'style'>;
  staleProps: Pick<ComponentProps<'div'>, 'className' | 'style'>;
}): ReactElement {
  const {
    snapshot,
    freshSnapshot,
    busy,
    error,
    setError,
    setLan,
    routes,
    tailscaleReady,
    lanReady,
    showTailscale,
    setShowTailscale,
    publish,
  } = state;
  return (
    <StatusStack title={t('devices.connection.title')}>
      {snapshot?.lan ? (
        <StatusBlock
          icon="house"
          tone={
            !freshSnapshot
              ? 'neutral'
              : snapshot.lan.state === 'error' || (snapshot.lan.state === 'listening' && !lanReady)
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
              {t(snapshot.lan.state === 'listening' ? 'devices.lan.disable' : 'devices.lan.enable')}
            </Button>
          }
        >
          <p {...metaProps}>{t('devices.lan.network')}</p>
        </StatusBlock>
      ) : null}
      <StatusBlock
        icon="shield-check"
        tone={
          !freshSnapshot
            ? 'neutral'
            : routes?.staleRoutes?.length || (!tailscaleReady && routes?.tailscale === 'stopped')
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
          <div data-tailscale-stale="" {...staleProps}>
            <p {...metaProps}>{t('devices.tailscale.stale')}</p>
            {routes.staleRoutes.map((route) => (
              <div key={route.url} {...staleProps}>
                <CopyChip
                  value={route.url}
                  copyLabel={t('devices.route.copy')}
                  copiedLabel={t('devices.pair.copied')}
                />
                <p {...metaProps}>
                  {t('devices.tailscale.localPort', {
                    port: route.targetPort,
                  })}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </StatusBlock>
      {showTailscale && routes && freshSnapshot ? (
        <div {...staleProps}>
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
  );
}
