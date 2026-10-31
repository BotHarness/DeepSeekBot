import { randomBytes } from 'node:crypto';
import { expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createTailnetBotBridge } from '../src/devices/bot-tailnet-bridge.js';
import type { TailnetChange } from '../src/devices/bot-tailnet-watch.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { receiveNetworkBotDm } from '../src/runtime/bot-network.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot } from './helpers.js';

it.each(['pending', 'started'] as const)(
  'carries a native removal through the real bridge and Inbox for %s work',
  async (phase) => {
    const nodes = [
      { nodeId: 'left', address: '127.0.0.12' },
      { nodeId: 'right', address: '127.0.0.13' },
    ];
    const cores: Array<ReturnType<typeof createCore>> = [];
    const bridges: Array<ReturnType<typeof createTailnetBotBridge>> = [];
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
      return createCore({ dshHome: homes[index]!, botNetwork: bridges[index]!, agents: adapter });
    };
    try {
      for (const [index, node] of nodes.entries()) {
        const key = randomBytes(32);
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
            withdrawn: (host) => cores[index]!.runtime.withdrawNetworkMembership(host),
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
      if (phase === 'pending') {
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
      eligible = false;
      notifications[1]!({ removedNodeIds: ['left'] });
      notifications[0]!({ removedNodeIds: ['right'] });
      if (phase === 'pending')
        await expect.poll(() => inbound()?.ignored_at).toEqual(expect.any(String));
      else expect(await bridges[1]!.membership!('left')).toBe('withdrawn');
      release();
      await cores[1]!.runtime.whenIdle();
      expect(failures).toEqual([]);
      expect(entered).toBe(1);
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
      expect(entered).toBe(1);
      for (const core of cores) {
        const channel = core.channels.list().find((item) => item.remoteBot)!;
        expect(core.channels.readMessages(channel.id).map((message) => message.body)).toEqual([
          'REMOTE_WORK',
        ]);
      }
    } finally {
      release();
      for (const bridge of bridges) await bridge.close();
      for (const core of cores) {
        await core.runtime.close();
        core.operationalDatabase.close();
      }
    }
  },
  120_000,
);
