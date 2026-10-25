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
  ).toEqual({ ok: false, code: 'channel-authentication-failed' });
  expect(host.routes).toEqual(['https://old.ts.net']);
});
