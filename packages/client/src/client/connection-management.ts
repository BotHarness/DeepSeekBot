import type { ConnectedHost } from '../../../core/src/devices/connect-account.js';
import type { HostClient } from '../../../../apps/mobile/src/host/client.js';
import type { RemoteHost, RemoteHosts } from './remote-hosts.js';
import { AppearanceError, object } from './appearance.js';

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
  'revoke-device',
  'stop-route',
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
}

async function inspect(
  client: HostClient,
  remote: RemoteHost,
  signal: AbortSignal,
): Promise<ManagedHost> {
  const answer = await client.api('/api/botharness/devices', { signal });
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
  return { hostId: host.id, name: host.name, devices, stops };
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
  if (input.action === 'hosts') return { hosts: sources.getSnapshot().hosts.map(observedHost) };
  const remote = sources.getSnapshot().hosts.find((entry) => entry.host.hostId === input.hostId);
  const client = remote && sources.client(remote.host.hostId);
  if (!remote || !client) throw new AppearanceError('connection-host-unknown');
  if (input.action === 'inspect-host') return inspect(client, remote, request.signal);
  if (input.action === 'test-route') {
    const route = remote.snapshot.routes?.find((route) => route.url === input.route);
    if (!route || !client.testRoute) throw new AppearanceError('connection-route-unknown');
    const verified = await client.testRoute(route.url);
    return { hostId: remote.host.hostId, route: address(route.url), verified };
  }
  if (input.confirm !== true) throw new AppearanceError('connection-confirmation-required');
  if (input.action === 'forget-host') {
    await sources.forgetLocal(remote.host.hostId);
    return { hostId: remote.host.hostId, removedLocally: true };
  }
  const status = await inspect(client, remote, request.signal);
  if (
    !Number.isFinite(request.expiresAt) ||
    request.signal.aborted ||
    Date.now() >= request.expiresAt
  )
    throw new AppearanceError('connection-request-stale');
  if (sources.client(remote.host.hostId) !== client)
    throw new AppearanceError('connection-host-changed');
  let path: string;
  let body: Record<string, unknown>;
  if (input.action === 'revoke-device') {
    if (!status.devices.some((device) => device.id === input.deviceId && !device.revoked))
      throw new AppearanceError('connection-device-unknown');
    path = '/api/botharness/devices/revoke';
    body = { deviceId: input.deviceId, confirm: true };
  } else if (input.action === 'stop-route') {
    const kind = status.stops.find((kind) => kind === input.kind);
    if (!kind) throw new AppearanceError('connection-route-unknown');
    path = `/api/botharness/devices/${kind}`;
    body = { action: 'disable', confirm: true };
  } else throw new AppearanceError('connection-action-unknown');
  const result = await client.api(path, { body, signal: request.signal });
  if (result.status < 200 || result.status >= 300)
    throw new AppearanceError('connection-management-refused');
  return { hostId: remote.host.hostId, action: input.action, accepted: true };
}
