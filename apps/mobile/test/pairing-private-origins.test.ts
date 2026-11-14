import { expect, it, vi } from 'vitest';
import { redeemPairing } from '../src/host/pairing';
import type { HostCarrier } from '../src/host/carrier';

const origin = 'https://primary.example';
const backup = 'https://backup.example';
const payload = {
  host: { id: 'peer', name: 'Peer' },
  offer: 'single-offer',
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  routes: [origin, backup],
  encryption: {
    protocol: 'connect-noise-xk-v1' as const,
    publicKey: 'ab'.repeat(32),
    privateRelay: { origin, token: 'cd'.repeat(32), additionalOrigins: [backup] },
  },
};

it('rejects an origin outside the private admission before opening a socket', async () => {
  const carrier: HostCarrier = { request: vi.fn(), openSocket: vi.fn() };
  expect(
    await redeemPairing({
      payload: { ...payload, routes: [origin, 'https://unapproved.example'] },
      deviceName: 'Client',
      carrier,
      confirmFingerprint: async () => true,
    }),
  ).toEqual({ ok: false, code: 'no-route' });
  expect(carrier.openSocket).not.toHaveBeenCalled();
});

it('stops on identity verification failure instead of trying another admitted origin', async () => {
  const openSocket: HostCarrier['openSocket'] = vi.fn((_url, events) => {
    queueMicrotask(() => events.closed('channel-authentication-failed'));
    return { send() {}, close() {} };
  });
  const result = await redeemPairing({
    payload,
    deviceName: 'Client',
    carrier: { request: vi.fn(), openSocket },
    confirmFingerprint: async () => true,
  });
  expect(result).toMatchObject({ ok: false, code: 'channel-authentication-failed' });
  expect(openSocket).toHaveBeenCalledOnce();
});
