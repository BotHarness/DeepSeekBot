import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { afterEach, expect, it } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import {
  fingerprint,
  event,
  fixture,
  contextEvent,
  sharedTarget,
  bridgeRow,
  addRoute,
  createRouteGroup,
  cleanup,
} from './messaging-inbound-fixtures.js';

afterEach(cleanup);

it('places one canonical external Source Event in a shared Channel, wakes only the addressed identity and preserves its reply route', async () => {
  let channelId: string;
  let sourceId: string;
  const fx = await fixture({
    onRun: async (run) => {
      if (run.bot.slug === 'ada') {
        expect(run.inboundChannelId).toBe(channelId);
        const item = fx.core.attention
          .list({ botSlug: 'ada' })
          .items.find((item) => item.sourceKind === 'bridge-message')!;
        sourceId = item.id;
        expect(run.channels.read({ channelId })[0]?.message).toMatchObject({
          id: sourceId,
          author: { kind: 'bridged', source: 'Human sender' },
          body: event().text,
          bridgeOrigin: {
            messageId: 'om-1',
            sourceEventId: sourceId,
            senderId: 'ou-human',
            senderName: 'Human sender',
            threadId: 'omt-topic',
          },
        });
        expect(run.externalMessaging?.read(sourceId).localChannelId).toBe(channelId);
        await run.externalMessaging?.reply(sourceId, 'Shared work reply');
      } else {
        expect(run.bot.slug).toBe('bea');
        expect(run.channels.query({ channelId, text: 'Please reply' }).messages).toHaveLength(1);
        expect(run.channels.read({ channelId })[0]?.message.id).toBe(sourceId);
        expect(run.externalMessaging?.read(sourceId).event.actor.id).toBe('ou-human');
        await expect(run.externalMessaging?.reply(sourceId, 'Borrowed identity')).rejects.toThrow(
          'own-reply-grant-unavailable',
        );
      }
    },
  });
  channelId = await sharedTarget(fx);
  expect((await fx.core.externalMessaging.snapshot('ada')).channelTargets).toContainEqual({
    id: channelId,
    name: 'Shared Lark work',
  });
  await fx.enable();
  expect(
    await fx.receive(event({ actor: { kind: 'user', id: 'ou-human', name: 'Human sender' } })),
  ).toEqual({ accepted: true });
  expect(fx.core.channels.readMessages(channelId)).toHaveLength(1);
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    1,
  );
  expect(fx.query('SELECT * FROM channel_placements')).toHaveLength(1);
  expect(fx.core.attention.list({ botSlug: 'bea' }).items).toHaveLength(0);
  await fx.idle();
  expect(fx.runs.map((run) => run.bot.slug)).toEqual(['ada']);
  expect(fx.replies).toEqual([
    { botId: 'lark-app', route: event().reply, text: 'Shared work reply' },
  ]);
  const dm = fx.core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'bea', 'Bea')!;
  await fx.core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
    id: 'check',
    at: '2026-10-01T00:01:00Z',
    author: { kind: 'human' },
    body: 'Read the shared Channel',
  });
  fx.core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
    channelId: dm.id,
    messageId: 'check',
    body: 'Read the shared Channel',
  });
  await fx.idle();
  expect(fx.runs.map((run) => run.bot.slug)).toEqual(['ada', 'bea']);
  expect(
    fx.core.channels.readMessages(
      fx.core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!.id,
    ),
  ).toHaveLength(0);
  expect(fx.replies).toHaveLength(1);
  await fx.receive();
  await fx.idle();
  await fx.restart();
  await fx.receive();
  await fx.idle();
  expect(fx.core.channels.readMessages(channelId)).toHaveLength(1);
  expect(fx.core.channels.readMessages(channelId)[0]?.bridgeOrigin).toMatchObject({
    senderName: 'Human sender',
    senderId: 'ou-human',
    sourceEventId: sourceId!,
  });
  expect(fx.runs.map((run) => run.bot.slug)).toEqual(['ada', 'bea']);
  expect(fx.replies).toHaveLength(1);
  expect(fx.query("SELECT * FROM inbox_admissions WHERE reason = 'group-mention'")).toHaveLength(1);
});

