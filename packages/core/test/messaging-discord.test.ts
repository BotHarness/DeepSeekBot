import { setImmediate as tick } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import type { MessagingInboundEvent, MessagingReplyRoute } from '../src/messaging/provider.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createTempRoot } from './helpers.js';

const cores: BotHarnessCore[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

it.each([
  {
    name: 'channel nearby context',
    nearby: true,
    threadId: undefined,
    refusal: undefined,
    state: 'provider-accepted',
    reason: undefined,
  },
  {
    name: 'thread nearby context',
    nearby: true,
    threadId: '555555555555555555',
    refusal: undefined,
    state: 'provider-accepted',
    reason: undefined,
  },
  {
    name: 'channel reply',
    nearby: false,
    threadId: undefined,
    refusal: undefined,
    state: 'provider-accepted',
    reason: undefined,
  },
  {
    name: 'own managed-role channel reply',
    managedRole: true,
    nearby: false,
    threadId: undefined,
    refusal: undefined,
    state: 'provider-accepted',
    reason: undefined,
  },
  {
    name: 'thread reply',
    nearby: false,
    threadId: '555555555555555555',
    refusal: undefined,
    state: 'provider-accepted',
    reason: undefined,
  },
  {
    name: 'deleted source',
    nearby: false,
    threadId: undefined,
    refusal: 'source-not-found',
    state: 'failed',
    reason: 'source-not-found',
  },
  {
    name: 'thread permission refusal',
    nearby: false,
    threadId: '555555555555555555',
    refusal: 'reply-permission-denied',
    state: 'failed',
    reason: 'reply-permission-denied',
  },
  {
    name: 'unknown transport outcome',
    nearby: false,
    threadId: undefined,
    refusal: 'reply-result-unknown',
    state: 'unknown-outcome',
    reason: 'provider-result-unknown',
  },
])(
  'Discord canonical Inbox and own-identity reply preserve $name outcome',
  async ({ threadId, refusal, state, reason, nearby, managedRole }) => {
    const fingerprint = 'd'.repeat(64);
    let consumer: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1] | undefined;
    let runs = 0;
    let replyCalls = 0;
    let historyCalls = 0;
    let outcome: unknown;
    let core: BotHarnessCore;
    const replies: { account: string; route: MessagingReplyRoute; text: string }[] = [];
    core = createCore({
      dshHome: createTempRoot('botharness-discord-'),
      agents: {
        async runOrchestrator(run) {
          runs++;
          const attentionSource = core.attention
            .list({ botSlug: 'ada' })
            .items.find((item) => item.sourceKind === 'bridge-message');
          expect(attentionSource).toBeDefined();
          const context = await run.externalMessaging!.context(attentionSource!.id, {
            scope: nearby ? 'nearby' : threadId ? 'thread' : 'group',
          });
          expect(context.messages.map((message) => message.text)).toEqual(
            nearby ? [source.text, 'cobalt-37'] : ['cobalt-37'],
          );
          if (nearby) expect(context.window).toEqual({ start: 1000, end: 1601 });
          outcome = await run.externalMessaging!.reply(attentionSource!.id, 'DISCORD-QA-OK');
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
          'history-text-checked',
          'thread-history-text-checked',
        ],
      }),
      sendChecked: vi.fn(async (): Promise<{ sent: true }> => ({ sent: true })),
      consumeInbound: async (_account, options) => {
        expect(options.ordinaryText).toBeUndefined();
        expect(options.sourceFiles).toBeUndefined();
        consumer = options;
        return () => {};
      },
      historyChecked: async (account, route, query, options) => {
        historyCalls++;
        expect(account).toBe('discord-qa');
        expect(options.expectedFingerprint).toBe(fingerprint);
        expect(route).toEqual(source.reply);
        expect(query.limit).toBe(20);
        if (nearby)
          expect(query).toMatchObject({ scope: 'nearby', beforeCount: 10, afterCount: 5 });
        return {
          version: 1,
          scope: query.scope,
          ...(nearby ? { window: { start: 1000, end: 1601 } } : {}),
          events: [
            ...(nearby ? [source] : []),
            {
              ...source,
              eventId: 'history:qa:700000000000000000',
              messageId: '700000000000000000',
              mentionedAccount: false,
              mentions: [],
              text: 'cobalt-37',
              reply: { ...source.reply, messageId: '700000000000000000' },
            },
          ],
          omitted: 0,
          hasMore: false,
          coverage: 'provider-visible-human-text',
        };
      },
      qualifyReplyChecked: async (_account, route) => route,
      replyChecked: async (account, route, text, options) => {
        replyCalls++;
        if (refusal) throw Object.assign(new Error(refusal), { code: refusal });
        expect(options.beforeSend?.()).toBe(true);
        replies.push({ account, route, text });
        return {
          sent: true,
          receipt: {
            version: 1,
            messageId: '999999999999999999',
            conversationId: route.conversationId,
          },
        };
      },
    };
    const provider = createDshImProvider(transport, 'discord')!;
    core.externalMessaging.register(provider);
    expect(await createDshImProvider(transport, 'slack')!.accounts()).toEqual([]);
    expect(provider.post).toBeUndefined();
    expect(provider.readFile).toBeUndefined();
    const target = (await core.externalMessaging.targets(provider.id, 'discord-qa'))[0]!;
    expect(target.receiveScope).toEqual({ kind: 'group', conversationId: '444444444444444444' });
    const grant = await core.externalMessaging.authorize({
      botSlug: 'ada',
      providerId: provider.id,
      accountRef: 'discord-qa',
      targetRef: 'qa',
      fingerprint,
      targetDigest: target.digest,
    });
    await core.externalMessaging.inbound.setEnabled('ada', grant.id, true);
    const source: MessagingInboundEvent = {
      version: 1,
      channel: 'discord',
      botId: 'discord-qa',
      fingerprint,
      eventId: 'gateway:qa:42',
      messageId: '777777777777777777',
      actor: { kind: 'user', id: '666666666666666666', name: 'QA Human' },
      conversation: { kind: 'group', id: '444444444444444444' },
      mentions: managedRole ? [] : [{ id: '111111111111111111', key: '<@111111111111111111>' }],
      mentionedAccount: true,
      at: new Date().toISOString(),
      text: managedRole ? '<@&888888888888888888> Reply here' : '<@111111111111111111> Reply here',
      reply: {
        messageId: '777777777777777777',
        actorId: '666666666666666666',
        conversationId: '444444444444444444',
        ...(threadId ? { threadId } : {}),
      },
      replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
    };
    await expect(
      consumer!.onEvent({ ...source, channel: 'slack' }, { signal: consumer!.signal }),
    ).rejects.toThrow('untrusted-source');
    await expect(
      consumer!.onEvent({ ...source, botId: 'wrong-account' }, { signal: consumer!.signal }),
    ).rejects.toThrow('untrusted-source');
    await consumer!.onEvent(source, { signal: consumer!.signal });
    await consumer!.onEvent({ ...source, eventId: 'gateway:qa:43' }, { signal: consumer!.signal });
    await tick();
    await core.runtime.whenIdle();
    await tick();
    expect(runs).toBe(1);
    expect(replyCalls).toBe(1);
    expect(historyCalls).toBe(1);
    expect(outcome).toMatchObject({ state, ...(reason ? { reason } : {}) });
    expect(replies).toEqual(
      refusal ? [] : [{ account: 'discord-qa', route: source.reply, text: 'DISCORD-QA-OK' }],
    );
    expect(transport.sendChecked).not.toHaveBeenCalled();
    expect(core.externalMessaging.history('ada')).toHaveLength(1);
    expect(core.attention.list({ botSlug: 'ada' }).items[0]).toMatchObject({
      externalOrigin: {
        platform: 'discord',
        conversationName: 'Discord QA channel',
        senderName: 'QA Human',
      },
    });
    const db = attachOperationalModule(core.operationalDatabase, 'test');
    expect(
      db.read((database) =>
        database.prepare("SELECT * FROM source_events WHERE source_kind = 'bridge-message'").all(),
      ),
    ).toHaveLength(2);
    expect(
      db.read((database) => database.prepare('SELECT * FROM inbox_admissions').all()),
    ).toHaveLength(1);
    expect(
      db.read((database) => database.prepare('SELECT * FROM channel_placements').all()),
    ).toHaveLength(0);
    await expect(
      core.externalMessaging.inbound.context(
        'other-bot',
        core.attention.list({ botSlug: 'ada' }).items[0]!.id,
        'borrow-context',
        { scope: 'group' },
      ),
    ).rejects.toThrow();
    expect(historyCalls).toBe(1);
    const anchor = core.attention.list({ botSlug: 'ada' }).items[0]!.id;
    await core.externalMessaging.revoke('ada', grant.id);
    await expect(
      core.externalMessaging.inbound.context('ada', anchor, 'revoked-context', {
        scope: 'group',
      }),
    ).rejects.toThrow('source-unavailable');
    expect(historyCalls).toBe(1);
    await expect(consumer!.onEvent(source, { signal: consumer!.signal })).rejects.toThrow();
    expect(replies).toHaveLength(refusal ? 0 : 1);
    expect(replyCalls).toBe(1);
  },
);

