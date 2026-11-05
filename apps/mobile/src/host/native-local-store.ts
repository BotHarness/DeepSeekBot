import { File } from 'expo-file-system';
import { defaultDatabaseDirectory, deleteDatabaseAsync, openDatabaseAsync } from 'expo-sqlite';

import { localStoreName, openLocalStore, type LocalStore, type SqlValue } from './local-store';

const bind = (params: readonly SqlValue[] | undefined): SqlValue[] => (params ? [...params] : []);

export async function openNativeLocalStore(hostId: string): Promise<LocalStore> {
  const database = await openDatabaseAsync(localStoreName(hostId));
  return openLocalStore({
    exec: (sql) => database.execAsync(sql),
    async run(sql, params) {
      await database.runAsync(sql, bind(params));
    },
    all: (sql, params) => database.getAllAsync(sql, bind(params)),
    close: () => database.closeAsync(),
  });
}

export async function deleteNativeLocalStore(hostId: string): Promise<void> {
  await deleteDatabaseAsync(localStoreName(hostId));
}

function nativeLocalStoreSize(hostId: string): number {
  const directory = String(defaultDatabaseDirectory);
  const root = directory.startsWith('file:') ? directory : `file://${directory}`;
  const name = localStoreName(hostId);
  return ['', '-wal', '-shm'].reduce((total, suffix) => {
    const file = new File(root, name + suffix);
    return total + (file.exists ? (file.size ?? 0) : 0);
  }, 0);
}

export const nativeHostStoreOpener = {
  open: openNativeLocalStore,
  remove: deleteNativeLocalStore,
  size: nativeLocalStoreSize,
};
