import { createServer, request } from 'node:http';
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
import type { TailnetChange } from '../src/devices/bot-tailnet-watch.js';

it.each(['background', 'explicit'])(
  'cancels an older %s directory read when a fresh query starts',
  async (kind) => {
    const self = { nodeId: 'self', address: '127.0.0.10' };
    const peer = { nodeId: 'peer', address: '127.0.0.11' };
    let first!: () => void;
    const firstRequest = new Promise<void>((resolve) => {
      first = resolve;
    });
    let requests = 0;
    let canceled = false;
    const listener = createServer((incoming, response) => {
      if (++requests === 1) {
        incoming.on('close', () => {
          canceled = true;
        });
        first();
        return;
      }
      response.end(JSON.stringify({ hostId: 'peer', publicKey: 'a'.repeat(64), contacts: [] }));
    });
    await new Promise<void>((resolve) => listener.listen(43278, peer.address, resolve));
    const bridge = createTailnetBotBridge({
      hostId: 'local',
      key: async () => randomBytes(32),
      directory: () => [],
      async receive() {},
      ports: [43278],
      tailnet: {
        async snapshot() {
          return { self, peers: [peer] };
        },
        async admit() {
          return peer;
        },
      },
    });
    const pending: Promise<void>[] = [];
    try {
      pending.push(kind === 'background' ? bridge.start() : bridge.refresh!());
      await firstRequest;
      pending.push(bridge.refresh!(), bridge.refresh!());
      await expect.poll(() => canceled, { timeout: 1000 }).toBe(true);
      await Promise.all(pending);
      expect(requests).toBe(2);
    } finally {
      await bridge.close();
      listener.closeAllConnections();
      await new Promise<void>((resolve) => listener.close(() => resolve()));
      await Promise.allSettled(pending);
    }
  },
);