it('refuses non-group or nonmember targets without changing the grant, and supports returning to Inbox-only reception', async () => {
  const fx = await fixture();
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...fx.core });
  const dm = fx.core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
  const other = fx.core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
    name: 'Other members',
    members: [],
  });
  for (const channelId of [dm.id, other.id, 'missing']) {
    expect(
      await methods.messagingChannelTarget({ slug: 'ada', grantId: fx.grant.id, channelId }),
    ).toMatchObject({ ok: false, error: { code: 'channel-unavailable' } });
  }
  expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]?.revision).toBe(
    fx.grant.revision,
  );
  await sharedTarget(fx);
  await methods.messagingChannelTarget({ slug: 'ada', grantId: fx.grant.id, channelId: null });
  await fx.enable();
  await fx.receive();
  await fx.idle();
  expect(fx.runs[0]?.inboundChannelId).toBeUndefined();
  expect(fx.query('SELECT * FROM channel_placements')).toHaveLength(0);
});

it('closes intake and old-source authority on Channel departure while retaining the shared fact', async () => {
  const fx = await fixture();
  const channelId = await sharedTarget(fx);
  await fx.enable();
  await fx.receive();
  await fx.idle();
  const id = fx.core.attention.list({ botSlug: 'ada' }).items[0]!.id;
  fx.core.channels.removeGroupMember(channelId, 'ada');
  expect(fx.core.externalMessaging.inbound.status(fx.grant.id)).toBe('unavailable');
  expect(() => fx.core.externalMessaging.inbound.read('ada', id)).toThrow('channel-unavailable');
  expect(fx.core.externalMessaging.inbound.available('ada', id)).toBe(false);
  await expect(fx.core.externalMessaging.reply('ada', id, 'Too late')).rejects.toThrow(
    'source-unavailable',
  );
  expect(
    await fx.receive(
      event({ eventId: 'ev-2', messageId: 'om-2', reply: { ...event().reply, messageId: 'om-2' } }),
    ),
  ).toEqual({ accepted: true });
  await fx.idle();
  expect(fx.replies).toHaveLength(0);
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    1,
  );
  expect(fx.core.channels.readMessages(channelId).some((message) => message.id === id)).toBe(true);
  await fx.restart();
  await fx.receive(
    event({ eventId: 'ev-3', messageId: 'om-3', reply: { ...event().reply, messageId: 'om-3' } }),
  );
  await fx.idle();
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    1,
  );
});

it('revoking a Channel bridge before the queued turn starts preserves its placement without waking or sending', async () => {
  const fx = await fixture();
  const channelId = await sharedTarget(fx);
  await fx.enable();
  await fx.receive();
  fx.core.externalMessaging.revoke('ada', fx.grant.id);
  await fx.idle();
  expect(fx.subscriptions).toBe(0);
  expect(fx.runs).toHaveLength(0);
  expect(fx.replies).toHaveLength(0);
  expect(fx.core.channels.readMessages(channelId)).toHaveLength(1);
});

it('shares one exclusive account receiver across two authorized groups without merging equal message IDs', async () => {
  const fx = await fixture();
  fx.publicService.listTargets = async () => [
    { targetId: 'team', name: 'QA team', kind: 'group', route: { chatId: 'oc-team' } },
    { targetId: 'other', name: 'QA other', kind: 'group', route: { chatId: 'oc-other' } },
  ];
  const originalConsume = fx.publicService.consumeInbound!;
  fx.publicService.consumeInbound = async (id, input) => {
    if (fx.subscriptions > 0)
      throw Object.assign(new Error('exclusive receiver'), { code: 'consumer-conflict' });
    return originalConsume(id, input);
  };
  const targets = await fx.core.externalMessaging.targets('dsh-im/feishu', 'lark-app');
  const second = await fx.core.externalMessaging.authorize({
    botSlug: 'ada',
    providerId: 'dsh-im/feishu',
    accountRef: 'lark-app',
    targetRef: 'other',
    fingerprint,
    targetDigest: targets.find((target) => target.ref === 'other')!.digest,
  });
  await fx.enable();
  await fx.core.externalMessaging.inbound.setEnabled('ada', second.id, true);
  expect(fx.subscriptions).toBe(1);
  await fx.receive(event());
  await fx.receive(
    event({
      conversation: { kind: 'group', id: 'oc-other' },
      reply: { messageId: 'om-1', conversationId: 'oc-other', actorId: 'ou-human' },
    }),
  );
  const sources = fx.query(
    "SELECT source_event_id, body FROM source_events WHERE source_kind = 'bridge-message'",
  );
  expect(sources).toHaveLength(2);
  expect(fx.query('SELECT * FROM inbox_admissions')).toHaveLength(2);
  await fx.core.externalMessaging.inbound.setEnabled('ada', fx.grant.id, false);
  expect(fx.subscriptions).toBe(1);
  await fx.receive(
    event({
      messageId: 'om-2',
      conversation: { kind: 'group', id: 'oc-other' },
      reply: { messageId: 'om-2', conversationId: 'oc-other', actorId: 'ou-human' },
    }),
  );
  expect(
    fx.query("SELECT source_event_id FROM source_events WHERE source_kind = 'bridge-message'"),
  ).toHaveLength(3);
  fx.core.externalMessaging.revoke('ada', second.id);
  expect(fx.subscriptions).toBe(0);
});

