import { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import { createBotMessageTool } from '../src/runtime/bot-message-tool.js';
import { expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import {
  BotNetworkDeliveryError,
  receiveNetworkBotDm,
  type BotNetworkPort,
} from '../src/runtime/bot-network.js';
import type { BotAgentAdapter, OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

function agents(run: (turn: OrchestratorAgentRun) => Promise<void>): BotAgentAdapter {
  return {
    runOrchestrator: run,
    async runAssignment() {},
    requestAssignment() {
      throw new Error('Unexpected Assignment');
    },
    async close() {},
  };
}

it('lets started work finish locally while refusing its reply to a withdrawn peer', async () => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let membership: 'member' | 'withdrawn' = 'member';
  let started = false;
  let finished = false;
  let runs = 0;
  let sendAttempts = 0;
  const failures: unknown[] = [];
  const contact = {
    hostId: 'departing',
    hostKey: 'a'.repeat(64),
    membership: { kind: 'tailnet' as const, localNodeId: 'local', remoteNodeId: 'peer' },
    botSlug: 'sender',
    displayName: 'Sender',
    device: { model: null, platform: 'linux' },
    capabilities: [],
  };
  const core = createCore({
    dshHome: createTempRoot('network-started-'),
    botNetwork: {
      contacts: () => [contact],
      membership: async () => membership,
      async send() {
        sendAttempts++;
        if (membership === 'withdrawn') throw new BotNetworkDeliveryError('network-denied');
      },
    },
    agents: agents(async (run) => {
      runs++;
      started = true;
      await blocked;
      try {
        await expect(
          run.channels.sendToBot({
            botSlug: 'remote:departing:sender',
            body: 'Completed locally',
          }),
        ).rejects.toThrow('network-denied');
        finished = true;
      } catch (error) {
        failures.push(error);
      }
    }),
  });
  try {
    core.registry.create({ slug: 'receiver', displayName: 'Receiver' });
    await receiveNetworkBotDm(
      {
        registry: core.registry,
        channels: core.channels,
        admitBotDmMessage: (channel, message) => core.runtime.admitBotDmMessage(channel, message),
      },
      contact,
      {
        id: 'started-remote',
        at: new Date().toISOString(),
        senderBotSlug: 'sender',
        recipientBotSlug: 'receiver',
        body: 'Start this work',
        causation: { rootSourceEventId: 'root', parentSourceEventId: 'parent', hop: 1 },
      },
    );
    await expect.poll(() => started).toBe(true);
    membership = 'withdrawn';
    await core.runtime.withdrawNetworkMembership('departing');
    release();
    await core.runtime.whenIdle();
    expect(failures).toEqual([]);
    expect(finished).toBe(true);
    expect(sendAttempts).toBe(1);
    const remote = core.channels.list().find((channel) => channel.remoteBot)!;
    expect(core.channels.readMessages(remote.id).map((message) => message.body)).toEqual([
      'Start this work',
    ]);
    membership = 'member';
    core.runtime.admitBotDmMessage(remote.id, 'started-remote');
    await core.runtime.whenIdle();
    expect(runs).toBe(1);
    expect(sendAttempts).toBe(1);
  } finally {
    release();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
}, 60_000);

it.each(['withdrawn', 'unavailable', 'returned-before-start', 'legacy-unverified'] as const)(
  'handles accepted remote work when collaboration becomes %s',
  async (state) => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let membership: 'member' | 'withdrawn' | 'unavailable' = 'member';
    const turns: string[] = [];
    const dshHome = createTempRoot('network-withdrawn-');
    const open = () =>
      createCore({
        dshHome,
        botNetwork: {
          contacts: () => [],
          membership: async () => membership,
          async send() {
            throw new Error('Unexpected send');
          },
        },
        agents: agents(async (run) => {
          turns.push(run.inboundChannelId ?? 'unknown');
          if (run.inboundChannelId === 'dm-receiver') await blocked;
        }),
      });
    let core = open();
    try {
      core.registry.create({ slug: 'receiver', displayName: 'Receiver' });
      const dm = core.channels.getOrCreateDm('receiver', 'Receiver')!;
      await core.channels.appendMessage(dm.id, {
        id: 'local-work',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: 'Local work',
      });
      core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'local-work',
        body: 'Local work',
      });
      await expect.poll(() => turns).toEqual(['dm-receiver']);
      await receiveNetworkBotDm(
        {
          registry: core.registry,
          channels: core.channels,
          admitBotDmMessage: (channel, message) => core.runtime.admitBotDmMessage(channel, message),
        },
        {
          hostId: 'departing',
          botSlug: 'sender',
          displayName: 'Sender',
          hostKey: 'a'.repeat(64),
          ...(state === 'legacy-unverified'
            ? {}
            : {
                membership: {
                  kind: 'tailnet' as const,
                  localNodeId: 'local',
                  remoteNodeId: 'peer',
                },
              }),
          device: { model: null, platform: 'linux' },
          capabilities: [],
        },
        {
          id: 'remote-pending',
          at: new Date().toISOString(),
          senderBotSlug: 'sender',
          recipientBotSlug: 'receiver',
          body: 'Work that has not started',
          causation: { rootSourceEventId: 'root', parentSourceEventId: 'parent', hop: 1 },
        },
      );
      membership =
        state === 'returned-before-start'
          ? 'withdrawn'
          : state === 'legacy-unverified'
            ? 'member'
            : state;
      if (state === 'returned-before-start') {
        await core.runtime.withdrawNetworkMembership('departing');
        membership = 'member';
      }
      release();
      await core.runtime.whenIdle();
      const remote = core.channels.list().find((channel) => channel.remoteBot)!;
      const expectedTurns = state === 'unavailable' ? ['dm-receiver', remote.id] : ['dm-receiver'];
      expect(turns).toEqual(expectedTurns);
      expect(core.channels.readMessages(remote.id).map((message) => message.body)).toEqual([
        'Work that has not started',
      ]);
      membership = 'member';
      core.runtime.admitBotDmMessage(remote.id, 'remote-pending');
      await core.runtime.whenIdle();
      expect(turns).toEqual(expectedTurns);
      await core.runtime.close();
      core.operationalDatabase.close();
      core = open();
      core.runtime.admitBotDmMessage(remote.id, 'remote-pending');
      await core.runtime.whenIdle();
      expect(turns).toEqual(expectedTurns);
      expect(core.channels.readMessages(remote.id).map((message) => message.body)).toEqual([
        'Work that has not started',
      ]);
    } finally {
      release();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  },
  60_000,
);

it('uses normal Bot tools and Inbox to exchange a DM between two Host owners', async () => {
  const contact = (hostId: string, botSlug: string) => ({
    hostId,
    botSlug,
    displayName: botSlug,
    description: 'iOS colleague',
    device: { model: null, platform: 'darwin' },
    capabilities: [],
  });
  const failures: unknown[] = [];
  const turns: string[] = [];
  let left: ReturnType<typeof createCore>;
  let right: ReturnType<typeof createCore>;
  const network = (from: string, to: () => ReturnType<typeof createCore>): BotNetworkPort => ({
    contacts: () => [
      contact(from === 'left' ? 'right' : 'left', from === 'left' ? 'ios' : 'caller'),
    ],
    async send(_hostId, message) {
      const owner = to();
      await receiveNetworkBotDm(
        {
          registry: owner.registry,
          channels: owner.channels,
          admitBotDmMessage: (channelId, messageId) =>
            owner.runtime.admitBotDmMessage(channelId, messageId),
        },
        contact(from, message.senderBotSlug),
        message,
      );
    },
  });
  left = createCore({
    dshHome: createTempRoot('network-left-'),
    botNetwork: network('left', () => right),
    agents: agents(async (run) => {
      try {
        turns.push('left');
        if (run.inboundChannelId === 'dm-caller') {
          expect((await run.channels.contacts({ query: 'iOS' })).contacts[0]?.botId).toBe(
            'remote:right:ios',
          );
          await run.channels.sendToBot({
            botSlug: 'remote:right:ios',
            body: 'Investigate iOS bug',
          });
        } else expect(run.message).toContain('Investigation complete');
      } catch (error) {
        failures.push(error);
        throw error;
      }
    }),
  });
  right = createCore({
    dshHome: createTempRoot('network-right-'),
    botNetwork: network('right', () => left),
    agents: agents(async (run) => {
      try {
        turns.push('right');
        expect(run.message).toContain('PersonaBot caller on Host left');
        const source = run.triage!.current()[0]!;
        const result = await createBotMessageTool(() => run).execute(
          {
            source_event_id: source,
            body: 'Investigation complete',
            resolve_inbox_ids: [source],
          },
          {
            callId: ToolCallId('remote-standard-reply'),
            signal: new AbortController().signal,
          } as ToolRunContext,
        );
        expect(JSON.parse(String(result))).toMatchObject({
          status: 'committed',
          inboxResolution: { outcome: 'resolved' },
        });
      } catch (error) {
        failures.push(error);
        throw error;
      }
    }),
  });
  try {
    left.registry.create({ slug: 'caller', displayName: 'Caller' });
    right.registry.create({ slug: 'ios', displayName: 'iOS' });
    const dm = left.channels.getOrCreateDm('caller', 'Caller')!;
    await left.channels.appendMessage(dm.id, {
      id: 'human-start',
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'Find iOS colleague',
    });
    left.runtime.admitDmMessage({
      channelId: dm.id,
      messageId: 'human-start',
      body: 'Find iOS colleague',
    });
    await left.runtime.whenIdle();
    await right.runtime.whenIdle();
    await left.runtime.whenIdle();
    expect(failures).toEqual([]);
    expect(turns).toEqual(['left', 'right', 'left']);
    const outgoing = left.channels.list().find((item) => item.remoteBot !== undefined)!;
    expect(left.channels.readMessages('dm-caller')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          botChannelPost: {
            channelId: outgoing.id,
            messageId: left.channels.readMessages(outgoing.id)[0]!.id,
          },
        }),
      ]),
    );
    for (const core of [left, right]) {
      const channel = core.channels.list().find((item) => item.remoteBot !== undefined)!;
      expect(
        core.channels
          .readMessages(channel.id)
          .map((message) => message.body)
          .sort(),
      ).toEqual(['Investigate iOS bug', 'Investigation complete']);
      expect(core.registry.list()).toHaveLength(1);
    }
  } finally {
    await left.runtime.close();
    await right.runtime.close();
    left.operationalDatabase.close();
    right.operationalDatabase.close();
  }
}, 60_000);
