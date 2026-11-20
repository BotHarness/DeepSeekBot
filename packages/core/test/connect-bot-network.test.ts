import { createHmac } from 'node:crypto';
import { expect, it } from 'vitest';
import { createConnectBotNetwork } from '../src/devices/connect-bot-network.js';

it('accepts a recipient-bound Bot proof only while both account registrations remain current', async () => {
  const receiver = { id: 'hbbbbbbbbbbbb', hostId: 'local-host', publicKey: 'b'.repeat(64) };
  const sender = { id: 'haaaaaaaaaaaa', hostId: 'remote-host', publicKey: 'a'.repeat(64) };
  const clock = Date.parse('2026-11-01T00:00:00.000Z');
  let active = true;
  let remotePresent = true;
  const network = createConnectBotNetwork({
    now: () => clock,
    session: async () => ({
      relay: 'https://relay.test',
      accountId: 'user_qa',
      localId: receiver.id,
      relayKey: 'receiver-private-key',
      accessToken: 'test-access',
      current: () => active,
    }),
    fetch: async (_url, init) => {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-access');
      return Response.json({
        hosts: [receiver, ...(remotePresent ? [sender] : [])].map((peer) => ({
          id: peer.id,
          hostname: `${peer.id}.example.test`,
          botNetwork: { hostId: peer.hostId, publicKey: peer.publicKey },
        })),
      });
    },
  });
  const payload = JSON.stringify({
    purpose: 'bot-network-peer-v1',
    account: 'user_qa',
    sender,
    recipient: receiver,
    issuedAt: new Date(clock).toISOString(),
    nonce: 'n'.repeat(32),
  });
  const grant = {
    payload,
    signature: createHmac('sha256', 'receiver-private-key').update(payload).digest('base64url'),
  };
  expect(await network.verify(receiver, grant)).toMatchObject({
    id: sender.id,
    hostId: sender.hostId,
    publicKey: sender.publicKey,
  });
  remotePresent = false;
  await expect(network.verify(receiver, grant)).rejects.toMatchObject({ code: 'network-denied' });
  remotePresent = true;
  active = false;
  await expect(network.verify(receiver, grant)).rejects.toMatchObject({ code: 'network-denied' });
});

it('discovers registered Bots through the current account and discards a directory fetched across sign-out', async () => {
  let active = true;
  let invalidate = false;
  const network = createConnectBotNetwork({
    session: async () => ({
      relay: 'https://relay.test',
      accountId: 'user_qa',
      localId: 'hbbbbbbbbbbbb',
      relayKey: 'private',
      accessToken: 'access',
      current: () => active,
    }),
    fetch: async () => {
      if (invalidate) active = false;
      return Response.json({
        hosts: [
          {
            id: 'hbbbbbbbbbbbb',
            hostname: 'local.example.test',
            botNetwork: { hostId: 'local', publicKey: 'b'.repeat(64) },
          },
          {
            id: 'haaaaaaaaaaaa',
            hostname: 'remote.example.test',
            botNetwork: { hostId: 'remote', publicKey: 'a'.repeat(64) },
          },
          { id: 'hcccccccccccc', hostname: 'unregistered.example.test' },
        ],
      });
    },
  });
  await expect(network.peers()).resolves.toEqual([
    {
      id: 'haaaaaaaaaaaa',
      hostname: 'remote.example.test',
      hostId: 'remote',
      publicKey: 'a'.repeat(64),
      membership: {
        kind: 'connect',
        accountId: 'user_qa',
        localHostId: 'hbbbbbbbbbbbb',
        remoteHostId: 'haaaaaaaaaaaa',
      },
    },
  ]);
  invalidate = true;
  await expect(network.peers()).rejects.toMatchObject({ code: 'network-denied' });
});