it('routes one source to two Groups, an explicit DM and Inbox with one member admission, processing and original-group reply', async () => {
  const fx = await fixture({
    onRun: async (run) => {
      const source = fx.core.attention.list({ botSlug: 'ada' }).items[0]!;
      expect(run.externalMessaging!.read(source.id).receptionPaths).toHaveLength(4);
      await run.externalMessaging!.reply(source.id, 'One authorized reply');
    },
  });
  const first = createRouteGroup(fx, 'First');
  const second = createRouteGroup(fx, 'Second');
  const dm = fx.core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
  await addRoute(fx, first);
  await addRoute(fx, second);
  await addRoute(fx, dm.id);
  await addRoute(fx, dm.id, 'inbox');
  const message = event({ at: new Date(Date.now() + 100).toISOString() });
  await fx.receive(message);
  await fx.idle();
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    1,
  );
  expect(fx.query('SELECT * FROM channel_placements')).toHaveLength(3);
  expect(fx.query('SELECT * FROM messaging_source_paths')).toHaveLength(4);
  expect(fx.query('SELECT * FROM inbox_admissions')).toHaveLength(1);
  expect(fx.core.attention.list({ botSlug: 'ada' }).items).toHaveLength(1);
  expect(fx.runs).toHaveLength(1);
  expect(fx.replies).toHaveLength(1);
  expect(fx.replies[0]?.route).toEqual(message.reply);
  for (const id of [first, second, dm.id])
    expect(fx.core.channels.readMessages(id)).toHaveLength(1);
  await fx.receive(message);
  await fx.idle();
  await fx.restart();
  await fx.receive(message);
  await fx.idle();
  expect(fx.query('SELECT * FROM channel_placements')).toHaveLength(3);
  expect(fx.runs).toHaveLength(1);
  expect(fx.replies).toHaveLength(1);
  expect(fx.subscriptions).toBe(1);
});

