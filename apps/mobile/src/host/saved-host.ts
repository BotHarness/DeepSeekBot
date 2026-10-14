import * as SecureStore from 'expo-secure-store';

import { parseSavedHosts, type SavedHosts } from './hosts';

export type { SavedHost, SavedHosts } from './hosts';

const KEY = 'deepseekbot.hosts.v3';
const SINGLE_KEY = 'deepseekbot.host.v2';
const LEGACY_KEY = 'deepseekbot.host.v1';

export async function loadSavedHosts(): Promise<SavedHosts> {
  await SecureStore.deleteItemAsync(LEGACY_KEY).catch(() => undefined);
  const [raw, single] = await Promise.all([
    SecureStore.getItemAsync(KEY),
    SecureStore.getItemAsync(SINGLE_KEY),
  ]);
  return parseSavedHosts(raw, single);
}

export async function saveHosts(state: SavedHosts): Promise<void> {
  if (state.hosts.length === 0) await SecureStore.deleteItemAsync(KEY);
  else
    await SecureStore.setItemAsync(KEY, JSON.stringify(state), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  await SecureStore.deleteItemAsync(SINGLE_KEY).catch(() => undefined);
}