it('registers this Host using its private registration credential and verifies the account directory result', async () => {
  const own = { hostId: 'local-host', publicKey: 'b'.repeat(64) };
  let registered = false;
  let registrations = 0;
  const network = createConnectBotNetwork({
    now: () => Date.parse('2026-11-01T00:00:00.000Z'),
    session: async () => ({
      relay: 'https://relay.test',
      accountId: 'user_qa',
      localId: 'hbbbbbbbbbbbb',
      relayKey: 'private',
      accessToken: 'access',
      current: () => true,
    }),
    fetch: async (url, init) => {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer access');
      if (init?.method === 'POST') {
        registrations++;
        expect(url).toBe('https://relay.test/v1/hosts/hbbbbbbbbbbbb/bot-network');
        const body = JSON.parse(String(init.body));
        expect(body).toMatchObject({ ...own, issuedAt: '2026-11-01T00:00:00.000Z' });
        const statement = JSON.stringify({
          purpose: 'bot-network-registration-v1',
          connectHostId: 'hbbbbbbbbbbbb',
          ...own,
          issuedAt: body.issuedAt,
        });
        expect(body.proof).toBe(
          createHmac('sha256', 'private').update(statement).digest('base64url'),
        );
        registered = true;
        return Response.json({ host: { id: 'hbbbbbbbbbbbb' } });
      }
      return Response.json({
        hosts: [
          {
            id: 'hbbbbbbbbbbbb',
            hostname: 'local.example.test',
            ...(registered ? { botNetwork: own } : {}),
          },
        ],
      });
    },
  });
  await expect(network.register(own)).resolves.toEqual({
    id: 'hbbbbbbbbbbbb',
    hostname: 'local.example.test',
    ...own,
  });
  await network.register(own);
  expect(registrations).toBe(1);
});

it('obtains a Bot-only peer grant without exposing the account token or Host credential to the peer', async () => {
  const own = { id: 'hbbbbbbbbbbbb', hostId: 'local-host', publicKey: 'b'.repeat(64) };
  const peer = {
    id: 'haaaaaaaaaaaa',
    hostname: 'remote.example.test',
    hostId: 'remote-host',
    publicKey: 'a'.repeat(64),
  };
  const time = '2026-11-01T00:00:00.000Z';
  let requests = 0;
  let clock = Date.parse(time);
  const network = createConnectBotNetwork({
    now: () => clock,
    session: async () => ({
      relay: 'https://relay.test',
      accountId: 'user_qa',
      localId: own.id,
      relayKey: 'sender-private',
      accessToken: 'access',
      current: () => true,
    }),
    fetch: async (url, init) => {
      requests++;
      expect(url).toBe(`https://relay.test/v1/hosts/${own.id}/bot-network/grant`);
      const body = JSON.parse(String(init?.body));
      expect(body.recipientId).toBe(peer.id);
      expect(body.nonce).toMatch(/^[A-Za-z0-9_-]{32,128}$/u);
      const statement = JSON.stringify({
        purpose: 'bot-network-grant-v1',
        connectHostId: own.id,
        recipientId: peer.id,
        issuedAt: body.issuedAt,
        nonce: body.nonce,
      });
      expect(body.proof).toBe(
        createHmac('sha256', 'sender-private').update(statement).digest('base64url'),
      );
      const payload = JSON.stringify({
        purpose: 'bot-network-peer-v1',
        account: 'user_qa',
        sender: own,
        recipient: { id: peer.id, hostId: peer.hostId, publicKey: peer.publicKey },
        issuedAt: body.issuedAt,
        nonce: body.nonce,
      });
      return Response.json({
        grant: {
          payload,
          signature: createHmac('sha256', 'recipient-private').update(payload).digest('base64url'),
        },
      });
    },
  });
  const granted = await network.grant(own, peer);
  expect(JSON.parse(granted.payload)).toMatchObject({
    purpose: 'bot-network-peer-v1',
    sender: own,
    recipient: { hostId: peer.hostId },
  });
  expect(JSON.stringify(granted)).not.toContain('sender-private');
  expect(JSON.stringify(granted)).not.toContain('access');
  await expect(network.grant(own, peer)).resolves.toEqual(granted);
  expect(requests).toBe(1);
  clock += 51_000;
  await network.grant(own, peer);
  expect(requests).toBe(2);
});

