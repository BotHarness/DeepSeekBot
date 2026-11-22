import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { afterEach, expect, it } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { event, fixture, externalAnchor, cleanup } from './messaging-inbound-fixtures.js';

afterEach(cleanup);

async function inboxShareTarget(fx: Awaited<ReturnType<typeof fixture>>) {
  expect(fx.core.registry.create({ slug: 'bea', displayName: 'Bea' }).ok).toBe(true);
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...fx.core });
  const result = methods.channelCreate({
    name: 'Explicit Inbox collaboration',
    members: ['ada', 'bea'],
  });
  if (!result.ok) throw new Error(result.error.message);
  const id = result.value.channel.id;
  fx.core.channels.setGroupWakePolicy(id, 'ada', { mode: 'silent', count: 1, intervalSeconds: 60 });
  fx.core.channels.setGroupWakePolicy(id, 'bea', { mode: 'all', count: 1, intervalSeconds: 60 });
  await fx.idle();
  return id;
}

it('shares an own-Inbox source through the owning Orchestrator, preserves one owner attention and lets an unbound helper discuss locally', async () => {
  let channelId = '';
  let sourceId = '';
  let shared = false;
  const fx = await fixture({
    onRun: async (run) => {
      if (run.bot.slug === 'ada' && run.inbox.includes('Share this Inbox fact')) {
        const item = fx.core.attention
          .list({ botSlug: 'ada' })
          .items.find((item) => item.summary.includes('Share this Inbox fact'))!;
        sourceId = item.id;
        expect(run.externalMessaging!.read(sourceId).localChannelId).toBeUndefined();
        const before = fx.query(
          `SELECT * FROM inbox_admissions WHERE source_event_id = '${sourceId}' AND bot_slug = 'ada'`,
        );
        expect(run.externalMessaging!.share(sourceId, channelId)).toMatchObject({
          sourceEventId: sourceId,
          channelId,
          messageId: sourceId,
          alreadyShared: false,
        });
        const after = fx.query(
          `SELECT * FROM inbox_admissions WHERE source_event_id = '${sourceId}' AND bot_slug = 'ada'`,
        );
        expect(after).toEqual([{ ...before[0], side_effect_started_at: expect.any(String) }]);
        expect(run.externalMessaging!.read(sourceId).localChannelId).toBeUndefined();
        expect(run.externalMessaging!.share(sourceId, channelId).alreadyShared).toBe(true);
        shared = true;
      }
      if (run.bot.slug === 'bea' && run.message.includes('Share this Inbox fact')) {
        expect(run.channels.read({ channelId })[0]?.message).toMatchObject({
          id: sourceId,
          body: 'Share this Inbox fact',
          author: { kind: 'bridged', source: 'Alex' },
          bridgeOrigin: {
            sourceEventId: sourceId,
            senderId: 'ou-human',
            messageId: 'om-1',
            mentions: [{ id: 'ou-bot', key: '@_user_1', name: 'QA Bot' }],
          },
        });
        expect(run.externalMessaging!.read(sourceId).event.actor.name).toBe('Alex');
        await expect(async () =>
          run.externalMessaging!.reply(sourceId, 'Borrowed identity'),
        ).rejects.toThrow('own-reply-grant-unavailable');
        await run.channels.send({ channelId, body: 'Helper local discussion' });
      }
    },
  });
  channelId = await inboxShareTarget(fx);
  await fx.enable();
  await fx.receive(
    event({
      text: 'Share this Inbox fact',
      mentions: [{ id: 'ou-bot', key: '@_user_1', name: 'QA Bot' }],
      actor: { kind: 'user', id: 'ou-human', name: 'Alex' },
      at: new Date().toISOString(),
    }),
  );
  await fx.idle();
  expect(
    fx.query(
      "SELECT last_error FROM inbox_admissions WHERE bot_slug = 'ada' AND reason = 'group-mention'",
    ),
  ).toEqual([{ last_error: null }]);
  expect(shared).toBe(true);
  expect(
    fx.query(
      `SELECT last_error FROM inbox_admissions WHERE source_event_id = '${sourceId}' AND bot_slug = 'bea'`,
    ),
  ).toEqual([{ last_error: null }]);
  expect(
    fx.query(`SELECT source_event_id FROM source_events WHERE source_kind = 'bridge-message'`),
  ).toEqual([{ source_event_id: sourceId }]);
  expect(
    fx.query(
      `SELECT bot_slug, reason, attempt_state FROM inbox_admissions WHERE source_event_id = '${sourceId}' ORDER BY bot_slug`,
    ),
  ).toEqual([
    { bot_slug: 'ada', reason: 'group-mention', attempt_state: 'handled' },
    { bot_slug: 'bea', reason: 'group-ordinary', attempt_state: 'handled' },
  ]);
  expect(fx.core.channels.readMessages('dm-ada').some((message) => message.id === sourceId)).toBe(
    false,
  );
  expect(
    fx.core.channels.readMessages(channelId).filter((message) => message.id === sourceId),
  ).toHaveLength(1);
  expect(fx.core.channels.readMessages(channelId).map((message) => message.body)).toContain(
    'Helper local discussion',
  );
  expect(fx.core.channels.readMessages(channelId).some((message) => message.sessionFailure)).toBe(
    false,
  );
  expect(
    fx.runs.filter((run) => run.bot.slug === 'ada' && run.inbox.includes('Share this Inbox fact')),
  ).toHaveLength(1);
  expect(fx.replies).toEqual([]);
  expect(fx.core.externalMessaging.history('ada')).toEqual([]);
  expect(fx.core.externalMessaging.history('bea')).toEqual([]);
  const granted = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!;
  expect(granted.receiveTargetChannelId).toBeUndefined();
  await fx.receive(
    event({
      reply: { ...event().reply, messageId: 'next-private' },
      messageId: 'next-private',
      eventId: 'ev-next-private',
      text: 'Later private Inbox traffic',
    }),
  );
  await fx.idle();
  expect(
    fx.core.channels
      .readMessages(channelId)
      .some((message) => message.body === 'Later private Inbox traffic'),
  ).toBe(false);
  await fx.restart();
  expect(fx.core.externalMessaging.inbound.share('ada', sourceId, channelId).alreadyShared).toBe(
    true,
  );
  expect(
    fx.core.channels.readMessages(channelId).find((message) => message.id === sourceId)
      ?.bridgeOrigin?.mentions,
  ).toEqual([{ id: 'ou-bot', key: '@_user_1', name: 'QA Bot' }]);
  expect(
    fx.core.channels.readMessages(channelId).filter((message) => message.id === sourceId),
  ).toHaveLength(1);
  expect(
    fx.query(`SELECT * FROM inbox_admissions WHERE source_event_id = '${sourceId}'`),
  ).toHaveLength(2);
});