it.each(['channel', 'inbox'] as const)(
  'delivers a context-only cached source through a managed %s route exactly once',
  async (delivery) => {
    const cached = event({
      messageId: 'om-context-before-live',
      eventId: 'context-before-live',
      text: 'Mention cached before its live delivery',
      at: new Date(Date.now() + 60000).toISOString(),
      reply: { ...event().reply, messageId: 'om-context-before-live' },
    });
    const fx = await fixture({
      history: async (_account, _route, query) => ({
        version: 1,
        scope: query.scope,
        events: [cached],
        omitted: 0,
        hasMore: false,
        coverage: 'provider-visible-human-text',
      }),
    });
    const target =
      delivery === 'channel'
        ? createRouteGroup(fx, 'Context before live')
        : fx.core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!.id;
    await addRoute(fx, target, delivery);
    await fx.receive(event({ at: new Date(Date.now() + 100).toISOString() }));
    await fx.idle();
    const anchor = fx.core.attention.list({ botSlug: 'ada' }).items[0]!.id;
    const page = await fx.core.externalMessaging.inbound.context('ada', anchor, 'test-read', {
      scope: 'group',
    });
    expect(page.messages.map((message) => message.text)).toContain(cached.text);
    expect(
      fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'"),
    ).toHaveLength(2);
    expect(fx.query('SELECT * FROM messaging_source_paths')).toHaveLength(1);
    expect(fx.query('SELECT * FROM inbox_admissions')).toHaveLength(1);
    expect(fx.runs).toHaveLength(1);

    await fx.receive(cached);
    await fx.idle();
    expect(fx.query('SELECT * FROM messaging_source_paths')).toHaveLength(2);
    expect(fx.query('SELECT * FROM inbox_admissions')).toHaveLength(2);
    expect(fx.query('SELECT * FROM channel_placements')).toHaveLength(
      delivery === 'channel' ? 2 : 0,
    );
    expect(fx.runs).toHaveLength(2);

    await fx.receive(cached);
    await fx.idle();
    await fx.restart();
    await fx.receive(cached);
    await fx.idle();
    expect(
      fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'"),
    ).toHaveLength(2);
    expect(fx.query('SELECT * FROM messaging_source_paths')).toHaveLength(2);
    expect(fx.query('SELECT * FROM inbox_admissions')).toHaveLength(2);
    expect(fx.query('SELECT * FROM channel_placements')).toHaveLength(
      delivery === 'channel' ? 2 : 0,
    );
    expect(fx.runs).toHaveLength(2);
  },
);

it('uses any eligible reception path without letting a silent first path suppress another member or consume its digest', async () => {
  const fx = await fixture({
    history: async (_account, _route, query) => ({
      version: 1,
      scope: query.scope,
      events: [contextEvent('om-private-history', 'Receiver-only provider history')],
      omitted: 0,
      hasMore: false,
      coverage: 'provider-visible-human-text',
    }),
  });
  expect(fx.core.registry.create({ slug: 'bea', displayName: 'Bea' }).ok).toBe(true);
  const first = createRouteGroup(fx, 'Silent path', ['ada', 'bea']);
  const second = createRouteGroup(fx, 'Immediate path', ['ada']);
  await addRoute(fx, first);
  await addRoute(fx, second);
  await fx.receive(event({ mentionedAccount: false, mentions: [], at: new Date().toISOString() }));
  for (const id of [first, second]) {
    const row = await bridgeRow(fx, id);
    await fx.core.externalMessaging.inbound.channelBridge(id, {
      kind: 'update',
      routeId: row.routeId,
      grantId: row.grantId,
      expectedGrantRevision: row.grantRevision,
      expectedRevision: row.revision,
      name: row.name,
      enabled: true,
      collection: 'all',
    });
  }
  fx.core.channels.setGroupWakePolicy(first, 'ada', {
    mode: 'silent',
    count: 2,
    intervalSeconds: 60,
  });
  fx.core.channels.setGroupWakePolicy(first, 'bea', {
    mode: 'digest',
    count: 2,
    intervalSeconds: 60,
  });
  fx.core.channels.setGroupWakePolicy(second, 'ada', {
    mode: 'all',
    count: 1,
    intervalSeconds: 60,
  });
  const one = event({
    messageId: 'multi-one',
    mentionedAccount: false,
    mentions: [],
    text: 'ordinary one',
    at: new Date(Date.now() + 100).toISOString(),
    reply: { ...event().reply, messageId: 'multi-one' },
  });
  await fx.receive(one);
  await fx.idle();
  expect(fx.runs.map((run) => run.bot.slug)).toEqual(['ada']);
  const sharedId = fx.query(
    "SELECT source_event_id FROM source_events WHERE body = 'ordinary one'",
  )[0]!.source_event_id as string;
  expect(
    fx.core.externalMessaging.inbound
      .read('bea', sharedId)
      .receptionPaths?.map((path) => path.channelId),
  ).toEqual([first]);
  expect(() => fx.core.externalMessaging.inbound.sourceSignal('bea', sharedId)).toThrow(
    'grant-unavailable',
  );
  await expect(
    fx.core.externalMessaging.inbound.context('bea', sharedId, 'secondary-context', {
      scope: 'group',
    }),
  ).rejects.toThrow('source-unavailable');
  await fx.core.externalMessaging.inbound.context('ada', sharedId, 'owner-context', {
    scope: 'group',
  });
  expect(fx.core.externalMessaging.inbound.read('ada', sharedId).contextMessages?.[0]?.text).toBe(
    'Receiver-only provider history',
  );
  const secondary = fx.core.externalMessaging.inbound.read('bea', sharedId);
  expect(secondary.contextMessages).toBeUndefined();
  expect(secondary.contextReads).toBeUndefined();
  expect(fx.query('SELECT bot_slug,attempt_state FROM inbox_admissions ORDER BY bot_slug')).toEqual(
    [
      { bot_slug: 'ada', attempt_state: 'handled' },
      { bot_slug: 'bea', attempt_state: 'pending' },
    ],
  );
  await fx.restart();
  await fx.receive({
    ...one,
    messageId: 'multi-two',
    text: 'ordinary two',
    reply: { ...one.reply, messageId: 'multi-two' },
  });
  await fx.idle();
  expect(fx.runs.filter((run) => run.bot.slug === 'ada')).toHaveLength(2);
  expect(fx.runs.filter((run) => run.bot.slug === 'bea')).toHaveLength(1);
  expect(fx.runs.find((run) => run.bot.slug === 'bea')?.inbox).toContain('ordinary one');
  expect(fx.runs.find((run) => run.bot.slug === 'bea')?.inbox).toContain('ordinary two');
  expect(fx.core.attention.list({ botSlug: 'bea' }).items).toHaveLength(2);
});

