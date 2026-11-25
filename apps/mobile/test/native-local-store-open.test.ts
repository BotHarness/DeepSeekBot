import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ calls: [] as string[] }));

const database = {
  execAsync: async () => undefined,
  runAsync: async () => undefined,
  getAllAsync: async () => [],
  closeAsync: async () => undefined,
};

vi.mock('expo-sqlite', () => ({
  defaultDatabaseDirectory: '/documents/SQLite',
  openDatabaseSync: (name: string) => {
    native.calls.push(`open ${name}`);
    return database;
  },
  deleteDatabaseSync: (name: string) => {
    if (name.includes('locked')) throw new Error('locked');
    native.calls.push(`delete ${name}`);
  },
  openDatabaseAsync: async (name: string) => {
    native.calls.push(`concurrent open ${name}`);
    return database;
  },
  deleteDatabaseAsync: async (name: string) => {
    native.calls.push(`concurrent delete ${name}`);
  },
}));
vi.mock('expo-file-system', () => ({ File: class {}, Paths: {} }));
vi.mock('@botharness/host-client/local-store', () => ({
  localStoreName: (hostId: string) => `store-${hostId}.db`,
  openLocalStore: async () => ({}),
}));

const { deleteNativeLocalStore, openNativeLocalStore } =
  await import('../src/host/native-local-store');

beforeEach(() => {
  native.calls = [];
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('native local store', () => {
  it('opens every paired Host at launch without the concurrent native path', async () => {
    await Promise.all(['h1', 'h2', 'h3', 'h4'].map((hostId) => openNativeLocalStore(hostId)));
    expect(native.calls).toEqual([
      'open store-h1.db',
      'open store-h2.db',
      'open store-h3.db',
      'open store-h4.db',
    ]);
  });

  it('deletes without the concurrent native path and still rejects a failed delete', async () => {
    await deleteNativeLocalStore('h1');
    await expect(deleteNativeLocalStore('locked')).rejects.toThrow('locked');
    expect(native.calls).toEqual(['delete store-h1.db']);
  });

  it('keeps expo-sqlite opens off the concurrent native path that crashed launches (#4678)', () => {
    const root = join(import.meta.dirname, '..');
    const offenders = ['app', 'src']
      .flatMap((directory) => sourceFiles(join(root, directory)))
      .filter((file) =>
        /\b(openDatabaseAsync|deleteDatabaseAsync|importDatabaseFromAssetAsync|SQLiteProvider)\b/.test(
          readFileSync(file, 'utf8'),
        ),
      );
    expect(offenders).toEqual([]);
  });
});
