import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it.each(['member', 'admin'])(
  'does not restore Owner remote credentials in the %s page singleton',
  async (role) => {
    vi.resetModules();
    const saved = 'owner-private-remote-credential';
    const values = new Map([['botharness.remoteHosts.v1', saved]]);
    const reads: string[] = [];
    const writes: string[] = [];
    vi.stubGlobal('__DSH_REMOTE_ACCESS__', { owner: false, role });
    vi.stubGlobal('localStorage', {
      getItem(key: string) {
        reads.push(key);
        return values.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        writes.push(key);
        values.set(key, value);
      },
      removeItem(key: string) {
        writes.push(key);
        values.delete(key);
      },
    });
    const fetcher = vi.fn();
    const socket = vi.fn();
    const open = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    vi.stubGlobal('WebSocket', socket);
    vi.stubGlobal('indexedDB', { open });
    const { remoteHosts, REMOTE_HOSTS_STORAGE_KEY, HOST_TAB_STORAGE_KEY } =
      await import('../src/client/remote-hosts.js');
    values.set(REMOTE_HOSTS_STORAGE_KEY, saved);
    const source = remoteHosts();
    const off = source.subscribe(() => {});
    expect(source.getSnapshot().hosts).toEqual([]);
    expect(await source.pair('private-link', 'Member')).toEqual({
      ok: false,
      code: 'owner-required',
    });
    expect(await source.enrollRelationship('a'.repeat(32), 'Member')).toEqual({
      ok: false,
      code: 'owner-required',
    });
    await expect(source.forgetLocal('owner-host')).rejects.toMatchObject({
      code: 'owner-required',
    });
    source.close();
    off();
    expect(reads).not.toContain(REMOTE_HOSTS_STORAGE_KEY);
    expect(reads).not.toContain(HOST_TAB_STORAGE_KEY);
    expect(writes).not.toContain(REMOTE_HOSTS_STORAGE_KEY);
    expect(values.get(REMOTE_HOSTS_STORAGE_KEY)).toBe(saved);
    expect(fetcher).not.toHaveBeenCalled();
    expect(socket).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  },
);
