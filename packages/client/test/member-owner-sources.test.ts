import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it.each(['member', 'admin'])(
  'does not restore Owner remote credentials in the %s page singleton',
  async (role) => {
    vi.resetModules();
    const saved = JSON.stringify([
      {
        hostId: 'owner-host',
        hostName: 'Owner private Host',
        deviceId: 'owner-device',
        credential: 'owner-device.private-credential',
        routes: ['http://127.0.0.1:47001'],
      },
    ]);
    const values = new Map([['botharness.remoteHosts.v1', saved]]);
    const reads: string[] = [];
    const writes: string[] = [];
    vi.stubGlobal('__DSH_REMOTE_ACCESS__', { owner: false, role });
    vi.stubGlobal('document', { cookie: 'dsh_auth=ambient-owner-session' });
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
    const { createRemoteHosts, remoteHosts, REMOTE_HOSTS_STORAGE_KEY, HOST_TAB_STORAGE_KEY } =
      await import('../src/client/remote-hosts.js');
    const { createHostClient } = await import('../../../apps/mobile/src/host/client.js');
    const { FakeHost } = await import('../../../apps/mobile/test/fake-host.js');
    const ownerClient = createHostClient({
      hostId: 'owner-host',
      routes: ['http://127.0.0.1:47001'],
      credential: 'unused-owner-grant',
      carrier: new FakeHost().carrier,
    });
    values.set(REMOTE_HOSTS_STORAGE_KEY, saved);
    const executionKey = 'botharness.remoteHosts.operation.v1:owner-private-record';
    values.set(
      'botharness.remoteHosts.operations.v1',
      JSON.stringify([{ hostId: 'owner-host', key: executionKey }]),
    );
    values.set(executionKey, 'owner-private-execution');
    const source = remoteHosts();
    const off = source.subscribe(() => {});
    expect(source.getSnapshot().hosts).toEqual([]);
    expect(await source.pair('private-link', 'Member')).toEqual({
      ok: false,
      code: 'owner-required',
    });
    const relationship = {
      id: 'a'.repeat(32),
      peer: { id: 'owner-host', name: 'Private', publicKey: 'ab'.repeat(32), routes: [] },
    };
    expect(await source.enrollRelationship(relationship, 'Member')).toEqual({
      ok: false,
      code: 'owner-required',
    });
    const forced = createRemoteHosts({
      enabled: true,
      storage: localStorage,
      carrier: {
        request: fetcher,
        openSocket: socket,
      },
    });
    const stopForced = forced.subscribe(() => {});
    expect(forced.getSnapshot().hosts).toEqual([]);
    expect(
      await forced.enrollRelationship(relationship, 'Member', undefined, {
        accountGeneration: 'caller-generation',
      }),
    ).toEqual({ ok: false, code: 'owner-required' });
    await expect(forced.learnRelationshipRoutes(relationship.peer)).rejects.toMatchObject({
      code: 'owner-required',
    });
    await expect(forced.retireRelationship(relationship.id)).rejects.toMatchObject({
      code: 'owner-required',
    });
    await expect(source.forgetLocal('owner-host')).rejects.toMatchObject({
      code: 'owner-required',
    });
    const execute = vi.fn();
    await expect(
      source.withConnectionOperation('owner-host', ownerClient, execute),
    ).rejects.toMatchObject({ code: 'owner-required' });
    expect(() => source.previousConnectionOperations('owner-host', ownerClient)).toThrow(
      'owner-required',
    );
    expect(() => source.setPendingConnection('owner-host', ownerClient, undefined)).toThrow(
      'owner-required',
    );
    expect(execute).not.toHaveBeenCalled();
    expect(reads).not.toContain('botharness.remoteHosts.operations.v1');
    expect(reads).not.toContain(executionKey);
    expect(writes).not.toContain('botharness.remoteHosts.operations.v1');
    expect(writes).not.toContain(executionKey);
    expect(values.get(executionKey)).toBe('owner-private-execution');
    ownerClient.stop();
    source.close();
    off();
    forced.close();
    stopForced();
    expect(reads).not.toContain(REMOTE_HOSTS_STORAGE_KEY);
    expect(reads).not.toContain(HOST_TAB_STORAGE_KEY);
    expect(writes).not.toContain(REMOTE_HOSTS_STORAGE_KEY);
    expect(values.get(REMOTE_HOSTS_STORAGE_KEY)).toBe(saved);
    expect(fetcher).not.toHaveBeenCalled();
    expect(socket).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(document.cookie).toBe('dsh_auth=ambient-owner-session');
  },
);
