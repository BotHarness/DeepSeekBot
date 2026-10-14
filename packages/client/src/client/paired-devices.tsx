import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';

import { Callout } from './ds/callout.js';
import { Note } from './ds/note.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { radius, space, text } from './ds/tokens.stylex.js';
import { formatRelativeTime } from './labels.js';
import { useMountedResource } from './mounted-resource.js';

const PATH = './api/botharness/devices';
const LIST_POLL_MS = 2000;

interface PairedDevice {
  id: string;
  name: string;
  pairedAt: string;
  lastSeenAt?: string;
  revokedAt?: string;
}

interface RouteStatus {
  routes: { url: string; kind: 'tailscale' | 'loopback'; ready: boolean; issue?: string }[];
  tailscale: 'running' | 'stopped' | 'missing';
  serveCommand: string;
}

interface DevicesSnapshot {
  host: { id: string; name: string };
  devices: PairedDevice[];
  routes: RouteStatus;
}

interface PairingOffer {
  link: string;
  qr: { size: number; path: string };
  expiresAt: string;
  routes: string[];
  reachable: boolean;
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
});

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
  return (await response.json()) as T;
}

function hasPhoneRoute(routes: RouteStatus): boolean {
  return routes.routes.some((route) => route.kind === 'tailscale' && route.ready);
}

function onTailnet(): boolean {
  return location.protocol === 'https:' && location.hostname.endsWith('.ts.net');
}

export function PairedDevicesSettings({ t }: PropsLocale<'botharness'>): ReactElement {
  const [snapshot, setSnapshot] = useState<DevicesSnapshot>();
  const [offer, setOffer] = useState<PairingOffer>();
  const [pairing, setPairing] = useState(false);
  const [paired, setPaired] = useState<PairedDevice>();
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const mounted = useRef(false);
  const known = useRef<Set<string>>(new Set());

  const load = async (signal?: AbortSignal): Promise<DevicesSnapshot | undefined> => {
    const value = await json<DevicesSnapshot>(await fetch(PATH, signal ? { signal } : {}));
    if (!mounted.current || signal?.aborted) return undefined;
    setSnapshot(value);
    return value;
  };

  const mount = useMountedResource<HTMLDivElement>(() => {
    mounted.current = true;
    const controller = new AbortController();
    load(controller.signal).catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, []);

  const watch = useMountedResource<HTMLDivElement>(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
      load()
        .then((value) => {
          const fresh = value?.devices.find(
            (device) => device.revokedAt === undefined && !known.current.has(device.id),
          );
          if (fresh !== undefined) {
            setPaired(fresh);
            setOffer(undefined);
          }
        })
        .catch(() => undefined);
    }, LIST_POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const createOffer = async (): Promise<void> => {
    setBusy('offer');
    setError(false);
    setCopied(false);
    setPaired(undefined);
    try {
      const value = await json<PairingOffer>(
        await fetch(`${PATH}/offer`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ origin: location.origin }),
        }),
      );
      known.current = new Set(snapshot?.devices.map((device) => device.id));
      if (mounted.current) {
        setOffer(value);
        setNow(Date.now());
      }
    } catch {
      if (mounted.current) setError(true);
    } finally {
      if (mounted.current) setBusy(undefined);
    }
  };

  const open = (): void => {
    setPairing(true);
    void createOffer();
  };

  const close = (): void => {
    setPairing(false);
    setOffer(undefined);
    setPaired(undefined);
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

  const expired = offer !== undefined && Date.parse(offer.expiresAt) <= now;
  const secondsLeft =
    offer === undefined ? 0 : Math.max(0, Math.ceil((Date.parse(offer.expiresAt) - now) / 1000));
  const routes = snapshot?.routes;
  const unreachable = routes !== undefined && !hasPhoneRoute(routes) && !onTailnet();
  const devices = snapshot?.devices ?? [];

  return (
    <div ref={mount} data-paired-devices="">
      <SettingsSection>
        <SettingsRow
          title={t('devices.pair.title')}
          description={t('devices.pair.description')}
          data={{ 'data-pair-phone': '' }}
          control={
            <Button variant="outline" size="sm" onClick={open}>
              {t('devices.pair.open')}
            </Button>
          }
        >
          {unreachable ? (
            <Callout tone="warning" data={{ 'data-pair-route-warning': routes.tailscale }}>
              {t(
                routes.tailscale === 'running'
                  ? 'devices.route.notServed'
                  : routes.tailscale === 'stopped'
                    ? 'devices.route.stopped'
                    : 'devices.route.missing',
              )}{' '}
              <code {...stylex.props(styles.code)}>{routes.serveCommand}</code>
            </Callout>
          ) : null}
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title={t('devices.list.title')}>
        {devices.length === 0 ? (
          <Note>
            {snapshot === undefined ? t('devices.list.loading') : t('devices.list.empty')}
          </Note>
        ) : (
          devices.map((device) => (
            <SettingsRow
              key={device.id}
              title={device.name}
              data={{
                'data-paired-device': device.id,
                'data-revoked': device.revokedAt === undefined ? undefined : '',
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
            {paired !== undefined ? (
              <Note tone="success">{t('devices.pair.done', { name: paired.name })}</Note>
            ) : offer === undefined ? (
              <Note>{t('devices.list.loading')}</Note>
            ) : expired ? (
              <>
                <Note>{t('devices.pair.expired')}</Note>
                <Button variant="primary" size="sm" onClick={() => void createOffer()}>
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
