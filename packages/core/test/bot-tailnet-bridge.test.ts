import { request } from 'node:http';
import {
  botNetworkHandshake,
  finishBotHandshake,
  encodeBotPayload,
} from '../src/devices/bot-network-noise.js';
import { noisePublicKey } from '../src/devices/noise/xk.js';
import { randomBytes } from 'node:crypto';
import { expect, it } from 'vitest';
import { createTailnetBotBridge } from '../src/devices/bot-tailnet-bridge.js';
import type { BotTailnet } from '../src/devices/bot-tailnet.js';

it('automatically discovers a peer listener and sends exactly once over its bounded device bridge', async () => {
  const keys = [randomBytes(32), randomBytes(32)];
  const members = [
    { nodeId: 'left-node', address: '127.0.0.2' },
    { nodeId: 'right-node', address: '127.0.0.3' },
  ];
  let peerOffline = false;
  let daemonReady = false;
  const events: Array<{ phase: string; code?: string; stage?: string }> = [];
  const tailnet = (index: number): BotTailnet => ({
    async snapshot() {
      if (!daemonReady) throw new Error('tailnet-unavailable');
      return {
        self: members[index]!,
        peers: peerOffline ? [] : [members[1 - index]!],
        offlinePeers: peerOffline ? [members[1 - index]!] : [],
      };
    },
    async admit(address) {
      const peer = members.find((peer) => peer.address === address);
      if (!peer) throw new Error('tailnet-peer-denied');
      return peer;
    },
  });
  const received: string[] = [];
  const pins = [new Map<string, string>(), new Map<string, string>()];
  let loseAcknowledgement = false;
  const make = (index: number) =>
    createTailnetBotBridge({
      key: async () => Uint8Array.from(keys[index]!),
      knownKey: (host) => pins[index]!.get(host),
      trustKey: (host, key) => {
        const known = pins[index]!.get(host);
        if (known && known !== key) throw new Error('network-host-key-conflict');
        pins[index]!.set(host, key);
      },
      record: (event) => events.push(event),
      hostId: index === 0 ? 'left' : 'right',
      tailnet: tailnet(index),
      ports: [43271, 43272],
      directory: () => [
        {
          hostId: index === 0 ? 'left' : 'right',
          botSlug: 'ios',
          displayName: 'iOS',
          device: { model: null, platform: 'darwin' },
          capabilities: [],
        },
      ],
      async receive(sender, message) {
        expect(sender.hostKey).toBe(Buffer.from(noisePublicKey(keys[1 - index]!)).toString('hex'));
        received.push(`${sender.hostId}:${message.body}`);
        if (loseAcknowledgement) throw new Error('accepted-before-acknowledgement');
      },
    });
  const left = make(0);
  const right = make(1);
  try {
    await expect(left.start()).rejects.toThrow('tailnet-unavailable');
    daemonReady = true;
    await left.start();
    await right.start();
    await left.discover();
    expect(left.contacts().map((bot) => bot.hostId)).toEqual(['right']);
    await left.send('right', {
      id: 'one',
      at: '2026-11-01T00:00:00.000Z',
      senderBotSlug: 'ios',
      recipientBotSlug: 'ios',
      body: 'Check iOS',
      causation: { rootSourceEventId: 'root', parentSourceEventId: 'parent', hop: 1 },
    });
    expect(received).toEqual(['left:Check iOS']);
    const post = (path: string, body: unknown) =>
      new Promise<{ status: number; value: { flight: string; session: string } }>(
        (resolve, reject) => {
          const bytes = JSON.stringify(body);
          const call = request(
            {
              hostname: members[1]!.address,
              localAddress: members[0]!.address,
              port: 43271,
              path: `/botharness-bots/v1/${path}`,
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'x-bot-host': 'left',
                'x-bot-port': '43271',
                'content-length': Buffer.byteLength(bytes),
              },
            },
            (response) => {
              let result = '';
              response.on('data', (chunk) => (result += chunk));
              response.on('end', () =>
                resolve({ status: response.statusCode!, value: JSON.parse(result) }),
              );
            },
          );
          call.on('error', reject);
          call.end(bytes);
        },
      );
    const forged = {
      id: 'forged',
      at: '2026-11-01T00:00:00.000Z',
      senderBotSlug: 'ios',
      recipientBotSlug: 'ios',
      body: 'Forged message',
      causation: { rootSourceEventId: 'root', parentSourceEventId: 'parent', hop: 1 },
    };
    expect((await post('messages', forged)).status).toBe(403);
    const rightPublic = Buffer.from(noisePublicKey(keys[1]!)).toString('hex');
    const impostor = await botNetworkHandshake({
      role: 'initiator',
      senderHost: 'left',
      receiverHost: 'right',
      key: async () => randomBytes(32),
      remotePublicKey: rightPublic,
    });
    try {
      const first = await post('handshake', {
        flight: Buffer.from(impostor.write()).toString('base64'),
      });
      expect(first.status).toBe(200);
      impostor.read(Buffer.from(first.value.flight, 'base64'));
      const flight = Buffer.from(impostor.write()).toString('base64');
      const transport = finishBotHandshake(impostor, rightPublic);
      try {
        const second = await post('messages', {
          session: first.value.session,
          flight,
          frames: encodeBotPayload(transport, forged),
        });
        expect(second.status).toBe(403);
      } finally {
        transport.close();
      }
    } finally {
      impostor.close();
    }
    expect(received).toEqual(['left:Check iOS']);

    loseAcknowledgement = true;
    await expect(
      left.send('right', {
        id: 'uncertain',
        at: '2026-11-01T00:00:00.000Z',
        senderBotSlug: 'ios',
        recipientBotSlug: 'ios',
        body: 'Accepted without acknowledgement',
        causation: { rootSourceEventId: 'root', parentSourceEventId: 'parent', hop: 1 },
      }),
    ).rejects.toThrow('delivery-unknown');
    expect(received).toEqual(['left:Check iOS', 'left:Accepted without acknowledgement']);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ phase: 'received' }),
        expect.objectContaining({
          phase: 'receive-refused',
          stage: 'admission',
          code: 'delivery-unknown',
        }),
      ]),
    );
    peerOffline = true;
    await expect(
      left.send('right', {
        id: 'offline-daemon',
        at: '2026-11-01T00:00:00.000Z',
        senderBotSlug: 'ios',
        recipientBotSlug: 'ios',
        body: 'Offline daemon',
        causation: { rootSourceEventId: 'root', parentSourceEventId: 'parent', hop: 1 },
      }),
    ).rejects.toThrow('unable-to-deliver');
    peerOffline = false;
    await right.close();
    await expect(
      left.send('right', {
        id: 'offline',
        at: '2026-11-01T00:00:00.000Z',
        senderBotSlug: 'ios',
        recipientBotSlug: 'ios',
        body: 'Offline',
        causation: { rootSourceEventId: 'root', parentSourceEventId: 'parent', hop: 1 },
      }),
    ).rejects.toThrow('unable-to-deliver');
    loseAcknowledgement = false;
    const restarted = make(1);
    try {
      await restarted.start();
      await left.discover();
      expect(left.contacts().map((bot) => bot.hostId)).toEqual(['right']);
      expect(received).toEqual(['left:Check iOS', 'left:Accepted without acknowledgement']);
    } finally {
      await restarted.close();
    }
  } finally {
    await left.close();
    await right.close();
  }
});
