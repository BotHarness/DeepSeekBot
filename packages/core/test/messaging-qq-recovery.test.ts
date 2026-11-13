import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { setImmediate as tick } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import type { MessagingReplyRoute } from '../src/messaging/provider.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

const accounts = {
  'qq-a': { fingerprint: 'a'.repeat(64), conversation: 'qq-group-a', owner: 'ada' },
} as const;
type Account = keyof typeof accounts;
const cores = new Set<BotHarnessCore>();

async function stop(core: BotHarnessCore) {
  core.externalMessaging.close();
  await core.runtime.close();
  core.operationalDatabase.close();
  cores.delete(core);
}

afterEach(async () => {
  for (const core of cores) await stop(core);
});

async function fixture() {
  const conversationFor = (account: Account) => accounts[account].conversation;
  const home = createTempRoot('botharness-qq-identities-');
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
  const consumers = new Map<string, Consumer>();
  const replies: { account: string; route: MessagingReplyRoute; text: string }[] = [];
  let connected = true;
  const unavailableConsumers = new Set<string>();
  const service: DshImOutboundService = {
    contractVersion: 1,
    replyContextVersion: 1,
    replyReceiptVersion: 1,
    replyFenceVersion: 1,
    echoVersion: 1,
    listBots: async () => Object.keys(accounts).map((botId) => ({ botId, channel: 'qq' })),
    listTargets: async () => [],
    describeBot: async (botId) => ({
      version: 1,
      channel: 'qq',
      botId,
      account: { fingerprint: accounts[botId as Account].fingerprint, name: botId },
      connected,
      capabilities: [
        'exclusive-text-consumer',
        'reply-text-checked',
        'reply-context-checked',
        'reply-receipt-checked',
        'reply-fence-checked',
      ],
    }),
    sendChecked: async () => {
      throw new Error('QQ proactive sending is not qualified by this fixture');
    },
    consumeInbound: async (account, input) => {
      if (unavailableConsumers.delete(account))
        throw Object.assign(new Error('Temporarily unavailable'), { code: 'provider-unavailable' });
      consumers.set(account, input);
      return () => {
        if (consumers.get(account) === input) consumers.delete(account);
      };
    },
    qualifyReplyChecked: async () => {
      throw Object.assign(new Error('No native cross-app source proof'), { code: 'stale-route' });
    },
    replyChecked: async (account, route, text, options) => {
      if (route.conversationId !== conversationFor(account as Account))
        throw Object.assign(new Error('Wrong app-scoped group'), { code: 'stale-route' });
      if (options.beforeSend && !options.beforeSend())
        throw Object.assign(new Error('Revoked before send'), { code: 'stale-route' });
      replies.push({ account, route, text });
      return {
        sent: true,
        receipt: {
          version: 1,
          messageId: `${account}-reply-${route.messageId}`,
          conversationId: route.conversationId,
        },
      };
    },
  };
  const boot = () => {
    const value = createCore({ dshHome: home, agents });
    cores.add(value);
    value.externalMessaging.register(createDshImProvider(service, 'qq')!);
    return value;
  };
  let core = boot();
  for (const slug of ['ada'])
    expect(core.registry.create({ slug, displayName: slug.toUpperCase() }).ok).toBe(true);
  const settle = async () => {
    for (let i = 0; i < 4; ++i) await tick();
    await core.runtime.whenIdle();
    await tick();
  };
  return {
    get core() {
      return core;
    },
    replies,
    async bind(account: Account) {
      const value = accounts[account];
      const binding = await core.externalMessaging.identity(value.owner, {
        kind: 'bind',
        providerId: 'dsh-im/qq',
        accountRef: account,
        fingerprint: value.fingerprint,
      });
      await settle();
      return binding;
    },
    async receive(account: Account, id: string) {
      const value = accounts[account];
      const consumer = consumers.get(account);
      if (!consumer) throw new Error('No owned QQ receiver');
      await consumer.onEvent(
        {
          version: 1,
          channel: 'qq',
          botId: account,
          fingerprint: value.fingerprint,
          eventId: `event-${id}`,
          messageId: id,
          actor: { kind: 'user', id: `member-${account}`, name: 'Same display name' },
          conversation: { kind: 'group', id: conversationFor(account) },
          mentions: [{ id: account, key: `<@${account}>` }],
          mentionedAccount: true,
          at: new Date(Date.now() + 1000).toISOString(),
          text: 'same content',
          reply: {
            messageId: id,
            conversationId: conversationFor(account),
            actorId: `member-${account}`,
          },
          replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
        },
        { signal: consumer.signal },
      );
      await settle();
      return core.attention
        .list({ botSlug: value.owner })
        .items.find(
          (item) =>
            core.externalMessaging.inbound.read(value.owner, item.id).event.messageId === id,
        )!.id;
    },
    async sync(account: Account, channelId: string) {
      const grant = (await core.externalMessaging.snapshot(accounts[account].owner)).grants[0]!;
      await core.externalMessaging.inbound.channelBridge(channelId, {
        kind: 'add',
        grantId: grant.id,
        expectedGrantRevision: grant.revision,
        delivery: 'channel',
        name: account,
        enabled: true,
        collection: 'mentions',
        collectionInheritance: 'inherit',
      });
    },
    async restart(failure?: 'disconnected' | 'consumer-unavailable') {
      await stop(core);
      connected = failure !== 'disconnected';
      if (failure === 'consumer-unavailable')
        for (const account of ['qq-a']) unavailableConsumers.add(account);
      core = boot();
      await settle();
      connected = true;
      if (failure)
        await vi.waitFor(
          async () => {
            for (const owner of ['ada'])
              expect((await core.externalMessaging.snapshot(owner)).grants[0]?.reception).toBe(
                'receiving',
              );
          },
          { timeout: 2000 },
        );
      await settle();
    },
  };
}

it.each(['disconnected', 'consumer-unavailable'] as const)(
  'restores the persisted QQ Channel route before the first fresh mention after %s',
  async (failure) => {
    const fx = await fixture();
    await fx.bind('qq-a');
    await fx.receive('qq-a', 'first');
    const room = fx.core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'QQ recovery',
      members: ['ada'],
    });
    await fx.sync('qq-a', room.id);
    const source = await fx.receive('qq-a', 'before-restart');
    expect(fx.core.channels.readMessages(room.id)).toHaveLength(1);
    const reply = await fx.core.externalMessaging.reply('ada', source, 'accepted before restart');
    expect(reply.state).toBe('provider-accepted');
    await fx.restart(failure);
    expect(fx.core.channels.readMessages(room.id)).toHaveLength(1);
    await fx.receive('qq-a', 'first-after-restart');
    expect(fx.core.channels.readMessages(room.id)).toHaveLength(2);
    expect(
      await fx.core.externalMessaging.reply('ada', source, 'accepted before restart'),
    ).toMatchObject({ id: reply.id });
    expect(fx.replies).toHaveLength(1);
  },
);
