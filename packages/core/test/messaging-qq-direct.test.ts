import { setImmediate as tick } from 'node:timers/promises';
import { afterEach, expect, it } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import type { MessagingInboundEvent, MessagingReplyRoute } from '../src/messaging/provider.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

const fingerprint = 'd'.repeat(64);
const cores = new Set<BotHarnessCore>();

afterEach(async () => {
  for (const core of cores) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
  cores.clear();
});

async function fixture(direct: boolean) {
  const agents: BotAgentAdapter = {
    async runOrchestrator() {},
    async runAssignment() {},
    requestAssignment() {
      return { delivery: 'steer' };
    },
    async stopAssignment() {},
    async close() {},
  };
  type Consumer = Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1];
  let consumer: Consumer | undefined;
  const replies: { route: MessagingReplyRoute; text: string }[] = [];
  const service: DshImOutboundService = {
    contractVersion: 1,
    replyContextVersion: 1,
    replyReceiptVersion: 1,
    replyFenceVersion: 1,
    listBots: async () => [{ botId: 'qq-app', channel: 'qq' }],
    listTargets: async () => [],
    describeBot: async (botId) => ({
      version: 1,
      channel: 'qq',
      botId,
      account: { fingerprint, name: 'QQ QA' },
      connected: true,
      capabilities: [
        'exclusive-text-consumer',
        'reply-text-checked',
        'reply-context-checked',
        'reply-receipt-checked',
        'reply-fence-checked',
        ...(direct ? ['direct-message-consumer'] : []),
      ],
    }),
    sendChecked: async () => {
      throw new Error('QQ proactive sending is not qualified by this fixture');
    },
    consumeInbound: async (_account, input) => {
      consumer = input;
      return () => {
        if (consumer === input) consumer = undefined;
      };
    },
    qualifyReplyChecked: async (_account, route) => route,
    replyChecked: async (_account, route, text, options) => {
      if (options.beforeSend && !options.beforeSend())
        throw Object.assign(new Error('Revoked before send'), { code: 'stale-route' });
      replies.push({ route, text });
      return {
        sent: true,
        receipt: {
          version: 1,
          messageId: `reply-${route.messageId}`,
          conversationId: route.conversationId,
        },
      };
    },
  };
  const core = createCore({ dshHome: createTempRoot('botharness-qq-direct-'), agents });
  cores.add(core);
  core.externalMessaging.register(createDshImProvider(service, 'qq')!);
  expect(core.registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  const settle = async () => {
    for (let i = 0; i < 4; ++i) await tick();
    await core.runtime.whenIdle();
    await tick();
  };
  await core.externalMessaging.identity('ada', {
    kind: 'bind',
    providerId: 'dsh-im/qq',
    accountRef: 'qq-app',
    fingerprint,
  });
  await settle();
  const event = (id: string): MessagingInboundEvent => ({
    version: 1,
    channel: 'qq',
    botId: 'qq-app',
    fingerprint,
    eventId: id,
    messageId: id,
    actor: { kind: 'user', id: 'private-user' },
    conversation: { kind: 'dm', id: 'private-user' },
    mentions: [],
    mentionedAccount: false,
    at: new Date(Date.now() + 1000).toISOString(),
    text: 'hello in private',
    reply: { messageId: id, conversationId: 'private-user', actorId: 'private-user' },
    replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
  });
  return {
    core,
    replies,
    get consumer() {
      if (!consumer) throw new Error('No QQ receiver');
      return consumer;
    },
    async receive(id: string) {
      await this.consumer.onEvent(event(id), { signal: this.consumer.signal });
      await settle();
      return core.attention
        .list({ botSlug: 'ada' })
        .items.find(
          (item) => core.externalMessaging.inbound.read('ada', item.id).event.messageId === id,
        )?.id;
    },
  };
}

it('a QQ app that consumes private messages delivers them as a direct conversation and replies to the sender', async () => {
  const fx = await fixture(true);
  expect(fx.consumer.directMessages).toBe(true);
  const item = await fx.receive('private-1');
  expect(item).toBeDefined();
  expect(fx.core.externalMessaging.inbound.read('ada', item!).event.conversation).toEqual({
    kind: 'dm',
    id: 'private-user',
  });
  expect(await fx.core.externalMessaging.reply('ada', item!, 'private answer')).toMatchObject({
    state: 'provider-accepted',
    receipt: { conversationId: 'private-user' },
  });
  expect(fx.replies.map((reply) => [reply.route.conversationId, reply.text])).toEqual([
    ['private-user', 'private answer'],
  ]);
});

it('a QQ app without the private-message capability never receives private messages', async () => {
  const fx = await fixture(false);
  expect(fx.consumer.directMessages).toBeUndefined();
  await expect(
    fx.consumer.onEvent(
      {
        version: 1,
        channel: 'qq',
        botId: 'qq-app',
        fingerprint,
        eventId: 'private-2',
        messageId: 'private-2',
        actor: { kind: 'user', id: 'private-user' },
        conversation: { kind: 'dm', id: 'private-user' },
        mentions: [],
        mentionedAccount: false,
        at: new Date(Date.now() + 1000).toISOString(),
        text: 'hello in private',
        reply: { messageId: 'private-2', conversationId: 'private-user', actorId: 'private-user' },
        replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
      },
      { signal: fx.consumer.signal },
    ),
  ).rejects.toThrow();
  expect(fx.core.attention.list({ botSlug: 'ada' }).items).toHaveLength(0);
});