it.each(['purpose', 'account', 'recipient', 'key', 'expired', 'sign-out-during-query'])(
  'refuses a signed grant with invalid %s before it can authorize a peer',
  async (variant) => {
    const own = { id: 'hbbbbbbbbbbbb', hostId: 'local-host', publicKey: 'b'.repeat(64) };
    const sender = { id: 'haaaaaaaaaaaa', hostId: 'remote-host', publicKey: 'a'.repeat(64) };
    const now = Date.parse('2026-11-01T00:00:00.000Z');
    let active = true;
    let queries = 0;
    const network = createConnectBotNetwork({
      now: () => now,
      session: async () => ({
        relay: 'https://relay.test',
        accountId: 'user_qa',
        localId: own.id,
        relayKey: 'receiver-private',
        accessToken: 'access',
        current: () => active,
      }),
      fetch: async () => {
        queries++;
        active = false;
        return Response.json({
          hosts: [own, sender].map((peer) => ({
            id: peer.id,
            hostname: `${peer.id}.example.test`,
            botNetwork: { hostId: peer.hostId, publicKey: peer.publicKey },
          })),
        });
      },
    });
    const payload = JSON.stringify({
      purpose: variant === 'purpose' ? 'human-device-offer' : 'bot-network-peer-v1',
      account: variant === 'account' ? 'other_account' : 'user_qa',
      sender,
      recipient: {
        ...own,
        ...(variant === 'recipient' ? { id: 'hcccccccccccc' } : {}),
        ...(variant === 'key' ? { publicKey: 'c'.repeat(64) } : {}),
      },
      issuedAt: new Date(now - (variant === 'expired' ? 60_001 : 0)).toISOString(),
      nonce: 'n'.repeat(32),
    });
    await expect(
      network.verify(own, {
        payload,
        signature: createHmac('sha256', 'receiver-private').update(payload).digest('base64url'),
      }),
    ).rejects.toMatchObject({ code: 'network-denied' });
    expect(queries).toBe(variant === 'sign-out-during-query' ? 1 : 0);
  },
);

it('refuses a grant that expires while current registration membership is queried', async () => {
  const own = { id: 'hbbbbbbbbbbbb', hostId: 'local', publicKey: 'b'.repeat(64) };
  const peer = { id: 'haaaaaaaaaaaa', hostId: 'remote', publicKey: 'a'.repeat(64) };
  const issuedAt = '2026-11-01T00:00:00.000Z';
  let clock = Date.parse(issuedAt) + 59_000;
  const network = createConnectBotNetwork({
    now: () => clock,
    session: async () => ({
      relay: 'https://relay.test',
      accountId: 'account',
      localId: own.id,
      relayKey: 'private',
      accessToken: 'access',
      current: () => true,
    }),
    fetch: async () => {
      clock += 2000;
      return Response.json({
        hosts: [own, peer].map((host) => ({
          id: host.id,
          hostname: `${host.id}.example.test`,
          botNetwork: { hostId: host.hostId, publicKey: host.publicKey },
        })),
      });
    },
  });
  const payload = JSON.stringify({
    purpose: 'bot-network-peer-v1',
    account: 'account',
    sender: peer,
    recipient: own,
    issuedAt,
    nonce: 'n'.repeat(32),
  });
  await expect(
    network.verify(own, {
      payload,
      signature: createHmac('sha256', 'private').update(payload).digest('base64url'),
    }),
  ).rejects.toMatchObject({ code: 'network-denied' });
});

