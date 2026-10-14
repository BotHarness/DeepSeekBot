import * as SecureStore from 'expo-secure-store';

export interface SavedHost {
  route: string;
  token: string;
}

const KEY = 'deepseekbot.host.v1';

export async function loadSavedHost(): Promise<SavedHost | undefined> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (raw === null) return undefined;
  try {
    const value = JSON.parse(raw) as Partial<SavedHost>;
    return typeof value.route === 'string' && typeof value.token === 'string'
      ? { route: value.route, token: value.token }
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
