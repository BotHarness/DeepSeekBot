export interface SavedHost {
  hostId: string;
  hostName: string;
  routes: string[];
  deviceId: string;
  credential: string;
}

export interface SavedHosts {
  hosts: SavedHost[];
  current?: string;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export function parseSavedHost(input: unknown): SavedHost | undefined {
  const value = record(input);
  return typeof value['hostId'] === 'string' &&
    typeof value['hostName'] === 'string' &&
    Array.isArray(value['routes']) &&
    value['routes'].every((route) => typeof route === 'string') &&
    typeof value['deviceId'] === 'string' &&
    typeof value['credential'] === 'string'
    ? {
        hostId: value['hostId'],
        hostName: value['hostName'],
        routes: value['routes'] as string[],
        deviceId: value['deviceId'],
        credential: value['credential'],
      }
    : undefined;
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
  if (hosts.length === 0) {
    const legacy = parseSavedHost(parse(single));
    return legacy === undefined ? { hosts: [] } : { hosts: [legacy], current: legacy.hostId };
  }
  const current =
    typeof value['current'] === 'string' && hosts.some((host) => host.hostId === value['current'])
      ? value['current']
      : hosts[0]!.hostId;
  return { hosts, current };
}

export function currentHost(state: SavedHosts): SavedHost | undefined {
  return state.hosts.find((host) => host.hostId === state.current);
}

export function withHost(state: SavedHosts, host: SavedHost): SavedHosts {
  return {
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
  return current === undefined ? { hosts } : { hosts, current };
}

export function selectHost(state: SavedHosts, hostId: string): SavedHosts | undefined {
  return state.hosts.some((host) => host.hostId === hostId)
    ? { hosts: state.hosts, current: hostId }
    : undefined;
}
