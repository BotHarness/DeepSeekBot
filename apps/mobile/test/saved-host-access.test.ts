import { beforeEach, describe, expect, it, vi } from 'vitest';

const secure = new Map<string, string>();
const writes: { key: string; value: string; access: unknown }[] = [];
let failWrites = false;

vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked',
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock',
  getItemAsync: async (key: string) => secure.get(key) ?? null,
  setItemAsync: async (key: string, value: string, options?: { keychainAccessible?: unknown }) => {
    if (failWrites) throw new Error('User interaction is not allowed.');
    writes.push({ key, value, access: options?.keychainAccessible });
    secure.set(key, value);
  },
  deleteItemAsync: async (key: string) => void secure.delete(key),
}));

const { loadSavedHosts, saveHosts } = await import('../src/host/saved-host');

const host = {
  hostId: 'h1',
  hostName: 'Studio Mac',
  routes: ['https://studio.example'],
  deviceId: 'd1',
  credential: 'secret',
};
const stored = JSON.stringify({ hosts: [host], current: 'h1' });

beforeEach(() => {
  secure.clear();
  writes.splice(0);
  failWrites = false;
});

describe('saved computer credential protection', () => {
  it('saves pairings so background work can read them after the first unlock', async () => {
    await saveHosts({ hosts: [host], current: 'h1' });
    expect(writes.find((write) => write.key === 'deepseekbot.hosts.v3')?.access).toBe(
      'after-first-unlock',
    );
    expect(secure.get('deepseekbot.hosts.access')).toBe('after-first-unlock');
  });

  it('re-saves an existing pairing once with the new protection, unchanged', async () => {
    secure.set('deepseekbot.hosts.v3', stored);
    const first = await loadSavedHosts();
    expect(first.hosts.map((entry) => entry.hostId)).toEqual(['h1']);
    expect(writes).toEqual([
      { key: 'deepseekbot.hosts.v3', value: stored, access: 'after-first-unlock' },
      {
        key: 'deepseekbot.hosts.access',
        value: 'after-first-unlock',
        access: 'after-first-unlock',
      },
    ]);
    writes.splice(0);
    await loadSavedHosts();
    expect(writes).toEqual([]);
  });

  it('still loads pairings when the re-save fails and tries again next time', async () => {
    secure.set('deepseekbot.hosts.v3', stored);
    failWrites = true;
    expect((await loadSavedHosts()).hosts.map((entry) => entry.hostId)).toEqual(['h1']);
    expect(secure.has('deepseekbot.hosts.access')).toBe(false);
    failWrites = false;
    await loadSavedHosts();
    expect(secure.get('deepseekbot.hosts.access')).toBe('after-first-unlock');
  });

  it('writes nothing when the phone has no saved computers', async () => {
    await loadSavedHosts();
    expect(writes).toEqual([]);
  });
});
