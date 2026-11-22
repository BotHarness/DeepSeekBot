import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { expect, it } from 'vitest';
import { createDeviceLan } from '../src/devices/lan.js';
import { createEncryptedGateway } from '../src/devices/encrypted-gateway.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { createDevicesHttp } from '../src/devices/http.js';
import { noisePublicKey } from '@botharness/host-protocol/noise/xk';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTempRoot, trackTestOwner } from './helpers.js';
import { pairHost, pairingDeviceKey } from '@botharness/host-client/pairing';
import type { SavedHost } from '@botharness/host-client/hosts';
import type { HostCarrier } from '@botharness/host-protocol/carrier';

async function lanHost() {
  const owner = trackTestOwner(
    mountOperationalDatabase({
      dshHome: createTempRoot('lan-resume-'),
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    }),
  );
  const pairing = createDevicePairing({
    database: attachOperationalModule(owner, 'device-pairing'),
    hostName: 'LAN Host',
  });
  const key = randomBytes(32);
  const upstream = createServer((_req, res) => res.end());
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
  const post = (path: string, body: object) =>
    http(
      new Request(`http://localhost/api/botharness/devices/${path}`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    );
  expect((await post('lan', { action: 'enable', confirm: true })).status).toBe(200);
  const sockets: WebSocket[] = [];
  const muted = new Set<WebSocket>();
  const carrier: HostCarrier = {
    request: async () => {
      throw new Error('plaintext forbidden');
    },
    openSocket: (_url, events) => {
      const ws = new WebSocket(`ws://127.0.0.1:${lan.status().port}/botharness-device/channel`);
      sockets.push(ws);
      ws.on('open', events.open);
      ws.on('message', (data) => {
        if (!muted.has(ws)) events.message(data.toString());
      });
      ws.on('close', () => events.closed('closed'));
      ws.on('error', () => events.closed('error'));
      return {
        send: (text) => {
          if (!muted.has(ws)) ws.send(text);
        },
        close: () => ws.terminate(),
      };
    },
  };
  const link = ((await (await post('offer', {})).json()) as { link: string }).link;
  return {
    pairing,
    carrier,
    sockets,
    muted,
    link,
    close: async () => {
      await lan.close();
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    },
  };
}

it('keeps waiting for approval when the channel drops while the phone waits, then pairs', async () => {
  const host = await lanHost();
  let saved: SavedHost | undefined;
  let pending = 0;
  try {
    const result = await pairHost({
      text: host.link,
      method: 'qr',
      deviceName: 'Test phone',
      carrier: host.carrier,
      telemetry: { pairing: () => ({ finish: () => {} }) },
      onPending: () => {
        pending++;
        if (pending !== 1) return;
        host.sockets[0]!.terminate();
        const waiting = host.pairing.pendingKeys()[0]!;
        expect(host.pairing.approveKey(waiting.receipt, waiting.publicKey)).toBe(true);
      },
      save: async (paired) => {
        saved = paired;
      },
    });
    expect(result).toEqual({ ok: true });
    expect(host.sockets.length).toBeGreaterThan(1);
    expect(saved && host.pairing.admit(`Device ${saved.credential}`).ok).toBe(true);
    expect(host.pairing.list()).toHaveLength(1);
  } finally {
    await host.close();
  }
}, 15_000);

it('lets a retry of the same offer finish the pairing the computer already approved', async () => {
  const host = await lanHost();
  const deviceKey = pairingDeviceKey(host.carrier);
  const controller = new AbortController();
  let saved: SavedHost | undefined;
  const attempt = (signal?: AbortSignal) =>
    pairHost({
      text: host.link,
      method: 'qr',
      deviceName: 'Test phone',
      carrier: host.carrier,
      deviceKey,
      telemetry: { pairing: () => ({ finish: () => {} }) },
      onPending: () => {
        const waiting = host.pairing.pendingKeys()[0]!;
        host.pairing.approveKey(waiting.receipt, waiting.publicKey);
        controller.abort();
      },
      save: async (paired) => {
        saved = paired;
      },
      ...(signal ? { signal } : {}),
    });
  try {
    expect(await attempt(controller.signal)).toEqual({ ok: false, code: 'cancelled' });
    expect(saved).toBeUndefined();
    expect(await attempt()).toEqual({ ok: true });
    expect(saved && host.pairing.admit(`Device ${saved.credential}`).ok).toBe(true);
  } finally {
    await host.close();
  }
}, 15_000);

it('reconnects when the waiting channel goes quiet without closing, then pairs', async () => {
  const host = await lanHost();
  let saved: SavedHost | undefined;
  let pending = 0;
  try {
    const result = await pairHost({
      text: host.link,
      method: 'qr',
      deviceName: 'Test phone',
      carrier: host.carrier,
      telemetry: { pairing: () => ({ finish: () => {} }) },
      onPending: () => {
        pending++;
        if (pending !== 1) return;
        host.muted.add(host.sockets[0]!);
        const waiting = host.pairing.pendingKeys()[0]!;
        host.pairing.approveKey(waiting.receipt, waiting.publicKey);
      },
      save: async (paired) => {
        saved = paired;
      },
    });
    expect(result).toEqual({ ok: true });
    expect(host.sockets.length).toBe(2);
    expect(saved && host.pairing.admit(`Device ${saved.credential}`).ok).toBe(true);
  } finally {
    await host.close();
  }
}, 20_000);
