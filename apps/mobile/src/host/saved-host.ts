import * as SecureStore from 'expo-secure-store';

import {
  parseSavedHosts,
  SavedHostsWriteError,
  serializeSavedHost,
  type SavedHosts,
} from './hosts';

export { SavedHostsWriteError } from './hosts';
export type { SavedHost, SavedHosts } from './hosts';

const KEY = 'deepseekbot.hosts.v3';
const STAGED_KEY = 'deepseekbot.hosts.v3.staged';
const SINGLE_KEY = 'deepseekbot.host.v2';
const LEGACY_KEY = 'deepseekbot.host.v1';
const ACCESS_KEY = 'deepseekbot.hosts.access';
const ACCESS = 'after-first-unlock';
const ACCESSIBLE = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
const RETRY_DELAYS_MS = [250, 750, 1500];

let queue: Promise<unknown> = Promise.resolve();

function exclusive<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.catch(() => undefined);
  return run;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function setWithRetry(key: string, value: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await SecureStore.setItemAsync(key, value, ACCESSIBLE);
      return;
    } catch (error) {
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined) throw error;
      await wait(delay);
    }
  }
}

async function recreate(value: string): Promise<void> {
  await setWithRetry(STAGED_KEY, value);
  await SecureStore.deleteItemAsync(KEY);
  await setWithRetry(KEY, value);
  await SecureStore.deleteItemAsync(STAGED_KEY).catch(() => undefined);
}

async function writeHosts(value: string): Promise<void> {
  try {
    await setWithRetry(KEY, value);
  } catch (error) {
    await recreate(value).catch(() => {
      throw new SavedHostsWriteError(error);
    });
  }
}

async function migrateAccess(raw: string): Promise<void> {
  if ((await SecureStore.getItemAsync(ACCESS_KEY)) === ACCESS) return;
  await SecureStore.setItemAsync(KEY, raw, ACCESSIBLE);
  await SecureStore.setItemAsync(ACCESS_KEY, ACCESS, ACCESSIBLE);
}

async function settleStaged(main: string | null, staged: string): Promise<void> {
  if (main === null) await writeHosts(staged);
  await SecureStore.deleteItemAsync(STAGED_KEY);
}

export function loadSavedHosts(): Promise<SavedHosts> {
  return exclusive(async () => {
    await SecureStore.deleteItemAsync(LEGACY_KEY).catch(() => undefined);
    const [main, staged, single] = await Promise.all([
      SecureStore.getItemAsync(KEY),
      SecureStore.getItemAsync(STAGED_KEY),
      SecureStore.getItemAsync(SINGLE_KEY),
    ]);
    const raw = main ?? staged;
    if (staged !== null) await settleStaged(main, staged).catch(() => undefined);
    if (raw !== null) await migrateAccess(raw).catch(() => undefined);
    return parseSavedHosts(raw, single);
  });
}

export function saveHosts(state: SavedHosts): Promise<void> {
  const value = JSON.stringify({
    ...state,
    hosts: state.hosts.map(serializeSavedHost),
    ...(state.pendingAccountRemoval === undefined
      ? {}
      : { pendingAccountRemoval: state.pendingAccountRemoval.map(serializeSavedHost) }),
  });
  return exclusive(async () => {
    await writeHosts(value);
    await SecureStore.setItemAsync(ACCESS_KEY, ACCESS, ACCESSIBLE).catch(() => undefined);
    await SecureStore.deleteItemAsync(SINGLE_KEY).catch(() => undefined);
  });
}
