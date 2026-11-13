import type { ConnectedHost } from '../../../core/src/devices/connect-account.js';
import type { HostClient } from '../../../../apps/mobile/src/host/client.js';
import type { RemoteHost, RemoteHosts } from './remote-hosts.js';
import { AppearanceError, object } from './appearance.js';
import {
  connectionMutationSchema,
  type ConnectionMutation,
} from '../../../core/src/devices/connection-operation.js';
import { isLanRoute, isConnectRoute } from '../../../../apps/mobile/src/host/route.js';

export function connectionRows(hosts: readonly RemoteHost[], account: readonly ConnectedHost[]) {
  const matched = new Set<string>();
  const paired = hosts.map((remote) => {
    const member = account.find(
      (entry) =>
        entry.botNetwork?.hostId === remote.host.hostId &&
        entry.botNetwork.publicKey === remote.host.encryption?.hostKey,
    );
    if (member) matched.add(member.id);
    return { remote, member };
  });
  return {
    account: paired.filter((row) => row.member !== undefined),
    other: paired.filter((row) => row.member === undefined),
    discovered: account.filter((entry) => !entry.current && !matched.has(entry.id)),
  };
}

function address(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

export function observedHost(remote: RemoteHost) {
  const { connection, routes } = remote.snapshot;
  return {
    hostId: remote.host.hostId,
    name: remote.host.hostName,
    status: connection.status,
    routePreference:
      remote.snapshot.routePreference === undefined
        ? 'automatic'
        : address(remote.snapshot.routePreference),
    routeChangePending: remote.snapshot.routeChangePending === true,
    ...(remote.host.connectionOwnerChanged ? { previousCredentialOutcomeUnknown: true } : {}),
    ...(remote.host.pendingConnection
      ? {
          pendingOperation: {
            generation: remote.host.pendingConnection.generation,
            action: remote.host.pendingConnection.operation.action,
            outcome: 'unknown',
          },
        }
      : {}),
    currentRoute: address(connection.route),
    routes: (
      routes ?? remote.host.routes.map((url) => ({ url, status: 'unchecked' as const }))
    ).map((route) => ({
      address: address(route.url),
      status: route.status,
      current: connection.status === 'connected' && route.url === connection.route,
    })),
  };
}

const managementActions = new Set([
  'hosts',
  'inspect-host',
  'forget-host',
  'test-route',
  'select-route',
  'revoke-device',
  'stop-route',
  'plan-operation',
  'read-operation',
  'read-previous-operation',
  'sign-out',
]);
export const isConnectionManagement = (raw: unknown) => {
  const action = object(raw).action;
  return typeof action === 'string' && managementActions.has(action);
};

type StopKind = 'lan' | 'private-tunnel';
export interface ManagedHost {
  hostId: string;
  name: string;
  devices: { id: string; name: string; revoked: boolean; current: boolean }[];
  stops: StopKind[];
  privateRoutes: { id: 'quick' | 'custom'; origin: string; state: string }[];
  accountState: string;
  lanState: string;
  lanPort?: number;
}

async function inspect(
  client: HostClient,
  remote: RemoteHost,
  signal: AbortSignal,
): Promise<ManagedHost> {
  let answer: Awaited<ReturnType<HostClient['api']>>;
  try {
    answer = await client.api('/api/botharness/devices', { signal });
  } catch {
    throw new AppearanceError('connection-management-unavailable');
  }
  if (answer.status !== 200) throw new AppearanceError('connection-management-refused');
  const body = object(answer.body);
  const host = object(body.host);
  if (
    host.id !== remote.host.hostId ||
    typeof host.name !== 'string' ||
    !Array.isArray(body.devices)
  )
    throw new AppearanceError('connection-host-mismatch');
  const devices = body.devices.map((item) => {
    const device = object(item);
    if (typeof device.id !== 'string' || typeof device.name !== 'string')
      throw new AppearanceError('connection-status-invalid');
    return {
      id: device.id,
      name: device.name,
      revoked: typeof device.revokedAt === 'string',
      current: device.id === remote.host.deviceId,
    };
  });
  const stops: StopKind[] = [];
  for (const [field, kind] of [
    ['lan', 'lan'],
    ['privateTunnel', 'private-tunnel'],
  ] as const) {
    if (body[field] !== undefined) {
      const status = object(body[field]);
      if (typeof status.state === 'string' && status.state !== 'off') stops.push(kind);
    }
  }
  const privateRoutes: ManagedHost['privateRoutes'] = [];
  if (Array.isArray(body.privateRoutes)) {
    for (const raw of body.privateRoutes) {
      const route = object(raw);
      if ((route.id === 'quick' || route.id === 'custom') && typeof route.state === 'string')
        privateRoutes.push({
          id: route.id,
          origin: typeof route.origin === 'string' ? address(route.origin) : '',
          state: route.state,
        });
    }
  }
  const lanPort = object(body.lan).port;
  return {
    hostId: host.id,
    name: host.name,
    devices,
    stops,
    privateRoutes,
    accountState: String(object(object(body.connect).account).state ?? 'unavailable'),
    lanState: String(object(body.lan).state ?? 'unavailable'),
    ...(typeof lanPort === 'number' ? { lanPort } : {}),
  };
}

export interface ConnectionPlan {
  hostId: string;
  disconnects: boolean;
  alternatives: string[];
}

function affectsRoute(operation: ConnectionMutation, status: ManagedHost, route: string): boolean {
  if (operation.action === 'sign-out') return isConnectRoute(route);
  if (operation.action !== 'stop-route') return false;
  if (operation.kind === 'lan') {
    try {
      const url = new URL(route);
      return (
        isLanRoute(route) ||
        (status.lanPort !== undefined &&
          Number(url.port || (url.protocol === 'https:' ? 443 : 80)) === status.lanPort)
      );
    } catch {
      return true;
    }
  }
  const owned = status.privateRoutes.find((entry) => entry.id === operation.routeId);
  return !owned?.origin || address(route) === owned.origin;
}

function validateOperation(operation: ConnectionMutation, status: ManagedHost): void {
  if (operation.action === 'revoke-device') {
    if (!status.devices.some((entry) => entry.id === operation.deviceId && !entry.revoked))
      throw new AppearanceError('connection-device-unknown');
  } else if (operation.action === 'stop-route') {
    if (operation.kind === 'private-tunnel') {
      if (
        !operation.routeId ||
        !status.privateRoutes.some(
          (entry) => entry.id === operation.routeId && entry.state !== 'off',
        )
      )
        throw new AppearanceError('connection-route-unknown');
    } else if (!status.stops.includes('lan')) throw new AppearanceError('connection-route-unknown');
  } else if (status.accountState !== 'signed-in')
    throw new AppearanceError('connection-account-unavailable');
}

function operationPlan(
  remote: RemoteHost,
  status: ManagedHost,
  operation: ConnectionMutation,
): ConnectionPlan {
  const selfRevocation =
    operation.action === 'revoke-device' && operation.deviceId === remote.host.deviceId;
  return {
    hostId: remote.host.hostId,
    disconnects:
      selfRevocation || affectsRoute(operation, status, remote.snapshot.connection.route),
    alternatives: selfRevocation
      ? []
      : [
          ...new Set(
            remote.host.routes
              .filter(
                (route) =>
                  route !== remote.snapshot.connection.route &&
                  !affectsRoute(operation, status, route),
              )
              .map(address)
              .filter(Boolean),
          ),
        ],
  };
}

function operationCompleted(status: ManagedHost, operation: ConnectionMutation): boolean {
  if (operation.action === 'revoke-device')
    return status.devices.some((entry) => entry.id === operation.deviceId && entry.revoked);
  if (operation.action === 'sign-out') return status.accountState === 'signed-out';
  if (operation.kind === 'lan') return status.lanState === 'off';
  return status.privateRoutes.some(
    (entry) => entry.id === operation.routeId && entry.state === 'off',
  );
}

async function waitForRoute(client: HostClient, route: string, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let off: (() => void) | undefined;
    const finish = (error?: Error) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', aborted);
      off?.();
      if (error) reject(error);
      else resolve();
    };
    const aborted = () => finish(new AppearanceError('connection-handover-unconfirmed'));
    const timer = setTimeout(aborted, 12_000);
    signal.addEventListener('abort', aborted, { once: true });
    const check = () => {
      const current = client.getSnapshot().connection;
      if (current.status === 'connected' && current.route === route) finish();
    };
    off = client.subscribe(check);
    if (signal.aborted) aborted();
    else check();
  });
}

