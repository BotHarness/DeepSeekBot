import { expect, it, vi } from 'vitest';
import { FakeHost } from '../../../apps/mobile/test/fake-host.js';
import { pairingLink } from '../../core/src/devices/http.js';
import { createRemoteHosts } from '../src/client/remote-hosts.js';
import { createConnectionControl } from '../src/client/connection-control.js';

it('requires the exact full Host identity and refuses stale or cancelled confirmation', async () => {
  const host = new FakeHost();
  const sources = createRemoteHosts({ carrier: host.carrier });
  const control = createConnectionControl(sources, () => ({ id: 'local' }));
  const request = { expiresAt: Date.now() + 8000, signal: new AbortController().signal };
  const link = pairingLink({
    v: 1,
    host: { id: 'remote', name: 'Studio' },
    offer: 'test',
    routes: ['http://127.0.0.1:47001'],
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    encryption: {
      protocol: 'connect-noise-xk-v1',
      publicKey: '11'.repeat(32),
      noise: 'Noise_XK_25519_ChaChaPoly_SHA256',
      required: true,
      fingerprint: 'test',
    },
  });
  try {
    expect(() =>
      control.execute(
        { action: 'start', attemptId: 'old', link },
        { ...request, expiresAt: Date.now() - 1 },
      ),
    ).toThrow('connection-request-stale');
    control.execute({ action: 'start', attemptId: 'identity', link }, request);
    await vi.waitFor(() => expect(control.getSnapshot('identity')?.state).toBe('verify-host'));
    expect(() =>
      control.execute(
        { action: 'confirm', attemptId: 'identity', fingerprint: 'Studio', confirm: true },
        request,
      ),
    ).toThrow('connection-confirmation-required');
    const fingerprint = control.getSnapshot('identity')?.hostFingerprint;
    expect(fingerprint?.length).toBeGreaterThan(64);
    expect(sources.getSnapshot().hosts).toEqual([]);
    control.execute({ action: 'cancel', attemptId: 'identity' }, request);
    expect(() =>
      control.execute(
        { action: 'confirm', attemptId: 'identity', fingerprint, confirm: true },
        request,
      ),
    ).toThrow('connection-confirmation-required');
    control.dispose();
    expect(() => control.execute({ action: 'start', attemptId: 'late', link }, request)).toThrow(
      'connection-cancelled',
    );
    expect(sources.getSnapshot().hosts).toEqual([]);
  } finally {
    control.dispose();
  }
});

it('reports connected only after the target Client saves the Remote Host and reads its Feed', async () => {
  const host = new FakeHost();
  const values = new Map<string, string>();
  const sources = createRemoteHosts({
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => void values.set(key, value),
      removeItem: (key) => void values.delete(key),
    },
    carrier: {
      ...host.carrier,
      request: async (url, init) =>
        url.endsWith('/botharness-device/pair')
          ? {
              status: 200,
              text: async () =>
                JSON.stringify({
                  deviceId: 'device-1',
                  credential: host.credential,
                  host: { id: 'remote-test', name: 'Studio' },
                }),
            }
          : host.carrier.request(url, init),
    },
  });
  const control = createConnectionControl(sources, () => ({ id: 'local-test', name: 'Local' }));
  const request = { expiresAt: Date.now() + 8000, signal: new AbortController().signal };
  const link = pairingLink({
    v: 1,
    host: { id: 'remote-test', name: 'Studio' },
    offer: 'test',
    routes: ['http://127.0.0.1:47001'],
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  });
  try {
    control.execute({ action: 'start', attemptId: 'test-attempt', link }, request);
    await vi.waitFor(() =>
      expect(
        control.execute({ action: 'status', attemptId: 'test-attempt' }, request),
      ).toMatchObject({ state: 'connected', hostId: 'remote-test', saved: true }),
    );
    expect(sources.getSnapshot().hosts[0]?.snapshot.roster).toBeDefined();
    expect(
      JSON.stringify(control.execute({ action: 'status', attemptId: 'test-attempt' }, request)),
    ).not.toContain('secret');
  } finally {
    control.dispose();
  }
});

it.each(['cancel', 'delivery-timeout'])(
  'stops %s without saving a late credential in the target Client',
  async (reason) => {
    let release!: () => void;
    const gate = new Promise<void>((done) => {
      release = done;
    });
    const host = new FakeHost();
    const values = new Map<string, string>();
    const sources = createRemoteHosts({
      storage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => void values.set(key, value),
        removeItem: (key) => void values.delete(key),
      },
      carrier: {
        ...host.carrier,
        request: async (url, init) => {
          if (url.endsWith('/pair')) await gate;
          return host.carrier.request(url, init);
        },
      },
    });
    const control = createConnectionControl(sources, () => ({ id: 'local-test' }));
    const delivery = new AbortController();
    const request = { expiresAt: Date.now() + 8000, signal: delivery.signal };
    const link = pairingLink({
      v: 1,
      host: { id: host.hostId, name: 'Studio' },
      offer: host.offer,
      routes: ['http://127.0.0.1:47001'],
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    });
    try {
      control.execute({ action: 'start', attemptId: 'cancel-test', link }, request);
      if (reason === 'cancel')
        control.execute({ action: 'cancel', attemptId: 'cancel-test' }, request);
      else delivery.abort();
      release();
      await new Promise((done) => setTimeout(done, 30));
      expect(sources.getSnapshot().hosts).toEqual([]);
      expect(control.getSnapshot('cancel-test')).toMatchObject({
        state: 'cancelled',
        saved: false,
      });
    } finally {
      control.dispose();
    }
  },
);
