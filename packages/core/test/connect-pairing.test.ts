import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { expect, it, vi } from 'vitest';
import { redeemPairing } from '../../../apps/mobile/src/host/pairing.js';
import { encryptedCarrier } from '../../../apps/mobile/src/host/encrypted-carrier.js';
import type { HostCarrier } from '../../../apps/mobile/src/host/carrier.js';
import { createEncryptedGateway } from '../src/devices/encrypted-gateway.js';
import { noisePublicKey, noiseFingerprint } from '../src/devices/noise/xk.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

it('pairs over Noise only after both fingerprint confirmations, rejects a stolen bearer with a new key, and carries bytes', async () => {
  const owner = trackTestOwner(
    mountOperationalDatabase({
      dshHome: createTempRoot('noise-pair-'),
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    }),
  );
  const pairing = createDevicePairing({
    database: attachOperationalModule(owner, 'device-pairing'),
    hostName: 'Test Host',
  });
  const key = randomBytes(32),
    publicKey = noisePublicKey(key);
  const seen: string[] = [];
  const forwarded = vi.fn();
  const server = createServer(async (request, response) => {
    forwarded(request.url);
    expect(pairing.admit(request.headers.authorization).ok).toBe(true);
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    response.setHeader('content-type', 'image/png');
    response.end(Buffer.concat(chunks));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const gateway = createEncryptedGateway({
    pairing,
    key: async () => Uint8Array.from(key),
    port: () => port,
  });
  server.on('upgrade', (req, socket, head) => gateway.upgrade(req, socket, head));
  const raw: HostCarrier = {
    request: vi.fn(async () => {
      throw new Error('plaintext');
    }),
    randomBytes: () => randomBytes(32),
    openSocket(url, events, headers) {
      expect(url).toBe('wss://pair.deepseekbot.dev/botharness-device/channel');
      expect(headers).toBeUndefined();
      const socket = new WebSocket(`ws://127.0.0.1:${port}/botharness-device/channel`);
      socket.on('open', events.open);
      socket.on('message', (data) => {
        seen.push(data.toString());
        events.message(data.toString());
      });
      socket.on('close', () => events.closed('closed'));
      socket.on('error', () => events.closed('error'));
      return {
        get bufferedAmount() {
          return socket.bufferedAmount;
        },
        send(text) {
          seen.push(text);
          socket.send(text);
        },
        close: () => socket.close(),
      };
    },
  };
  let carrier: HostCarrier | undefined, stolen: HostCarrier | undefined;
  try {
    const offer = pairing.createOffer();
    const payload = {
      v: 1 as const,
      host: pairing.host(),
      offer: offer.offer,
      expiresAt: offer.expiresAt,
      routes: ['https://pair.deepseekbot.dev'],
      encryption: {
        protocol: 'connect-noise-xk-v1' as const,
        publicKey: Buffer.from(publicKey).toString('hex'),
      },
    };
    expect(await redeemPairing({ payload, deviceName: 'Phone', carrier: raw })).toEqual({
      ok: false,
      code: 'host-key-confirmation-required',
    });
    expect(seen).toHaveLength(0);
    let approved = false;
    const result = await redeemPairing({
      payload,
      deviceName: 'Phone',
      carrier: raw,
      confirmFingerprint: async (fingerprint) => fingerprint === noiseFingerprint(publicKey),
      onPending: (fingerprint) => {
        const pending = pairing.pendingKeys()[0]!;
        expect(pairing.list()).toHaveLength(0);
        expect(forwarded).not.toHaveBeenCalled();
        expect(fingerprint).toBe(noiseFingerprint(Buffer.from(pending.publicKey, 'hex')));
        approved = pairing.approveKey(pending.receipt, pending.publicKey);
      },
    });
    expect(approved).toBe(true);
    if (!result.ok) throw new Error(result.code);
    expect(pairing.list()).toHaveLength(1);
    carrier = encryptedCarrier({ ...result.host, raw });
    const privateBytes = new Uint8Array([137, 80, 78, 71, 0, 255, 1]);
    const response = await carrier.request(
      'https://pair.deepseekbot.dev/botharness-device/api/attachments/upload',
      {
        method: 'POST',
        body: new Blob([privateBytes]),
        signal: AbortSignal.timeout(5000),
        headers: { 'content-type': 'application/octet-stream' },
      },
    );
    expect(await response.bytes?.()).toEqual(privateBytes);
    expect(response.contentType).toBe('image/png');
    expect(seen.join('')).not.toContain(offer.offer);
    expect(seen.join('')).not.toContain(result.host.credential);
    stolen = encryptedCarrier({
      ...result.host,
      encryption: { ...result.host.encryption!, deviceKey: randomBytes(32).toString('hex') },
      raw,
    });
    await expect(
      stolen.request('https://pair.deepseekbot.dev/botharness-device/api/botharness/list', {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
      }),
    ).rejects.toThrow();
    expect(forwarded).toHaveBeenCalledTimes(1);
    expect(raw.request).not.toHaveBeenCalled();
  } finally {
    carrier?.close?.();
    stolen?.close?.();
    gateway.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}, 10_000);
