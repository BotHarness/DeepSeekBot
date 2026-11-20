import type { HostStorage } from './remote-hosts.js';

export const CREATION_HOST_STORAGE_KEY = 'botharness.creationHost.v1';

export interface CreationHost {
  readonly id: string;
  readonly name: string;
  readonly online: boolean;
}

export function lastCreationHost(storage: HostStorage | undefined): CreationHost | undefined {
  try {
    const raw: unknown = JSON.parse(storage?.getItem(CREATION_HOST_STORAGE_KEY) ?? 'null');
    if (
      typeof raw === 'object' &&
      raw !== null &&
      'id' in raw &&
      'name' in raw &&
      typeof raw.id === 'string' &&
      raw.id.length > 0 &&
      typeof raw.name === 'string'
    )
      return { id: raw.id, name: raw.name, online: false };
  } catch {}
  return undefined;
}

export function initialCreationHost(
  scope: string,
  hosts: readonly CreationHost[],
  previous: CreationHost | undefined,
): CreationHost | undefined {
  if (scope !== 'all') return hosts.find((host) => host.id === scope);
  if (previous) return hosts.find((host) => host.id === previous.id) ?? previous;
  return hosts.length === 1 ? hosts[0] : undefined;
}

export function rememberCreationHost(storage: HostStorage | undefined, host: CreationHost): void {
  try {
    storage?.setItem(CREATION_HOST_STORAGE_KEY, JSON.stringify({ id: host.id, name: host.name }));
  } catch {}
}

export function creationStorage(): HostStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
