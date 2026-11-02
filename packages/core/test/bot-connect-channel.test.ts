import { createHmac } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import { expect, it } from 'vitest';
import { BotNetworkDeliveryError } from '../src/runtime/bot-network.js';
import { createConnectBotNetwork } from '../src/devices/connect-bot-network.js';
import { createBotConnectChannel } from '../src/devices/bot-connect-channel.js';
import { createGatewayOrigin } from '../src/devices/connect.js';
import { noisePublicKey } from '../src/devices/noise/xk.js';

it.each(['success', 'lost-ack', 'withdrawn', 'sender-signed-out', 'refused', 'forged-refusal'])(
  'handles %s over authenticated Noise without replay or Human device access',
  async (scenario) => {
    const keys = [new Uint8Array(32).fill(11), new Uint8Array(32).fill(22)];
    const hosts = keys.map((key, index) => ({
      id: index === 0 ? 'haaaaaaaaaaaa' : 'hbbbbbbbbbbbb',
      hostId: `host-${index}`,
      publicKey: Buffer.from(noisePublicKey(key)).toString('hex'),
      hostname: `host-${index}.example.test`,
    }));
    let member = true;
    let senderActive = true;
    const accounts = hosts.map((host, index) =>
      createConnectBotNetwork({
        session: async () => ({
          relay: 'https://relay.test',
          accountId: 'user_test',
          localId: host.id,
          relayKey: `private-${index}`,
          accessToken: `token-${index}`,
          current: () => index !== 0 || senderActive,
        }),
        fetch: async (url, init) => {
          expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer token-${index}`);
          if (String(url).endsWith('/grant')) {
            const input = JSON.parse(String(init?.body));
            const recipient = hosts.findIndex((peer) => peer.id === input.recipientId);
            const statement = JSON.stringify({
              purpose: 'bot-network-grant-v1',
              connectHostId: host.id,
              recipientId: input.recipientId,
              issuedAt: input.issuedAt,
              nonce: input.nonce,
            });
            expect(input.proof).toBe(
              createHmac('sha256', `private-${index}`).update(statement).digest('base64url'),
            );
            const identity = (peer: typeof host) => ({
              id: peer.id,
              hostId: peer.hostId,
              publicKey: peer.publicKey,
            });
            const payload = JSON.stringify({
              purpose: 'bot-network-peer-v1',
              account: 'user_test',
              sender: identity(host),
              recipient: identity(hosts[recipient]!),
              issuedAt: new Date().toISOString(),
              nonce: input.nonce,
            });
            return Response.json({
              grant: {
                payload,
                signature: createHmac('sha256', `private-${recipient}`)
                  .update(payload)
                  .digest('base64url'),
              },
            });
          }
          return Response.json({
            hosts: hosts
              .filter((_, peerIndex) => member || peerIndex !== 0)
              .map((peer) => ({
                id: peer.id,
                hostname: peer.hostname,
                botNetwork: { hostId: peer.hostId, publicKey: peer.publicKey },
              })),
          });
        },
      }),
    );
    let received = 0;
    const receiver = createBotConnectChannel({
      hostId: hosts[1]!.hostId,
      key: async () => keys[1]!.slice(),
      account: accounts[1]!,
      receive: async (peer, payload) => {
        expect(peer.hostId).toBe(hosts[0]!.hostId);
        expect(payload).toEqual({ kind: 'contacts', offset: 0 });
        if (scenario === 'refused') throw new BotNetworkDeliveryError('network-denied');
        received++;
        return { contacts: [{ botSlug: 'ios', description: 'iOS development' }] };
      },
    });
    const server = createServer((req, res) => void receiver.handle(req, res));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const hostAddress = server.address();
    if (!hostAddress || typeof hostAddress === 'string') throw new Error('test-listener');
    const origin = createGatewayOrigin(() => hostAddress.port);
    await new Promise<void>((resolve) => origin.listen(0, '127.0.0.1', resolve));
    const address = origin.address();
    if (!address || typeof address === 'string') throw new Error('test-origin');
    const wire: string[] = [];
    const sender = createBotConnectChannel({
      hostId: hosts[0]!.hostId,
      key: async () => keys[0]!.slice(),
      account: accounts[0]!,
      receive: async () => {
        throw new Error('unexpected-inbound');
      },
      fetch: async (url, init) => {
        wire.push(String(init?.body));
        expect(new Headers(init?.headers).has('authorization')).toBe(false);
        const path = new URL(String(url)).pathname;
        if (path.endsWith('/request') && scenario === 'withdrawn') member = false;
        const response = await fetch(`http://127.0.0.1:${address.port}${path}`, init);
        if (path.endsWith('/handshake') && scenario === 'sender-signed-out') senderActive = false;
        if (path.endsWith('/request') && scenario === 'forged-refusal') {
          await response.arrayBuffer();
          return new Response(JSON.stringify({ code: 'network-denied' }), { status: 403 });
        }
        if (path.endsWith('/request') && scenario === 'lost-ack') {
          await response.arrayBuffer();
          throw new Error('lost-ack');
        }
        return response;
      },
    });
    try {
      if (scenario === 'success') {
        for (const headers of [
          { authorization: 'Bearer human-owner' },
          { cookie: 'owner=human' },
        ]) {
          const denied = await fetch(
            `http://127.0.0.1:${address.port}/botharness-device/bots/v1/handshake`,
            { method: 'POST', headers, body: '{}' },
          );
          expect(denied.status).toBe(404);
          await denied.body?.cancel();
        }
        for (const path of [
          '/botharness-device/bots/v1/handshake?admin=true',
          '/botharness-device/bots/v1/request/extra',
          '/botharness-device/bots/v1/admin',
          '/api/botharness/devices',
        ]) {
          const denied = await fetch(`http://127.0.0.1:${address.port}${path}`, {
            method: 'POST',
            body: '{}',
          });
          expect(denied.status).toBe(404);
          await denied.body?.cancel();
        }
        expect(received).toBe(0);
      }
      const result = sender.request(
        {
          ...hosts[1]!,
          membership: {
            kind: 'connect',
            accountId: 'user_test',
            localHostId: hosts[0]!.id,
            remoteHostId: hosts[1]!.id,
          },
        },
        { kind: 'contacts', offset: 0 },
        scenario === 'lost-ack' || scenario === 'refused' || scenario === 'forged-refusal',
      );
      if (scenario === 'success')
        await expect(result).resolves.toEqual({
          contacts: [{ botSlug: 'ios', description: 'iOS development' }],
        });
      else
        await expect(result).rejects.toMatchObject({
          code:
            scenario === 'lost-ack' || scenario === 'forged-refusal'
              ? 'delivery-unknown'
              : 'network-denied',
        });
      expect(received).toBe(
        scenario === 'withdrawn' || scenario === 'sender-signed-out' || scenario === 'refused'
          ? 0
          : 1,
      );
      if (scenario !== 'sender-signed-out') {
        const replay = await fetch(
          `http://127.0.0.1:${address.port}/botharness-device/bots/v1/request`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: wire[1]!,
          },
        );
        expect(replay.status).toBe(403);
        await replay.body?.cancel();
      }
      expect(received).toBe(
        scenario === 'withdrawn' || scenario === 'sender-signed-out' || scenario === 'refused'
          ? 0
          : 1,
      );
      expect(wire).toHaveLength(scenario === 'sender-signed-out' ? 1 : 2);
      expect(wire.join('')).not.toContain('contacts');
      expect(wire.join('')).not.toContain('private-');
      expect(wire.join('')).not.toContain('token-');
    } finally {
      sender.close();
      receiver.close();
      origin.closeAllConnections();
      await new Promise<void>((resolve) => origin.close(() => resolve()));
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);

it('bounds simultaneous account verification before accepting more handshakes', async () => {
  let entered = 0;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const channel = createBotConnectChannel({
    hostId: 'receiver',
    key: async () => new Uint8Array(32).fill(7),
    account: {
      grant: async () => {
        throw new Error('unused');
      },
      membership: async () => 'member',
      verify: async () => {
        entered++;
        await held;
        throw new Error('test-rejected');
      },
    },
    receive: async () => {
      throw new Error('unused');
    },
  });
  const server = createServer((req, res) => void channel.handle(req, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('listener');
  const call = () =>
    fetch(`http://127.0.0.1:${address.port}/botharness-device/bots/v1/handshake`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        flight: 'aA==',
        grant: { payload: 'test', signature: 'a'.repeat(43) },
      }),
    }).then(async (response) => {
      await response.body?.cancel();
      return response.status;
    });
  const requests = Array.from({ length: 32 }, call);
  try {
    await expect.poll(() => entered).toBe(32);
    const extra = call();
    requests.push(extra);
    await expect(
      Promise.race([
        extra,
        new Promise((resolve) => setTimeout(() => resolve('not-bounded'), 500)),
      ]),
    ).resolves.toBe(403);
    expect(entered).toBe(32);
  } finally {
    release();
    await Promise.allSettled(requests);
    channel.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it('closes an unfinished request body before it can hold a Host slot indefinitely', async () => {
  const channel = createBotConnectChannel({
    hostId: 'receiver',
    key: async () => new Uint8Array(32).fill(8),
    account: {
      grant: async () => {
        throw new Error('unused');
      },
      membership: async () => 'member',
      verify: async () => {
        throw new Error('must-not-verify-partial-body');
      },
    },
    receive: async () => {
      throw new Error('unused');
    },
  });
  const server = createServer((req, res) => void channel.handle(req, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('listener');
  const client = httpRequest({
    hostname: '127.0.0.1',
    port: address.port,
    path: '/botharness-device/bots/v1/handshake',
    method: 'POST',
  });
  client.on('error', () => undefined);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const closed = new Promise<boolean>((resolve) => {
    client.once('close', () => resolve(true));
    timeout = setTimeout(() => resolve(false), 6500);
  });
  client.write('{"grant":');
  try {
    await expect(closed).resolves.toBe(true);
  } finally {
    clearTimeout(timeout);
    client.destroy();
    channel.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}, 10_000);