it('rejects a foreign source, a DM, removed membership, unavailable receiving authority and cross-Channel reshare without partial placement', async () => {
  const fx = await fixture();
  const channelId = await inboxShareTarget(fx);
  await fx.enable();
  await fx.receive();
  await fx.idle();
  const sourceId = externalAnchor(fx);
  const share = (bot: string, source = sourceId, destination = channelId) =>
    fx.core.externalMessaging.inbound.share(bot, source, destination);
  expect(() => share('bea')).toThrow('source-unavailable');
  expect(() => share('ada', 'fabricated-source')).toThrow('source-unavailable');
  expect(() => share('ada', sourceId, 'dm-ada')).toThrow('channel-unavailable');
  fx.core.channels.removeGroupMember(channelId, 'ada');
  expect(() => share('ada')).toThrow('channel-unavailable');
  expect(
    fx.query(`SELECT * FROM channel_placements WHERE source_event_id = '${sourceId}'`),
  ).toEqual([]);
  expect(
    fx.query(`SELECT * FROM inbox_admissions WHERE source_event_id = '${sourceId}'`),
  ).toHaveLength(1);
});

it('preserves shared history on revocation and refuses not-yet-started sharing', async () => {
  const fx = await fixture();
  const channelId = await inboxShareTarget(fx);
  await fx.enable();
  await fx.receive();
  await fx.idle();
  const first = externalAnchor(fx);
  fx.core.externalMessaging.inbound.share('ada', first, channelId);
  await fx.receive(
    event({
      reply: { ...event().reply, messageId: 'unshared' },
      messageId: 'unshared',
      eventId: 'ev-unshared',
      text: 'Not shared',
    }),
  );
  await fx.idle();
  const second = fx.core.attention
    .list({ botSlug: 'ada' })
    .items.find((item) => item.summary === 'Not shared')!.id;
  fx.core.externalMessaging.revoke('ada', fx.grant.id);
  expect(() => fx.core.externalMessaging.inbound.share('ada', second, channelId)).toThrow(
    'source-unavailable',
  );
  expect(fx.query(`SELECT * FROM channel_placements WHERE source_event_id = '${second}'`)).toEqual(
    [],
  );
  expect(fx.core.channels.message(channelId, first)?.bridgeOrigin?.sourceEventId).toBe(first);
  expect(
    fx.query(`SELECT * FROM inbox_admissions WHERE source_event_id = '${second}'`),
  ).toHaveLength(1);
});

