import { randomBytes, randomUUID } from 'node:crypto';
import { credentialKey } from '@deepseek-ai/dsh-credentials';
import { validTunnelToken } from './connect.js';
import {
  addressSignInAllowed,
  createPrivateTunnelRuntime,
  parseTunnelRecord,
  privateIngressOrigin,
  privateTunnelHostname,
  type PrivateTunnelMode,
  type PrivateTunnelOptions,
  type PrivateTunnelResult,
  type PrivateTunnelStatus,
  type TunnelRecord,
} from './private-tunnel.js';

export type PrivateRouteId = 'quick' | 'custom' | 'direct';
export interface PrivateRouteStatus extends PrivateTunnelStatus {
  id: PrivateRouteId;
  enabled: boolean;
  revision: string;
  addressSignIn?: boolean;
}
interface OwnedRoute {
  id: PrivateRouteId;
  enabled: boolean;
  configuration: TunnelRecord;
  addressSignIn?: true;
}
interface OwnedRoutes {
  version: 2;
  phoneToken: string;
  routes: OwnedRoute[];
}
class PrivateRouteChanged extends Error {}
export interface PrivateRouteInput {
  mode: PrivateTunnelMode;
  hostname?: string;
  token?: string;
  origin?: string;
  lan?: boolean;
  inUse?: boolean;
}
export const privateRouteId = (mode: PrivateTunnelMode): PrivateRouteId =>
  mode === 'quick' || mode === 'direct' ? mode : 'custom';
const configurationOrigin = (configuration: TunnelRecord) =>
  configuration.origin ??
  (configuration.hostname ? `https://${configuration.hostname}` : undefined);

function sameConfiguration(a: TunnelRecord, b: TunnelRecord): boolean {
  if (a.mode !== b.mode) return false;
  if (a.mode === 'quick') return true;
  if (a.mode === 'named') return a.hostname === b.hostname && a.token === b.token;
  if (a.mode === 'direct') return a.hostname === b.hostname;
  return a.origin === b.origin && a.lan === b.lan;
}

function decode(input: unknown): OwnedRoutes | undefined {
  if (typeof input !== 'object' || input === null) return;
  if (!('version' in input)) {
    const legacy = parseTunnelRecord(input);
    return legacy
      ? {
          version: 2,
          phoneToken: legacy.phoneToken,
          routes: [{ id: privateRouteId(legacy.mode), enabled: true, configuration: legacy }],
        }
      : undefined;
  }
  if (
    input.version !== 2 ||
    !('phoneToken' in input) ||
    typeof input.phoneToken !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(input.phoneToken) ||
    !('routes' in input) ||
    !Array.isArray(input.routes) ||
    input.routes.length > 2
  )
    return;
  const routes: OwnedRoute[] = [];
  const direct = 'direct' in input ? input.direct : undefined;
  for (const value of direct === undefined ? input.routes : [...input.routes, direct]) {
    if (typeof value !== 'object' || value === null) return;
    const configuration = parseTunnelRecord(value.configuration);
    if (
      !configuration ||
      configuration.phoneToken !== input.phoneToken ||
      value.id !== privateRouteId(configuration.mode) ||
      (value.id === 'direct' && value !== direct) ||
      (value === direct && value.id !== 'direct') ||
      typeof value.enabled !== 'boolean' ||
      routes.some((route) => route.id === value.id) ||
      (value.addressSignIn !== undefined && typeof value.addressSignIn !== 'boolean')
    )
      return;
    routes.push({
      id: value.id,
      enabled: value.enabled,
      configuration,
      ...(value.id === 'custom' &&
      value.addressSignIn === true &&
      addressSignInAllowed(configuration)
        ? { addressSignIn: true }
        : {}),
    });
  }
  return { version: 2, phoneToken: input.phoneToken, routes };
}