it.each([undefined, '555555555555555555'])(
  'Discord opted-in ordinary text uses existing proof gate, count harvest and checked source reply (thread=%s)',
  async (threadId) => {
    const fingerprint = 'd'.repeat(64);
    let consumer: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1] | undefined;
    let runs = 0;
    const replies: MessagingReplyRoute[] = [];
    let core: BotHarnessCore;
    core = createCore({
      dshHome: createTempRoot('botharness-discord-ordinary-'),
      agents: {
        async runOrchestrator(run) {
          runs++;
          expect(run.inbox).toContain('ordinary message; no reply required');
          const source = core.attention
            .list({ botSlug: 'ada' })
            .items.find(
              (item) =>
                item.sourceKind === 'bridge-message' &&
                run.externalMessaging!.read(item.id).event.messageId === second.messageId,
            )!;
          expect(
            await run.externalMessaging!.reply(source.id, 'DISCORD-ORDINARY-OK'),
          ).toMatchObject({ state: 'provider-accepted' });
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
    const service: DshImOutboundService = {
      contractVersion: 1,
      replyContextVersion: 1,
      replyReceiptVersion: 1,
      replyFenceVersion: 1,
      listBots: async () => [{ botId: 'discord-ordinary', channel: 'discord' }],
      listTargets: async () => [
        {
          targetId: 'qa',
          name: 'Discord QA',
          kind: 'channel',
          route: { channelId: '444444444444444444' },
        },
      ],
      describeBot: async (botId) => ({
        version: 1,
        botId,
        channel: 'discord',
        connected: true,
        account: { fingerprint },
        capabilities: [
          'proactive-text-checked',
          'exclusive-text-consumer',
          'ordinary-text-consumer',
          'reply-text-checked',
          'reply-context-checked',
          'reply-receipt-checked',
          'reply-fence-checked',
        ],
      }),
      sendChecked: async () => {
        throw new Error('no proactive fallback');
      },
      consumeInbound: async (_id, input) => {
        expect(input.ordinaryText).toBe(true);
        consumer = input;
        return () => {};
      },
      qualifyReplyChecked: async (_id, route) => route,
      replyChecked: async (_id, route, _text, options) => {
        expect(options.beforeSend?.()).toBe(true);
        replies.push(route);
        return {
          sent: true,
          receipt: {
            version: 1,
            messageId: '999999999999999999',
            conversationId: route.conversationId,
          },
        };
      },
    };
    core.externalMessaging.register(createDshImProvider(service, 'discord')!);
    const target = (await core.externalMessaging.targets('dsh-im/discord', 'discord-ordinary'))[0]!;
    const grant = await core.externalMessaging.authorize({
      botSlug: 'ada',
      providerId: 'dsh-im/discord',
      accountRef: 'discord-ordinary',
      targetRef: target.ref,
      fingerprint,
      targetDigest: target.digest,
    });
    await core.externalMessaging.inbound.setEnabled('ada', grant.id, true);
    const policy = { collection: 'all', wake: 'digest', count: 2, intervalSeconds: 60 } as const;
    await expect(
      core.externalMessaging.inbound.setPolicy('ada', grant.id, policy, { kind: 'human' }),
    ).rejects.toThrow('ordinary-delivery-unverified');
    const event = (messageId: string): MessagingInboundEvent => ({
      version: 1,
      channel: 'discord',
      botId: 'discord-ordinary',
      fingerprint,
      eventId: 'gateway:ordinary:' + messageId,
      messageId,
      actor: { kind: 'user', id: '666666666666666666', name: 'QA Human' },
      conversation: { kind: 'group', id: '444444444444444444' },
      mentions: [],
      mentionedAccount: false,
      at: new Date().toISOString(),
      text: 'Ordinary ' + messageId,
      reply: {
        messageId,
        conversationId: '444444444444444444',
        actorId: '666666666666666666',
        ...(threadId ? { threadId } : {}),
      },
      replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
    });
    const receive = (value: MessagingInboundEvent) =>
      consumer!.onEvent(value, { signal: consumer!.signal });
    const idle = async () => {
      await tick();
      await core.runtime.whenIdle();
      await tick();
    };
    const db = attachOperationalModule(core.operationalDatabase, 'test');
    const query = (sql: string) => db.read((database) => database.prepare(sql).all());
    await receive(event('700000000000000000'));
    await idle();
    expect(query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
      0,
    );
    expect((await core.externalMessaging.snapshot('ada')).grants[0]).toMatchObject({
      ordinaryDelivery: 'verified',
      groupPolicy: { collection: 'mentions' },
    });
    await core.externalMessaging.inbound.setPolicy('ada', grant.id, policy, { kind: 'human' });
    const first = event('777777777777777777');
    const second = event('777777777777777778');
    await receive(first);
    await idle();
    expect(runs).toBe(0);
    await receive(second);
    await idle();
    expect(runs).toBe(1);
    await receive({ ...first, eventId: 'gateway:redelivery' });
    await idle();
    expect(runs).toBe(1);
    expect(replies).toHaveLength(1);
    expect(replies).toEqual([second.reply]);
    expect(query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
      2,
    );
    expect(
      query(
        "SELECT reason, wake_count, attempt_state FROM inbox_admissions WHERE reason = 'group-ordinary'",
      ),
    ).toEqual([
      { reason: 'group-ordinary', wake_count: 2, attempt_state: 'handled' },
      { reason: 'group-ordinary', wake_count: 2, attempt_state: 'handled' },
    ]);
    expect(query('SELECT * FROM messaging_outbox')).toHaveLength(1);
    expect(query('SELECT * FROM channel_placements')).toHaveLength(0);
    await core.externalMessaging.inbound.setPolicy(
      'ada',
      grant.id,
      { ...policy, collection: 'mentions' },
      { kind: 'human' },
    );
    await receive(event('777777777777777779'));
    await idle();
    expect(runs).toBe(1);
    expect(query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
      2,
    );
    await core.externalMessaging.revoke('ada', grant.id);
    await expect(receive(event('777777777777777780'))).rejects.toThrow();
  },
);

it('Discord shared placement deduplicates the existing Inbox path and preserves native child authority across connector pause', async () => {
  const fingerprint = 'e'.repeat(64);
  let consumer: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1] | undefined;
  const replies: MessagingReplyRoute[] = [];
  const core = createCore({ dshHome: createTempRoot('botharness-discord-shared-') });
  cores.push(core);
  for (const slug of ['ada', 'bea'])
    expect(core.registry.create({ slug, displayName: slug }).ok).toBe(true);
  const transport: DshImOutboundService = {
    contractVersion: 1,
    replyContextVersion: 1,
    replyReceiptVersion: 1,
    replyFenceVersion: 1,
    listBots: async () => [{ botId: 'discord-shared', channel: 'discord' }],
    listTargets: async () => [
      {
        targetId: 'qa',
        name: 'Discord parent',
        kind: 'channel',
        route: { channelId: '444444444444444444' },
      },
    ],
    describeBot: async (botId) => ({
      version: 1,
      botId,
      channel: 'discord',
      connected: true,
      account: { fingerprint, name: 'Own Discord identity' },
      capabilities: [
        'proactive-text-checked',
        'exclusive-text-consumer',
        'reply-text-checked',
        'reply-context-checked',
        'reply-receipt-checked',
        'reply-fence-checked',
      ],
    }),
    sendChecked: vi.fn(async () => ({ sent: true as const })),
    consumeInbound: async (_account, input) => {
      expect(input.ordinaryText).toBeUndefined();
      consumer = input;
      return () => {};
    },
    qualifyReplyChecked: async (_account, route) => route,
    replyChecked: async (account, route, _text, options) => {
      expect(account).toBe('discord-shared');
      expect(options.beforeSend?.()).toBe(true);
      replies.push(route);
      return {
        sent: true,
        receipt: {
          version: 1,
          messageId: '700000000000000000',
          conversationId: route.threadId ?? route.conversationId,
        },
      };
    },
  };
  const provider = createDshImProvider(transport, 'discord')!;
  core.externalMessaging.register(provider);
  const target = (await core.externalMessaging.targets(provider.id, 'discord-shared'))[0]!;
  const grant = await core.externalMessaging.authorize({
    botSlug: 'ada',
    providerId: provider.id,
    accountRef: 'discord-shared',
    targetRef: target.ref,
    fingerprint,
    targetDigest: target.digest,
  });
  const shared = core.channels.createGroup({ name: 'Shared Discord', members: ['ada', 'bea'] });
  const other = core.channels.createGroup({ name: 'Untargeted', members: ['ada'] });
  await core.externalMessaging.inbound.channelBridge(shared.id, {
    kind: 'add',
    grantId: grant.id,
    expectedGrantRevision: grant.revision,
    name: 'Discord source',
    enabled: true,
    collection: 'mentions',
  });
  const event = (id: string): MessagingInboundEvent => ({
    version: 1,
    channel: 'discord',
    botId: 'discord-shared',
    fingerprint,
    eventId: 'discord:' + id,
    messageId: id,
    actor: { kind: 'user', id: '666666666666666666', name: 'QA Human' },
    conversation: { kind: 'group', id: '444444444444444444' },
    mentionedAccount: true,
    mentions: [{ id: '333333333333333333', key: '<@333333333333333333>' }],
    at: new Date().toISOString(),
    text: 'Shared Discord ' + id,
    reply: {
      conversationId: '444444444444444444',
      messageId: id,
      actorId: '666666666666666666',
      threadId: '555555555555555555',
    },
    replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
  });
  const receive = (source: MessagingInboundEvent) =>
    consumer!.onEvent(source, { signal: consumer!.signal });
  const first = event('600000000000000001');
  await receive(first);
  await receive({ ...first, eventId: 'discord:redelivery' });
  const messages = core.channels.readMessages(shared.id);
  expect(messages).toHaveLength(1);
  expect(core.channels.readMessages(other.id)).toHaveLength(0);
  const sourceId = messages[0]!.id;
  const database = attachOperationalModule(core.operationalDatabase, 'test');
  const admissions = () =>
    database.read((db) =>
      db
        .prepare(
          'SELECT bot_slug FROM inbox_admissions WHERE source_event_id = ? ORDER BY bot_slug',
        )
        .all(sourceId),
    );
  expect(admissions()).toEqual([{ bot_slug: 'ada' }]);
  expect(() => core.externalMessaging.inbound.read('bea', sourceId)).toThrow('source-unavailable');
  expect(core.externalMessaging.inbound.readShared('bea', sourceId)).toMatchObject({
    event: { reply: first.reply },
  });
  await expect(core.externalMessaging.reply('bea', sourceId, 'Borrow identity')).rejects.toThrow(
    'own-reply-grant-unavailable',
  );
  await core.externalMessaging.reply('ada', sourceId, 'Own reply');
  expect(replies).toEqual([first.reply]);
  let row = (await core.externalMessaging.channelBridges(shared.id)).bridges[0]!;
  expect(row).toMatchObject({ platform: 'discord', ordinaryDelivery: 'unverified', enabled: true });
  const change = async (enabled: boolean) => {
    await core.externalMessaging.inbound.channelBridge(shared.id, {
      kind: 'update',
      routeId: row.routeId,
      grantId: row.grantId,
      expectedGrantRevision: row.grantRevision,
      expectedRevision: row.revision,
      name: row.name,
      enabled,
      collection: 'mentions',
    });
    row = (await core.externalMessaging.channelBridges(shared.id)).bridges[0]!;
  };
  await change(false);
  const paused = event('600000000000000002');
  await receive(paused);
  expect(core.channels.readMessages(shared.id)).toHaveLength(1);
  await expect(
    core.externalMessaging.snapshot('ada').then((s) => s.grants[0]!.canPost),
  ).resolves.toBe(false);
  await new Promise((resolve) => setTimeout(resolve, 5));
  await change(true);
  expect(Date.parse(row.intakeAfter!)).toBeGreaterThan(Date.parse(paused.at));
  await receive({ ...paused, eventId: 'discord:late-paused' });
  expect(core.channels.readMessages(shared.id)).toHaveLength(1);
  await receive(event('600000000000000003'));
  expect(core.channels.readMessages(shared.id)).toHaveLength(2);
  await expect(receive({ ...first, channel: 'slack' })).rejects.toThrow('untrusted-source');
  expect(core.channels.readMessages(other.id)).toHaveLength(0);
  expect(replies).toHaveLength(1);
  expect(transport.sendChecked).not.toHaveBeenCalled();
});
