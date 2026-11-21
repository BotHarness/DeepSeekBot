import { fakeCarrier, link, memoryStorage, releases } from './remote-hosts-fixtures.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostCarrier } from '@botharness/host-protocol/carrier';
import { parseSavedHost, type SavedHost } from '@botharness/host-client/hosts';
import {
  REMOTE_HOSTS_STORAGE_KEY,
  REMOTE_HOST_RELEASE_STORAGE_KEY,
  createRemoteHosts,
} from '../src/client/remote-hosts.js';

afterEach(() => {
  for (const release of releases.splice(0)) release();
  vi.unstubAllGlobals();
});

function custodyFake(raw: HostCarrier) {
  const kept = new Map<string, SavedHost>();
  let next = 0;
  const forgotten: string[] = [];
  const custody = {
    seal: vi.fn(async (host: SavedHost) => {
      if (kept.has(host.credential)) {
        kept.set(host.credential, { ...kept.get(host.credential)!, routes: host.routes });
        return parseSavedHost(host)!;
      }
      const handle = `custody.${String(next++).padStart(43, 'h')}`;
      kept.set(handle, host);
      return { ...parseSavedHost(host)!, credential: handle };
    }),
    forget: vi.fn(async (handle: string) => {
      forgotten.push(handle);
      kept.delete(handle);
    }),
  };
  const carrier: HostCarrier = {
    ...raw,
    custody: ({ credential }) => {
      const real = kept.get(credential);
      if (!real) throw new Error('custody-handle-unknown');
      const swap = (headers?: Record<string, string>) =>
        headers &&
        Object.fromEntries(
          Object.entries(headers).map(([name, value]) => [
            name,
            value === `Device ${credential}` ? `Device ${real.credential}` : value,
          ]),
        );
      return {
        request: (url, init) =>
          raw.request(url, { ...init, ...(init.headers ? { headers: swap(init.headers)! } : {}) }),
        openSocket: (url, events, headers) => raw.openSocket(url, events, swap(headers)),
      };
    },
  };
  return { custody, carrier, kept, forgotten };
}

describe('Remote Host credentials kept by the local Host', () => {
  it('stores only a handle after pairing and revokes through the Host before forgetting it', async () => {
    const storage = memoryStorage();
    const { carrier: raw, calls } = fakeCarrier();
    const { custody, carrier, kept, forgotten } = custodyFake(raw);
    const sources = createRemoteHosts({ storage, carrier, custody });
    const result = await sources.pair(link(), 'Browser', 'host-a');
    expect(result).toMatchObject({ ok: true });
    const stored = storage.values.get(REMOTE_HOSTS_STORAGE_KEY)!;
    expect(stored).not.toContain('device-1.secret');
    const [saved] = JSON.parse(stored) as SavedHost[];
    expect(saved?.credential).toMatch(/^custody\./u);
    expect(sources.getSnapshot().hosts[0]?.host.credential).toBe(saved?.credential);
    expect(kept.get(saved!.credential)?.credential).toBe('device-1.secret');

    await sources.remove('host-b');
    expect(calls.at(-1)).toEqual({
      url: 'http://127.0.0.1:47001/botharness-device/unpair',
      body: {},
      headers: { authorization: 'Device device-1.secret' },
    });
    expect(forgotten).toEqual([saved!.credential]);
    expect(kept.size).toBe(0);
    expect(custody.seal).toHaveBeenCalled();
  });

  it('moves a credential already in browser storage to the Host once and keeps the pairing working', async () => {
    const saved = {
      hostId: 'host-b',
      hostName: 'Studio',
      deviceId: 'device-1',
      credential: 'device-1.secret',
      routes: ['http://127.0.0.1:47001'],
    };
    const storage = memoryStorage({ [REMOTE_HOSTS_STORAGE_KEY]: JSON.stringify([saved]) });
    const { carrier: raw } = fakeCarrier();
    const { custody, carrier, kept } = custodyFake(raw);
    const sources = createRemoteHosts({ storage, carrier, custody });
    await vi.waitFor(() =>
      expect(storage.values.get(REMOTE_HOSTS_STORAGE_KEY)).not.toContain('device-1.secret'),
    );
    const handle = (JSON.parse(storage.values.get(REMOTE_HOSTS_STORAGE_KEY)!) as SavedHost[])[0]!
      .credential;
    expect(handle).toMatch(/^custody\./u);
    await vi.waitFor(() => expect(sources.getSnapshot().hosts[0]?.host.credential).toBe(handle));
    expect(kept.get(handle)?.credential).toBe('device-1.secret');
    const reloaded = createRemoteHosts({ storage, carrier, custody });
    expect(reloaded.getSnapshot().hosts[0]?.host.credential).toBe(handle);
    await Promise.resolve();
    expect(custody.seal).toHaveBeenCalledTimes(1);
  });

  it('retries forgetting a released handle on the next start after the Host could not forget it', async () => {
    const storage = memoryStorage();
    const { carrier: raw } = fakeCarrier();
    const { custody, carrier, kept, forgotten } = custodyFake(raw);
    const sources = createRemoteHosts({ storage, carrier, custody });
    await sources.pair(link(), 'Browser', 'host-a');
    const [saved] = JSON.parse(storage.values.get(REMOTE_HOSTS_STORAGE_KEY)!) as SavedHost[];
    const forget = custody.forget.getMockImplementation()!;
    custody.forget.mockRejectedValueOnce(new Error('custody-storage-unavailable'));

    await sources.remove('host-b');
    expect(storage.values.get(REMOTE_HOSTS_STORAGE_KEY)).not.toContain(saved!.credential);
    expect(kept.has(saved!.credential)).toBe(true);
    expect(JSON.parse(storage.values.get(REMOTE_HOST_RELEASE_STORAGE_KEY)!)).toEqual([
      saved!.credential,
    ]);

    custody.forget.mockImplementation(forget);
    createRemoteHosts({ storage, carrier, custody });
    await vi.waitFor(() => expect(kept.has(saved!.credential)).toBe(false));
    expect(forgotten).toEqual([saved!.credential]);
    expect(storage.values.has(REMOTE_HOST_RELEASE_STORAGE_KEY)).toBe(false);
  });

  it('keeps the old credential when the Host cannot take it yet', async () => {
    const saved = {
      hostId: 'host-b',
      hostName: 'Studio',
      deviceId: 'device-1',
      credential: 'device-1.secret',
      routes: ['http://127.0.0.1:47001'],
    };
    const storage = memoryStorage({ [REMOTE_HOSTS_STORAGE_KEY]: JSON.stringify([saved]) });
    const { carrier } = fakeCarrier();
    const seal = vi.fn(async () => {
      throw new Error('custody-storage-unavailable');
    });
    const sources = createRemoteHosts({
      storage,
      carrier,
      custody: { seal, forget: vi.fn() },
    });
    await vi.waitFor(() => expect(seal).toHaveBeenCalled());
    expect(JSON.parse(storage.values.get(REMOTE_HOSTS_STORAGE_KEY)!)).toEqual([saved]);
    expect(sources.getSnapshot().hosts[0]?.host.credential).toBe('device-1.secret');
  });
});
