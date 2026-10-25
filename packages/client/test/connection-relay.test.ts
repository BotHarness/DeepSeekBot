import { afterEach, expect, it, vi } from 'vitest';
import { FakeHost } from '../../../apps/mobile/test/fake-host.js';
import { createAppearanceControl } from '../../core/src/appearance/control.js';
import { pairingLink } from '../../core/src/devices/http.js';
import { Appearance } from '../src/client/appearance.js';
import { mountAppearanceControl } from '../src/client/appearance-control.js';
import { createRemoteHosts } from '../src/client/remote-hosts.js';

const shared = vi.hoisted(() => new Map<string, unknown>());
vi.mock('../src/client/remote-hosts.js', async (original) => ({
  ...(await original<typeof import('../src/client/remote-hosts.js')>()),
  remoteHosts: () => shared.get('sources'),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  shared.clear();
});

it('starts connection control on demand and returns the selected Client readable Host Feed', async () => {
  const host = new FakeHost();
  const relay = createAppearanceControl();
  const stored = new Map<string, string>();
  const sources = createRemoteHosts({
    storage: {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => void stored.set(key, value),
      removeItem: (key) => void stored.delete(key),
    },
    carrier: {
      ...host.carrier,
      request: async (url, init) =>
        url.endsWith('/botharness-device/pair')
          ? {
              status: 200,
              text: async () =>
                JSON.stringify({
                  deviceId: 'relay-device',
                  credential: host.credential,
                  host: { id: 'relay-remote', name: 'Studio' },
                }),
            }
          : host.carrier.request(url, init),
    },
  });
  vi.stubGlobal('location', { protocol: 'http:' });
  vi.stubGlobal('fetch', (_url: string, init?: RequestInit) =>
    relay.fetch(new Request('http://localhost/api/botharness/appearance-control', init)),
  );
  const release = mountAppearanceControl(new Appearance(undefined, () => 'light'));
  try {
    let clientId = '';
    await vi.waitFor(async () => {
      const { clients } = await (await relay.fetch(new Request('http://localhost'))).json();
      expect(clients).toHaveLength(1);
      clientId = clients[0].id;
    });
    shared.set('sources', sources);
    const request = async (connection: Record<string, unknown>) =>
      (
        await relay.fetch(
          new Request('http://localhost/api/botharness/appearance-control', {
            method: 'POST',
            body: JSON.stringify({ action: 'request', clientId, connection }),
          }),
        )
      ).json();
    await request({
      action: 'start',
      attemptId: 'relay-attempt',
      link: pairingLink({
        v: 1,
        host: { id: 'relay-remote', name: 'Studio' },
        offer: 'test',
        routes: ['http://127.0.0.1:47001'],
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      }),
    });
    await vi.waitFor(async () => {
      expect(await request({ action: 'status', attemptId: 'relay-attempt' })).toMatchObject({
        state: 'connected',
        saved: true,
        hostId: 'relay-remote',
      });
    });
    expect(sources.getSnapshot().hosts[0]?.snapshot.roster).toBeDefined();
  } finally {
    release();
    await sources.remove('relay-remote');
  }
});
