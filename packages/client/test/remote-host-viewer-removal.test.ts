import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostCarrier } from '../../../apps/mobile/src/host/carrier.js';
import { FakeHost } from '../../../apps/mobile/test/fake-host.js';
import { createRemoteHostViewer } from '../src/client/remote-host-viewer.js';
import { createRemoteHosts, REMOTE_HOSTS_STORAGE_KEY } from '../src/client/remote-hosts.js';

afterEach(() => vi.useRealTimers());

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function pairedViewerHost(kind: 'browser' | 'computer') {
  const host = new FakeHost();
  const events: string[] = [];
  const taking = deferred();
  const releasing = deferred();
  let delayRelease = false;
  let paused = false;
  let firstFrame = true;
  const answer = (status: number, body: unknown) => ({
    status,
    text: async () => JSON.stringify(body),
  });
  const carrier: HostCarrier = {
    openSocket: host.carrier.openSocket,
    async request(url, init) {
      const path = new URL(url).pathname;
      if (path.endsWith('/unpair')) {
        events.push('unpair');
        host.revoked = true;
        return answer(200, { revoked: true });
      }
      if (!path.includes(`/api/${kind}/`)) return host.carrier.request(url, init);
      if (host.revoked) return answer(401, { code: 'device-revoked' });
      if (path.endsWith('/status')) return answer(200, { probe: { available: true } });
      if (path.endsWith('/takeover')) {
        const body = JSON.parse(String(init.body)) as { active: boolean };
        paused = body.active;
        events.push(`takeover:${body.active}`);
        if (body.active) await taking.promise;
        else if (delayRelease) await releasing.promise;
        return answer(200, { takeover: body.active, paused: body.active });
      }
      if (path.endsWith('/input')) {
        events.push('input');
        return answer(200, {});
      }
      if (path.endsWith('/observation')) return answer(200, { takeover: paused });
      if (firstFrame) {
        firstFrame = false;
        return answer(200, { data: 'frame', seq: 1, width: 100, height: 100, mode: 'stream' });
      }
      return new Promise((_resolve, reject) => {
        const abort = () => reject(new DOMException('aborted', 'AbortError'));
        if (init.signal?.aborted) abort();
        else init.signal?.addEventListener('abort', abort, { once: true });
      });
    },
  };
  const values = new Map([
    [
      REMOTE_HOSTS_STORAGE_KEY,
      JSON.stringify([
        {
          hostId: host.hostId,
          hostName: 'Studio',
          routes: ['http://127.0.0.1:47712'],
          deviceId: 'device-1',
          credential: host.credential,
        },
      ]),
    ],
  ]);
  const sources = createRemoteHosts({
    carrier,
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => void values.set(key, value),
      removeItem: (key) => void values.delete(key),
    },
  });
  const stopSources = sources.subscribe(() => {});
  const client = sources.viewerClient(host.hostId);
  if (client === undefined) throw new Error('Missing paired Host');
  const viewer = createRemoteHostViewer(client, kind, 'ada');
  const stopViewer = viewer.subscribe(() => {});
  return {
    host,
    client,
    sources,
    viewer,
    events,
    values,
    paused: () => paused,
    finishTakeover: () => taking.resolve(),
    delayRelease() {
      delayRelease = true;
    },
    finishRelease: () => releasing.resolve(),
    stop() {
      taking.resolve();
      releasing.resolve();
      stopViewer();
      stopSources();
    },
  };
}

describe.each(['browser', 'computer'] as const)('remove a Host during %s takeover', (kind) => {
  it('stops input and releases the delayed takeover before revoking its credential', async () => {
    const h = pairedViewerHost(kind);
    try {
      await vi.waitFor(() => expect(h.viewer.getSnapshot().status).toBe('live'));
      const taking = h.viewer.setControl(true);
      await vi.waitFor(() => expect(h.paused()).toBe(true));
      const removing = h.sources.remove(h.host.hostId);
      await h.viewer.send({ kind: 'type', text: 'after-remove' });
      expect(h.events).toEqual(['takeover:true']);
      expect(h.sources.getSnapshot().hosts).toHaveLength(0);
      expect(h.values.has(REMOTE_HOSTS_STORAGE_KEY)).toBe(false);
      const stale = createRemoteHostViewer(h.client, kind, 'ada');
      const stopStale = stale.subscribe(() => {});
      await stale.setControl(true);
      await stale.send({ kind: 'type', text: 'stale-client' });
      stopStale();
      h.finishTakeover();
      await Promise.all([taking, removing]);
      expect(h.events).toEqual(['takeover:true', 'takeover:false', 'unpair']);
      expect(h.paused()).toBe(false);
      expect(h.host.revoked).toBe(true);
      expect(h.viewer.getSnapshot().control).toBe(false);
    } finally {
      h.stop();
    }
  });

  it('also waits for the release response before unpairing', async () => {
    const h = pairedViewerHost(kind);
    try {
      await vi.waitFor(() => expect(h.viewer.getSnapshot().status).toBe('live'));
      h.finishTakeover();
      await h.viewer.setControl(true);
      h.delayRelease();
      const removing = h.sources.remove(h.host.hostId);
      await vi.waitFor(() => expect(h.events).toEqual(['takeover:true', 'takeover:false']));
      expect(h.host.revoked).toBe(false);
      h.finishRelease();
      await removing;
      expect(h.events).toEqual(['takeover:true', 'takeover:false', 'unpair']);
    } finally {
      h.stop();
    }
  });

  it('bounds waiting for an unresponsive takeover and keeps the removed client closed', async () => {
    const h = pairedViewerHost(kind);
    try {
      await vi.waitFor(() => expect(h.viewer.getSnapshot().status).toBe('live'));
      const taking = h.viewer.setControl(true);
      await vi.waitFor(() => expect(h.paused()).toBe(true));
      vi.useFakeTimers();
      const removing = h.sources.remove(h.host.hostId);
      await vi.advanceTimersByTimeAsync(4999);
      expect(h.host.revoked).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await removing;
      expect(h.host.revoked).toBe(true);
      expect(h.sources.getSnapshot().hosts).toHaveLength(0);
      h.finishTakeover();
      await taking;
      await h.viewer.setControl(true);
      await h.viewer.send({ kind: 'type', text: 'after-timeout' });
      expect(h.events).toEqual(['takeover:true', 'unpair']);
      expect(h.viewer.getSnapshot().control).toBe(false);
    } finally {
      h.stop();
    }
  });
});
