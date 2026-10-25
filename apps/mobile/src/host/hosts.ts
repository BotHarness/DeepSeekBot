import { parseAccountOwner, type AccountOwner } from './account-owner';

export interface HostEncryption {
  loopback?: 'encrypted';
  protocol: 'connect-noise-xk-v1';
  hostKey: string;
  deviceKey: string;
}

export interface SavedHost {
  accountOwner?: AccountOwner;
  encryption?: HostEncryption;
  hostId: string;
  hostName: string;
  routes: string[];
  deviceId: string;
  credential: string;
}

export interface SavedHosts {
  hosts: SavedHost[];
  current?: string;
  pendingAccountRemoval?: SavedHost[];
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export function parseSavedHost(input: unknown): SavedHost | undefined {
  const value = record(input);
  const encryptedRoutes = value['encryptedLoopbackRoutes'];
  if (
    encryptedRoutes !== undefined &&
    (record(value['encryption'])['loopback'] !== 'encrypted' ||
      !Array.isArray(value['routes']) ||
      value['routes'].length !== 0 ||
      !Array.isArray(encryptedRoutes) ||
      encryptedRoutes.length !== 1 ||
      typeof encryptedRoutes[0] !== 'string' ||
      !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/u.test(encryptedRoutes[0]))
  )
    return undefined;
  if (
    record(value['encryption'])['loopback'] === 'encrypted' &&
    parseEncryption(value['encryption']) === undefined
  )
    return undefined;
  return typeof value['hostId'] === 'string' &&
    typeof value['hostName'] === 'string' &&
    Array.isArray(value['routes']) &&
    value['routes'].every((route) => typeof route === 'string') &&
    typeof value['deviceId'] === 'string' &&
    typeof value['credential'] === 'string'
    ? {
        ...(parseAccountOwner(value['accountOwner']) === undefined
          ? {}
          : { accountOwner: parseAccountOwner(value['accountOwner'])! }),
        ...(parseEncryption(value['encryption']) === undefined
          ? {}
          : { encryption: parseEncryption(value['encryption'])! }),
        hostId: value['hostId'],
        hostName: value['hostName'],
        routes: (encryptedRoutes ?? value['routes']) as string[],
        deviceId: value['deviceId'],
        credential: value['credential'],
      }
    : undefined;
}

export function serializeSavedHost(host: SavedHost) {
  return host.encryption?.loopback === 'encrypted'
    ? { ...host, routes: [], encryptedLoopbackRoutes: host.routes }
    : host;
}

function parse(text: string | null | undefined): unknown {
  if (text === null || text === undefined) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export function parseSavedHosts(
  raw: string | null | undefined,
  single?: string | null,
): SavedHosts {
  const value = record(parse(raw));
  const hosts = Array.isArray(value['hosts'])
    ? value['hosts'].flatMap((entry) => parseSavedHost(entry) ?? [])
    : [];
  if (
    hosts.length === 0 &&
    !Array.isArray(value['hosts']) &&
    !Array.isArray(value['pendingAccountRemoval'])
  ) {
    const legacy = parseSavedHost(parse(single));
    return legacy === undefined ? { hosts: [] } : { hosts: [legacy], current: legacy.hostId };
  }
  const current =
    typeof value['current'] === 'string' && hosts.some((host) => host.hostId === value['current'])
      ? value['current']
      : hosts[0]?.hostId;
  const pendingAccountRemoval = Array.isArray(value['pendingAccountRemoval'])
    ? value['pendingAccountRemoval'].flatMap((entry) => parseSavedHost(entry) ?? [])
    : [];
  return {
    hosts,
    ...(current === undefined ? {} : { current }),
    ...(pendingAccountRemoval.length ? { pendingAccountRemoval } : {}),
  };
}

export function currentHost(state: SavedHosts): SavedHost | undefined {
  return state.hosts.find((host) => host.hostId === state.current);
}

export function withHost(state: SavedHosts, host: SavedHost): SavedHosts {
  if (state.pendingAccountRemoval?.some((entry) => entry.hostId === host.hostId))
    throw new Error('account-cleanup-pending');
  const previous = state.hosts.find((entry) => entry.hostId === host.hostId);
  if (previous?.encryption && previous.encryption.hostKey !== host.encryption?.hostKey)
    throw new Error('host-key-mismatch');

  return {
    ...state,
    hosts: [...state.hosts.filter((entry) => entry.hostId !== host.hostId), host],
    current: host.hostId,
  };
}

export function withoutHost(state: SavedHosts, hostId: string): SavedHosts {
  const hosts = state.hosts.filter((host) => host.hostId !== hostId);
  const current =
    state.current !== hostId && hosts.some((host) => host.hostId === state.current)
      ? state.current
      : hosts[0]?.hostId;
  const { current: _previous, ...rest } = state;
  return { ...rest, hosts, ...(current === undefined ? {} : { current }) };
}

export function selectHost(state: SavedHosts, hostId: string): SavedHosts | undefined {
  return state.hosts.some((host) => host.hostId === hostId)
    ? { ...state, current: hostId }
    : undefined;
}

export function parseEncryption(input: unknown): HostEncryption | undefined {
  const value = record(input);
  return value['protocol'] === 'connect-noise-xk-v1' &&
    typeof value['hostKey'] === 'string' &&
    /^[0-9a-f]{64}$/u.test(value['hostKey']) &&
    typeof value['deviceKey'] === 'string' &&
    /^[0-9a-f]{64}$/u.test(value['deviceKey'])
    ? {
        protocol: 'connect-noise-xk-v1',
        hostKey: value['hostKey'],
        deviceKey: value['deviceKey'],
        ...(value['loopback'] === 'encrypted' ? { loopback: 'encrypted' as const } : {}),
      }
    : undefined;
}
