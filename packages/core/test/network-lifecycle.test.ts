import { randomBytes } from 'node:crypto';
import { expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createTailnetBotBridge } from '../src/devices/bot-tailnet-bridge.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { receiveNetworkBotDm } from '../src/runtime/bot-network.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot } from './helpers.js';

it('uses public tools over real bridges for replacement colleagues and an explicitly chosen third Host', async () => {
  const nodes = [
    { nodeId: 'a', address: '127.0.0.5' },
    { nodeId: 'b', address: '127.0.0.6' },
    { nodeId: 'c', address: '127.0.0.7' },
  ];
  const cores: Array<ReturnType<typeof createCore>> = [];
  const bridges: Array<ReturnType<typeof createTailnetBotBridge>> = [];
  const adjacent = (index: number) => nodes.filter((_, other) => Math.abs(index - other) === 1);
  try {
    for (const [index, node] of nodes.entries()) {
      const key = randomBytes(32);
      const bridge = createTailnetBotBridge({
        hostId: node.nodeId,
        key: async () => Uint8Array.from(key),
        ports: [43275],
        tailnet: {
          async snapshot() {
            return { self: node, peers: adjacent(index) };
          },
          async admit(address) {
            const peer = adjacent(index).find((candidate) => candidate.address === address);
            if (!peer) throw new Error('tailnet-peer-denied');
            return peer;
          },
        },
        knownKey: (host) => cores[index]!.channels.remoteHostKey!(host),
        trustKey: (host, key, membership) =>
          cores[index]!.channels.trustRemoteHostKey!(host, key, membership),
        knownMemberships: () =>
          cores[index]!.channels.list().flatMap((channel) =>
            channel.remoteBot?.membership
              ? [{ hostId: channel.remoteBot.hostId, membership: channel.remoteBot.membership }]
              : [],
          ),
        withdrawn: (host) => cores[index]!.runtime.withdrawNetworkMembership(host),
        directory: () =>
          cores[index]!.registry.list()
            .filter((bot) => !bot.paused)
            .map((bot) => ({
              hostId: node.nodeId,
              botSlug: bot.slug,
              displayName: bot.displayName,
              ...(bot.description === undefined ? {} : { description: bot.description }),
              device: { model: null, platform: 'test' },
              capabilities: [],
            })),
        async receive(sender, message) {
          const core = cores[index]!;
          await receiveNetworkBotDm(
            {
              registry: core.registry,
              channels: core.channels,
              admitBotDmMessage: (channel, id) => core.runtime.admitBotDmMessage(channel, id),
            },
            sender,
            message,
          );
        },
      });
      bridges.push(bridge);
      cores.push(
        createCore({
          dshHome: createTempRoot('network-lifecycle-'),
          botNetwork: bridge,
          agents: createDshBotAgentAdapter({
            agents: new FakeAgentHost({ kind: 'completed' }),
            orchestratorCwd: () => '/memory',
            ensureWorkspace: () => undefined,
            defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
          }),
        }),
      );
      cores[index]!.registry.create({ slug: 'bot', displayName: 'Colleague' });
      await bridge.start();
    }
    const [a, b, c] = cores;
    const query = (index: number, slug = 'bot') =>
      cores[index]!.runtime.runDirectBotTool!(
        slug,
        'list_bot_contacts',
        {},
        new AbortController().signal,
      );
    const send = (index: number, source: string, botId: string, body: string) =>
      cores[index]!.runtime.runDirectBotTool!(
        'bot',
        'bot_send_message',
        { bot_id: botId, body },
        new AbortController().signal,
        undefined,
        source,
      );
    const inbound = (index: number, body: string) => {
      const core = cores[index]!;
      const row = attachOperationalModule(core.operationalDatabase, 'test-network-lifecycle').read(
        (db) => db.prepare('SELECT source_event_id FROM source_events WHERE body = ?').get(body),
      ) as { source_event_id: string } | undefined;
      expect(row).toBeDefined();
      return row!.source_event_id;
    };
    const dm = a!.channels.getOrCreateDm('bot', 'Colleague')!;
    await a!.channels.appendMessage(dm.id, {
      id: 'root',
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'Start collaboration',
    });
    const root = a!.channels.humanSendStatus!(dm.id, 'root')!.sourceEventId;
    expect((await query(0)).result).toMatchObject({ contacts: [{ botId: 'remote:b:bot' }] });
    await send(0, root, 'remote:b:bot', 'Investigate');
    const originalChannel = a!.channels.list().find((channel) => channel.remoteBot)!;

    b!.registry.setPaused('bot', true);
    await expect(send(0, root, 'remote:b:bot', 'Stale archived contact')).rejects.toMatchObject({
      code: 'network-denied',
    });
    expect((await query(0)).result).toMatchObject({ contacts: [] });
    b!.registry.setPaused('bot', false);
    await query(0);
    await b!.deletions.confirm('bot', b!.deletions.preview('bot').token, false);
    await expect(send(0, root, 'remote:b:bot', 'Stale deleted contact')).rejects.toMatchObject({
      code: 'network-denied',
    });
    b!.registry.create({
      slug: 'replacement',
      displayName: 'Colleague',
      description: 'New iOS specialist',
    });
    expect((await query(0)).result).toMatchObject({
      contacts: [{ botId: 'remote:b:replacement', description: 'New iOS specialist' }],
    });
    await send(0, root, 'remote:b:replacement', 'New identity');
    const replacement = a!.channels
      .list()
      .find((channel) => channel.remoteBot?.botSlug === 'replacement')!;
    expect(replacement.id).not.toBe(originalChannel.id);
    expect(a!.channels.readMessages(originalChannel.id).map((message) => message.body)).toEqual([
      'Investigate',
    ]);
    expect(a!.channels.readMessages(replacement.id).map((message) => message.body)).toEqual([
      'New identity',
    ]);

    expect((await query(1, 'replacement')).result).toMatchObject({
      contacts: expect.arrayContaining([expect.objectContaining({ botId: 'remote:c:bot' })]),
    });
    const secondSource = inbound(1, 'New identity');
    await b!.runtime.runDirectBotTool!(
      'replacement',
      'bot_send_message',
      {
        bot_id: 'remote:c:bot',
        body: 'Ask third colleague',
      },
      new AbortController().signal,
      undefined,
      secondSource,
    );
    const thirdChannel = c!.channels.list().find((channel) => channel.remoteBot)!;
    expect(c!.channels.readMessages(thirdChannel.id)[0]?.botCausation).toEqual({
      rootSourceEventId: root,
      parentSourceEventId: secondSource,
      hop: 2,
    });
    await query(2);
    let previousBody = 'Ask third colleague';
    for (let hop = 3; hop <= 33; hop++) {
      const from = hop % 2 === 1 ? 2 : 1;
      const to = from === 2 ? 1 : 2;
      const source = inbound(from, previousBody);
      const body = `Cycle hop ${hop}`;
      await cores[from]!.runtime.runDirectBotTool!(
        from === 2 ? 'bot' : 'replacement',
        'bot_send_message',
        { bot_id: to === 1 ? 'remote:b:replacement' : 'remote:c:bot', body },
        new AbortController().signal,
        undefined,
        source,
      );
      const channel = cores[to]!.channels.list().find(
        (item) =>
          item.remoteBot?.hostId === nodes[from]!.nodeId &&
          item.members.includes(to === 1 ? 'replacement' : 'bot'),
      )!;
      const message = cores[to]!.channels.readMessages(channel.id).find(
        (item) => item.body === body,
      )!;
      expect(message.botCausation).toEqual({
        rootSourceEventId: root,
        parentSourceEventId: source,
        hop,
      });
      if (hop === 33) expect(message.deliveries).toBeUndefined();
      else
        expect(message.deliveries).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ botSlug: to === 1 ? 'replacement' : 'bot' }),
          ]),
        );
      previousBody = body;
    }
    await expect(send(0, root, 'remote:c:bot', 'Do not transitively enroll')).rejects.toMatchObject(
      { code: 'unable-to-deliver' },
    );
    expect(a!.channels.list().some((channel) => channel.remoteBot?.hostId === 'c')).toBe(false);
  } finally {
    for (const bridge of bridges) await bridge.close();
    for (const core of cores) {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  }
}, 120_000);
