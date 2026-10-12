import { setImmediate as tick } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import type { MessagingInboundEvent, MessagingReplyRoute } from '../src/messaging/provider.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createTempRoot } from './helpers.js';
import { privateInputWebUrl } from '../src/credentials/web-locator.js';

const cores: BotHarnessCore[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

it('Lark exact private chat uses canonical Inbox without mentions and replies through its bound identity', async () => {
  const fingerprint = 'd'.repeat(64);
  let consumer: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1] | undefined;
  let runs = 0;
  let noticePending = true;
  let expireNoticeAtSend = false;
  let core: BotHarnessCore;
  const replies: { account: string; route: MessagingReplyRoute; text: string }[] = [];
  core = createCore({
    dshHome: createTempRoot('botharness-feishu-'),
    agents: {
      async runOrchestrator(run) {
        runs++;
        const source = core.attention
          .list({ botSlug: 'ada' })
          .items.find((item) => item.sourceKind === 'bridge-message');
        expect(source).toBeDefined();
        const origin = core.runtime.bindPrivateInputOrigin?.(run.sessionId, source!.id);
        expect(origin?.current()).toBe(true);
        expect(core.runtime.canRequestPrivateInput?.(run.sessionId, source!.id)).toBe(true);
        expect(() =>
          core.runtime.bindPrivateInputOrigin?.(run.sessionId, 'historical-source'),
        ).toThrow();
        const cardId = '11111111-1111-4111-8111-111111111111';
        const link = privateInputWebUrl('http://127.0.0.1:31393', 'dm-ada', cardId);
        const notice = await core.externalMessaging.privateInputNotice(
          'ada',
          source!.id,
          cardId,
          link,
          origin!,
        );
        expect(
          await core.externalMessaging.privateInputNotice('ada', source!.id, cardId, link, origin!),
        ).toEqual(notice);
        expireNoticeAtSend = true;
        const staleNotice = await core.externalMessaging
          .privateInputNotice('ada', source!.id, '22222222-2222-4222-8222-222222222222', link, {
            signal: origin!.signal,
            current: () => noticePending,
          })
          .then(
            () => 'sent',
            () => 'refused',
          );
        expect(staleNotice).toBe('refused');
        expireNoticeAtSend = false;
        await expect(
          run.externalMessaging!.reply(
            source!.id,
            'private:11111111-1111-4111-8111-111111111111:api_key',
          ),
        ).rejects.toThrow('private-reference-not-deliverable');
        await run.externalMessaging!.reply(source!.id, 'LARK-DM-QA-OK');
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
  expect(core.registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  const transport: DshImOutboundService = {
    contractVersion: 1,
    replyContextVersion: 1,
    replyReceiptVersion: 1,
    replyFenceVersion: 1,
    listBots: async () => [
      { botId: 'feishu-qa', channel: 'feishu' },
      { botId: 'discord-qa', channel: 'discord' },
    ],
    listTargets: async () => [
      {
        targetId: 'qa',
        name: 'Private owner conversation',
        kind: 'user',
        route: { openId: 'ou_owner', chatId: 'oc_private' },
      },
      { targetId: 'send-only', kind: 'user', route: { openId: 'ou_owner' } },
      { targetId: 'empty-chat', kind: 'user', route: { openId: 'ou_owner', chatId: '' } },
      { targetId: 'missing-actor', kind: 'user', route: { chatId: 'oc_private' } },
    ],
    describeBot: async (botId) => ({
      version: 1,
      botId,
      channel: botId === 'discord-qa' ? 'discord' : 'feishu',
      connected: true,
      account: { fingerprint, name: 'Lark QA Bot' },
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
    consumeInbound: async (account, options) => {
      expect(options.ordinaryText).toBeUndefined();
      expect(options.sourceFiles).toBeUndefined();
      if (account === 'feishu-qa') consumer = options;
      return () => {};
    },
    qualifyReplyChecked: async (_account, route) => route,
    replyChecked: async (account, route, text, options) => {
      if (expireNoticeAtSend) {
        noticePending = false;
        expect(options.beforeSend?.()).toBe(false);
        throw new Error('cancelled');
      }
      expect(options.beforeSend?.()).toBe(true);
      replies.push({ account, route, text });
      return {
        sent: true,
        receipt: {
          version: 1,
          messageId: 'dsh-feishu-qa-client',
          conversationId: route.conversationId,
        },
      };
    },
  };
  const provider = createDshImProvider(transport, 'feishu')!;
  core.externalMessaging.register(provider);
  const discord = createDshImProvider(transport, 'discord')!;
  core.externalMessaging.register(discord);
  for (const [providerId, accountRef] of [
    [provider.id, 'feishu-qa'],
    [discord.id, 'discord-qa'],
  ]) {
    const bound = await core.externalMessaging.identity('ada', {
      kind: 'bind',
      providerId: providerId!,
      accountRef: accountRef!,
      fingerprint,
    });
    await core.externalMessaging.identity('ada', {
      kind: 'update',
      id: bound.id,
      expectedRevision: bound.revision,
      name: bound.name,
      enabled: true,
      newConversations: 'ask',
    });
  }
  expect((await core.externalMessaging.snapshot('ada')).identities).toHaveLength(2);
  const asking = (await core.externalMessaging.snapshot('ada')).identities!.find(
    (value) => value.platform === 'discord',
  )!;
  expect(asking).toMatchObject({ newConversations: 'ask', newConversationsInheritance: 'custom' });
  const following = await core.externalMessaging.identity('ada', {
    kind: 'update',
    id: asking.id,
    expectedRevision: asking.revision,
    name: asking.name,
    enabled: true,
    newConversations: 'inherit',
  });
  expect(following).toMatchObject({
    newConversations: 'auto',
    newConversationsInheritance: 'inherit',
  });
  await core.externalMessaging.identity('ada', {
    kind: 'update',
    id: following.id,
    expectedRevision: following.revision,
    name: following.name,
    enabled: true,
    newConversations: 'ask',
  });
  expect(await createDshImProvider(transport, 'slack')!.accounts()).toEqual([]);
  expect(provider.post).toBeUndefined();
  expect(provider.readFile).toBeUndefined();
  const target = (await core.externalMessaging.targets(provider.id, 'feishu-qa'))[0]!;
  expect(target.receiveScope).toEqual({ kind: 'dm', conversationId: 'oc_private' });
  const unavailable = (await provider.targets('feishu-qa')).filter((value) => value.ref !== 'qa');
  expect(unavailable.every((value) => value.receiveScope === undefined)).toBe(true);
  const sendOnly = unavailable.find((value) => value.ref === 'send-only')!;
  const outboundGrant = await core.externalMessaging.authorize({
    botSlug: 'ada',
    providerId: provider.id,
    accountRef: 'feishu-qa',
    targetRef: sendOnly.ref,
    fingerprint,
    targetDigest: sendOnly.digest,
  });
  await expect(
    core.externalMessaging.inbound.setEnabled('ada', outboundGrant.id, true),
  ).rejects.toThrow('group-required');
  const grant = await core.externalMessaging.authorize({
    botSlug: 'ada',
    providerId: provider.id,
    accountRef: 'feishu-qa',
    targetRef: 'qa',
    fingerprint,
    targetDigest: target.digest,
  });
  await core.externalMessaging.inbound.setEnabled('ada', grant.id, true);
  const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
  expect(await core.externalMessaging.channelBridges(dm.id)).toMatchObject({
    bridges: [],
    sources: [],
  });
  await expect(
    core.externalMessaging.inbound.channelBridge(dm.id, {
      kind: 'add',
      grantId: grant.id,
      expectedGrantRevision: (await core.externalMessaging.snapshot('ada')).grants.find(
        (value) => value.id === grant.id,
      )!.revision,
      delivery: 'inbox',
      name: 'unsupported route',
      enabled: true,
      collection: 'mentions',
    }),
  ).rejects.toThrow('capability-unavailable');
  const source: MessagingInboundEvent = {
    version: 1,
    channel: 'feishu',
    botId: 'feishu-qa',
    fingerprint,
    eventId: 'gateway:qa:42',
    messageId: '777777777777777777',
    actor: { kind: 'user', id: 'ou_owner' },
    conversation: { kind: 'dm', id: 'oc_private' },
    mentions: [],
    mentionedAccount: false,
    at: new Date().toISOString(),
    text: 'Reply in my Lark DM',
    reply: {
      messageId: '777777777777777777',
      actorId: 'ou_owner',
      conversationId: 'oc_private',
    },
    replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
  };
  await expect(
    consumer!.onEvent({ ...source, channel: 'slack' }, { signal: consumer!.signal }),
  ).rejects.toThrow('untrusted-source');
  await expect(
    consumer!.onEvent({ ...source, botId: 'wrong-account' }, { signal: consumer!.signal }),
  ).rejects.toThrow('untrusted-source');
  await consumer!.onEvent(
    { ...source, conversation: { kind: 'group', id: 'oc_private' } },
    { signal: consumer!.signal },
  );
  await consumer!.onEvent(
    {
      ...source,
      conversation: { kind: 'dm', id: 'stranger' },
      reply: { ...source.reply, conversationId: 'stranger' },
    },
    { signal: consumer!.signal },
  );
  await consumer!.onEvent(source, { signal: consumer!.signal });
  await consumer!.onEvent({ ...source, eventId: 'gateway:qa:43' }, { signal: consumer!.signal });
  await tick();
  await core.runtime.whenIdle();
  await tick();
  expect(runs).toBe(1);
  expect(replies).toHaveLength(2);
  expect(replies[0]).toMatchObject({ account: 'feishu-qa', route: source.reply });
  expect(replies[0]!.text).toContain('#botharness-private-input=');
  expect(replies[0]!.text).not.toContain('api_key');
  expect(replies[1]).toEqual({ account: 'feishu-qa', route: source.reply, text: 'LARK-DM-QA-OK' });
  expect(core.attention.list({ botSlug: 'ada' }).items[0]).toMatchObject({
    externalOrigin: {
      platform: 'feishu',
      conversationName: 'Private owner conversation',
      senderId: 'ou_owner',
    },
  });
  const db = attachOperationalModule(core.operationalDatabase, 'test');
  expect(
    db.read((database) =>
      database.prepare("SELECT * FROM source_events WHERE source_kind = 'bridge-message'").all(),
    ),
  ).toHaveLength(1);
  expect(
    db.read((database) => database.prepare('SELECT * FROM inbox_admissions').all()),
  ).toMatchObject([{ reason: 'human-dm', attempt_state: 'handled' }]);
  expect(
    db.read((database) => database.prepare('SELECT * FROM channel_placements').all()),
  ).toHaveLength(0);
  await core.externalMessaging.revoke('ada', grant.id);
  await consumer!.onEvent(source, { signal: consumer!.signal });
  expect(
    db.read((database) =>
      database.prepare("SELECT * FROM source_events WHERE source_kind = 'bridge-message'").all(),
    ),
  ).toHaveLength(1);
  expect(
    db.read((database) => database.prepare('SELECT * FROM inbox_admissions').all()),
  ).toHaveLength(1);
  expect(replies).toHaveLength(2);
  expect(core.externalMessaging.history('ada')[0]?.receipt).toMatchObject({
    messageId: 'dsh-feishu-qa-client',
  });
});
