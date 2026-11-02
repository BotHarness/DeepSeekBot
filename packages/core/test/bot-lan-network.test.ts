import { randomBytes } from 'node:crypto';
import { expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createLanBotMembership } from '../src/devices/bot-lan-membership.js';
import { createLanBotBridge } from '../src/devices/bot-lan-bridge.js';
import { createDeviceLan } from '../src/devices/lan.js';
import { createBotNetworkRoutes } from '../src/devices/bot-network-routes.js';
import { noisePublicKey } from '../src/devices/noise/xk.js';
import { receiveNetworkBotDm } from '../src/runtime/bot-network.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot } from './helpers.js';

it('requires bilateral Host admission before encrypted contacts and a DM reach the existing Inbox', async () => {
  const keys = [randomBytes(32), randomBytes(32)];
  const peers = keys.map((key, index) => ({
    hostId: index === 0 ? 'left' : 'right',
    name: index === 0 ? 'Windows' : 'Mac',
    publicKey: Buffer.from(noisePublicKey(key)).toString('hex'),
    origin: '',
  }));
  const cores: ReturnType<typeof createCore>[] = [];
  const bridges: ReturnType<typeof createLanBotBridge>[] = [];
  const admissions: ReturnType<typeof createLanBotMembership>[] = [];
  const listeners: ReturnType<typeof createDeviceLan>[] = [];
  let discoverable = true;
  const withdrawals: string[] = [];
  let rightRequests = 0;
  let holdHandshake: (() => Promise<void>) | undefined;
  try {
    for (const [index, peer] of peers.entries()) {
      const network = createBotNetworkRoutes();
      const core = createCore({
        dshHome: createTempRoot('bot-lan-inbox-'),
        botNetwork: network,
        agents: createDshBotAgentAdapter({
          agents: new FakeAgentHost({ kind: 'completed' }),
          orchestratorCwd: () => '/memory',
          ensureWorkspace: () => undefined,
          defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
        }),
      });
      cores.push(core);
      core.registry.create({ slug: 'bot', displayName: 'Developer' });
      const other = peers[1 - index]!;
      const membership = createLanBotMembership({
        database: attachOperationalModule(core.operationalDatabase, 'bot-lan'),
        candidate: (id) => (id === other.hostId ? other : undefined),
      });
      admissions.push(membership);
      const bridge = createLanBotBridge({
        hostId: peer.hostId,
        key: async () => Uint8Array.from(keys[index]!),
        peers: () => (discoverable ? [other] : []),
        admission: membership,
        knownKey: (host) => core.channels.remoteHostKey!(host),
        trustKey: core.channels.trustRemoteHostKey!.bind(core.channels),
        knownMemberships: () =>
          core.channels
            .list()
            .flatMap((channel) =>
              channel.remoteBot?.membership
                ? [{ hostId: channel.remoteBot.hostId, membership: channel.remoteBot.membership }]
                : [],
            ),
        withdrawn: async (host) => {
          withdrawals.push(`${peer.hostId}:${host}`);
          await core.runtime.withdrawNetworkMembership(host);
        },
        directory: () => [
          {
            hostId: peer.hostId,
            botSlug: 'bot',
            displayName: 'Developer',
            device: { model: null, platform: index === 0 ? 'win32' : 'darwin' },
            capabilities: [],
          },
        ],
        receive: (sender, message) =>
          receiveNetworkBotDm(
            {
              registry: core.registry,
              channels: core.channels,
              admitBotDmMessage: (channel, id) => core.runtime.admitBotDmMessage(channel, id),
            },
            sender,
            message,
          ),
      });
      bridges.push(bridge);
      network.attach(bridge);
      const listener = createDeviceLan({
        read: async () => undefined,
        write: async () => {},
        gateway: () => ({ upgrade: (_request, socket) => socket.destroy(), close: () => {} }),
        collaboration: () => ({
          start: async () => {},
          handle: async (request, response) => {
            if (index === 1) {
              rightRequests++;
              const hold = holdHandshake;
              if (hold && request.url?.endsWith('/handshake')) {
                holdHandshake = undefined;
                await hold();
              }
            }
            await bridge.handle(request, response);
          },
          close: bridge.close,
        }),
      });
      listeners.push(listener);
      const enabled = await listener.enable();
      if (!enabled.ok) throw new Error('Missing test LAN listener');
      peer.origin = `http://127.0.0.1:${enabled.status.port}`;
    }
    await bridges[0]!.refresh();
    expect(bridges[0]!.contacts()).toEqual([]);
    admissions[0]!.admit(peers[1]!);
    await bridges[0]!.refresh();
    expect(bridges[0]!.contacts()).toEqual([]);
    admissions[1]!.admit(peers[0]!);
    let markArrived = () => {};
    let release = () => {};
    const arrived = new Promise<void>((resolve) => {
      markArrived = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    holdHandshake = async () => {
      markArrived();
      await released;
    };
    const requestCount = rightRequests;
    const foreground = bridges[0]!.refresh();
    await arrived;
    const background = bridges[0]!.refresh(true);
    release();
    await Promise.all([foreground, background]);
    expect(rightRequests - requestCount).toBe(2);
    expect(bridges[0]!.contacts()).toEqual([
      expect.objectContaining({
        hostId: 'right',
        botSlug: 'bot',
        device: { model: null, platform: 'darwin' },
        membership: expect.objectContaining({ kind: 'lan' }),
      }),
    ]);
    const human = cores[0]!.channels.getOrCreateDm('bot', 'Developer')!;
    await cores[0]!.channels.appendMessage(human.id, {
      id: 'human-request',
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'Collaborate',
    });
    cores[0]!.runtime.admitDmMessage({
      channelId: human.id,
      messageId: 'human-request',
      body: 'Collaborate',
    });
    const source = cores[0]!.channels.humanSendStatus!(human.id, 'human-request')!.sourceEventId;
    await cores[0]!.runtime.runDirectBotTool!(
      'bot',
      'bot_send_message',
      { bot_id: 'remote:right:bot', body: 'Inspect the iOS bug' },
      new AbortController().signal,
      undefined,
      source,
    );
    const channel = cores[1]!.channels.list().find((item) => item.remoteBot?.hostId === 'left');
    expect(channel).toBeDefined();
    expect(cores[1]!.channels.readMessages(channel!.id).map((message) => message.body)).toEqual([
      'Inspect the iOS bug',
    ]);
    expect(
      cores[1]!.inboxHistory.list('bot', { channelId: channel!.id, query: 'Inspect the iOS bug' })
        .items,
    ).toHaveLength(1);
    const accepted = cores[1]!.inboxHistory.list('bot', { channelId: channel!.id }).items[0]!;
    expect(await bridges[0]!.membership('right')).toBe('member');
    await cores[1]!.runtime.runDirectBotTool!(
      'bot',
      'bot_send_message',
      { bot_id: 'remote:left:bot', body: 'I will inspect it on macOS' },
      new AbortController().signal,
      undefined,
      accepted.sourceEventId,
    );
    for (const core of cores) {
      const conversations = core.channels.list().filter((item) => item.remoteBot);
      expect(conversations).toHaveLength(1);
      expect(
        core.channels.readMessages(conversations[0]!.id).map((message) => message.body),
      ).toEqual(['I will inspect it on macOS', 'Inspect the iOS bug']);
    }
    discoverable = false;
    expect(await bridges[0]!.membership('right')).toBe('unavailable');
    expect(withdrawals).toEqual([]);
    discoverable = true;
    admissions[1]!.revoke('left');
    expect(await bridges[0]!.membership('right')).toBe('withdrawn');
    admissions[1]!.admit(peers[0]!);
    expect(await bridges[0]!.membership('right')).toBe('withdrawn');
    admissions[1]!.revoke('left');
    await bridges[0]!.refresh();
    expect(bridges[0]!.contacts()).toEqual([]);
    expect(withdrawals).toContain('left:right');
    await expect(
      bridges[0]!.send('right', {
        id: 'refused-message',
        at: '2026-11-01T00:00:01.000Z',
        senderBotSlug: 'bot',
        recipientBotSlug: 'bot',
        body: 'Must not arrive',
        causation: {
          rootSourceEventId: 'human-request',
          parentSourceEventId: 'human-request',
          hop: 1,
        },
      }),
    ).rejects.toThrow();
    expect(cores[1]!.channels.readMessages(channel!.id)).toHaveLength(2);
  } finally {
    for (const bridge of bridges) bridge.close();
    for (const listener of listeners) await listener.close();
    for (const core of cores) {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  }
});
