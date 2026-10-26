import { setImmediate as tick } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import { EXTERNAL_BOT_TURNS } from '../src/messaging/bot-sender-guard.js';
import type { MessagingInboundEvent } from '../src/messaging/provider.js';
import { createTempRoot } from './helpers.js';

const cores: BotHarnessCore[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

async function discordGroup() {
  const fingerprint = 'd'.repeat(64);
  const inboxes: string[] = [];
  let consumer: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1] | undefined;
  const core = createCore({
    dshHome: createTempRoot('botharness-external-bot-'),
    agents: {
      async runOrchestrator(run) {
        inboxes.push(run.inbox);
      },
      async runAssignment() {},
      requestAssignment() {
        return { delivery: 'steer' };
      },
      async stopAssignment() {},
      async close() {},
    },
  });
  cores.push(core);
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  const transport: DshImOutboundService = {
    contractVersion: 1,
    replyContextVersion: 1,
    replyReceiptVersion: 1,
    replyFenceVersion: 1,
    listBots: async () => [{ botId: 'discord-qa', channel: 'discord' }],
    listTargets: async () => [
      {
        targetId: 'qa',
        name: 'Discord QA channel',
        kind: 'channel',
        route: { channelId: '444444444444444444' },
      },
    ],
    describeBot: async (botId) => ({
      version: 1,
      botId,
      channel: 'discord',
      connected: true,
      account: { fingerprint, name: 'Discord QA Bot' },
      capabilities: [
        'proactive-text-checked',
        'exclusive-text-consumer',
        'reply-text-checked',
        'reply-context-checked',
        'reply-receipt-checked',
        'reply-fence-checked',
      ],
    }),
    sendChecked: vi.fn(async (): Promise<{ sent: true }> => ({ sent: true })),
    consumeInbound: async (_account, options) => {
      consumer = options;
      return () => {};
    },
    qualifyReplyChecked: async (_account, route) => route,
    replyChecked: async (_account, route) => ({
      sent: true,
      receipt: {
        version: 1,
        messageId: '999999999999999999',
        conversationId: route.conversationId,
      },
    }),
  };
  const provider = createDshImProvider(transport, 'discord')!;
  core.externalMessaging.register(provider);
  const target = (await core.externalMessaging.targets(provider.id, 'discord-qa'))[0]!;
  const grant = await core.externalMessaging.authorize({
    botSlug: 'ada',
    providerId: provider.id,
    accountRef: 'discord-qa',
    targetRef: 'qa',
    fingerprint,
    targetDigest: target.digest,
  });
  await core.externalMessaging.inbound.setEnabled('ada', grant.id, true);
  let sequence = 0;
  const start = Date.now() - 60_000;
  const send = async (
    actor: MessagingInboundEvent['actor'],
    mentionedAccount = true,
  ): Promise<void> => {
    sequence++;
    const messageId = String(700000000000000000n + BigInt(sequence));
    await consumer!.onEvent(
      {
        version: 1,
        channel: 'discord',
        botId: 'discord-qa',
        fingerprint,
        eventId: `gateway:qa:${sequence}`,
        messageId,
        actor,
        conversation: { kind: 'group', id: '444444444444444444' },
        mentions: mentionedAccount
          ? [{ id: '111111111111111111', key: '<@111111111111111111>' }]
          : [],
        mentionedAccount,
        at: new Date(start + sequence * 1000).toISOString(),
        text: `${mentionedAccount ? '<@111111111111111111> ' : ''}round ${sequence}`,
        reply: { messageId, actorId: actor.id, conversationId: '444444444444444444' },
        replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
      },
      { signal: consumer!.signal },
    );
    await tick();
    await core.runtime.whenIdle();
    await tick();
  };
  return { inboxes, send };
}

const peer = { kind: 'bot' as const, id: '222222222222222222', name: 'Peer Bot' };
const human = { kind: 'user' as const, id: '666666666666666666', name: 'QA Human' };

it('wakes a Bot when another external Bot mentions it and says the sender is a Bot', async () => {
  const { inboxes, send } = await discordGroup();
  await send(peer);
  expect(inboxes).toHaveLength(1);
  expect(inboxes[0]).toContain('from external Bot "Peer Bot"');
  expect(inboxes[0]).toContain('"senderKind":"bot"');
  expect(inboxes[0]).toContain('The sender is another Bot, not a Human');
});

it('refuses an external Bot message that does not mention this account', async () => {
  const { inboxes, send } = await discordGroup();
  await expect(send(peer, false)).rejects.toThrow();
  expect(inboxes).toHaveLength(0);
});

it('stops waking for external Bots after a run of Bot mentions until a Human speaks', async () => {
  const { inboxes, send } = await discordGroup();
  for (let index = 0; index <= EXTERNAL_BOT_TURNS; index++) await send(peer);
  expect(inboxes).toHaveLength(EXTERNAL_BOT_TURNS);
  await send(human);
  expect(inboxes).toHaveLength(EXTERNAL_BOT_TURNS + 1);
  await send(peer);
  expect(inboxes).toHaveLength(EXTERNAL_BOT_TURNS + 2);
});
