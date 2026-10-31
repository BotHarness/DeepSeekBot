import { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import { createBotMessageTool } from '../src/runtime/bot-message-tool.js';
import { expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import { receiveNetworkBotDm, type BotNetworkPort } from '../src/runtime/bot-network.js';
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
          expect(run.channels.contacts({ query: 'iOS' }).contacts[0]?.botId).toBe(
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
