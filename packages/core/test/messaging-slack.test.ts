import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
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

it('Slack external-only report stays in Outbox; Human @ enters Inbox once and replies through its own identity', async () => {
  const fingerprint = 'a'.repeat(64);
  let callback: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1] | undefined;
  let runs = 0;
  let core: BotHarnessCore;
  const replies: { botId: string; route: MessagingReplyRoute; text: string }[] = [];
  core = createCore({
    dshHome: createTempRoot('botharness-slack-'),
    agents: {
      async runOrchestrator(run) {
        runs++;
        const source = core.attention
          .list({ botSlug: 'ada' })
          .items.find((item) => item.sourceKind === 'bridge-message');
        expect(source).toBeDefined();
        const details = core.externalMessaging.inbound.read('ada', source!.id);
        expect(details.report?.text).toBe('Slack morning report');
        expect(details.event.reply.parentId).toBeUndefined();
        expect(details.event.reply.rootId).toBe('1791127600.000001');
        expect(run.inbox).toContain('Slack morning report');
        const context = await run.externalMessaging!.context(source!.id, { scope: 'thread' });
        expect(context.messages).toHaveLength(1);
        expect(context.messages[0]).toMatchObject({ text: 'ordinary earlier context' });
        await run.externalMessaging?.reply(source!.id, 'SLACK-QA-OK');
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
    receiptVersion: 1,
    replyContextVersion: 1,
    replyReceiptVersion: 1,
    replyFenceVersion: 1,
    listBots: async () => [{ botId: 'slack-qa', channel: 'slack' }],
    listTargets: async () => [
      {
        targetId: 'qa',
        name: 'botharness-im-qa-802',
        kind: 'conversation',
        route: { channelId: 'C12345678' },
      },
    ],
    describeBot: async (botId) => ({
      version: 1,
      botId,
      channel: 'slack',
      connected: true,
      account: { fingerprint, name: 'Slack QA Bot' },
      capabilities: [
        'proactive-text-checked',
        'proactive-receipt-checked',
        'exclusive-text-consumer',
        'ordinary-text-consumer',
        'reply-text-checked',
        'reply-context-checked',
        'reply-receipt-checked',
        'reply-fence-checked',
        'history-text-checked',
        'thread-history-text-checked',
      ],
    }),
    sendChecked: vi.fn(async () => ({
      sent: true as const,
      receipt: { version: 1 as const, messageId: '1791127600.000001', conversationId: 'C12345678' },
    })),
    consumeInbound: async (_id, input) => {
      expect(input.ordinaryText).toBe(true);
      callback = input;
      return () => {};
    },
    historyChecked: async (_id, _route, query) => ({
      version: 1,
      scope: query.scope,
      events: [
        {
          ...source,
          eventId: 'history:C12345678:1791127720.000001',
          messageId: '1791127720.000001',
          mentionedAccount: false,
          mentions: [],
          text: 'ordinary earlier context',
          reply: { ...source.reply, messageId: '1791127720.000001' },
        },
      ],
      omitted: 0,
      hasMore: false,
      coverage: 'provider-visible-human-text',
    }),
    qualifyReplyChecked: async (_id, route) => route,
    replyChecked: async (botId, route, text, options) => {
      expect(options.beforeSend?.()).toBe(true);
      replies.push({ botId, route, text });
      return {
        sent: true,
        receipt: {
          version: 1,
          messageId: '1791127737.000001',
          conversationId: route.conversationId,
        },
      };
    },
  };
  const slack = createDshImProvider(transport, 'slack')!;
  const lark = createDshImProvider(transport)!;
  expect(slack.history).toBeDefined();
  expect(slack.readFile).toBeUndefined();
  expect(slack.post).toBeDefined();
  core.externalMessaging.register(slack);
  core.externalMessaging.register(lark);
  expect(await lark.accounts()).toEqual([]);
  const targets = await core.externalMessaging.targets(slack.id, 'slack-qa');
  const grant = await core.externalMessaging.authorize({
    botSlug: 'ada',
    providerId: slack.id,
    accountRef: 'slack-qa',
    targetRef: 'qa',
    fingerprint,
    targetDigest: targets[0]!.digest,
  });
  await core.externalMessaging.inbound.setEnabled('ada', grant.id, true);
  expect(callback).toBeDefined();
  const db = attachOperationalModule(core.operationalDatabase, 'test');
  const report = await core.externalMessaging.post(
    'ada',
    grant.id,
    'slack_morning_report',
    'Slack morning report',
  );
  expect(report.state).toBe('provider-accepted');
  expect(report.receipt).toEqual({
    version: 1,
    messageId: '1791127600.000001',
    conversationId: 'C12345678',
  });
  for (const table of ['source_events', 'channel_placements', 'inbox_admissions']) {
    expect(db.read((d) => d.prepare(`SELECT * FROM ${table}`).all())).toHaveLength(0);
  }
  expect(core.externalMessaging.inspectIntent('ada', report.id).text).toBe('Slack morning report');
  expect(
    (
      await core.externalMessaging.post(
        'ada',
        grant.id,
        'slack_morning_report',
        'Slack morning report',
      )
    ).id,
  ).toBe(report.id);
  expect(transport.sendChecked).toHaveBeenCalledTimes(1);
  await expect(
    core.externalMessaging.post('bea', grant.id, 'borrow_report', 'Wrong'),
  ).rejects.toThrow('grant-unavailable');
  const source: MessagingInboundEvent = {
    version: 1,
    channel: 'slack',
    botId: 'slack-qa',
    fingerprint,
    eventId: 'Ev12345678',
    messageId: '1791127736.123456',
    actor: { kind: 'user', id: 'U87654321', name: 'QA Human' },
    conversation: { kind: 'group', id: 'C12345678' },
    mentions: [{ id: 'U12345678', key: '<@U12345678>' }],
    mentionedAccount: true,
    at: '2026-10-05T00:00:00.000Z',
    text: '<@U12345678> Reply in the thread',
    reply: {
      messageId: '1791127736.123456',
      conversationId: 'C12345678',
      actorId: 'U87654321',
      threadId: '1791127600.000001',
      rootId: '1791127600.000001',
    },
    replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
  };
  await callback!.onEvent(
    {
      ...source,
      eventId: 'EvOrdinary',
      messageId: '1791127735.000001',
      mentions: [],
      mentionedAccount: false,
      text: 'Ordinary message does not enter the default mention-only Inbox',
      reply: { ...source.reply, messageId: '1791127735.000001' },
    },
    { signal: callback!.signal },
  );
  await tick();
  expect(runs).toBe(0);
  expect(core.attention.list({ botSlug: 'ada' }).items).toHaveLength(0);
  await callback!.onEvent(source, { signal: callback!.signal });
  await callback!.onEvent({ ...source, eventId: 'EvRedelivery' }, { signal: callback!.signal });
  await tick();
  await core.runtime.whenIdle();
  await tick();
  expect(runs).toBe(1);
  expect(replies).toEqual([{ botId: 'slack-qa', route: source.reply, text: 'SLACK-QA-OK' }]);
  expect(core.attention.list({ botSlug: 'ada' }).items[0]).toMatchObject({
    authorKind: 'bridged',
    externalOrigin: {
      platform: 'slack',
      conversationName: 'botharness-im-qa-802',
      senderName: 'QA Human',
    },
  });
  expect(
    db.read((database) =>
      database.prepare("SELECT * FROM source_events WHERE source_kind = 'bridge-message'").all(),
    ),
  ).toHaveLength(2);
  expect(
    db.read((database) => database.prepare('SELECT * FROM inbox_admissions').all()),
  ).toHaveLength(1);
  expect(core.attention.list({ botSlug: 'ada' }).items).toHaveLength(1);
  expect(
    db.read((database) => database.prepare('SELECT * FROM channel_placements').all()),
  ).toHaveLength(0);
  await expect(
    callback!.onEvent({ ...source, channel: 'feishu' }, { signal: callback!.signal }),
  ).rejects.toThrow('untrusted-source');
  const history = transport.historyChecked!;
  transport.historyChecked = async (...args) => {
    const page = await history(...args);
    return { ...page, events: page.events.map((event) => ({ ...event, channel: 'feishu' })) };
  };
  await expect(
    slack.history!({
      accountRef: 'slack-qa',
      fingerprint,
      route: source.reply,
      query: { scope: 'thread', limit: 20 },
      signal: new AbortController().signal,
    }),
  ).rejects.toThrow('untrusted-source');
  transport.sendChecked = vi.fn(async () => ({
    sent: true as const,
    receipt: { version: 1 as const, messageId: '1791127800.000001', conversationId: 'C87654321' },
  }));
  const unknown = await core.externalMessaging.post(
    'ada',
    grant.id,
    'slack_ambiguous_report',
    'Unknown report',
  );
  expect(unknown.state).toBe('unknown-outcome');
  expect(
    (await core.externalMessaging.post('ada', grant.id, 'slack_ambiguous_report', 'Unknown report'))
      .id,
  ).toBe(unknown.id);
  expect(transport.sendChecked).toHaveBeenCalledTimes(1);
  await core.externalMessaging.revoke('ada', grant.id);
  expect(core.externalMessaging.inspectIntent('ada', report.id).text).toBe('Slack morning report');
  await expect(
    core.externalMessaging.post('ada', grant.id, 'revoked_report', 'Refused'),
  ).rejects.toThrow('grant-revoked');
  await expect(callback!.onEvent(source, { signal: callback!.signal })).rejects.toThrow();
});

it('Slack shared routing preserves one source, independent member policy and own-identity thread authority across connector pause', async () => {
  const fingerprint = 'b'.repeat(64);
  let callback: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1] | undefined;
  const replies: { botId: string; route: MessagingReplyRoute }[] = [];
  const core = createCore({ dshHome: createTempRoot('botharness-slack-shared-') });
  cores.push(core);
  for (const slug of ['ada', 'bea'])
    expect(core.registry.create({ slug, displayName: slug }).ok).toBe(true);
  const transport: DshImOutboundService = {
    contractVersion: 1,
    replyContextVersion: 1,
    replyReceiptVersion: 1,
    replyFenceVersion: 1,
    listBots: async () => [{ botId: 'slack-shared', channel: 'slack' }],
    listTargets: async () => [
      {
        targetId: 'qa',
        name: 'Shared QA',
        kind: 'conversation',
        route: { channelId: 'C12345678' },
      },
    ],
    describeBot: async (botId) => ({
      version: 1,
      botId,
      channel: 'slack',
      connected: true,
      account: { fingerprint, name: 'Own Slack identity' },
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
    sendChecked: async () => ({ sent: true }),
    consumeInbound: async (_id, input) => {
      callback = input;
      return () => {};
    },
    qualifyReplyChecked: async (_id, route) => route,
    replyChecked: async (botId, route, _text, options) => {
      expect(options.beforeSend?.()).toBe(true);
      replies.push({ botId, route });
      return {
        sent: true,
        receipt: {
          version: 1,
          messageId: '1791127999.000001',
          conversationId: route.conversationId,
        },
      };
    },
  };
  core.externalMessaging.register(createDshImProvider(transport, 'slack')!);
  const target = (await core.externalMessaging.targets('dsh-im/slack', 'slack-shared'))[0]!;
  const grant = await core.externalMessaging.authorize({
    botSlug: 'ada',
    providerId: 'dsh-im/slack',
    accountRef: 'slack-shared',
    targetRef: target.ref,
    fingerprint,
    targetDigest: target.digest,
  });
  const channel = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
    name: 'Shared Slack',
    members: ['ada', 'bea'],
  });
  const channelId = channel.id;
  const other = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
    name: 'Unconnected',
    members: ['ada'],
  });
  await core.externalMessaging.setDefaults({
    platform: 'slack',
    expectedRevision: 0,
    collection: 'all',
    wake: 'digest',
    count: 7,
    intervalSeconds: 45,
    identityEnabled: true,
  });
  const policies = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core }).channelGroupWakePolicies({
    channelId,
  });
  expect(policies).toMatchObject({
    ok: true,
    value: {
      members: [
        {
          botSlug: 'ada',
          externals: [
            {
              platform: 'feishu',
              origin: 'platform',
              defaultRevision: 0,
              policy: { mode: 'digest', count: 5, intervalSeconds: 30 },
            },
            {
              platform: 'slack',
              origin: 'platform',
              defaultRevision: 1,
              policy: { mode: 'digest', count: 7, intervalSeconds: 45 },
            },
            {
              platform: 'discord',
              origin: 'platform',
              defaultRevision: 0,
              policy: { mode: 'digest', count: 5, intervalSeconds: 30 },
            },
          ],
        },
        {
          botSlug: 'bea',
          externals: [
            { platform: 'feishu' },
            { platform: 'slack', policy: { count: 7 } },
            { platform: 'discord', defaultRevision: 0, policy: { count: 5 } },
          ],
        },
      ],
    },
  });
  core.channels.setGroupWakePolicy(channelId, 'ada', {
    mode: 'digest',
    count: 2,
    intervalSeconds: 60,
  });
  core.channels.setGroupWakePolicy(channelId, 'bea', {
    mode: 'silent',
    count: 2,
    intervalSeconds: 60,
  });
  await core.externalMessaging.inbound.channelBridge(channelId, {
    kind: 'add',
    grantId: grant.id,
    expectedGrantRevision: grant.revision,
    name: 'Slack source',
    enabled: true,
    collection: 'mentions',
  });
  const event = (id: string, mentionedAccount = false): MessagingInboundEvent => ({
    version: 1,
    channel: 'slack',
    botId: 'slack-shared',
    fingerprint,
    eventId: 'Ev-' + id,
    messageId: id,
    actor: { kind: 'user', id: 'U87654321', name: 'Human sender' },
    conversation: { kind: 'group', id: 'C12345678' },
    mentions: mentionedAccount ? [{ id: 'U12345678', key: '<@U12345678>' }] : [],
    mentionedAccount,
    at: new Date(Date.now() + 1000).toISOString(),
    text: 'Shared text ' + id,
    reply: {
      conversationId: 'C12345678',
      messageId: id,
      actorId: 'U87654321',
      threadId: '1791127600.000001',
      rootId: '1791127600.000001',
    },
    replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
  });
  const receive = async (e: MessagingInboundEvent) =>
    callback!.onEvent(e, { signal: callback!.signal });
  await receive(event('1791127730.000001'));
  expect(core.channels.readMessages(channelId)).toHaveLength(0);
  let row = (await core.externalMessaging.channelBridges(channelId)).bridges[0]!;
  const change = async (enabled: boolean, collection: 'all' | 'mentions') => {
    await core.externalMessaging.inbound.channelBridge(channelId, {
      kind: 'update',
      routeId: row.routeId,
      grantId: row.grantId,
      expectedGrantRevision: row.grantRevision,
      expectedRevision: row.revision,
      name: row.name,
      enabled,
      collection,
    });
    row = (await core.externalMessaging.channelBridges(channelId)).bridges[0]!;
  };
  expect(row.ordinaryDelivery).toBe('verified');
  await change(true, 'all');
  const first = event('1791127731.000001');
  await receive(first);
  await receive({ ...first, eventId: 'Ev-redelivery' });
  expect(core.channels.readMessages(channelId)).toHaveLength(1);
  expect(core.channels.readMessages(other.id)).toHaveLength(0);
  const sourceId = core.channels.readMessages(channelId)[0]!.id;
  expect(core.externalMessaging.inbound.read('bea', sourceId)).toMatchObject({
    event: { actor: { id: 'U87654321', name: 'Human sender' }, reply: first.reply },
  });
  const db = attachOperationalModule(core.operationalDatabase, 'test');
  const admissions = db.read((d) =>
    d
      .prepare(
        'SELECT bot_slug, wake_mode, wake_count FROM inbox_admissions WHERE source_event_id = ? ORDER BY bot_slug',
      )
      .all(sourceId),
  );
  expect(admissions).toEqual([
    { bot_slug: 'ada', wake_mode: 'digest', wake_count: 2 },
    { bot_slug: 'bea', wake_mode: 'silent', wake_count: null },
  ]);
  await expect(core.externalMessaging.reply('bea', sourceId, 'Borrow receiver')).rejects.toThrow(
    'own-reply-grant-unavailable',
  );
  await core.externalMessaging.reply('ada', sourceId, 'Own reply');
  expect(replies).toEqual([{ botId: 'slack-shared', route: first.reply }]);
  await change(false, 'all');
  const missed = event('1791127732.000001');
  missed.at = new Date(Date.now() - 1000).toISOString();
  await receive(missed);
  await change(true, 'all');
  await receive({ ...missed, eventId: 'Ev-late-paused' });
  expect(core.channels.readMessages(channelId)).toHaveLength(1);
  await receive(event('1791127733.000001'));
  expect(core.channels.readMessages(channelId)).toHaveLength(2);
  expect(replies).toHaveLength(1);
});
