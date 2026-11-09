import { describe, expect, it, vi } from 'vitest';
import { checkRoute } from '../src/host/route';
import { parseEncryption, parseSavedHost } from '../src/host/hosts';
import { parsePairingLink, pairingLinkMode, redeemPairing } from '../src/host/pairing';
import { encryptedCarrier } from '../src/host/encrypted-carrier';
import { learnedRoutes } from '../src/host/learned-routes';

const admission = { origin: 'https://relay.example.com', token: 'ab'.repeat(32) };
const encryption = {
  protocol: 'connect-noise-xk-v1' as const,
  hostKey: 'cd'.repeat(32),
  deviceKey: 'ef'.repeat(32),
  privateRelay: admission,
};
describe('private relay trust boundary', () => {
  it('rejects persisted private routes mixed with an official fallback', () => {
    expect(
      parseSavedHost({
        hostId: 'host',
        hostName: 'Home',
        deviceId: 'phone',
        credential: 'credential',
        encryption,
        routes: [admission.origin, 'https://fallback.deepseekbot.dev'],
      }),
    ).toBeUndefined();
  });
  it('admits only the explicit paired endpoint and preserves it through secure persistence', () => {
    expect(checkRoute(admission.origin).ok).toBe(false);
    expect(checkRoute(admission.origin, admission.origin).ok).toBe(true);
    expect(checkRoute('https://other.example', admission.origin).ok).toBe(false);
    expect(checkRoute(admission.origin + '/unexpected', admission.origin).ok).toBe(false);
    expect(parseEncryption(JSON.parse(JSON.stringify(encryption)))).toEqual(encryption);
  });
  it('parses a private QR only with valid relay admission and Host identity', () => {
    const payload = {
      v: 1,
      host: { id: 'host', name: 'Home' },
      routes: [admission.origin],
      offer: 'offer',
      expiresAt: '2099-01-01',
      encryption: {
        protocol: encryption.protocol,
        publicKey: encryption.hostKey,
        privateRelay: admission,
      },
    };
    const link = (value: unknown) =>
      'deepseekbot://pair?p=' + Buffer.from(JSON.stringify(value)).toString('base64url');
    const valid = parsePairingLink(link(payload));
    expect(pairingLinkMode(new URL(link(payload)).searchParams.get('p')!)).toBe('private');
    expect(valid.ok && valid.payload.encryption?.privateRelay).toEqual(admission);
    expect(
      parsePairingLink(
        link({
          ...payload,
          encryption: { ...payload.encryption, privateRelay: { ...admission, token: 'bad' } },
        }),
      ),
    ).toMatchObject({ ok: false, code: 'no-route' });
  });
  it('does not send secrets or contact a different endpoint', async () => {
    const raw = { request: vi.fn(), openSocket: vi.fn() };
    const carrier = encryptedCarrier({
      raw,
      hostId: 'host',
      credential: 'device-secret',
      encryption,
    });
    await expect(
      carrier.request('https://other.example/botharness-device/api/botharness/devices', {
        method: 'GET',
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'route-invalid' });
    expect(raw.request).not.toHaveBeenCalled();
    expect(raw.openSocket).not.toHaveBeenCalled();
    carrier.close?.();
  });
  it('requires Host fingerprint approval before opening a private connection', async () => {
    const raw = { request: vi.fn(), openSocket: vi.fn() };
    const result = await redeemPairing({
      carrier: raw,
      deviceName: 'Phone',
      confirmFingerprint: async () => false,
      payload: {
        host: { id: 'host', name: 'Home' },
        offer: 'offer',
        expiresAt: '2099-01-01',
        routes: [admission.origin],
        encryption: {
          protocol: encryption.protocol,
          publicKey: encryption.hostKey,
          privateRelay: admission,
        },
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'host-key-confirmation-required' });
    expect(raw.openSocket).not.toHaveBeenCalled();
  });
  it('never learns an official fallback from a private Host snapshot', () => {
    const routes = [admission.origin];
    expect(
      learnedRoutes(
        { hostId: 'host', routes, encryption },
        {
          host: { id: 'host' },
          connect: { encryption: { publicKey: encryption.hostKey } },
          routes: { routes: [{ url: 'https://fallback.deepseekbot.dev', ready: true }] },
        },
      ),
    ).toEqual(routes);
  });
});
