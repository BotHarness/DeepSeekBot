import { createServer } from 'node:http';
import { expect, it } from 'vitest';
import { createConnectBotBridge } from '../src/devices/bot-connect-bridge.js';
import { noisePublicKey } from '../src/devices/noise/xk.js';
import type {
  createConnectBotNetwork,
  AuthenticatedConnectBotPeer,
} from '../src/devices/connect-bot-network.js';

it.each(['new', 'legacy', 'rebound'])(
  'discovers and delivers a DM with a %s relationship through the limited Connect bridge',
  async (relationship) => {
    const keys = [new Uint8Array(32).fill(31), new Uint8Array(32).fill(32)];
    const peers: AuthenticatedConnectBotPeer[] = keys.map((key, index) => ({
      id: index === 0 ? 'haaaaaaaaaaaa' : 'hbbbbbbbbbbbb',
      hostname: `host-${index}.example.test`,
      hostId: `host-${index}`,
      publicKey: Buffer.from(noisePublicKey(key)).toString('hex'),
      membership: {
        kind: 'connect',
        accountId: 'account',
        localHostId: index === 0 ? 'hbbbbbbbbbbbb' : 'haaaaaaaaaaaa',
        remoteHostId: index === 0 ? 'haaaaaaaaaaaa' : 'hbbbbbbbbbbbb',
      },
    }));
    let membership: 'member' | 'withdrawn' = 'member';
    let rebound = false;
    let connectRecorded = false;
    let connected = true;
    let recipientActive = true;
    let holdResponse = false;
    let responseHeld!: () => void;
    let releaseResponse!: () => void;
    const heldResponse = new Promise<void>((resolve) => {
      responseHeld = resolve;
    });
    const responseReleased = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    const withdrawals: string[] = [];
    const accounts: ReturnType<typeof createConnectBotNetwork>[] = peers.map((own, index) => ({
      membership: async () => membership,
      register: async () => {
        if (!connected) throw new Error('signed-out');
        return own;
      },
      peers: async () =>
        membership === 'member'
          ? [
              {
                ...peers[1 - index]!,
                membership: {
                  ...peers[1 - index]!.membership,
                  ...(rebound ? { localHostId: 'hcccccccccccc' } : {}),
                },
              },
            ]
          : [],
      grant: async () => ({ payload: own.hostId, signature: 'a'.repeat(43) }),
      verify: async (_own, grant) => {
        expect(grant.payload).toBe(peers[1 - index]!.hostId);
        return peers[1 - index]!;
      },
    }));
    const contacts = peers.map((peer, index) => ({
      hostId: peer.hostId,
      botSlug: index === 0 ? 'triage' : 'ios',
      displayName: index === 0 ? 'Triage' : 'iOS developer',
      description: 'Development',
      device: { model: null, platform: 'test' },
      capabilities: [],
    }));
    const delivered: unknown[] = [];
    const lifecycle: string[] = [];
    const diagnostics: { phase: string; durationMs: number; code?: string }[] = [];
    const receiver = createConnectBotBridge({
      record: (event) => diagnostics.push(event),
      hostId: peers[1]!.hostId,
      key: async () => keys[1]!.slice(),
      account: accounts[1]!,
      directory: () => (recipientActive ? [contacts[1]!] : []),
      knownKey: () => (relationship === 'new' ? undefined : peers[0]!.publicKey),
      knownMemberships: () =>
        relationship === 'rebound'
          ? [
              {
                hostId: peers[0]!.hostId,
                membership: { ...peers[0]!.membership, localHostId: 'holdregistration' },
              },
            ]
          : [],
      unbound: async () => {
        lifecycle.push('unbound');
      },
      withdrawn: async () => {
        lifecycle.push('withdrawn');
      },
      receive: async (sender, message) => {
        lifecycle.push('accepted');
        delivered.push({ sender, message });
      },
    });
    const server = createServer((req, res) => void receiver.handle(req, res));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test-server');
    const sender = createConnectBotBridge({
      record: (event) => diagnostics.push(event),
      hostId: peers[0]!.hostId,
      key: async () => keys[0]!.slice(),
      account: accounts[0]!,
      directory: () => [contacts[0]!],
      knownMemberships: () => [
        {
          hostId: peers[1]!.hostId,
          membership: connectRecorded
            ? peers[1]!.membership
            : { kind: 'tailnet', localNodeId: 'local-node', remoteNodeId: 'remote-node' },
        },
      ],
      withdrawn: async (hostId) => {
        withdrawals.push(hostId);
      },
      receive: async () => {
        throw new Error('unexpected-receive');
      },
      fetch: async (url, init) => {
        const path = new URL(String(url)).pathname;
        const response = await fetch(`http://127.0.0.1:${address.port}${path}`, init);
        if (holdResponse && path.endsWith('/request')) {
          holdResponse = false;
          responseHeld();
          await responseReleased;
        }
        return response;
      },
    });
    const message = {
      id: 'connect-dm-one',
      at: new Date().toISOString(),
      senderBotSlug: 'triage',
      recipientBotSlug: 'ios',
      body: 'Investigate iOS bug',
      causation: { rootSourceEventId: 'root', parentSourceEventId: 'parent', hop: 1 },
    };
    try {
      await sender.refresh();
      await expect(sender.membership(peers[1]!.hostId)).resolves.toBe('member');
      connectRecorded = true;
      expect(sender.contacts()).toEqual([
        { ...contacts[1], hostKey: peers[1]!.publicKey, membership: peers[1]!.membership },
      ]);
      holdResponse = true;
      const olderRefresh = sender.refresh();
      await heldResponse;
      contacts[1]!.displayName = 'Updated iOS developer';
      const freshRefresh = sender.refresh();
      try {
        await expect
          .poll(() => sender.contacts()[0]?.displayName, { timeout: 1000 })
          .toBe('Updated iOS developer');
      } finally {
        releaseResponse();
        await Promise.all([olderRefresh, freshRefresh]);
      }
      expect(sender.contacts()[0]?.displayName).toBe('Updated iOS developer');
      await sender.send(peers[1]!.hostId, message);
      expect(delivered).toEqual([
        {
          sender: {
            ...contacts[0],
            hostKey: peers[0]!.publicKey,
            membership: peers[0]!.membership,
          },
          message,
        },
      ]);
      expect(lifecycle).toEqual(
        relationship === 'new'
          ? ['accepted']
          : [relationship === 'legacy' ? 'unbound' : 'withdrawn', 'accepted'],
      );
      expect(sender.availability(peers[1]!.hostId, 'ios')).toBe('available');
      recipientActive = false;
      await expect(
        sender.send(peers[1]!.hostId, { ...message, id: 'paused-recipient' }),
      ).rejects.toMatchObject({ code: 'network-denied' });
      expect(delivered).toHaveLength(1);
      expect(diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ phase: 'connect-send-accepted' }),
          expect.objectContaining({ phase: 'connect-send-refused', code: 'network-denied' }),
          expect.objectContaining({ phase: 'connect-receive-refused', code: 'network-denied' }),
        ]),
      );
      recipientActive = true;
      rebound = true;
      await expect(
        sender.send(peers[1]!.hostId, { ...message, id: 'stale-contact' }),
      ).rejects.toMatchObject({ code: 'network-denied' });
      expect(delivered).toHaveLength(1);
      rebound = false;
      receiver.close();
      diagnostics.length = 0;
      await sender.refresh();
      expect(diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ phase: 'connect-discovery-refused', code: 'network-denied' }),
          expect.objectContaining({ phase: 'connect-refresh-refused' }),
        ]),
      );
      expect(diagnostics.some((event) => event.phase === 'connect-refreshed')).toBe(false);
      expect(JSON.stringify(diagnostics)).not.toContain(message.body);
      membership = 'withdrawn';
      await sender.refresh();
      expect(sender.contacts()).toEqual([]);
      expect(withdrawals).toEqual([peers[1]!.hostId]);
      await expect(sender.membership(peers[1]!.hostId)).resolves.toBe('withdrawn');
      connected = false;
      await expect(sender.refresh()).resolves.toBeUndefined();
      expect(sender.contacts()).toEqual([]);
    } finally {
      sender.close();
      receiver.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);
