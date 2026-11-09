import { randomBytes } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { ConnectChannel } from '../../../packages/core/src/devices/noise/channel';
import { noisePublicKey } from '../../../packages/core/src/devices/noise/xk';
import { updatePairedRoutes } from '../src/host/pairing';
import type { HostCarrier } from '../src/host/carrier';
import type { SavedHost } from '../src/host/hosts';

it('updates scanned Tailscale addresses over pinned encryption with the existing device credential', async () => {
  const key = randomBytes(32);
  const host: SavedHost = {
    hostId: 'host',
    hostName: 'Studio',
    deviceId: 'existing',
    credential: 'existing.secret',
    routes: ['https://old.ts.net'],
    encryption: {
      protocol: 'connect-noise-xk-v1',
      hostKey: Buffer.from(noisePublicKey(key)).toString('hex'),
      deviceKey: randomBytes(32).toString('hex'),
    },
  };
  const payload = {
    host: { id: 'host', name: 'Studio' },
    offer: 'unused',
    routes: ['https://new.ts.net:8443'],
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    encryption: { protocol: 'connect-noise-xk-v1' as const, publicKey: host.encryption!.hostKey },
  };
  const admitted: string[] = [];
  const raw: HostCarrier = {
    request: vi.fn(),
    openSocket(_url, events) {
      const peer = new ConnectChannel({
        role: 'responder',
        hostId: 'host',
        staticKey: key,
        ephemeralKey: randomBytes(32),
        hostKey: noisePublicKey(key),
      });
      const reply = (value: unknown) => {
        for (const frame of peer.send(JSON.stringify(value)))
          queueMicrotask(() => events.message(frame));
      };
      queueMicrotask(events.open);
      return {
        send(wire) {
          const result = peer.receive(wire);
          if (result.reply) queueMicrotask(() => events.message(result.reply!));
          if (!result.message) return;
          const value = JSON.parse(result.message);
          if (value.type === 'admit') {
            admitted.push(value.credential);
            reply({ type: 'admitted' });
          }
          if (value.type === 'request') {
            expect(value.path).toBe('/botharness-device/api/botharness/devices');
            reply({
              type: 'response',
              id: value.id,
              status: 200,
              body: btoa(
                JSON.stringify({
                  host: payload.host,
                  connect: { encryption: payload.encryption },
                  routes: { routes: [] },
                }),
              ),
            });
          }
          reply({ type: 'ack', credit: value.credit });
        },
        close: () => peer.close(),
      };
    },
  };
  const result = await updatePairedRoutes(host, payload, raw);
  expect(result).toMatchObject({
    ok: true,
    host: {
      deviceId: host.deviceId,
      credential: host.credential,
      encryption: host.encryption,
      routes: ['https://new.ts.net:8443', 'https://old.ts.net'],
    },
  });
  expect(admitted).toEqual([host.credential]);
  expect(raw.request).not.toHaveBeenCalled();
  expect(
    await updatePairedRoutes(
      host,
      { ...payload, encryption: { ...payload.encryption, publicKey: 'ff'.repeat(32) } },
      raw,
    ),
  ).toEqual({ ok: false, code: 'host-key-changed', detail: 'link:host-key-changed' });
  expect(host.routes).toEqual(['https://old.ts.net']);
});

function privatePeer(key: Buffer, payload: { host: { id: string; name: string } }) {
  const sockets: { url: string; headers?: Record<string, string> }[] = [];
  const admitted: string[] = [];
  const raw: HostCarrier = {
    request: vi.fn(),
    openSocket(url, events, headers) {
      sockets.push({ url, ...(headers ? { headers } : {}) });
      const peer = new ConnectChannel({
        role: 'responder',
        hostId: 'host',
        staticKey: key,
        ephemeralKey: randomBytes(32),
        hostKey: noisePublicKey(key),
      });
      const reply = (value: unknown) => {
        for (const frame of peer.send(JSON.stringify(value)))
          queueMicrotask(() => events.message(frame));
      };
      queueMicrotask(events.open);
      return {
        send(wire) {
          let result;
          try {
            result = peer.receive(wire);
          } catch {
            queueMicrotask(() => events.closed('channel-authentication-failed'));
            return;
          }
          if (result.reply) queueMicrotask(() => events.message(result.reply!));
          if (!result.message) return;
          const value = JSON.parse(result.message);
          if (value.type === 'admit') {
            admitted.push(value.credential);
            reply({ type: 'admitted' });
          }
          if (value.type === 'request')
            reply({
              type: 'response',
              id: value.id,
              status: 200,
              body: btoa(
                JSON.stringify({
                  host: payload.host,
                  connect: {
                    encryption: { publicKey: Buffer.from(noisePublicKey(key)).toString('hex') },
                  },
                  routes: { routes: [] },
                }),
              ),
            });
          reply({ type: 'ack', credit: value.credit });
        },
        close: () => peer.close(),
      };
    },
  };
  return { raw, sockets, admitted };
}

it('moves a private-tunnel phone to a changed address only after the pinned Host admits its credential', async () => {
  const key = randomBytes(32);
  const hostKey = Buffer.from(noisePublicKey(key)).toString('hex');
  const token = 'a'.repeat(64);
  const host: SavedHost = {
    hostId: 'host',
    hostName: 'Studio',
    deviceId: 'existing',
    credential: 'existing.secret',
    routes: ['https://old-quick.trycloudflare.com'],
    encryption: {
      protocol: 'connect-noise-xk-v1',
      hostKey,
      deviceKey: randomBytes(32).toString('hex'),
      privateRelay: { origin: 'https://old-quick.trycloudflare.com', token },
    },
  };
  const origin = 'https://new-quick.trycloudflare.com';
  const payload = {
    host: { id: 'host', name: 'Studio' },
    offer: 'unused',
    routes: [origin],
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    encryption: {
      protocol: 'connect-noise-xk-v1' as const,
      publicKey: hostKey,
      privateRelay: { origin, token },
    },
  };
  const real = privatePeer(key, payload);
  const result = await updatePairedRoutes(host, payload, real.raw);
  expect(result).toMatchObject({
    ok: true,
    host: {
      deviceId: 'existing',
      credential: 'existing.secret',
      routes: [origin],
      encryption: { hostKey, privateRelay: { origin, token } },
    },
  });
  expect(real.admitted).toEqual(['existing.secret']);
  expect(real.sockets[0]).toEqual({
    url: `${origin.replace('https', 'wss')}/botharness-device/channel`,
    headers: { Authorization: `Bearer ${token}`, 'X-BotHarness-Admission': token },
  });

  const impostor = privatePeer(randomBytes(32), payload);
  expect(await updatePairedRoutes(host, payload, impostor.raw)).toMatchObject({ ok: false });
  expect(impostor.admitted).toEqual([]);

  expect(
    await updatePairedRoutes(
      host,
      { ...payload, routes: [origin, 'https://other.example.com'] },
      real.raw,
    ),
  ).toEqual({ ok: false, code: 'no-route' });
  expect(host.routes).toEqual(['https://old-quick.trycloudflare.com']);
});
