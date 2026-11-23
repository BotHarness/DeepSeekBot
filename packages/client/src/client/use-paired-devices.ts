import { useRef, useState } from 'react';
import { checkRoute, isConnectRoute, isLanRoute } from '@botharness/host-protocol/route';
import type {
  PairedDevice,
  DevicesSnapshot,
  RouteStatus,
  PairingOffer,
  PairingView,
  ConnectedHost,
  PairedDevicesSettingsProps,
} from './paired-devices.js';
import type { PrivateTunnelStep } from './private-tunnel-settings.js';
import type { PublishFailure } from './phone-route-steps.js';
import { useMountedResource } from './mounted-resource.js';
import { observeResource } from './messaging-defaults-live.js';

export const PATH = './api/botharness/devices';
const LIST_POLL_MS = 2000;
const ROUTE_POLL_MS = 3000;
const NETWORK_POLL_MS = 15_000;
const NEW_DEVICE_MS = 24 * 60 * 60 * 1000;

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

export async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
  return (await response.json()) as T;
}

export function hasPhoneRoute(routes: RouteStatus): boolean {
  return routes.routes.some((route) => route.kind !== 'loopback' && route.ready);
}

export function onTailnet(): boolean {
  return location.protocol === 'https:' && location.hostname.endsWith('.ts.net');
}

export function usePairedDevices({
  section,
  initialPairing,
  initialRemote,
  pairedDeviceId,
  onDevicePaired,
  onFeedRead,
}: Pick<
  PairedDevicesSettingsProps,
  | 'section'
  | 'initialPairing'
  | 'initialRemote'
  | 'pairedDeviceId'
  | 'onDevicePaired'
  | 'onFeedRead'
>) {
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
    let queued = false;
    const refresh = (): void => {
      setNow(Date.now());
      const current = reading.current;
      if (current === undefined) {
        void load(controller.signal);
        return;
      }
      if (queued) return;
      queued = true;
      void current.finally(() => {
        queued = false;
        if (!controller.signal.aborted) void load(controller.signal);
      });
    };
    const timer = setInterval(refresh, NETWORK_POLL_MS);
    const stopObserving = observeResource('devices', refresh, ROUTE_POLL_MS);
    return () => {
      mounted.current = false;
      controller.abort();
      offerAbort.current?.abort();
      offerRequest.current += 1;
      clearInterval(timer);
      stopObserving();
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

  const open = (): void => {
    if (preparingRelationshipRoute.current) {
      preparingRelationshipRoute.current = false;
      setSetup('closed');
      return;
    }
    if (!phoneAppReady.current) {
      setSetup('app');
      return;
    }
    void createOffer();
  };

  const createOffer = async (): Promise<void> => {
    setSetup('closed');
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
        open();
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

  return {
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
    showTailscale,
    setShowTailscale,
    advancedMethods,
    setAdvancedMethods,
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
    phoneAppReady,
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
  };
}
