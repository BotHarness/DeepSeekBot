import { encryptedCarrier } from '../../../apps/mobile/src/host/encrypted-carrier.js';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { expect, it } from 'vitest';
import { createEncryptedGateway } from '../src/devices/encrypted-gateway.js';
import { ConnectChannel } from '../src/devices/noise/channel.js';
import { noisePublicKey } from '../src/devices/noise/xk.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

it('admits only the approved Noise key, forwards private RPC and push settings, and closes on device revocation', async () => {
  const owner = trackTestOwner(
    mountOperationalDatabase({
      dshHome: createTempRoot('noise-gateway-'),
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    }),
  );
  const pairing = createDevicePairing({
    database: attachOperationalModule(owner, 'device-pairing'),
    hostName: 'Host',
  });
  const hostKey = randomBytes(32),
    deviceKey = randomBytes(32);
  const publicKey = Buffer.from(noisePublicKey(deviceKey)).toString('hex');
  const offer = pairing.createOffer();
  pairing.requestKey({ offer: offer.offer, publicKey });
  pairing.approveKey(offer.receipt, publicKey);
  const paired = pairing.redeem({ offer: offer.offer, publicKey });
  if (!paired.ok) throw new Error('pairing failed');
  const observed: string[] = [];
  const server = createServer(async (request, response) => {
    expect(request.headers.authorization).toBe(`Device ${paired.credential}`);
    if (request.url === '/botharness-device/push') {
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          registered: false,
          enabled: false,
          preferences: { approval: true, question: true, 'private-input': true, reply: true },
          quietChannelIds: [],
        }),
      );
      return;
    }
    let body = '';
    for await (const chunk of request) body += String(chunk);
    response.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const gateway = createEncryptedGateway({
    pairing,
    key: async () => Uint8Array.from(hostKey),
    port: () => port,
  });
  server.on('upgrade', (req, socket, head) => gateway.upgrade(req, socket, head));
  const channel = new ConnectChannel({
    role: 'initiator',
    hostId: pairing.host().id,
    staticKey: deviceKey,
    ephemeralKey: randomBytes(32),
    hostKey: noisePublicKey(hostKey),
  });
  const socket = new WebSocket(`ws://127.0.0.1:${port}/botharness-device/channel`);
  const answers: Record<string, unknown>[] = [];
  let next: (() => void) | undefined;
  socket.on('message', (data) => {
    const wire = data.toString();
    observed.push(wire);
    const result = channel.receive(wire);
    if (result.reply) socket.send(result.reply);
    if (result.ready)
      for (const frame of channel.send(
        JSON.stringify({ type: 'admit', credential: paired.credential }),
      ))
        socket.send(frame);
    if (result.message) {
      answers.push(JSON.parse(result.message));
      next?.();
    }
  });
  const wait = async () => {
    if (answers.length) return answers.shift()!;
    await new Promise<void>((resolve) => {
      next = resolve;
    });
    next = undefined;
    return answers.shift()!;
  };
  try {
    await new Promise<void>((resolve) => socket.once('open', resolve));
    socket.send(channel.start());
    expect(await wait()).toMatchObject({ type: 'admitted' });
    const sentinel = 'disposable-private-value';
    for (const frame of channel.send(
      JSON.stringify({
        type: 'request',
        id: '1',
        method: 'POST',
        path: '/botharness-device/api/botharness/privateInputSubmit',
        body: sentinel,
      }),
    )) {
      observed.push(frame);
      socket.send(frame);
    }
    const answer = await wait();
    expect(Buffer.from(String(answer.body), 'base64').toString()).toBe(sentinel);
    expect(observed.join('')).not.toContain(sentinel);
    const carrier = encryptedCarrier({
      hostId: pairing.host().id,
      credential: paired.credential,
      encryption: {
        protocol: 'connect-noise-xk-v1',
        hostKey: Buffer.from(noisePublicKey(hostKey)).toString('hex'),
        deviceKey: deviceKey.toString('hex'),
      },
      raw: {
        request: async () => {
          throw new Error('plaintext request forbidden');
        },
        openSocket: (url, events, headers) => {
          expect(headers).toBeUndefined();
          expect(url).toBe('wss://host.deepseekbot.dev/botharness-device/channel');
          const peer = new WebSocket(`ws://127.0.0.1:${port}/botharness-device/channel`);
          peer.on('open', events.open);
          peer.on('message', (data) => events.message(data.toString()));
          peer.on('close', () => events.closed('closed'));
          peer.on('error', () => events.closed('error'));
          return {
            send: (text) => {
              observed.push(text);
              peer.send(text);
            },
            close: () => peer.close(),
          };
        },
      },
    });
    try {
      const response = await carrier.request(
        'https://host.deepseekbot.dev/botharness-device/api/botharness/privateInputSubmit',
        {
          method: 'POST',
          body: sentinel,
          headers: { authorization: `Device ${paired.credential}` },
          signal: new AbortController().signal,
        },
      );
      expect(await response.text()).toBe(sentinel);
      const settings = await carrier.request(
        'https://host.deepseekbot.dev/botharness-device/push',
        {
          method: 'GET',
          signal: new AbortController().signal,
        },
      );
      expect(settings.status).toBe(200);
      expect(JSON.parse(await settings.text())).toMatchObject({
        registered: false,
        quietChannelIds: [],
      });

      expect(observed.join('')).not.toContain(paired.credential);
    } finally {
      carrier.close?.();
    }
    const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()));
    pairing.revoke(paired.device.id);
    await closed;
  } finally {
    socket.terminate();
    channel.close();
    gateway.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
