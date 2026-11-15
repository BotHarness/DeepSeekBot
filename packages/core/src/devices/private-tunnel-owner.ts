import { randomBytes, randomUUID } from 'node:crypto';
import { credentialKey } from '@deepseek-ai/dsh-credentials';
import { validTunnelToken } from './connect.js';
import {
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

export type PrivateRouteId = 'quick' | 'custom';
export interface PrivateRouteStatus extends PrivateTunnelStatus {
  id: PrivateRouteId;
  enabled: boolean;
  revision: string;
}
interface OwnedRoute {
  id: PrivateRouteId;
  enabled: boolean;
  configuration: TunnelRecord;
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
const routeId = (mode: PrivateTunnelMode): PrivateRouteId =>
  mode === 'quick' ? 'quick' : 'custom';
const configurationOrigin = (configuration: TunnelRecord) =>
  configuration.origin ??
  (configuration.hostname ? `https://${configuration.hostname}` : undefined);

function sameConfiguration(a: TunnelRecord, b: TunnelRecord): boolean {
  if (a.mode !== b.mode) return false;
  if (a.mode === 'quick') return true;
  if (a.mode === 'named') return a.hostname === b.hostname && a.token === b.token;
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
          routes: [{ id: routeId(legacy.mode), enabled: true, configuration: legacy }],
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
  for (const value of input.routes) {
    if (typeof value !== 'object' || value === null) return;
    const configuration = parseTunnelRecord(value.configuration);
    if (
      !configuration ||
      configuration.phoneToken !== input.phoneToken ||
      value.id !== routeId(configuration.mode) ||
      typeof value.enabled !== 'boolean' ||
      routes.some((route) => route.id === value.id)
    )
      return;
    routes.push({ id: value.id, enabled: value.enabled, configuration });
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
        previousConfiguration?.mode === 'quick' &&
        nextConfiguration?.hostname !== previousConfiguration.hostname;
      try {
        await credentials.modifyRecord(key, async () => ({ kind: 'grant', payload: next }));
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
      };
    });
  const status = (): PrivateTunnelStatus => {
    if (failure) return { state: 'error', issue: failure };
    const route = statuses().find((route) => route.state === 'connected') ?? statuses()[0];
    if (!route) return { state: 'off' };
    const { id: _id, enabled: _enabled, ...view } = route;
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
    if (!['quick', 'named', 'ingress'].includes(input.mode))
      return { ok: false, code: 'private-tunnel-input-invalid' };
    const hostname =
      input.mode === 'named' ? privateTunnelHostname(input.hostname ?? '') : undefined;
    const origin = input.mode === 'ingress' ? privateIngressOrigin(input.origin ?? '') : undefined;
    const token = input.token?.trim();
    if (input.mode === 'named' && !hostname)
      return { ok: false, code: 'private-tunnel-hostname-invalid' };
    if (input.mode === 'named' && !validTunnelToken(token ?? ''))
      return { ok: false, code: 'private-tunnel-token-invalid' };
    if (input.mode === 'ingress' && !origin)
      return { ok: false, code: 'private-ingress-origin-invalid' };
    if (closed || !(await load()) || !state) return unavailable();
    await writes;
    const id = routeId(input.mode);
    if (replace !== undefined && (replace !== id || !state.routes.some((r) => r.id === replace)))
      return { ok: false, code: 'private-route-not-found' };
    if (legacy && state.routes.some((route) => route.id !== id))
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
            { id, enabled: true, configuration: next },
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
  const change = async (
    action: 'start' | 'stop' | 'remove',
    id?: PrivateRouteId,
    expectedRevision?: string,
  ): Promise<PrivateTunnelResult> => {
    if (closed || !(await load()) || !state) return unavailable();
    await writes;
    if (id === undefined && state.routes.length > 1)
      return { ok: false, code: 'private-route-id-required' };
    const selected = id ?? state.routes[0]?.id;
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
    admissions: () =>
      [...runtimes].flatMap(([id, runtime]) => {
        const admission = runtime.admission();
        return admission ? [{ id, ...admission }] : [];
      }),
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
