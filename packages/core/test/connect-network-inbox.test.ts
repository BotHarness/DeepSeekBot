import { randomBytes } from 'node:crypto';
import { expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createBotNetworkRoutes } from '../src/devices/bot-network-routes.js';
import { createConnectBotBridge } from '../src/devices/bot-connect-bridge.js';
import { createServer, type Server } from 'node:http';
import { noisePublicKey } from '../src/devices/noise/xk.js';
import type { AuthenticatedConnectBotPeer } from '../src/devices/connect-bot-network.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { receiveNetworkBotDm } from '../src/runtime/bot-network.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot } from './helpers.js';

it.each(['pending', 'started', 'alternate-network', 'lost-ack'] as const)(
  'carries Connect account removal through encrypted HTTP and the canonical Inbox for %s work',
  async (phase) => {
    const nodes = [
      { nodeId: 'left', address: '127.0.0.12' },
      { nodeId: 'right', address: '127.0.0.13' },
    ];
    const cores: Array<ReturnType<typeof createCore>> = [];
    const bridges: Array<ReturnType<typeof createConnectBotBridge>> = [];
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
            throw new Error('This alternate route qualifies shared membership only');
          },
        });
    const homes = nodes.map(() => createTempRoot('connect-inbox-'));
    const servers: Server[] = [];
    const ports: number[] = [];
    const keys = nodes.map(() => randomBytes(32));
    const peers: AuthenticatedConnectBotPeer[] = nodes.map((node, index) => ({
      id: index === 0 ? 'haaaaaaaaaaaa' : 'hbbbbbbbbbbbb',
      hostId: node.nodeId,
      hostname: `${node.nodeId}.example.test`,
      publicKey: Buffer.from(noisePublicKey(keys[index]!)).toString('hex'),
      membership: {
        kind: 'connect',
        accountId: 'test-account',
        localHostId: index === 0 ? 'hbbbbbbbbbbbb' : 'haaaaaaaaaaaa',
        remoteHostId: index === 0 ? 'haaaaaaaaaaaa' : 'hbbbbbbbbbbbb',
      },
    }));
    let eligible = true;
    let loseAck = phase === 'lost-ack';
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
          createConnectBotBridge({
            hostId: node.nodeId,
            key: async () => Uint8Array.from(key),
            account: {
              register: async () => peers[index]!,
              peers: async () => (eligible ? [peers[1 - index]!] : []),
              membership: async () => (eligible ? 'member' : 'withdrawn'),
              grant: async () => ({ payload: node.nodeId, signature: 'a'.repeat(43) }),
              verify: async (_own, grant) => {
                if (!eligible || grant.payload !== peer.nodeId)
                  throw new Error('account-peer-denied');
                return peers[1 - index]!;
              },
            },
            fetch: async (url, init) => {
              const response = await fetch(
                `http://127.0.0.1:${ports[1 - index]}${new URL(String(url)).pathname}`,
                init,
              );
              if (index === 0 && loseAck && inbound() !== undefined) {
                loseAck = false;
                await response.arrayBuffer();
                throw new Error('test-lost-ack-after-admission');
              }
              return response;
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
        networks[index]!.attach(bridge);
        cores.push(open(index));
        cores[index]!.registry.create({ slug: 'bot', displayName: node.nodeId });
        const server = createServer((req, res) => void bridge.handle(req, res));
        servers.push(server);
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('test-server');
        ports[index] = address.port;
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
      const sending = cores[0]!.runtime.runDirectBotTool!(
        'bot',
        'bot_send_message',
        { bot_id: 'remote:right:bot', body: 'REMOTE_WORK' },
        new AbortController().signal,
        undefined,
        root,
      );
      if (phase === 'lost-ack')
        await expect(sending).rejects.toMatchObject({ code: 'delivery-unknown' });
      else await sending;
      if (phase === 'started') await expect.poll(() => entered).toBe(1);
      expect(inbound()).toMatchObject({ ignored_at: null });
      eligible = false;
      await Promise.all(bridges.map((bridge) => bridge.refresh()));
      if (phase === 'pending' || phase === 'lost-ack')
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
      expect(entered).toBe(phase === 'alternate-network' ? 2 : 1);
      expect(finished).toBe(phase === 'started');
      eligible = true;
      await Promise.all(bridges.map((bridge) => bridge.refresh()));
      const remote = cores[1]!.channels.list().find((channel) => channel.remoteBot)!;
      const messages = cores[1]!.channels.readMessages(remote.id);
      expect(messages.map((message) => message.body)).toEqual(['REMOTE_WORK']);
      await cores[1]!.runtime.close();
      cores[1]!.operationalDatabase.close();
      cores[1] = open(1);
      cores[1]!.runtime.admitBotDmMessage(remote.id, messages[0]!.id);
      await cores[1]!.runtime.whenIdle();
      expect(entered).toBe(phase === 'alternate-network' ? 2 : 1);
      for (const [index, core] of cores.entries()) {
        const channel = core.channels.list().find((item) => item.remoteBot)!;
        expect(core.channels.readMessages(channel.id).map((message) => message.body)).toEqual(
          phase === 'lost-ack' && index === 0 ? [] : ['REMOTE_WORK'],
        );
      }
    } finally {
      release();
      for (const bridge of bridges) bridge.close();
      for (const server of servers) {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      for (const core of cores) {
        await core.runtime.close();
        core.operationalDatabase.close();
      }
    }
  },
  120_000,
);