export async function manageConnections(
  sources: RemoteHosts,
  raw: unknown,
  request: { expiresAt: number; signal: AbortSignal },
) {
  const input = object(raw);
  if (
    !Number.isFinite(request.expiresAt) ||
    request.signal.aborted ||
    Date.now() >= request.expiresAt
  )
    throw new AppearanceError('connection-request-stale');
  if (
    [
      'stop-route',
      'revoke-device',
      'sign-out',
      'read-operation',
      'read-previous-operation',
    ].includes(String(input.action))
  ) {
    if (typeof input.hostId !== 'string') throw new AppearanceError('connection-host-unknown');
    const client = sources.client(input.hostId);
    if (!client) throw new AppearanceError('connection-host-unknown');
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(
        Math.min(30_000, Math.max(1, Math.floor(request.expiresAt - Date.now()))),
      ),
    ]);
    try {
      return await sources.withConnectionOperation(
        input.hostId,
        client,
        () => executeConnections(sources, raw, { ...request, signal }),
        signal,
      );
    } catch (error) {
      if (error instanceof AppearanceError) throw error;
      if (
        error instanceof Error &&
        [
          'connection-host-changed',
          'connection-operation-lock-unavailable',
          'connection-operation-limit',
          'connection-operation-owner-changed',
          'connection-operation-changed',
        ].includes(error.message)
      )
        throw new AppearanceError(error.message);
      if (signal.aborted) throw new AppearanceError('connection-request-stale');
      throw new AppearanceError('connection-operation-storage-unavailable');
    }
  }
  return executeConnections(sources, raw, request);
}

