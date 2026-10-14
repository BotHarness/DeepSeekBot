import * as SecureStore from 'expo-secure-store';

export interface SavedHost {
  hostId: string;
  hostName: string;
  routes: string[];
  deviceId: string;
  credential: string;
}

const KEY = 'deepseekbot.host.v2';
const LEGACY_KEY = 'deepseekbot.host.v1';

export async function loadSavedHost(): Promise<SavedHost | undefined> {
  await SecureStore.deleteItemAsync(LEGACY_KEY).catch(() => undefined);
  const raw = await SecureStore.getItemAsync(KEY);
  if (raw === null) return undefined;
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

export function saveHost(host: SavedHost): Promise<void> {
  return SecureStore.setItemAsync(KEY, JSON.stringify(host), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export function forgetHost(): Promise<void> {
  return SecureStore.deleteItemAsync(KEY);
}
