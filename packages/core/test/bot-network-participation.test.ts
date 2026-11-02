import { expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import { receiveNetworkBotDm } from '../src/runtime/bot-network.js';
import { createTempRoot } from './helpers.js';
import { createBotNetworkRoutes } from '../src/devices/bot-network-routes.js';
import { createTailnetBotBridge } from '../src/devices/bot-tailnet-bridge.js';
import { createDevicesHttp } from '../src/devices/http.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { runDevicesCommand } from '../src/bots/cli-devices.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { randomBytes } from 'node:crypto';

it('cuts off incoming remote DMs at the Host and Bot switches and preserves choices across reopen', async () => {
  const dshHome = createTempRoot('network-participation-');
  let core = createCore({ dshHome });
  const sender = {
    hostId: 'colleague-host',
    botSlug: 'colleague',
    displayName: 'Colleague',
    device: { model: null, platform: 'linux' },
    capabilities: [],
  };
  const send = (id: string, recipientBotSlug = 'developer') =>
    receiveNetworkBotDm(
      {
        registry: core.registry,
        channels: core.channels,
        participation: core.networkParticipation,
        admitBotDmMessage() {},
      },
      sender,
      {
        id,
        at: '2026-11-03T00:00:00.000Z',
        senderBotSlug: 'colleague',
        recipientBotSlug,
        body: 'Please investigate',
        causation: { rootSourceEventId: 'request', parentSourceEventId: 'request', hop: 1 },
      },
    );
  try {
    core.registry.create({ slug: 'developer', displayName: 'Developer' });
    core.registry.create({ slug: 'designer', displayName: 'Designer' });
    await send('before');
    core.networkParticipation.set({ botSlug: 'developer', enabled: false });
    await expect(send('disabled-bot')).rejects.toMatchObject({ code: 'network-disabled' });
    await send('sibling', 'designer');
    core.networkParticipation.set({ enabled: false });
    await expect(send('disabled-host', 'designer')).rejects.toMatchObject({
      code: 'network-disabled',
    });
    await core.runtime.close();
    core.operationalDatabase.close();
    core = createCore({ dshHome });
    expect(core.networkParticipation.snapshot()).toMatchObject({ enabled: false });
    core.networkParticipation.set({ enabled: true });
    await expect(send('still-disabled')).rejects.toMatchObject({ code: 'network-disabled' });
    await send('reopened-sibling', 'designer');
    core.networkParticipation.set({ botSlug: 'developer', enabled: true });
    await send('fresh');
    const dm = core.channels
      .list()
      .find((channel) => channel.remoteBot && channel.members.includes('developer'))!;
    expect(core.channels.message(dm.id, 'before')).toBeDefined();
    expect(core.channels.message(dm.id, 'fresh')).toBeDefined();
    expect(core.channels.message(dm.id, 'disabled-bot')).toBeUndefined();
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

it('does not open a Tailscale Bot listener while Host participation is off', async () => {
  const core = createCore({ dshHome: createTempRoot('network-listener-off-') });
  core.networkParticipation.set({ enabled: false });
  const self = { nodeId: 'local', address: '127.0.0.36' };
  const bridge = createTailnetBotBridge({
    hostId: 'local',
    participation: core.networkParticipation,
    ports: [43279],
    key: async () => randomBytes(32),
    directory: () => [],
    receive: async () => {},
    tailnet: { snapshot: async () => ({ self, peers: [] }), admit: async () => self },
  });
  try {
    await bridge.start();
    await expect(
      fetch('http://127.0.0.36:43279/botharness-bots/v1/contacts?offset=0'),
    ).rejects.toThrow();
  } finally {
    await bridge.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

it('refuses an outgoing request when participation changes during contact refresh without withdrawing membership', async () => {
  const core = createCore({ dshHome: createTempRoot('network-send-cutoff-') });
  core.registry.create({ slug: 'developer', displayName: 'Developer' });
  const network = createBotNetworkRoutes({ participation: core.networkParticipation });
  let sent = false;
  network.attach({
    contacts: () => [
      {
        hostId: 'remote',
        botSlug: 'colleague',
        displayName: 'Colleague',
        device: { model: null, platform: null },
        capabilities: [],
      },
    ],
    membership: async () => 'member',
    refresh: async () => {
      core.networkParticipation.set({ botSlug: 'developer', enabled: false });
    },
    send: async () => {
      sent = true;
    },
  });
  try {
    await expect(
      network.send('remote', {
        id: 'cutoff',
        at: '2026-11-03T00:00:00.000Z',
        senderBotSlug: 'developer',
        recipientBotSlug: 'colleague',
        body: 'Investigate',
        causation: { rootSourceEventId: 'request', parentSourceEventId: 'request', hop: 1 },
      }),
    ).rejects.toMatchObject({ code: 'network-disabled' });
    expect(sent).toBe(false);
    expect(await network.membership?.('remote')).toBe('member');
    core.networkParticipation.set({ enabled: false });
    expect(network.contacts()).toEqual([]);
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

it('changes Host and Bot participation through the Owner HTTP and online CLI seam', async () => {
  const core = createCore({ dshHome: createTempRoot('network-owner-') });
  core.registry.create({ slug: 'developer', displayName: 'Developer' });
  const http = createDevicesHttp({
    pairing: createDevicePairing({
      database: attachOperationalModule(core.operationalDatabase, 'device-pairing'),
      hostName: 'Local',
    }),
    routes: async () => ({ routes: [], tailscale: 'missing', serveCommand: '' }),
    participation: core.networkParticipation,
  });
  const connect = async () => ({
    http: async (path: string, body?: Record<string, unknown>) => {
      const response = await http(
        new Request(
          `http://localhost${path}`,
          body ? { method: 'POST', body: JSON.stringify(body) } : {},
        ),
      );
      return { bytes: new Uint8Array(await response.arrayBuffer()) };
    },
  });
  try {
    expect(await runDevicesCommand('bot-network', ['list'], {}, connect)).toMatchObject({
      enabled: true,
      bots: [{ botSlug: 'developer', enabled: true, effective: true }],
    });
    await expect(runDevicesCommand('bot-network', ['disable'], {}, connect)).rejects.toThrow(
      'confirm',
    );
    expect(
      await runDevicesCommand('bot-network', ['disable', 'developer'], { confirm: true }, connect),
    ).toMatchObject({ enabled: true, bots: [{ enabled: false, effective: false }] });
    expect(
      await runDevicesCommand('bot-network', ['disable'], { confirm: true }, connect),
    ).toMatchObject({ enabled: false });
    expect(
      await runDevicesCommand('bot-network', ['enable'], { confirm: true }, connect),
    ).toMatchObject({ enabled: true, bots: [{ enabled: false, effective: false }] });
    const invalid = await http(
      new Request('http://localhost/api/botharness/devices/bot-network', {
        method: 'POST',
        body: JSON.stringify({ enabled: 'false', confirm: true }),
      }),
    );
    expect(invalid.status).toBe(400);
    expect(core.networkParticipation.enabled()).toBe(true);
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

it('keeps actual model-facing contact and message definitions identical across participation toggles', async () => {
  const definitions: string[] = [];
  const host = new FakeAgentHost(
    { kind: 'completed' },
    {
      onTurn: async (_session, tools) => {
        const selected = tools.filter((tool) =>
          ['list_bot_contacts', 'bot_send_message'].includes(tool.name),
        );
        expect(selected.map((tool) => tool.name).sort()).toEqual([
          'bot_send_message',
          'list_bot_contacts',
        ]);
        definitions.push(JSON.stringify(selected));
      },
    },
  );
  const core = createCore({
    dshHome: createTempRoot('network-stable-tools-'),
    agents: createDshBotAgentAdapter({
      agents: host,
      orchestratorCwd: () => '/memory',
      ensureWorkspace: () => undefined,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    }),
  });
  try {
    core.registry.create({ slug: 'developer', displayName: 'Developer' });
    const channel = core.channels.getOrCreateDm('developer', 'Developer')!;
    for (const [index, enabled] of [true, false, true].entries()) {
      core.networkParticipation.set({ enabled });
      core.networkParticipation.set({ enabled, botSlug: 'developer' });
      const messageId = `human-${index}`;
      await core.channels.appendMessage(channel.id, {
        id: messageId,
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: 'Inspect contacts',
      });
      core.runtime.admitDmMessage({ channelId: channel.id, messageId, body: 'Inspect contacts' });
      await core.runtime.whenIdle();
    }
    expect(definitions).toHaveLength(3);
    expect(new Set(definitions).size).toBe(1);
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
}, 60_000);