it('revokes one overlap independently and never backfills a newly added target on provider replay', async () => {
  const fx = await fixture();
  const first = createRouteGroup(fx, 'First path');
  const second = createRouteGroup(fx, 'Second path');
  await addRoute(fx, first);
  const message = event({ at: new Date(Date.now() + 100).toISOString() });
  await fx.receive(message);
  await fx.idle();
  await addRoute(fx, second);
  await fx.receive(message);
  await fx.idle();
  expect(fx.core.channels.readMessages(second)).toHaveLength(0);
  const row = await bridgeRow(fx, first);
  await fx.core.externalMessaging.inbound.channelBridge(first, {
    kind: 'delete',
    routeId: row.routeId,
    grantId: row.grantId,
    expectedGrantRevision: row.grantRevision,
    expectedRevision: row.revision,
  });
  expect(fx.subscriptions).toBe(1);
  await fx.receive({
    ...message,
    messageId: 'new-overlap',
    at: new Date(Date.now() + 100).toISOString(),
    reply: { ...message.reply, messageId: 'new-overlap' },
  });
  await fx.idle();
  expect(fx.core.channels.readMessages(first)).toHaveLength(1);
  expect(fx.core.channels.readMessages(second)).toHaveLength(1);
  expect(fx.runs).toHaveLength(2);
  expect((await fx.core.externalMessaging.channelBridges(first)).bridges).toHaveLength(0);
});

it('refuses implicit Bot-to-Bot DM targets and keeps Inbox-only sources out of the Human DM history', async () => {
  const fx = await fixture();
  expect(fx.core.registry.create({ slug: 'bea', displayName: 'Bea' }).ok).toBe(true);
  const botDm = fx.core.channels.getOrCreateBotDm(OWNER_HUMAN_CONTEXT, 'ada', 'bea', 'Peers')!;
  await expect(addRoute(fx, botDm.id)).rejects.toThrow('channel-unavailable');
  const dm = fx.core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
  await addRoute(fx, dm.id, 'inbox');
  await fx.receive(event({ at: new Date(Date.now() + 100).toISOString() }));
  await fx.idle();
  expect(fx.core.channels.readMessages(dm.id)).toHaveLength(0);
  expect(fx.query('SELECT * FROM channel_placements')).toHaveLength(0);
  expect(fx.core.attention.list({ botSlug: 'ada' }).items).toHaveLength(1);
  expect(fx.runs).toHaveLength(1);
});

it('preserves inherited Provider methods when sharing an account consumer', async () => {
  const f = await fixture({ inheritedProvider: true });
  await f.enable();
  expect(f.subscriptions).toBe(1);
  await f.receive();
  await f.idle();
  expect(f.runs).toHaveLength(1);
  expect(f.query('SELECT source_event_id FROM source_events')).toHaveLength(1);
});
