import { beforeEach, describe, expect, it, vi } from 'vitest';

const secure = new Map<string, string>();
let failures: ((key: string, exists: boolean) => boolean) | undefined;
let inFlight = 0;
let maxInFlight = 0;

vi.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock',
  getItemAsync: async (key: string) => secure.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 1));
    inFlight--;
    if (failures?.(key, secure.has(key)))
      throw new Error(
        "Calling the 'setValueWithKeyAsync' function has failed → Caused by: No keychain is available. You may need to restart your computer.",
      );
    secure.set(key, value);
  },
  deleteItemAsync: async (key: string) => void secure.delete(key),
}));

const { loadSavedHosts, saveHosts, SavedHostsWriteError } = await import('../src/host/saved-host');

const KEY = 'deepseekbot.hosts.v3';
const STAGED = 'deepseekbot.hosts.v3.staged';
const hosts = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    hostId: `h${index}`,
    hostName: `Mac ${index}`,
    routes: [`https://mac-${index}.example`],
    deviceId: `d${index}`,
    credential: `secret-${index}`,
  }));
const ids = async () => (await loadSavedHosts()).hosts.map((host) => host.hostId);

beforeEach(() => {
  secure.clear();
  failures = undefined;
  inFlight = 0;
  maxInFlight = 0;
});

describe('saved computers keychain writes', () => {
  it('applies overlapping saves one at a time, in order', async () => {
    const all = hosts(18);
    await Promise.all(
      all.map((_, index) => saveHosts({ hosts: all.slice(0, all.length - index), current: 'h0' })),
    );
    expect(maxInFlight).toBe(1);
    expect(await ids()).toEqual(['h0']);
  });

  it('does not let a load overwrite a save that started before it finished', async () => {
    await saveHosts({ hosts: hosts(18), current: 'h0' });
    secure.delete('deepseekbot.hosts.access');
    const loading = loadSavedHosts();
    const saving = saveHosts({ hosts: hosts(17), current: 'h0' });
    await Promise.all([loading, saving]);
    expect(await ids()).toHaveLength(17);
  });

  it('retries a transient keychain failure', async () => {
    await saveHosts({ hosts: hosts(18), current: 'h0' });
    let failed = 0;
    failures = (key) => key === KEY && failed++ < 2;
    await saveHosts({ hosts: hosts(17), current: 'h0' });
    expect(await ids()).toHaveLength(17);
  });

  it('re-creates the item when updating the existing one keeps failing', async () => {
    await saveHosts({ hosts: hosts(18), current: 'h0' });
    failures = (key, exists) => key === KEY && exists;
    await saveHosts({ hosts: hosts(17), current: 'h0' });
    failures = undefined;
    expect(secure.has(STAGED)).toBe(false);
    expect(await ids()).toHaveLength(17);
  });

  it('keeps the saved list and reports a keychain error when nothing works', async () => {
    await saveHosts({ hosts: hosts(18), current: 'h0' });
    failures = () => true;
    await expect(saveHosts({ hosts: hosts(17), current: 'h0' })).rejects.toBeInstanceOf(
      SavedHostsWriteError,
    );
    failures = undefined;
    expect(await ids()).toHaveLength(18);
  }, 15_000);

  it('recovers the staged copy when the app stopped mid re-create', async () => {
    secure.set(STAGED, JSON.stringify({ hosts: hosts(17), current: 'h0' }));
    expect(await ids()).toHaveLength(17);
    expect(secure.has(STAGED)).toBe(false);
    expect(secure.has(KEY)).toBe(true);
  });

  it('drops a leftover staged copy when the main list is present', async () => {
    await saveHosts({ hosts: hosts(18), current: 'h0' });
    secure.set(STAGED, JSON.stringify({ hosts: hosts(3), current: 'h0' }));
    expect(await ids()).toHaveLength(18);
    expect(secure.has(STAGED)).toBe(false);
  });
});
