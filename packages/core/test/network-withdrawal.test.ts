import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createBotNetworkRoutes } from '../src/devices/bot-network-routes.js';
import { createTailnetBotBridge } from '../src/devices/bot-tailnet-bridge.js';
import { createConnectBotBridge } from '../src/devices/bot-connect-bridge.js';
import { noisePublicKey } from '../src/devices/noise/xk.js';
import type { AuthenticatedConnectBotPeer } from '../src/devices/connect-bot-network.js';
import type { TailnetChange } from '../src/devices/bot-tailnet-watch.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { receiveNetworkBotDm } from '../src/runtime/bot-network.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot } from './helpers.js';
import { loopbackAliasesAvailable } from './loopback-aliases.js';

const aliases = await loopbackAliasesAvailable(['127.0.0.12', '127.0.0.13']);

it.skipIf(!aliases).each(['pending', 'started', 'alternate-network', 'connect-route'] as const)(
  'carries a native removal through the real bridge and Inbox for %s work',
  async (phase) => {
    const nodes = [
      { nodeId: 'left', address: '127.0.0.12' },
      { nodeId: 'right', address: '127.0.0.13' },
    ];
    const cores: Array<ReturnType<typeof createCore>> = [];
    const bridges: Array<ReturnType<typeof createTailnetBotBridge>> = [];
    const connectBridges: Array<ReturnType<typeof createConnectBotBridge>> = [];
    const connectServers: ReturnType<typeof createServer>[] = [];
    const connectPorts: number[] = [];
    const keys = nodes.map(() => randomBytes(32));
    const networks = nodes.map((_, index) =>
      createBotNetworkRoutes({
        withdrawn: (host) => cores[index]!.runtime.withdrawNetworkMembership(host),
      }),
    );
    if (phase === 'alternate-network')
      for (const network of networks)
        network.attach({
          contacts: () => [],
          membership: async () => 'member',
          async send() {
            throw new Error('This test only qualifies membership, not Connect transport');
          },
        });
    const homes = nodes.map(() => createTempRoot('network-withdrawal-'));
    const notifications: Array<(change: TailnetChange) => void> = [];
    let eligible = true;
    let entered = 0;
    let finished = false;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const failures: unknown[] = [];
    const inbound = () =>
      attachOperationalModule(cores[1]!.operationalDatabase, 'withdrawal-test').read((db) =>
        db
          .prepare(
            "SELECT a.source_event_id, a.ignored_at FROM inbox_admissions a JOIN source_events e USING(source_event_id) WHERE e.body = 'REMOTE_WORK' AND a.bot_slug = 'bot'",
          )
          .get(),
      );
    const open = (index: number) => {
      const adapter = createDshBotAgentAdapter({
        agents: new FakeAgentHost({ kind: 'completed' }),
        orchestratorCwd: () => '/memory',
        ensureWorkspace: () => undefined,
        defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      });
      adapter.runOrchestrator = async () => {
        if (index !== 1) return;
        entered++;
        await held;
        if (phase === 'started') {
          try {
            const source = inbound();
            if (typeof source?.source_event_id !== 'string')
              throw new Error('Missing inbound source');
            await expect(
              cores[1]!.runtime.runDirectBotTool!(
                'bot',
                'bot_send_message',
                { bot_id: 'remote:left:bot', body: 'REPLY_MUST_NOT_REPLAY' },
                new AbortController().signal,
                undefined,
                source.source_event_id,
              ),
            ).rejects.toMatchObject({
              code: expect.stringMatching(/^(network-denied|unable-to-deliver)$/u),
            });
            finished = true;
          } catch (error) {
            failures.push(error);
          }
        }
      };
      return createCore({ dshHome: homes[index]!, botNetwork: networks[index]!, agents: adapter });
    };
    try {
      for (const [index, node] of nodes.entries()) {
        const key = keys[index]!;
        const peer = nodes[1 - index]!;
        bridges.push(
          createTailnetBotBridge({
            hostId: node.nodeId,
            key: async () => Uint8Array.from(key),
            ports: [43279],
            tailnet: {
              watch(changed) {
                notifications[index] = changed;
                return async () => {};
              },
              async snapshot() {
                return { self: node, peers: eligible ? [peer] : [] };
              },
              async admit(address) {
                if (!eligible || address !== peer.address) throw new Error('tailnet-peer-denied');
                return peer;
              },
            },
            knownKey: (host) => cores[index]!.channels.remoteHostKey!(host),
            trustKey: (host, publicKey, membership) =>
              cores[index]!.channels.trustRemoteHostKey!(host, publicKey, membership),
            knownMemberships: () =>
              cores[index]!.channels.list().flatMap((channel) =>
                channel.remoteBot?.membership
                  ? [{ hostId: channel.remoteBot.hostId, membership: channel.remoteBot.membership }]
                  : [],
              ),
            withdrawn: (host) => networks[index]!.observeWithdrawal(host),
            directory: () => [
              {
                hostId: node.nodeId,
                botSlug: 'bot',
                displayName: node.nodeId,
                device: { model: null, platform: 'test' },
                capabilities: [],
              },
            ],
            receive: (sender, message) =>
              receiveNetworkBotDm(
                {
                  registry: cores[index]!.registry,
                  channels: cores[index]!.channels,
                  admitBotDmMessage: (channel, id) =>
                    cores[index]!.runtime.admitBotDmMessage(channel, id),
                },
                sender,
                message,
              ),
          }),
        );
        const bridge = bridges[index]!;
        networks[index]!.attach({ ...bridge, membership: (host) => bridge.probeMembership(host) });
        cores.push(open(index));
        cores[index]!.registry.create({ slug: 'bot', displayName: node.nodeId });
        await bridges[index]!.start();
      }
      const appendHuman = async (index: number, body: string) => {
        const core = cores[index]!;
        const dm = core.channels.getOrCreateDm('bot', nodes[index]!.nodeId)!;
        await core.channels.appendMessage(dm.id, {
          id: body,
          at: new Date().toISOString(),
          author: { kind: 'human' },
          body,
        });
        core.runtime.admitDmMessage({ channelId: dm.id, messageId: body, body });
        return core.channels.humanSendStatus!(dm.id, body)!.sourceEventId;
      };
      if (phase !== 'started') {
        await appendHuman(1, 'LOCAL_WORK');
        await expect.poll(() => entered).toBe(1);
      }
      const root = await appendHuman(0, 'ROOT');
      const contacts = await cores[0]!.runtime.runDirectBotTool!(
        'bot',
        'list_bot_contacts',
        {},
        new AbortController().signal,
      );
      expect(contacts.result).toMatchObject({ contacts: [{ botId: 'remote:right:bot' }] });
      await cores[0]!.runtime.runDirectBotTool!(
        'bot',
        'bot_send_message',
        { bot_id: 'remote:right:bot', body: 'REMOTE_WORK' },
        new AbortController().signal,
        undefined,
        root,
      );
      if (phase === 'started') await expect.poll(() => entered).toBe(1);
      expect(inbound()).toMatchObject({ ignored_at: null });
      if (phase === 'connect-route') {
        const peers: AuthenticatedConnectBotPeer[] = nodes.map((node, index) => ({
          id: `h${index === 0 ? 'a' : 'b'}`.padEnd(13, 'a'),
          hostname: `${node.nodeId}.example.test`,
          hostId: node.nodeId,
          publicKey: Buffer.from(noisePublicKey(keys[index]!)).toString('hex'),
          membership: {
            kind: 'connect',
            accountId: 'account',
            localHostId: `h${index === 0 ? 'b' : 'a'}`.padEnd(13, 'a'),
            remoteHostId: `h${index === 0 ? 'a' : 'b'}`.padEnd(13, 'a'),
          },
        }));
        for (const [index, node] of nodes.entries()) {
          const peer = peers[1 - index]!;
          const bridge = createConnectBotBridge({
            hostId: node.nodeId,
            key: async () => Uint8Array.from(keys[index]!),
            account: {
              register: async () => peers[index]!,
              peers: async () => [peer],
              membership: async (host, scope, key) =>
                host === peer.hostId &&
                scope.accountId === peer.membership.accountId &&
                scope.localHostId === peer.membership.localHostId &&
                scope.remoteHostId === peer.membership.remoteHostId &&
                key === peer.publicKey
                  ? 'member'
                  : 'withdrawn',
              grant: async () => ({ payload: node.nodeId, signature: 'a'.repeat(43) }),
              verify: async (_own, grant) => {
                expect(grant.payload).toBe(peer.hostId);
                return peer;
              },
            },
            knownKey: (host) => cores[index]!.channels.remoteHostKey!(host),
            knownMemberships: () =>
              cores[index]!.channels.list().flatMap((channel) =>
                channel.remoteBot?.membership
                  ? [{ hostId: channel.remoteBot.hostId, membership: channel.remoteBot.membership }]
                  : [],
              ),
            withdrawn: (host) => networks[index]!.observeWithdrawal(host),
            directory: () => [
              {
                hostId: node.nodeId,
                botSlug: 'bot',
                displayName: node.nodeId,
                device: { model: null, platform: 'test' },
                capabilities: [],
              },
            ],
            receive: async () => {
              throw new Error('No Connect DM should establish membership in this test');
            },
            fetch: (url, init) =>
              fetch(
                `http://127.0.0.1:${connectPorts[1 - index]}${new URL(String(url)).pathname}`,
                init,
              ),
          });
          connectBridges.push(bridge);
          networks[index]!.attach(bridge);
          const server = createServer((req, res) => void bridge.handle(req, res));
          connectServers.push(server);
          await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
          const address = server.address();
          if (!address || typeof address === 'string') throw new Error('test-server');
          connectPorts.push(address.port);
        }
        await Promise.all(connectBridges.map((bridge) => bridge.refresh()));
        for (const [index, bridge] of connectBridges.entries()) {
          expect(bridge.contacts()).toHaveLength(1);
          expect(await bridge.membership(nodes[1 - index]!.nodeId)).toBe('member');
          expect(
            cores[index]!.channels.list().find((channel) => channel.remoteBot)!.remoteBot!
              .membership,
          ).toMatchObject({ kind: 'tailnet' });
        }
      }
      eligible = false;
      notifications[1]!({ removedNodeIds: ['left'] });
      notifications[0]!({ removedNodeIds: ['right'] });
      if (phase === 'pending')
        await expect.poll(() => inbound()?.ignored_at).toEqual(expect.any(String));
      else if (phase === 'started') expect(await bridges[1]!.membership!('left')).toBe('withdrawn');
      else {
        await networks[1]!.observeWithdrawal('left');
        expect(await networks[1]!.membership!('left')).toBe('member');
        expect(inbound()).toMatchObject({ ignored_at: null });
      }
      release();
      await cores[1]!.runtime.whenIdle();
      expect(failures).toEqual([]);
      expect(entered).toBe(phase === 'alternate-network' || phase === 'connect-route' ? 2 : 1);
      expect(finished).toBe(phase === 'started');
      eligible = true;
      await Promise.all(bridges.map((bridge) => bridge.discover()));
      const remote = cores[1]!.channels.list().find((channel) => channel.remoteBot)!;
      const messages = cores[1]!.channels.readMessages(remote.id);
      expect(messages.map((message) => message.body)).toEqual(['REMOTE_WORK']);
      await cores[1]!.runtime.close();
      cores[1]!.operationalDatabase.close();
      cores[1] = open(1);
      cores[1]!.runtime.admitBotDmMessage(remote.id, messages[0]!.id);
      await cores[1]!.runtime.whenIdle();
      expect(entered).toBe(phase === 'alternate-network' || phase === 'connect-route' ? 2 : 1);
      for (const core of cores) {
        const channel = core.channels.list().find((item) => item.remoteBot)!;
        expect(core.channels.readMessages(channel.id).map((message) => message.body)).toEqual([
          'REMOTE_WORK',
        ]);
      }
    } finally {
      release();
      for (const bridge of connectBridges) bridge.close();
      for (const server of connectServers) {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      for (const bridge of bridges) await bridge.close();
      for (const core of cores) {
        await core.runtime.close();
        core.operationalDatabase.close();
      }
    }
  },
  120_000,
);
