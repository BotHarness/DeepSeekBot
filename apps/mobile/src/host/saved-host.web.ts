import type { SavedHost } from './saved-host';

const KEY = 'deepseekbot.host.v2';

function store(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

export async function loadSavedHost(): Promise<SavedHost | undefined> {
  const raw = store()?.getItem(KEY);
  if (raw === null || raw === undefined) return undefined;
  try {
    const value = JSON.parse(raw) as Partial<SavedHost>;
    return typeof value.hostId === 'string' &&
      typeof value.hostName === 'string' &&
      Array.isArray(value.routes) &&
      value.routes.every((route) => typeof route === 'string') &&
      typeof value.deviceId === 'string' &&
      typeof value.credential === 'string'
      ? {
          hostId: value.hostId,
          hostName: value.hostName,
          routes: value.routes,
          deviceId: value.deviceId,
          credential: value.credential,
        }
      : undefined;
  } catch {
    return undefined;
  }
}

export async function saveHost(host: SavedHost): Promise<void> {
  store()?.setItem(KEY, JSON.stringify(host));
}

export async function forgetHost(): Promise<void> {
  store()?.removeItem(KEY);
}
