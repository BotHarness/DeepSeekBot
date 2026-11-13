import { parseAccountOwner, type AccountOwner } from './account-owner';
import { hasPrivateOrigin, isPrivateRoute } from './route';

export interface PrivateAdmission {
  origin: string;
  token: string;
  additionalOrigins?: string[];
}

export interface HostEncryption {
  privateRelay?: PrivateAdmission;
  loopback?: 'encrypted';
  protocol: 'connect-noise-xk-v1';
  hostKey: string;
  deviceKey: string;
}

export interface SavedHost {
  routePreference?: string;
  accountOwner?: AccountOwner;
  connectHost?: string;
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
  if (value['routePreference'] !== undefined && typeof value['routePreference'] !== 'string')
    return undefined;
  const privateRelay = parsePrivateAdmission(record(value['encryption'])['privateRelay']);
  if (record(value['encryption'])['privateRelay'] !== undefined && !privateRelay) return;
  if (
    privateRelay &&
    (!Array.isArray(value['routes']) ||
      value['routes'].length === 0 ||
      value['routes'].length > 2 ||
      new Set(value['routes']).size !== value['routes'].length ||
      !value['routes'].every(
        (route) => typeof route === 'string' && hasPrivateOrigin(privateRelay, route),
      ))
  )
    return;
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
        ...(typeof value['routePreference'] === 'string'
          ? { routePreference: value['routePreference'] }
          : {}),
        ...(parseAccountOwner(value['accountOwner']) === undefined
          ? {}
          : { accountOwner: parseAccountOwner(value['accountOwner'])! }),
        ...(typeof value['connectHost'] === 'string' &&
        /^h[a-z2-7]{12}$/u.test(value['connectHost'])
          ? { connectHost: value['connectHost'] }
          : {}),
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
    hosts: [
      ...state.hosts.filter((entry) => entry.hostId !== host.hostId),
      {
        ...(previous?.routePreference === undefined
          ? {}
          : { routePreference: previous.routePreference }),
        ...host,
      },
    ],
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

export function parsePrivateAdmission(input: unknown): PrivateAdmission | undefined {
  const value = record(input);
  if (
    typeof value['origin'] !== 'string' ||
    typeof value['token'] !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value['token'])
  )
    return;
  try {
    const url = new URL(value['origin']);
    if (
      !isPrivateRoute(url.origin) ||
      url.protocol !== 'https:' ||
      url.origin !== value['origin'] ||
      url.username ||
      url.password
    )
      return;
    const additional = value['additionalOrigins'];
    if (
      additional !== undefined &&
      (!Array.isArray(additional) ||
        additional.length > 1 ||
        additional.some((origin) => {
          if (typeof origin !== 'string' || origin === url.origin) return true;
          try {
            const extra = new URL(origin);
            return (
              extra.origin !== origin ||
              !isPrivateRoute(origin) ||
              extra.protocol !== 'https:' ||
              !!extra.username ||
              !!extra.password
            );
          } catch {
            return true;
          }
        }))
    )
      return;
    return {
      origin: url.origin,
      token: value['token'],
      ...(Array.isArray(additional) && additional.length ? { additionalOrigins: additional } : {}),
    };
  } catch {
    return;
  }
}

export function parseEncryption(input: unknown): HostEncryption | undefined {
  const value = record(input);
  return value['protocol'] === 'connect-noise-xk-v1' &&
    typeof value['hostKey'] === 'string' &&
    /^[0-9a-f]{64}$/u.test(value['hostKey']) &&
    typeof value['deviceKey'] === 'string' &&
    /^[0-9a-f]{64}$/u.test(value['deviceKey'])
    ? {
        ...(parsePrivateAdmission(value['privateRelay'])
          ? { privateRelay: parsePrivateAdmission(value['privateRelay'])! }
          : {}),
        protocol: 'connect-noise-xk-v1',
        hostKey: value['hostKey'],
        deviceKey: value['deviceKey'],
        ...(value['loopback'] === 'encrypted' ? { loopback: 'encrypted' as const } : {}),
      }
    : undefined;
}

export class SavedHostsWriteError extends Error {
  constructor(override readonly cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'SavedHostsWriteError';
  }
}
