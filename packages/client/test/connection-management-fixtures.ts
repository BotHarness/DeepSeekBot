import { vi } from 'vitest';
import { FakeHost } from '../../host-client/test/fake-host.js';
import type { SavedHost } from '@botharness/host-client/hosts';
import { createRemoteHosts, REMOTE_HOSTS_STORAGE_KEY } from '../src/client/remote-hosts.js';

export const saved = (hostId: string): SavedHost => ({
  hostId,
  hostName: 'Same name',
  routes: ['http://127.0.0.1:47001'],
  deviceId: `device-${hostId}`,
  credential: `${hostId}.secret`,
  encryption: {
    protocol: 'connect-noise-xk-v1',
    hostKey: '11'.repeat(32),
    deviceKey: '22'.repeat(32),
  },
});
export const request = () => ({
  expiresAt: Date.now() + 30_000,
  signal: new AbortController().signal,
});
export function acknowledgement(path: string, input: unknown) {
  const body = typeof input === 'object' && input !== null ? input : {};
  if (path.endsWith('/revoke'))
    return {
      revoked: true,
      closedStreams: 0,
      device: { id: 'deviceId' in body ? body.deviceId : undefined, name: 'Browser' },
    };
  if (path.endsWith('/private-tunnel'))
    return {
      ok: true,
      status: { state: 'off' },
      routeId: 'routeId' in body ? body.routeId : undefined,
      expectedRevision: 'expectedRevision' in body ? body.expectedRevision : undefined,
    };
  return { state: path.endsWith('/lan') ? 'off' : 'signed-out' };
}
export const fixture = (routes?: string[]) => {
  let tail = Promise.resolve();
  const lock = async <T>(_name: string, run: () => Promise<T>): Promise<T> => {
    const previous = tail;
    let release: (() => void) | undefined;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await run();
    } finally {
      release?.();
    }
  };
  const values = new Map([
    [
      REMOTE_HOSTS_STORAGE_KEY,
      JSON.stringify([{ ...saved('a'), ...(routes ? { routes } : {}) }, saved('b')]),
    ],
  ]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const sources = createRemoteHosts({
    storage,
    carrier: new FakeHost().carrier,
    connectionOperationLock: lock,
  });
  for (const hostId of ['a', 'b']) {
    const client = sources.client(hostId)!;
    const snapshot = client.getSnapshot();
    vi.spyOn(client, 'getSnapshot').mockImplementation(() => ({
      ...snapshot,
      connection: { status: 'connected', route: routes?.[0] ?? 'http://127.0.0.1:47001' },
    }));
  }
  return { sources, values, storage, lock };
};
