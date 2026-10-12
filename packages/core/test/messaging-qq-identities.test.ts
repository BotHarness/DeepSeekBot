import { setImmediate as tick } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import type { MessagingReplyRoute } from '../src/messaging/provider.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

const accounts = {
  'qq-a': { fingerprint: 'a'.repeat(64), conversation: 'qq-group-a', owner: 'ada' },
  'qq-b': { fingerprint: 'b'.repeat(64), conversation: 'qq-group-b', owner: 'bea' },
  'qq-c': { fingerprint: 'c'.repeat(64), conversation: 'qq-group-c', owner: 'bea' },
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

async function fixture(sharedConversation = false) {
  const conversationFor = (account: Account) =>
    sharedConversation ? 'qualified-group' : accounts[account].conversation;
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
  for (const slug of ['ada', 'bea'])
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
    receiverAccounts() {
      return [...consumers.keys()].sort();
    },
    hasEchoReceiver(account: Account) {
      return typeof consumers.get(account)?.onEcho === 'function';
    },
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
        for (const account of ['qq-a', 'qq-b']) unavailableConsumers.add(account);
      core = boot();
      await settle();
      connected = true;
      if (failure)
        await vi.waitFor(
          async () => {
            for (const owner of ['ada', 'bea'])
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
  'two QQ apps retain independent source identity, Channel mapping and own-group replies after %s restart',
  async (failure) => {
    const fx = await fixture();
    await fx.bind('qq-a');
    await fx.bind('qq-b');
    await fx.receive('qq-a', 'first');
    await fx.receive('qq-b', 'first');
    const room = fx.core.channels.createGroup({ name: 'Shared QQ QA', members: ['ada', 'bea'] });
    await fx.sync('qq-a', room.id);
    await fx.sync('qq-b', room.id);
    const a = await fx.receive('qq-a', 'same-native-id');
    const b = await fx.receive('qq-b', 'same-native-id');
    expect(a).not.toBe(b);
    expect(fx.core.channels.readMessages(room.id).map((message) => message.body)).toEqual([
      'same content',
      'same content',
    ]);
    expect(
      fx.core.channels
        .readMessages(room.id)
        .map((message) => message.bridgeOrigin)
        .sort((a, b) => a!.accountRef!.localeCompare(b!.accountRef!)),
    ).toEqual([
      expect.objectContaining({ accountRef: 'qq-a', accountName: 'qq-a' }),
      expect.objectContaining({ accountRef: 'qq-b', accountName: 'qq-b' }),
    ]);
    expect(fx.core.externalMessaging.inbound.readShared('bea', a).event.botId).toBe('qq-a');
    await expect(fx.core.externalMessaging.reply('bea', a, 'borrowed')).rejects.toThrow(
      'own-reply-grant-unavailable',
    );
    const ownA = await fx.core.externalMessaging.reply('ada', a, 'A result');
    const ownB = await fx.core.externalMessaging.reply('bea', b, 'B result');
    expect(ownA).toMatchObject({
      state: 'provider-accepted',
      receipt: { conversationId: 'qq-group-a' },
    });
    expect(ownB).toMatchObject({
      state: 'provider-accepted',
      receipt: { conversationId: 'qq-group-b' },
    });
    expect(
      fx.replies.map((reply) => [reply.account, reply.text, reply.route.conversationId]),
    ).toEqual([
      ['qq-a', 'A result', 'qq-group-a'],
      ['qq-b', 'B result', 'qq-group-b'],
    ]);
    await fx.restart(failure);
    expect(fx.core.channels.readMessages(room.id)).toHaveLength(2);
    expect(
      (await fx.core.externalMessaging.apps())
        .filter((app) => app.boundBotSlug)
        .map((app) => [app.ref, app.boundBotSlug]),
    ).toEqual([
      ['qq-a', 'ada'],
      ['qq-b', 'bea'],
    ]);
    expect(await fx.core.externalMessaging.reply('ada', a, 'A result')).toMatchObject({
      id: ownA.id,
    });
    expect(await fx.core.externalMessaging.reply('bea', b, 'B result')).toMatchObject({
      id: ownB.id,
    });
    expect(fx.replies).toHaveLength(2);
    await fx.receive('qq-a', 'after-restart-a');
    await fx.receive('qq-b', 'after-restart-b');
    expect(fx.core.channels.readMessages(room.id)).toHaveLength(4);
  },
);

it('revoking one QQ owner fences its reply without transferring identity or erasing the other source', async () => {
  const fx = await fixture();
  const aBinding = await fx.bind('qq-a');
  await fx.bind('qq-b');
  await expect(
    fx.core.externalMessaging.identity('bea', {
      kind: 'bind',
      providerId: 'dsh-im/qq',
      accountRef: 'qq-a',
      fingerprint: accounts['qq-a'].fingerprint,
    }),
  ).rejects.toThrow('binding-conflict');
  await fx.receive('qq-a', 'first');
  await fx.receive('qq-b', 'first');
  const room = fx.core.channels.createGroup({
    name: 'Independent owners',
    members: ['ada', 'bea'],
  });
  await fx.sync('qq-a', room.id);
  await fx.sync('qq-b', room.id);
  const a = await fx.receive('qq-a', 'pending-a');
  const b = await fx.receive('qq-b', 'pending-b');
  await fx.core.externalMessaging.identity('ada', {
    kind: 'unbind',
    id: aBinding.id,
    expectedRevision: aBinding.revision,
  });
  await expect(fx.core.externalMessaging.reply('ada', a, 'revoked')).rejects.toThrow();
  expect(fx.receiverAccounts()).toEqual(['qq-b']);
  expect(
    (await fx.core.externalMessaging.apps()).map((app) => [app.ref, app.boundBotSlug ?? null]),
  ).toEqual([
    ['qq-a', null],
    ['qq-b', 'bea'],
    ['qq-c', null],
  ]);
  expect(await fx.core.externalMessaging.reply('bea', b, 'still B')).toMatchObject({
    state: 'provider-accepted',
    receipt: { conversationId: 'qq-group-b' },
  });
  await fx.restart();
  expect(fx.receiverAccounts()).toEqual(['qq-b']);
  expect(fx.core.channels.readMessages(room.id)).toHaveLength(2);
  expect(fx.replies.map((reply) => reply.account)).toEqual(['qq-b']);
});

it('QQ shared reading cannot qualify a foreign reply proof or choose between two own apps', async () => {
  const fx = await fixture(true);
  await fx.bind('qq-a');
  await fx.bind('qq-b');
  await fx.receive('qq-a', 'first-a');
  await fx.receive('qq-b', 'first-b');
  const room = fx.core.channels.createGroup({ name: 'Qualified group', members: ['ada', 'bea'] });
  await fx.sync('qq-a', room.id);
  const source = await fx.receive('qq-a', 'shared');
  await expect(fx.core.externalMessaging.reply('bea', source, 'foreign proof')).rejects.toThrow(
    'stale-route',
  );
  await fx.bind('qq-c');
  await fx.receive('qq-c', 'first-c');
  await expect(fx.core.externalMessaging.reply('bea', source, 'guess app')).rejects.toThrow(
    'reply-target-ambiguous',
  );
  expect(fx.replies).toEqual([]);
});

it.each(['block', 'archive'] as const)(
  '%s fences only the affected QQ owner and retains accepted Channel sources',
  async (control) => {
    const fx = await fixture();
    await fx.bind('qq-a');
    await fx.bind('qq-b');
    await fx.receive('qq-a', 'first-a');
    await fx.receive('qq-b', 'first-b');
    expect(fx.hasEchoReceiver('qq-a')).toBe(false);
    expect(fx.hasEchoReceiver('qq-b')).toBe(false);
    const room = fx.core.channels.createGroup({ name: 'QQ lifecycle', members: ['ada', 'bea'] });
    await fx.sync('qq-a', room.id);
    await fx.sync('qq-b', room.id);
    const a = await fx.receive('qq-a', 'pending-a');
    const b = await fx.receive('qq-b', 'pending-b');
    if (control === 'block') {
      const grant = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!;
      await fx.core.externalMessaging.conversation('ada', {
        kind: 'block',
        grantId: grant.id,
        expectedRevision: grant.revision,
      });
    } else {
      expect(fx.core.registry.setPaused('ada', true).ok).toBe(true);
    }
    await expect(fx.core.externalMessaging.reply('ada', a, 'fenced')).rejects.toThrow();
    expect(await fx.core.externalMessaging.reply('bea', b, 'independent')).toMatchObject({
      state: 'provider-accepted',
    });
    await fx.restart();
    expect(fx.core.channels.readMessages(room.id)).toHaveLength(2);
    await expect(fx.core.externalMessaging.reply('ada', a, 'still fenced')).rejects.toThrow();
    expect(fx.replies.map((reply) => reply.account)).toEqual(['qq-b']);
  },
);
