import { createServer, request } from 'node:http';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { expect, it } from 'vitest';
import { createDeviceLan } from '../src/devices/lan.js';
import { createEncryptedGateway } from '../src/devices/encrypted-gateway.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { createDevicesHttp } from '../src/devices/http.js';
import { noisePublicKey } from '../src/devices/noise/xk.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTempRoot, trackTestOwner } from './helpers.js';
import { pairHost } from '../../../apps/mobile/src/host/pairing.js';
import { encryptedCarrier } from '../../../apps/mobile/src/host/encrypted-carrier.js';
import type { SavedHost } from '../../../apps/mobile/src/host/hosts.js';
import type { HostCarrier } from '../../../apps/mobile/src/host/carrier.js';

it('opens only after opt-in, never serves operator HTTP, persists its port and releases it on disable', async () => {
  let saved: number | undefined;
  let closed = 0;
  const lan = createDeviceLan({
    read: async () => saved,
    write: async (port) => {
      saved = port;
    },
    gateway: () => ({
      upgrade: (_request, socket) => socket.destroy(),
      close: () => {
        closed++;
      },
    }),
    addresses: () => ['192.168.1.20'],
  });
  try {
    await lan.start();
    expect(lan.status()).toEqual({ state: 'off' });
    expect(lan.routes()).toEqual([]);
    const enabled = await lan.enable();
    expect(enabled.ok).toBe(true);
    expect(saved).toBeGreaterThan(0);
    expect(lan.routes()).toEqual([
      { kind: 'lan', ready: true, url: `http://192.168.1.20:${saved}` },
    ]);
    for (const path of ['/', '/api', '/botharness-device/pair', '/botharness-device/channel']) {
      const status = await new Promise<number | undefined>((resolve, reject) => {
        const req = request({ host: '127.0.0.1', port: saved, path }, (res) => {
          res.resume();
          resolve(res.statusCode);
        });
        req.on('error', reject);
        req.end();
      });
      expect(status).toBe(404);
    }
    expect((await lan.disable()).ok).toBe(true);
    expect(saved).toBeUndefined();
    expect(closed).toBe(1);
    expect(lan.routes()).toEqual([]);
  } finally {
    await lan.close();
  }
});

it('pairs a scanned LAN offer with exact key approval, encrypts a phone request, then enforces revocation', async () => {
  const owner = trackTestOwner(
    mountOperationalDatabase({
      dshHome: createTempRoot('lan-pair-'),
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    }),
  );
  const pairing = createDevicePairing({
    database: attachOperationalModule(owner, 'device-pairing'),
    hostName: 'LAN Host',
  });
  const key = randomBytes(32);
  const upstream = createServer((req, res) => {
    expect(req.url).toBe('/botharness-device/api/botharness/list');
    expect(pairing.admit(req.headers.authorization).ok).toBe(true);
    res.end('private-host-feed');
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const lan = createDeviceLan({
    read: async () => undefined,
    write: async () => {},
    addresses: () => ['192.168.1.20'],
    gateway: () =>
      createEncryptedGateway({
        pairing,
        key: async () => Uint8Array.from(key),
        port: () => (upstream.address() as AddressInfo).port,
        route: 'lan',
      }),
  });
  const http = createDevicesHttp({
    pairing,
    lan,
    encryption: async () => ({
      protocol: 'connect-noise-xk-v1',
      noise: 'Noise_XK_25519_ChaChaPoly_SHA256',
      required: true,
      publicKey: Buffer.from(noisePublicKey(key)).toString('hex'),
      fingerprint: 'test',
      state: 'disconnected',
    }),
    routes: async () => ({ routes: lan.routes(), tailscale: 'missing', serveCommand: '' }),
  });
  const wire: string[] = [];
  let saved: SavedHost | undefined;
  let carrier: HostCarrier | undefined;
  const post = (path: string, body: object) =>
    http(
      new Request(`http://localhost/api/botharness/devices/${path}`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    );
  try {
    expect((await post('lan', { action: 'enable' })).status).toBe(400);
    expect(lan.status().state).toBe('off');
    expect((await post('lan', { action: 'enable', confirm: true })).status).toBe(200);
    const raw: HostCarrier = {
      request: async () => {
        throw new Error('plaintext forbidden');
      },
      openSocket: (_url, events, headers) => {
        expect(headers).toBeUndefined();
        const ws = new WebSocket(`ws://127.0.0.1:${lan.status().port}/botharness-device/channel`);
        ws.on('open', events.open);
        ws.on('message', (data) => {
          wire.push(data.toString());
          events.message(data.toString());
        });
        ws.on('close', () => events.closed('closed'));
        ws.on('error', () => events.closed('error'));
        return {
          send: (text) => {
            wire.push(text);
            ws.send(text);
          },
          close: () => ws.terminate(),
        };
      },
    };
    const offer = await (await post('offer', {})).json();
    expect(offer.reachable).toBe(true);
    const result = await pairHost({
      text: offer.link,
      method: 'qr',
      deviceName: 'Test phone',
      carrier: raw,
      telemetry: { pairing: () => ({ finish: () => {} }) },
      onPending: () => {
        const pending = pairing.pendingKeys()[0]!;
        expect(pairing.approveKey(pending.receipt, 'ff'.repeat(32))).toBe(false);
        expect(pairing.approveKey(pending.receipt, pending.publicKey)).toBe(true);
      },
      save: async (host) => {
        saved = host;
      },
    });
    expect(result).toEqual({ ok: true });
    expect(saved?.encryption).toBeDefined();
    carrier = encryptedCarrier({ raw, ...saved! });
    const read = () =>
      carrier!.request(`${saved!.routes[0]}/botharness-device/api/botharness/list`, {
        method: 'POST',
        body: 'private-phone-input',
        signal: new AbortController().signal,
      });
    expect(await (await read()).text()).toBe('private-host-feed');
    expect(wire.join('')).not.toContain('private-host-feed');
    expect(wire.join('')).not.toContain('private-phone-input');
    expect(wire.join('')).not.toContain(saved!.credential);
    pairing.revoke(saved!.deviceId);
    await expect(read()).rejects.toThrow();
    await post('lan', { action: 'disable' });
    expect(lan.status()).toEqual({ state: 'off' });
  } finally {
    carrier?.close?.();
    await lan.close();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});

it('restores an opted-in port after restart and fails closed when persistence fails', async () => {
  let saved: number | undefined;
  const options = {
    read: async () => saved,
    write: async (port: number | undefined) => {
      saved = port;
    },
    gateway: () => ({ upgrade: () => {}, close: () => {} }),
  };
  const first = createDeviceLan(options);
  const second = createDeviceLan(options);
  try {
    await first.enable();
    const port = first.status().port;
    await first.close();
    await second.start();
    expect(second.status()).toEqual({ state: 'listening', port });
    await second.disable();
    const failed = createDeviceLan({
      ...options,
      write: async () => {
        throw new Error('disk');
      },
    });
    try {
      expect(await failed.enable()).toEqual({ ok: false, code: 'lan-storage-unavailable' });
      expect(failed.status().state).toBe('off');
    } finally {
      await failed.close();
    }
  } finally {
    await first.close();
    await second.close();
  }
});