it('distinguishes account withdrawal from temporary directory unavailability for accepted work', async () => {
  const scope = {
    kind: 'connect' as const,
    accountId: 'account',
    localHostId: 'hbbbbbbbbbbbb',
    remoteHostId: 'haaaaaaaaaaaa',
  };
  let present = true;
  let unavailable = false;
  let revoked = false;
  const network = createConnectBotNetwork({
    revoked: () => revoked,
    session: async () =>
      revoked
        ? undefined
        : {
            relay: 'https://relay.test',
            accountId: 'account',
            localId: scope.localHostId,
            relayKey: 'private',
            accessToken: 'access',
            current: () => !revoked,
          },
    fetch: async () => {
      if (unavailable) throw new Error('directory-offline');
      return Response.json({
        hosts: [
          {
            id: scope.localHostId,
            hostname: 'local.example.test',
            botNetwork: { hostId: 'local', publicKey: 'b'.repeat(64) },
          },
          ...(present
            ? [
                {
                  id: scope.remoteHostId,
                  hostname: 'remote.example.test',
                  botNetwork: { hostId: 'remote', publicKey: 'a'.repeat(64) },
                },
              ]
            : []),
        ],
      });
    },
  });
  await expect(network.membership('remote', scope, 'a'.repeat(64))).resolves.toBe('member');
  unavailable = true;
  await expect(network.membership('remote', scope, 'a'.repeat(64))).resolves.toBe('unavailable');
  unavailable = false;
  present = false;
  await expect(network.membership('remote', scope, 'a'.repeat(64))).resolves.toBe('withdrawn');
  revoked = true;
  await expect(network.membership('remote', scope, 'a'.repeat(64))).resolves.toBe('withdrawn');
});

it('refuses a cached contact from a previous local account registration before issuing a grant', async () => {
  const network = createConnectBotNetwork({
    session: async () => ({
      relay: 'https://relay.test',
      accountId: 'new-account',
      localId: 'hcccccccccccc',
      relayKey: 'private',
      accessToken: 'access',
      current: () => true,
    }),
    fetch: async () => {
      throw new Error('must-not-request-a-grant');
    },
  });
  await expect(
    network.grant(
      { hostId: 'local', publicKey: 'b'.repeat(64) },
      {
        id: 'haaaaaaaaaaaa',
        hostId: 'remote',
        publicKey: 'a'.repeat(64),
        hostname: 'remote.example.test',
        membership: {
          kind: 'connect',
          accountId: 'old-account',
          localHostId: 'hbbbbbbbbbbbb',
          remoteHostId: 'haaaaaaaaaaaa',
        },
      },
    ),
  ).rejects.toMatchObject({ code: 'network-denied' });
});

it.each(['refresh', 'sign-out'])(
  'handles an expired account token with %s without changing account scope',
  async (scenario) => {
    let active = true;
    let refreshed = 0;
    let calls = 0;
    const network = createConnectBotNetwork({
      session: async () => ({
        relay: 'https://relay.test',
        accountId: 'account',
        localId: 'haaaaaaaaaaaa',
        relayKey: 'private',
        accessToken: 'expired',
        current: () => active,
        refresh: async () => {
          refreshed++;
          if (scenario === 'sign-out') active = false;
          return 'fresh';
        },
      }),
      fetch: async (_url, init) => {
        calls++;
        if (new Headers(init?.headers).get('authorization') === 'Bearer expired')
          return new Response(null, { status: 401 });
        return Response.json({
          hosts: [
            {
              id: 'haaaaaaaaaaaa',
              hostname: 'local.example.test',
              botNetwork: { hostId: 'local', publicKey: 'a'.repeat(64) },
            },
          ],
        });
      },
    });
    if (scenario === 'refresh') await expect(network.peers()).resolves.toEqual([]);
    else await expect(network.peers()).rejects.toMatchObject({ code: 'network-denied' });
    expect(refreshed).toBe(1);
    expect(calls).toBe(scenario === 'refresh' ? 2 : 1);
  },
);
