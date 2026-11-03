import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createBotNetworkRoutes } from '../src/devices/bot-network-routes.js';
import { createTailnetBotBridge } from '../src/devices/bot-tailnet-bridge.js';
import { createConnectBotBridge } from '../src/devices/bot-connect-bridge.js';
import { noisePublicKey } from '../src/devices/noise/xk.js';
import type { AuthenticatedConnectBotPeer } from '../src/devices/connect-bot-network.js';
import { receiveNetworkBotDm } from '../src/runtime/bot-network.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot } from './helpers.js';
import { loopbackAliasesAvailable } from './loopback-aliases.js';

const aliases = await loopbackAliasesAvailable(['127.0.0.31', '127.0.0.32']);

async function dualRouteHosts(saved?: { homes: string[]; keys: Buffer[] }) {
  const nodes = [
    { nodeId: 'left', address: '127.0.0.31' },
    { nodeId: 'right', address: '127.0.0.32' },
  ];
  const keys = saved?.keys ?? nodes.map(() => randomBytes(32));
  const homes = saved?.homes ?? nodes.map(() => createTempRoot('dual-route-'));
  const cores: Array<ReturnType<typeof createCore>> = [];
  const tails: Array<ReturnType<typeof createTailnetBotBridge>> = [];
  const connects: Array<ReturnType<typeof createConnectBotBridge>> = [];
  const servers: ReturnType<typeof createServer>[] = [];
  const ports: number[] = [];
  const delivered: string[] = [];
  const deviceModels: Array<string | null> = [null, null];
  let tailnetOnline = true;
  let connectOnline = true;
  let tailnetEligible = true;
  let connectEligible = true;
  let dropConnectAcknowledgement = false;
  let committedWithoutAcknowledgement = false;
  const networks = nodes.map((_, index) =>
    createBotNetworkRoutes({
      withdrawn: (host) => cores[index]!.runtime.withdrawNetworkMembership(host),
    }),
  );
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
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    for (const bridge of connects) bridge.close();
    for (const server of servers) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    for (const bridge of tails) await bridge.close();
    for (const core of cores) {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  };
  try {
    for (const [index, node] of nodes.entries()) {
      const agents = createDshBotAgentAdapter({
        agents: new FakeAgentHost({ kind: 'completed' }),
        orchestratorCwd: () => '/memory',
        ensureWorkspace: () => undefined,
        defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      });
      const core = createCore({
        dshHome: homes[index]!,
        botNetwork: networks[index]!,
        agents,
      });
      cores.push(core);
      if (!core.registry.get('bot'))
        core.registry.create({ slug: 'bot', displayName: 'Developer' });
      const common = {
        hostId: node.nodeId,
        key: async () => Uint8Array.from(keys[index]!),
        knownKey: (host: string) => core.channels.remoteHostKey!(host),
        trustKey: core.channels.trustRemoteHostKey!.bind(core.channels),
        knownMemberships: () =>
          core.channels
            .list()
            .flatMap((channel) =>
              channel.remoteBot?.membership
                ? [{ hostId: channel.remoteBot.hostId, membership: channel.remoteBot.membership }]
                : [],
            ),
        withdrawn: (host: string) => networks[index]!.observeWithdrawal(host),
        directory: () =>
          core.registry
            .list()
            .filter((bot) => !bot.paused)
            .map((bot) => ({
              hostId: node.nodeId,
              botSlug: bot.slug,
              displayName: bot.displayName,
              ...(bot.description === undefined ? {} : { description: bot.description }),
              device: { model: deviceModels[index]!, platform: 'test' },
              capabilities: [],
            })),
      };
      const receive =
        (route: string): Parameters<typeof createConnectBotBridge>[0]['receive'] =>
        async (sender, message) => {
          await receiveNetworkBotDm(
            {
              registry: core.registry,
              channels: core.channels,
              admitBotDmMessage: (channel, id) => core.runtime.admitBotDmMessage(channel, id),
            },
            sender,
            message,
          );
          delivered.push(`${route}:${message.body}`);
          if (route === 'connect' && dropConnectAcknowledgement) {
            dropConnectAcknowledgement = false;
            committedWithoutAcknowledgement = true;
          }
        };
      const peer = nodes[1 - index]!;
      const tail = createTailnetBotBridge({
        ...common,
        ports: [43287],
        tailnet: {
          snapshot: async () => ({
            self: node,
            peers: tailnetEligible && tailnetOnline ? [peer] : [],
            offlinePeers: tailnetEligible && !tailnetOnline ? [peer] : [],
          }),
          admit: async (address) => {
            if (!tailnetEligible || !tailnetOnline || address !== peer.address)
              throw new Error('tailnet-peer-denied');
            return peer;
          },
        },
        receive: receive('tailnet'),
      });
      tails.push(tail);
      networks[index]!.attach({ ...tail, membership: tail.probeMembership });
      const accountPeer = peers[1 - index]!;
      const connect = createConnectBotBridge({
        ...common,
        account: {
          register: async () => peers[index]!,
          peers: async () => (connectEligible ? [accountPeer] : []),
          membership: async (host, scope, key) =>
            connectEligible &&
            host === accountPeer.hostId &&
            key === accountPeer.publicKey &&
            scope.accountId === accountPeer.membership.accountId &&
            scope.localHostId === accountPeer.membership.localHostId &&
            scope.remoteHostId === accountPeer.membership.remoteHostId
              ? 'member'
              : 'withdrawn',
          grant: async () => ({ payload: node.nodeId, signature: 'a'.repeat(43) }),
          verify: async (_own, grant) => {
            if (!connectEligible) throw new Error('Test Connect membership withdrawn');
            expect(grant.payload).toBe(accountPeer.hostId);
            return accountPeer;
          },
        },
        receive: receive('connect'),
        fetch: async (url, init) => {
          if (!connectOnline) throw new Error('Test Connect transport is offline');
          const response = await fetch(
            `http://127.0.0.1:${ports[1 - index]}${new URL(String(url)).pathname}`,
            init,
          );
          if (index === 0 && committedWithoutAcknowledgement) {
            committedWithoutAcknowledgement = false;
            await response.arrayBuffer();
            tailnetOnline = true;
            await Promise.all(tails.map((tail) => tail.refresh!()));
            throw new Error('Test dropped the committed message acknowledgement');
          }
          return response;
        },
      });
      connects.push(connect);
      networks[index]!.attach(connect);
      const server = createServer((req, res) => void connect.handle(req, res));
      servers.push(server);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing test listener');
      ports.push(address.port);
    }
    await Promise.all(tails.map((tail) => tail.start()));
    await Promise.all(networks.map((network) => network.refresh!()));
    return {
      cores,
      saved: { homes, keys },
      delivered,
      close,
      loseNextConnectAcknowledgement() {
        dropConnectAcknowledgement = true;
      },
      setTailnetOnline(value: boolean) {
        tailnetOnline = value;
      },
      setConnectOnline(value: boolean) {
        connectOnline = value;
      },
      withdrawTailnet() {
        tailnetEligible = false;
      },
      withdrawConnect() {
        connectEligible = false;
      },
      setDeviceModel(index: number, model: string) {
        deviceModels[index] = model;
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}

async function explicitSender(core: ReturnType<typeof createCore>, rootId = 'root') {
  const human = core.channels.getOrCreateDm('bot', 'Developer')!;
  await core.channels.appendMessage(human.id, {
    id: rootId,
    at: new Date().toISOString(),
    author: { kind: 'human' },
    body: 'Collaborate',
  });
  core.runtime.admitDmMessage({ channelId: human.id, messageId: rootId, body: 'Collaborate' });
  const source = core.channels.humanSendStatus!(human.id, rootId)!.sourceEventId;
  return (body: string) =>
    core.runtime.runDirectBotTool!(
      'bot',
      'bot_send_message',
      { bot_id: 'remote:right:bot', body },
      new AbortController().signal,
      undefined,
      source,
    );
}

it.skipIf(!aliases)(
  'keeps one DM when a new explicit send follows loss of the previously selected route',
  async () => {
    const f = await dualRouteHosts();
    try {
      const left = f.cores[0]!;
      const contacts = await left.runtime.runDirectBotTool!(
        'bot',
        'list_bot_contacts',
        {},
        new AbortController().signal,
      );
      expect(contacts.result).toMatchObject({ contacts: [{ botId: 'remote:right:bot' }] });
      const send = await explicitSender(left);
      await expect(send('FIRST')).resolves.toBeDefined();
      const channel = left.channels.list().find((item) => item.remoteBot)!;
      expect(f.delivered).toEqual(['tailnet:FIRST']);
      f.setTailnetOnline(false);
      await expect(send('SECOND')).resolves.toBeDefined();
      expect(f.delivered).toEqual(['tailnet:FIRST', 'connect:SECOND']);
      expect(
        left.channels
          .list()
          .filter((item) => item.remoteBot)
          .map((item) => item.id),
      ).toEqual([channel.id]);
      expect(left.channels.readMessages(channel.id).map((message) => message.body)).toEqual([
        'SECOND',
        'FIRST',
      ]);
      const remote = f.cores[1]!.channels.list().find((item) => item.remoteBot)!;
      expect(f.cores[1]!.channels.readMessages(remote.id).map((message) => message.body)).toEqual([
        'SECOND',
        'FIRST',
      ]);
    } finally {
      await f.close();
    }
  },
  120_000,
);

it.skipIf(!aliases)(
  'does not resend a committed unknown delivery on the other live route, but accepts a later explicit message in the same DM',
  async () => {
    const f = await dualRouteHosts();
    try {
      const left = f.cores[0]!;
      f.setTailnetOnline(false);
      const send = await explicitSender(left);
      await expect(send('FIRST')).resolves.toBeDefined();
      const channel = left.channels.list().find((item) => item.remoteBot)!;
      expect(f.delivered).toEqual(['connect:FIRST']);
      f.loseNextConnectAcknowledgement();
      await expect(send('UNKNOWN')).rejects.toMatchObject({ code: 'delivery-unknown' });
      expect(left.runtime.networkBotAvailability!('right', 'bot')).toBe('available');
      expect(f.delivered).toEqual(['connect:FIRST', 'connect:UNKNOWN']);
      await expect(send('LATER')).resolves.toBeDefined();
      expect(f.delivered).toEqual(['connect:FIRST', 'connect:UNKNOWN', 'tailnet:LATER']);
      expect(
        left.channels
          .list()
          .filter((item) => item.remoteBot)
          .map((item) => item.id),
      ).toEqual([channel.id]);
      expect(left.channels.readMessages(channel.id).map((message) => message.body)).toEqual([
        'LATER',
        'FIRST',
      ]);
      const remote = f.cores[1]!.channels.list().find((item) => item.remoteBot)!;
      expect(f.cores[1]!.channels.readMessages(remote.id).map((message) => message.body)).toEqual([
        'LATER',
        'UNKNOWN',
        'FIRST',
      ]);
    } finally {
      await f.close();
    }
  },
  120_000,
);

it.skipIf(!aliases)(
  'retains one DM across both-route failure and Host restart without delivering the failed message later',
  async () => {
    let f = await dualRouteHosts();
    try {
      const send = await explicitSender(f.cores[0]!);
      await expect(send('FIRST')).resolves.toBeDefined();
      const localId = f.cores[0]!.channels.list().find((item) => item.remoteBot)!.id;
      const remoteId = f.cores[1]!.channels.list().find((item) => item.remoteBot)!.id;
      f.setTailnetOnline(false);
      f.setConnectOnline(false);
      await expect(send('OFFLINE')).rejects.toMatchObject({ code: 'unable-to-deliver' });
      expect(f.delivered).toEqual(['tailnet:FIRST']);
      expect(f.cores[0]!.runtime.networkBotAvailability!('right', 'bot')).toBe('unavailable');
      f.setConnectOnline(true);
      await expect(send('RECOVERED')).resolves.toBeDefined();
      expect(f.delivered).toEqual(['tailnet:FIRST', 'connect:RECOVERED']);
      const saved = f.saved;
      await f.close();
      f = await dualRouteHosts(saved);
      await Promise.all(f.cores.map((core) => core.runtime.whenIdle()));
      expect(f.delivered).toEqual([]);
      expect(f.cores[0]!.channels.readMessages(localId).map((message) => message.body)).toEqual([
        'RECOVERED',
        'FIRST',
      ]);
      expect(f.cores[1]!.channels.readMessages(remoteId).map((message) => message.body)).toEqual([
        'RECOVERED',
        'FIRST',
      ]);
      const next = await explicitSender(f.cores[0]!, 'new-request');
      await expect(next('LATER')).resolves.toBeDefined();
      expect(f.delivered).toEqual(['tailnet:LATER']);
      for (const [index, id] of [localId, remoteId].entries()) {
        expect(
          f.cores[index]!.channels.list()
            .filter((item) => item.remoteBot)
            .map((item) => item.id),
        ).toEqual([id]);
        expect(f.cores[index]!.channels.readMessages(id).map((message) => message.body)).toEqual([
          'LATER',
          'RECOVERED',
          'FIRST',
        ]);
      }
    } finally {
      await f.close();
    }
  },
  120_000,
);

it.skipIf(!aliases)(
  'sends through the remaining common scope but refuses after both memberships withdraw',
  async () => {
    const f = await dualRouteHosts();
    try {
      const left = f.cores[0]!;
      const send = await explicitSender(left);
      await expect(send('FIRST')).resolves.toBeDefined();
      const channel = left.channels.list().find((item) => item.remoteBot)!;
      f.withdrawTailnet();
      await expect(send('REMAINING_SCOPE')).resolves.toBeDefined();
      expect(f.delivered).toEqual(['tailnet:FIRST', 'connect:REMAINING_SCOPE']);
      expect(left.runtime.networkBotAvailability!('right', 'bot')).toBe('available');
      f.withdrawConnect();
      await expect(send('NO_SCOPE')).rejects.toMatchObject({
        code: expect.stringMatching(/^(network-denied|unable-to-deliver)$/u),
      });
      const contacts = await left.runtime.runDirectBotTool!(
        'bot',
        'list_bot_contacts',
        {},
        new AbortController().signal,
      );
      expect(contacts.result).toMatchObject({ contacts: [] });
      expect(f.delivered).toEqual(['tailnet:FIRST', 'connect:REMAINING_SCOPE']);
      expect(left.channels.readMessages(channel.id).map((message) => message.body)).toEqual([
        'REMAINING_SCOPE',
        'FIRST',
      ]);
    } finally {
      await f.close();
    }
  },
  120_000,
);

it.skipIf(!aliases)(
  'keeps updated profile facts and a reply on the same identity across routes despite a same-name colleague',
  async () => {
    const f = await dualRouteHosts();
    try {
      const [left, right] = f.cores;
      right!.registry.create({ slug: 'twin', displayName: 'Developer' });
      right!.registry.update('bot', { description: 'Initial responsibility' });
      const query = () =>
        left!.runtime.runDirectBotTool!(
          'bot',
          'list_bot_contacts',
          {},
          new AbortController().signal,
        );
      expect((await query()).result).toMatchObject({
        contacts: [
          { botId: 'remote:right:bot', displayName: 'Developer' },
          { botId: 'remote:right:twin', displayName: 'Developer' },
        ],
      });
      const send = await explicitSender(left!);
      await send('FIRST');
      const localId = left!.channels.list().find((item) => item.remoteBot)!.id;
      const remoteId = right!.channels.list().find((item) => item.remoteBot)!.id;
      right!.registry.update('bot', { description: 'iOS development and debugging' });
      f.setDeviceModel(1, 'Test workstation');
      f.setTailnetOnline(false);
      await send('SECOND');
      expect((await query()).result).toMatchObject({
        contacts: [
          {
            botId: 'remote:right:bot',
            description: 'iOS development and debugging',
            device: { model: 'Test workstation' },
          },
          { botId: 'remote:right:twin', displayName: 'Developer' },
        ],
      });
      const accepted = right!.inboxHistory.list('bot', {
        channelId: remoteId,
        query: 'SECOND',
      }).items;
      expect(accepted).toHaveLength(1);
      await right!.runtime.runDirectBotTool!(
        'bot',
        'bot_send_message',
        { bot_id: 'remote:left:bot', body: 'REPLY' },
        new AbortController().signal,
        undefined,
        accepted[0]!.sourceEventId,
      );
      expect(f.delivered).toEqual(['tailnet:FIRST', 'connect:SECOND', 'connect:REPLY']);
      for (const [index, id] of [localId, remoteId].entries()) {
        expect(
          f.cores[index]!.channels.list()
            .filter((item) => item.remoteBot)
            .map((item) => item.id),
        ).toEqual([id]);
        expect(f.cores[index]!.channels.readMessages(id).map((message) => message.body)).toEqual([
          'REPLY',
          'SECOND',
          'FIRST',
        ]);
      }
      expect(right!.inboxHistory.list('twin').items).toEqual([]);
    } finally {
      await f.close();
    }
  },
  120_000,
);