it.each([false, true])(
  'waits for observed withdrawal before trusting a returned peer (cancellation fails: %s)',
  async (fails) => {
    const self = { nodeId: 'self', address: '127.0.0.8' };
    const peer = { nodeId: 'peer', address: '127.0.0.9' };
    let notify!: (change: TailnetChange) => void;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let canceled = false;
    let cancellationFails = fails;
    let stopped = false;
    const bridge = createTailnetBotBridge({
      hostId: 'local',
      key: async () => randomBytes(32),
      directory: () => [],
      async receive() {},
      ports: [43274],
      knownMemberships: () => [
        {
          hostId: 'remote',
          membership: {
            kind: 'tailnet',
            localNodeId: 'self',
            remoteNodeId: 'peer',
          },
        },
      ],
      async withdrawn() {
        await held;
        if (cancellationFails) throw new Error('cancellation-unavailable');
        canceled = true;
      },
      tailnet: {
        watch(changed) {
          notify = changed;
          return async () => {
            stopped = true;
          };
        },
        async snapshot() {
          return { self, peers: [peer] };
        },
        async admit() {
          return peer;
        },
      },
    });
    try {
      await bridge.start();
      expect(notify).toBeTypeOf('function');
      notify({ removedNodeIds: ['peer'] });
      let settled = false;
      const status = bridge.membership!('remote').then((value) => {
        settled = true;
        return value;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      release();
      expect(await status).toBe(fails ? 'withdrawn' : 'member');
      if (fails) {
        expect(canceled).toBe(false);
        expect(bridge.availability?.('remote', 'bot')).toBe('withdrawn');
        cancellationFails = false;
        expect(await bridge.membership!('remote')).toBe('member');
      }
      expect(canceled).toBe(true);
    } finally {
      release();
      await bridge.close();
    }
    expect(stopped).toBe(true);
  },
);

it('rebinds its own listener after the local tailnet identity changes', async () => {
  let self = { nodeId: 'initial-node', address: '127.0.0.2' };
  const bridge = createTailnetBotBridge({
    hostId: 'local',
    key: async () => randomBytes(32),
    directory: () => [],
    async receive() {},
    ports: [43273],
    tailnet: {
      async snapshot() {
        return { self, peers: [] };
      },
      async admit() {
        return { nodeId: 'caller', address: '127.0.0.3' };
      },
    },
  });
  const query = (address: string) =>
    new Promise<number | 'offline'>((resolve) => {
      const call = request(
        {
          hostname: address,
          port: 43273,
          path: '/botharness-bots/v1/contacts?offset=0',
          localAddress: '127.0.0.3',
          agent: false,
          timeout: 1000,
        },
        (response) => {
          response.resume();
          resolve(response.statusCode!);
        },
      );
      call.on('error', () => resolve('offline'));
      call.on('timeout', () => call.destroy());
      call.end();
    });
  try {
    await bridge.start();
    expect(await query('127.0.0.2')).toBe(200);
    self = { nodeId: 'replacement-node', address: '127.0.0.4' };
    await bridge.refresh?.();
    expect(await query('127.0.0.4')).toBe(200);
    expect(await query('127.0.0.2')).toBe('offline');
  } finally {
    await bridge.close();
  }
});

it('checks persisted membership independently of online routes after a bridge restart', async () => {
  const self = { nodeId: 'local-node', address: '127.0.0.2' };
  const peer = { nodeId: 'peer-node', address: '127.0.0.3' };
  let state: 'online' | 'offline' | 'withdrawn' | 'unavailable' = 'online';
  const bridge = createTailnetBotBridge({
    hostId: 'local',
    key: async () => randomBytes(32),
    directory: () => [],
    async receive() {},
    knownMemberships: () => [
      {
        hostId: 'peer',
        membership: {
          kind: 'tailnet',
          localNodeId: self.nodeId,
          remoteNodeId: peer.nodeId,
        },
      },
    ],
    tailnet: {
      async snapshot() {
        if (state === 'unavailable') throw new Error('daemon-unreachable');
        return {
          self,
          peers: state === 'online' ? [peer] : [],
          offlinePeers: state === 'offline' ? [peer] : [],
        };
      },
      async admit() {
        return peer;
      },
    },
  });
  try {
    expect(bridge.contacts()).toEqual([]);
    expect(await bridge.membership?.('peer')).toBe('member');
    state = 'offline';
    expect(await bridge.membership?.('peer')).toBe('member');
    state = 'unavailable';
    expect(await bridge.membership?.('peer')).toBe('unavailable');
    state = 'withdrawn';
    expect(await bridge.membership?.('peer')).toBe('withdrawn');
    await bridge.refresh?.();
    expect(bridge.availability?.('peer', 'ios')).toBe('withdrawn');
    state = 'unavailable';
    await bridge.refresh?.();
    expect(bridge.availability?.('peer', 'ios')).toBe('unavailable');
    expect(await bridge.membership?.('unknown-host')).toBe('unavailable');
  } finally {
    await bridge.close();
  }
});

it.each(['changed', 'legacy'])(
  'discovers and sends exactly once while replacing a %s relationship',
  async (relationship) => {
    const keys = [randomBytes(32), randomBytes(32)];
    const members = [
      { nodeId: 'left-node', address: '127.0.0.2' },
      { nodeId: 'right-node', address: '127.0.0.3' },
    ];
    let peerOffline = false;
    let peerWithdrawn = false;
    let botVisible = true;
    let daemonReady = false;
    const events: Array<{ phase: string; code?: string; stage?: string }> = [];
    const tailnet = (index: number): BotTailnet => ({
      async snapshot() {
        if (!daemonReady) throw new Error('tailnet-unavailable');
        return {
          self: members[index]!,
          peers: peerOffline || peerWithdrawn ? [] : [members[1 - index]!],
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
    const hasBinding = [relationship !== 'legacy', relationship !== 'legacy'];
    if (relationship === 'legacy') {
      pins[0]!.set('right', Buffer.from(noisePublicKey(keys[1]!)).toString('hex'));
      pins[1]!.set('left', Buffer.from(noisePublicKey(keys[0]!)).toString('hex'));
    }
    const bindings = members.map((member, index) => ({
      kind: 'tailnet' as const,
      localNodeId: member.nodeId,
      remoteNodeId: members[1 - index]!.nodeId,
    }));
    const lifecycle: string[] = [];
    let loseAcknowledgement = false;
    let withdrawDuringHandshake = false;
    const make = (index: number) =>
      createTailnetBotBridge({
        key: async () => {
          if (index === 0 && withdrawDuringHandshake) peerWithdrawn = true;
          return Uint8Array.from(keys[index]!);
        },
        knownKey: (host) => pins[index]!.get(host),
        knownMemberships: () =>
          !hasBinding[index]
            ? []
            : [
                {
                  hostId: index === 0 ? 'right' : 'left',
                  membership: bindings[index]!,
                },
              ],
        withdrawn: async () => {
          await Promise.resolve();
          if (relationship !== 'legacy') lifecycle.push(`withdraw-${index}`);
        },
        unbound: async () => {
          await Promise.resolve();
          lifecycle.push(`withdraw-${index}`);
        },
        trustKey: (host, key, membership) => {
          const known = pins[index]!.get(host);
          if (known && known !== key) throw new Error('network-host-key-conflict');
          pins[index]!.set(host, key);
          if (membership !== undefined) {
            if (membership.kind !== 'tailnet') throw new Error('Expected tailnet binding');
            bindings[index] = membership;
            hasBinding[index] = true;
          }
          lifecycle.push(`pin-${index}`);
        },
        record: (event) => events.push(event),
        hostId: index === 0 ? 'left' : 'right',
        tailnet: tailnet(index),
        ports: [43271, 43272],
        directory: () =>
          !botVisible
            ? []
            : [
                {
                  hostId: index === 0 ? 'left' : 'right',
                  botSlug: 'ios',
                  displayName: 'iOS',
                  device: { model: null, platform: 'darwin' },
                  capabilities: [],
                },
              ],
        async receive(sender, message) {
          lifecycle.push(`receive-${index}`);
          expect(sender.hostKey).toBe(
            Buffer.from(noisePublicKey(keys[1 - index]!)).toString('hex'),
          );
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
      expect(left.availability?.('right', 'ios')).toBe('available');
      botVisible = false;
      await left.refresh?.();
      expect(left.availability?.('right', 'ios')).toBe('bot-unavailable');
      botVisible = true;
      peerOffline = true;
      await left.refresh?.();
      expect(left.availability?.('right', 'ios')).toBe('unavailable');
      peerOffline = false;
      peerWithdrawn = true;
      await left.refresh?.();
      expect(left.availability?.('right', 'ios')).toBe(
        relationship === 'legacy' ? 'unavailable' : 'withdrawn',
      );
      peerWithdrawn = false;
      await left.refresh?.();
      bindings[0] = { ...bindings[0]!, remoteNodeId: 'old-right-node' };
      bindings[1] = { ...bindings[1]!, remoteNodeId: 'old-left-node' };
      lifecycle.length = 0;
      await left.send('right', {
        id: 'one',
        at: '2026-11-01T00:00:00.000Z',
        senderBotSlug: 'ios',
        recipientBotSlug: 'ios',
        body: 'Check iOS',
        causation: { rootSourceEventId: 'root', parentSourceEventId: 'parent', hop: 1 },
      });
      expect(received).toEqual(['left:Check iOS']);
      expect(lifecycle).toEqual(['withdraw-0', 'pin-0', 'withdraw-1', 'pin-1', 'receive-1']);
      withdrawDuringHandshake = true;
      await expect(
        left.send('right', {
          id: 'withdraw-during-handshake',
          at: '2026-11-01T00:00:00.000Z',
          senderBotSlug: 'ios',
          recipientBotSlug: 'ios',
          body: 'Must not arrive',
          causation: { rootSourceEventId: 'root', parentSourceEventId: 'parent', hop: 1 },
        }),
      ).rejects.toThrow('network-denied');
      expect(received).toEqual(['left:Check iOS']);
      withdrawDuringHandshake = false;
      peerWithdrawn = false;
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
  },
);