it('keeps a silent helper pending, does not admit later joiners on share retry, and refuses an already Channel-targeted source', async () => {
  const fx = await fixture();
  const id = await inboxShareTarget(fx);
  fx.core.channels.setGroupWakePolicy(id, 'bea', { mode: 'silent', count: 1, intervalSeconds: 60 });
  await fx.enable();
  await fx.receive();
  await fx.idle();
  const source = externalAnchor(fx);
  fx.core.externalMessaging.inbound.share('ada', source, id);
  await fx.idle();
  expect(
    fx.query(
      `SELECT attempt_state, wake_mode FROM inbox_admissions WHERE source_event_id = '${source}' AND bot_slug = 'bea'`,
    ),
  ).toEqual([{ attempt_state: 'pending', wake_mode: 'silent' }]);
  expect(fx.core.registry.create({ slug: 'cee', displayName: 'Cee' }).ok).toBe(true);
  fx.core.channels.inviteGroupBot({
    channelId: id,
    inviterHuman: true,
    targetBotSlug: 'cee',
    targetBotCreatedAt: fx.core.registry.get('cee')!.createdAt,
    targetDmChannelId: fx.core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'cee', 'Cee')!.id,
  });
  expect(fx.core.externalMessaging.inbound.share('ada', source, id).alreadyShared).toBe(true);
  expect(
    fx.query(
      `SELECT bot_slug FROM inbox_admissions WHERE source_event_id = '${source}' ORDER BY bot_slug`,
    ),
  ).toEqual([{ bot_slug: 'ada' }, { bot_slug: 'bea' }]);
  const other = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...fx.core }).channelCreate({
    name: 'Other team',
    members: ['ada', 'bea'],
  });
  if (!other.ok) throw new Error(other.error.message);
  expect(() =>
    fx.core.externalMessaging.inbound.share('ada', source, other.value.channel.id),
  ).toThrow('source-conflict');
  await fx.core.externalMessaging.inbound.setChannelTarget('ada', fx.grant.id, id);
  await fx.receive(
    event({
      reply: { ...event().reply, messageId: 'channel-source' },
      messageId: 'channel-source',
      eventId: 'ev-channel-source',
      text: 'Already channel-targeted',
    }),
  );
  await fx.idle();
  const targeted = fx.core.attention
    .list({ botSlug: 'ada' })
    .items.find((item) => item.summary === 'Already channel-targeted')!.id;
  expect(() =>
    fx.core.externalMessaging.inbound.share('ada', targeted, other.value.channel.id),
  ).toThrow('source-conflict');
});
