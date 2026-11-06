import * as SecureStore from 'expo-secure-store';

import { parseSavedHosts, serializeSavedHost, type SavedHosts } from './hosts';

export type { SavedHost, SavedHosts } from './hosts';

const KEY = 'deepseekbot.hosts.v3';
const SINGLE_KEY = 'deepseekbot.host.v2';
const LEGACY_KEY = 'deepseekbot.host.v1';
const ACCESS_KEY = 'deepseekbot.hosts.access';
const ACCESS = 'after-first-unlock';
const ACCESSIBLE = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

async function migrateAccess(raw: string | null): Promise<void> {
  if (raw === null || (await SecureStore.getItemAsync(ACCESS_KEY)) === ACCESS) return;
  await SecureStore.setItemAsync(KEY, raw, ACCESSIBLE);
  await SecureStore.setItemAsync(ACCESS_KEY, ACCESS, ACCESSIBLE);
}

export async function loadSavedHosts(): Promise<SavedHosts> {
  await SecureStore.deleteItemAsync(LEGACY_KEY).catch(() => undefined);
  const [raw, single] = await Promise.all([
    SecureStore.getItemAsync(KEY),
    SecureStore.getItemAsync(SINGLE_KEY),
  ]);
  await migrateAccess(raw).catch(() => undefined);
  return parseSavedHosts(raw, single);
}

export async function saveHosts(state: SavedHosts): Promise<void> {
  await SecureStore.setItemAsync(
    KEY,
    JSON.stringify({
      ...state,
      hosts: state.hosts.map(serializeSavedHost),
      ...(state.pendingAccountRemoval === undefined
        ? {}
        : { pendingAccountRemoval: state.pendingAccountRemoval.map(serializeSavedHost) }),
    }),
    ACCESSIBLE,
  );
  await SecureStore.setItemAsync(ACCESS_KEY, ACCESS, ACCESSIBLE).catch(() => undefined);
  await SecureStore.deleteItemAsync(SINGLE_KEY).catch(() => undefined);
}