async function executeConnections(
  sources: RemoteHosts,
  raw: unknown,
  request: { expiresAt: number; signal: AbortSignal },
) {
  const input = object(raw);
  if (
    !Number.isFinite(request.expiresAt) ||
    request.signal.aborted ||
    Date.now() >= request.expiresAt
  )
    throw new AppearanceError('connection-request-stale');
  if (input.action === 'hosts') return { hosts: sources.getSnapshot().hosts.map(observedHost) };
  const remote = sources.getSnapshot().hosts.find((entry) => entry.host.hostId === input.hostId);
  const client = remote && sources.client(remote.host.hostId);
  if (!remote || !client) throw new AppearanceError('connection-host-unknown');
  if (input.action === 'select-route') {
    if (input.confirm !== true) throw new AppearanceError('connection-confirmation-required');
    if (typeof input.route !== 'string' || !client.setRoutePreference)
      throw new AppearanceError('connection-route-unknown');
    try {
      await client.setRoutePreference(input.route === 'automatic' ? undefined : input.route);
    } catch {
      throw new AppearanceError('connection-preference-not-saved');
    }
    return { hostId: remote.host.hostId, preferenceSaved: true };
  }
  if (input.action === 'inspect-host') return inspect(client, remote, request.signal);
  if (input.action === 'test-route') {
    const route = remote.snapshot.routes?.find((route) => route.url === input.route);
    if (!route || !client.testRoute) throw new AppearanceError('connection-route-unknown');
    const verified = await client.testRoute(route.url);
    return { hostId: remote.host.hostId, route: address(route.url), verified };
  }
  if (input.action === 'forget-host') {
    if (input.confirm !== true) throw new AppearanceError('connection-confirmation-required');
    await sources.forgetLocal(remote.host.hostId);
    return { hostId: remote.host.hostId, removedLocally: true };
  }
  const previousOperations =
    input.action === 'read-previous-operation'
      ? sources.previousConnectionOperations(remote.host.hostId, client)
      : [];
  const status = await inspect(client, remote, request.signal);
  if (
    !Number.isFinite(request.expiresAt) ||
    request.signal.aborted ||
    Date.now() >= request.expiresAt
  )
    throw new AppearanceError('connection-request-stale');
  if (sources.client(remote.host.hostId) !== client)
    throw new AppearanceError('connection-host-changed');
  const pending =
    input.action === 'read-operation'
      ? remote.host.pendingConnection
      : sources.getSnapshot().hosts.find((entry) => entry.host.hostId === remote.host.hostId)?.host
          .pendingConnection;
  if (input.action === 'read-previous-operation') {
    const outcomes = previousOperations.map((record) => {
      const completed = operationCompleted(status, record.operation);
      if (completed)
        sources.setPendingConnection(
          remote.host.hostId,
          client,
          undefined,
          record.generation,
          record.deviceId,
        );
      return {
        generation: record.generation,
        outcome: completed ? ('completed' as const) : ('unknown' as const),
      };
    });
    return {
      hostId: remote.host.hostId,
      outcomes,
      outcome: outcomes.some((entry) => entry.outcome === 'unknown')
        ? ('unknown' as const)
        : ('completed' as const),
    };
  }
  if (input.action === 'read-operation') {
    if (!pending)
      return {
        hostId: remote.host.hostId,
        outcome: remote.host.connectionOwnerChanged
          ? ('owner-changed' as const)
          : ('none' as const),
      };
    if (
      pending.hostKey !== remote.host.encryption?.hostKey ||
      pending.deviceId !== remote.host.deviceId
    )
      throw new AppearanceError('connection-operation-owner-changed');
    const completed = operationCompleted(status, pending.operation);
    if (completed)
      sources.setPendingConnection(remote.host.hostId, client, undefined, pending.generation);
    return {
      hostId: remote.host.hostId,
      generation: pending.generation,
      outcome: completed ? ('completed' as const) : ('unknown' as const),
    };
  }
  if (pending) throw new AppearanceError('connection-management-unconfirmed');
  const parsed = connectionMutationSchema.safeParse(
    input.action === 'plan-operation' ? input.operation : input,
  );
  if (!parsed.success) throw new AppearanceError('connection-action-unknown');
  const operation = parsed.data;
  validateOperation(operation, status);
  const currentRemote = sources
    .getSnapshot()
    .hosts.find((entry) => entry.host.hostId === remote.host.hostId);
  if (!currentRemote) throw new AppearanceError('connection-host-changed');
  const plan = operationPlan(currentRemote, status, operation);
  if (input.action === 'plan-operation') return plan;
  if (input.confirm !== true) throw new AppearanceError('connection-confirmation-required');
  let handedOver: string | undefined;
  if (plan.disconnects) {
    if (typeof input.handover === 'string') {
      if (
        !plan.alternatives.includes(input.handover) ||
        !client.testRoute ||
        !client.setRoutePreference
      )
        throw new AppearanceError('connection-route-unknown');
      if (!(await client.testRoute(input.handover)))
        throw new AppearanceError('connection-alternative-unavailable');
      await client.setRoutePreference(input.handover);
      await waitForRoute(client, input.handover, request.signal);
      const refreshed = await inspect(client, remote, request.signal);
      validateOperation(operation, refreshed);
      const active = client.getSnapshot().connection;
      if (
        active.status !== 'connected' ||
        active.route !== input.handover ||
        affectsRoute(operation, refreshed, active.route)
      )
        throw new AppearanceError('connection-handover-unconfirmed');
      handedOver = input.handover;
    } else if (input.confirmDisconnect !== true) {
      throw new AppearanceError('connection-disconnect-confirmation-required');
    }
  }
  if (request.signal.aborted || Date.now() >= request.expiresAt)
    throw new AppearanceError('connection-request-stale');
  if (sources.client(remote.host.hostId) !== client)
    throw new AppearanceError('connection-host-changed');
  if (client.getSnapshot().connection.status !== 'connected')
    throw new AppearanceError('connection-host-offline');
  const hostKey = remote.host.encryption?.hostKey;
  if (!hostKey) throw new AppearanceError('connection-host-key-required');
  if (
    sources.getSnapshot().hosts.find((entry) => entry.host.hostId === remote.host.hostId)?.host
      .pendingConnection
  )
    throw new AppearanceError('connection-management-unconfirmed');
  let path: string;
  let body: Record<string, unknown>;
  if (operation.action === 'revoke-device') {
    path = '/api/botharness/devices/revoke';
    body = { deviceId: operation.deviceId, confirm: true };
  } else if (operation.action === 'stop-route') {
    path = `/api/botharness/devices/${operation.kind}`;
    body =
      operation.kind === 'lan'
        ? { action: 'disable', confirm: true }
        : { action: 'stop', routeId: operation.routeId, confirm: true };
  } else {
    path = '/api/botharness/devices/connect';
    body = { action: 'sign-out', confirm: true };
  }
  const generation = crypto.randomUUID();
  sources.setPendingConnection(remote.host.hostId, client, {
    generation,
    hostKey,
    deviceId: remote.host.deviceId,
    operation,
  });
  let result;
  try {
    if (handedOver !== undefined) {
      const active = client.getSnapshot().connection;
      if (
        active.status !== 'connected' ||
        active.route !== handedOver ||
        client.getSnapshot().routePreference !== handedOver
      ) {
        sources.setPendingConnection(remote.host.hostId, client, undefined, generation);
        throw new AppearanceError('connection-handover-unconfirmed');
      }
    }
    result = await client.api(path, { body, signal: request.signal });
  } catch {
    throw new AppearanceError('connection-management-unconfirmed');
  }
  if (result.status < 200 || result.status >= 300) {
    if (
      [
        'confirm-required',
        'private-route-id-required',
        'private-route-not-found',
        'lan-action-invalid',
      ].includes(String(object(result.body).code))
    )
      sources.setPendingConnection(remote.host.hostId, client, undefined, generation);
    throw new AppearanceError('connection-management-refused');
  }
  if (object(result.body).ok === false) throw new AppearanceError('connection-management-refused');
  sources.setPendingConnection(remote.host.hostId, client, undefined, generation);
  return { hostId: remote.host.hostId, action: input.action, accepted: true };
}