export function createPrivateTunnel(options: PrivateTunnelOptions) {
  const key = credentialKey('botharness-core', 'private-tunnel');
  const runtimes = new Map<PrivateRouteId, ReturnType<typeof createPrivateTunnelRuntime>>();
  const runtimeRevisions = new Map<PrivateRouteId, string>();
  let state: OwnedRoutes | undefined;
  let loaded = false;
  let failure: PrivateTunnelStatus['issue'];
  let closed = false;
  let lifecycle: Promise<unknown> = Promise.resolve();
  let writes: Promise<unknown> = Promise.resolve();
  const revisions = new Map<PrivateRouteId, string>();
  const commit = (next: OwnedRoutes, renew?: PrivateRouteId, runtimeUpdate?: PrivateRouteId) => {
    const updateRuntime =
      runtimeUpdate !== undefined &&
      runtimes.has(runtimeUpdate) &&
      runtimeRevisions.get(runtimeUpdate) === revisions.get(runtimeUpdate);
    for (const id of revisions.keys()) {
      if (!next.routes.some((route) => route.id === id)) revisions.delete(id);
    }
    for (const route of next.routes) {
      if (!revisions.has(route.id) || route.id === renew) revisions.set(route.id, randomUUID());
    }
    if (updateRuntime && runtimeUpdate !== undefined)
      runtimeRevisions.set(runtimeUpdate, revisions.get(runtimeUpdate)!);
    state = next;
  };
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = lifecycle.then(work, work);
    lifecycle = next.catch(() => undefined);
    return next;
  };
  const write = (
    change: (current: OwnedRoutes) => OwnedRoutes,
    renew?: PrivateRouteId,
    runtimeUpdate?: PrivateRouteId,
  ): Promise<boolean> => {
    const work = async () => {
      const credentials = options.credentials();
      if (!credentials || !state) return false;
      const next = change(state);
      const previousConfiguration = state.routes.find(
        (route) => route.id === runtimeUpdate,
      )?.configuration;
      const nextConfiguration = next.routes.find(
        (route) => route.id === runtimeUpdate,
      )?.configuration;
      const endpointChanged =
        runtimeUpdate !== undefined &&
        previousConfiguration !== undefined &&
        configurationOrigin(previousConfiguration) !==
          (nextConfiguration && configurationOrigin(nextConfiguration));
      try {
        const direct = next.routes.find((route) => route.id === 'direct');
        await credentials.modifyRecord(key, async () => ({
          kind: 'grant',
          payload: {
            ...next,
            routes: next.routes.filter((route) => route.id !== 'direct'),
            ...(direct === undefined ? {} : { direct }),
          },
        }));
        commit(next, endpointChanged ? runtimeUpdate : renew, runtimeUpdate);
        return true;
      } catch {
        return false;
      }
    };
    const next = writes.then(work, work);
    writes = next.catch(() => undefined);
    return next;
  };
  const load = async (): Promise<boolean> => {
    if (loaded) return true;
    const credentials = options.credentials();
    if (!credentials) {
      failure = 'credential-unavailable';
      return false;
    }
    try {
      const record = await credentials.readRecord(key);
      if (record === undefined || record === null) {
        commit({ version: 2, phoneToken: randomBytes(32).toString('hex'), routes: [] });
      } else {
        const parsed = record.kind === 'grant' ? decode(record.payload) : undefined;
        if (!parsed) {
          failure = 'private-tunnel-credential-invalid';
          return false;
        }
        commit(parsed);
        if (!(await write((current) => current))) {
          failure = 'credential-unavailable';
          return false;
        }
      }
      loaded = true;
      failure = undefined;
      return true;
    } catch {
      failure = 'credential-unavailable';
      return false;
    }
  };
  const statuses = (): PrivateRouteStatus[] =>
    (state?.routes ?? []).map((route) => {
      const runtime =
        runtimeRevisions.get(route.id) === revisions.get(route.id)
          ? runtimes.get(route.id)?.status()
          : undefined;
      const { origin: _runtimeOrigin, ...runtimeStatus } = runtime ?? {
        state: 'off' as const,
        mode: route.configuration.mode,
        originPort: route.configuration.originPort,
        origin: undefined,
      };
      const origin = configurationOrigin(route.configuration);
      return {
        ...runtimeStatus,
        ...(origin === undefined ? {} : { origin }),
        id: route.id,
        enabled: route.enabled,
        revision: revisions.get(route.id)!,
        ...(route.id === 'custom'
          ? {
              addressSignIn:
                route.addressSignIn === true && addressSignInAllowed(route.configuration),
            }
          : {}),
      };
    });
  const status = (): PrivateTunnelStatus => {
    if (failure) return { state: 'error', issue: failure };
    const route = statuses().find((route) => route.state === 'connected') ?? statuses()[0];
    if (!route) return { state: 'off' };
    const { id: _id, enabled: _enabled, addressSignIn: _address, ...view } = route;
    return view;
  };
  const unavailable = (): PrivateTunnelResult => ({
    ok: false,
    code:
      failure === 'private-tunnel-credential-invalid'
        ? 'private-tunnel-credential-invalid'
        : 'credential-unavailable',
  });
  const startRuntime = async (id: PrivateRouteId) => {
    if (closed || runtimes.has(id)) return;
    const entry = state?.routes.find((route) => route.id === id);
    if (!entry?.enabled) return;
    const runtime = createPrivateTunnelRuntime({
      ...options,
      addressSignIn: () => {
        const route = state?.routes.find((route) => route.id === id);
        return (
          route?.addressSignIn === true &&
          addressSignInAllowed(route.configuration) &&
          options.passwordSignInAvailable?.() === true
        );
      },
      record: (phase, detail) =>
        options.record?.(phase, `route=${id}${detail ? ` ${detail}` : ''}`),
      storage: {
        read: async () => state?.routes.find((route) => route.id === id)?.configuration,
        persist: (configuration) =>
          write(
            (current) => ({
              ...current,
              routes: current.routes.map((route) =>
                route.id === id &&
                runtimes.get(id) === runtime &&
                runtimeRevisions.get(id) === revisions.get(id)
                  ? { ...route, configuration }
                  : route,
              ),
            }),
            undefined,
            id,
          ),
      },
    });
    runtimes.set(id, runtime);
    runtimeRevisions.set(id, revisions.get(id)!);
    await runtime.restore();
  };
  const stopRuntime = async (id: PrivateRouteId) => {
    const runtime = runtimes.get(id);
    runtimes.delete(id);
    runtimeRevisions.delete(id);
    await runtime?.close();
  };
  const configure = async (
    input: PrivateRouteInput,
    replace?: PrivateRouteId,
    legacy = false,
  ): Promise<PrivateTunnelResult> => {
    if (input.inUse) return { ok: false, code: 'private-route-in-use' };
    if (!['quick', 'named', 'ingress', 'direct'].includes(input.mode))
      return { ok: false, code: 'private-tunnel-input-invalid' };
    const hostname =
      input.mode === 'named' || (input.mode === 'direct' && input.hostname !== undefined)
        ? privateTunnelHostname(input.hostname ?? '')
        : undefined;
    const origin = input.mode === 'ingress' ? privateIngressOrigin(input.origin ?? '') : undefined;
    const token = input.token?.trim();
    if (
      (input.mode === 'named' || (input.hostname !== undefined && input.mode === 'direct')) &&
      !hostname
    )
      return { ok: false, code: 'private-tunnel-hostname-invalid' };
    if (input.mode === 'named' && !validTunnelToken(token ?? ''))
      return { ok: false, code: 'private-tunnel-token-invalid' };
    if (input.mode === 'ingress' && !origin)
      return { ok: false, code: 'private-ingress-origin-invalid' };
    if (closed || !(await load()) || !state) return unavailable();
    await writes;
    const id = privateRouteId(input.mode);
    if (replace !== undefined && (replace !== id || !state.routes.some((r) => r.id === replace)))
      return { ok: false, code: 'private-route-not-found' };
    if (legacy && state.routes.some((route) => route.id !== id && route.id !== 'direct'))
      return { ok: false, code: 'private-route-id-required' };
    const requestedOrigin = origin ?? (hostname ? `https://${hostname}` : undefined);
    if (
      requestedOrigin &&
      statuses().some((route) => route.id !== id && route.origin === requestedOrigin)
    )
      return { ok: false, code: 'private-route-origin-in-use' };
    const previous = state.routes.find((route) => route.id === id);
    const next: TunnelRecord = {
      mode: input.mode,
      phoneToken: state.phoneToken,
      originPort: previous?.configuration.originPort ?? 0,
      ...(input.mode === 'quick' && previous?.configuration.hostname
        ? { hostname: previous.configuration.hostname }
        : {}),
      ...(hostname ? { hostname } : {}),
      ...(input.mode === 'named' && token ? { token } : {}),
      ...(origin ? { origin, lan: input.lan === true } : {}),
    };
    if (previous && replace === undefined) {
      if (!sameConfiguration(previous.configuration, next))
        return { ok: false, code: 'private-route-replace-required' };
      const runtime = runtimes.get(id);
      if (previous.enabled && runtime) return { ok: true, status: runtime.status(), routeId: id };
    }
    if (
      !(await write(
        (current) => ({
          ...current,
          routes: [
            ...current.routes.filter((route) => route.id !== id),
            {
              id,
              enabled: true,
              configuration: next,
              ...(replace === undefined && previous?.addressSignIn ? { addressSignIn: true } : {}),
            },
          ],
        }),
        replace,
      ))
    )
      return { ok: false, code: 'credential-unavailable' };
    await stopRuntime(id);
    await startRuntime(id);
    return { ok: true, status: runtimes.get(id)?.status() ?? { state: 'off' }, routeId: id };
  };
  const setAddressSignIn = async (
    id: PrivateRouteId,
    enabled: boolean,
  ): Promise<PrivateTunnelResult> => {
    if (id !== 'custom') return { ok: false, code: 'private-route-address-sign-in-unsupported' };
    if (closed || !(await load()) || !state) return unavailable();
    await writes;
    const route = state.routes.find((route) => route.id === id);
    if (!route) return { ok: false, code: 'private-route-not-found' };
    if (enabled && !addressSignInAllowed(route.configuration))
      return { ok: false, code: 'private-route-address-sign-in-lan' };
    if (enabled && options.passwordSignInAvailable?.() !== true)
      return { ok: false, code: 'private-route-address-sign-in-unavailable' };
    const change = (current: OwnedRoutes): OwnedRoutes => ({
      ...current,
      routes: current.routes.map((route) => {
        if (route.id !== id) return route;
        const { addressSignIn: _previous, ...rest } = route;
        return enabled ? { ...rest, addressSignIn: true } : rest;
      }),
    });
    if (!enabled) {
      state = change(state);
      runtimes.get(id)?.closeAddressSignIn();
    }
    const written = await write(change);
    options.record?.(
      'address-sign-in',
      `route=${id} enabled=${String(enabled)}${written ? '' : ' saved=false'}`,
    );
    if (!written) return { ok: false, code: 'credential-unavailable' };
    return { ok: true, status: runtimes.get(id)?.status() ?? { state: 'off' }, routeId: id };
  };
  const change = async (
    action: 'start' | 'stop' | 'remove',
    id?: PrivateRouteId,
    expectedRevision?: string,
  ): Promise<PrivateTunnelResult> => {
    if (closed || !(await load()) || !state) return unavailable();
    await writes;
    const legacyRoutes = state.routes.filter((route) => route.id !== 'direct');
    if (id === undefined && legacyRoutes.length > 1)
      return { ok: false, code: 'private-route-id-required' };
    const selected = id ?? legacyRoutes[0]?.id;
    if (selected === undefined) return { ok: true, status: status() };
    if (!state.routes.some((route) => route.id === selected))
      return { ok: false, code: 'private-route-not-found' };
    const checkRevision = (current: OwnedRoutes) => {
      if (expectedRevision === undefined) return;
      const configuration = current.routes.find((route) => route.id === selected)?.configuration;
      const runtimeOrigin = runtimes.get(selected)?.status().origin;
      if (
        !configuration ||
        revisions.get(selected) !== expectedRevision ||
        (runtimeOrigin !== undefined && runtimeOrigin !== configurationOrigin(configuration))
      )
        throw new PrivateRouteChanged();
    };
    try {
      checkRevision(state);
      const written = await write((current) => {
        checkRevision(current);
        return {
          ...current,
          routes:
            action === 'remove'
              ? current.routes.filter((route) => route.id !== selected)
              : current.routes.map((route) =>
                  route.id === selected ? { ...route, enabled: action === 'start' } : route,
                ),
        };
      });
      if (!written) return { ok: false, code: 'credential-unavailable' };
    } catch (error) {
      if (error instanceof PrivateRouteChanged) return { ok: false, code: 'private-route-changed' };
      throw error;
    }
    if (action === 'start') await startRuntime(selected);
    else await stopRuntime(selected);
    if (action === 'remove' && state.routes.length === 0) {
      await writes;
      try {
        await options.credentials()!.deleteRecord(key);
        state = undefined;
        loaded = false;
      } catch {
        return { ok: false, code: 'credential-unavailable' };
      }
    }
    return {
      ok: true,
      status: runtimes.get(selected)?.status() ?? { state: 'off' },
      ...(id === undefined ? {} : { routeId: selected }),
      ...(expectedRevision === undefined ? {} : { expectedRevision }),
    };
  };
  return {
    status,
    statuses,
    admission: () =>
      [...runtimes.values()]
        .map((runtime) => runtime.admission())
        .find((value) => value !== undefined),
    addressSignInOrigins: () =>
      options.passwordSignInAvailable?.() === true
        ? statuses().flatMap((route) =>
            route.addressSignIn && route.enabled && route.state === 'connected' && route.origin
              ? [route.origin]
              : [],
          )
        : [],
    setAddressSignIn: (id: PrivateRouteId, enabled: boolean) =>
      serial(() => setAddressSignIn(id, enabled)),
    admissions: () => {
      const direct = runtimes.get('direct')?.admission();
      return [
        ...(direct ? [{ id: 'direct' as const, ...direct }] : []),
        ...[...runtimes].flatMap(([id, runtime]) => {
          if (id === 'direct') return [];
          const admission = runtime.admission();
          return admission && admission.origin !== direct?.origin ? [{ id, ...admission }] : [];
        }),
      ];
    },
    restore: () =>
      serial(async () => {
        if (closed || !(await load())) return;
        for (const route of state?.routes ?? []) await startRuntime(route.id);
      }),
    enable: (input: PrivateRouteInput) => serial(() => configure(input, undefined, true)),
    add: (input: PrivateRouteInput) => serial(() => configure(input)),
    replace: (id: PrivateRouteId, input: PrivateRouteInput) => serial(() => configure(input, id)),
    start: (id: PrivateRouteId) => serial(() => change('start', id)),
    stop: (id: PrivateRouteId, expectedRevision?: string) =>
      serial(() => change('stop', id, expectedRevision)),
    remove: (id: PrivateRouteId) => serial(() => change('remove', id)),
    disable: () => serial(() => change('remove')),
    acknowledgeAddress: () => {
      for (const runtime of runtimes.values()) runtime.acknowledgeAddress();
    },
    close: () =>
      serial(async () => {
        closed = true;
        for (const id of runtimes.keys()) await stopRuntime(id);
        await writes;
      }),
  };
}

export type PrivateTunnel = ReturnType<typeof createPrivateTunnel>;
