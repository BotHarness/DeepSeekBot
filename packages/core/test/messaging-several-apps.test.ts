import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { setImmediate as tick } from 'node:timers/promises';
import { afterEach, expect, it } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import type { MessagingInboundEvent, MessagingReplyRoute } from '../src/messaging/provider.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

const APPS = { 'lark-a': 'a', 'lark-b': 'b', 'lark-c': 'c' } as const;
type App = keyof typeof APPS;
const fp = (app: App) => APPS[app].repeat(64);

const cores: BotHarnessCore[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

async function fixture() {
  const home = createTempRoot('botharness-several-apps-');
  const agents: BotAgentAdapter = {
    async runOrchestrator() {},
    async runAssignment() {},
    requestAssignment() {
      return { delivery: 'steer' };
    },
    async stopAssignment() {},
    async close() {},
  };
  const core = createCore({ dshHome: home, agents });
  cores.push(core);
  for (const slug of ['ada', 'bea'])
    expect(core.registry.create({ slug, displayName: slug.toUpperCase() }).ok).toBe(true);
  type Consumer = Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1];
  const consumers = new Map<string, Consumer>();
  const replies: { app: string; route: MessagingReplyRoute; text: string }[] = [];
  const service: DshImOutboundService = {
    contractVersion: 1,
    replyContextVersion: 1,
    replyReceiptVersion: 1,
    replyFenceVersion: 1,
    listBots: async () => Object.keys(APPS).map((botId) => ({ botId, channel: 'feishu' })),
    listTargets: async () => [],
    describeBot: async (botId) => ({
      version: 1,
      channel: 'feishu',
      botId,
      account: { fingerprint: fp(botId as App), name: `App ${botId}` },
      connected: true,
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
    sendChecked: async () => ({ sent: true as const }),
    consumeInbound: async (botId, input) => {
      consumers.set(botId, input);
      return () => {
        if (consumers.get(botId) === input) consumers.delete(botId);
      };
    },
    qualifyReplyChecked: async (_botId, route) => route,
    replyChecked: async (botId, route, text, options) => {
      if (options.beforeSend && !options.beforeSend())
        throw Object.assign(new Error('stale-route'), { code: 'stale-route' });
      replies.push({ app: botId, route, text });
      return {
        sent: true,
        receipt: {
          version: 1,
          messageId: 'reply-' + route.messageId,
          conversationId: route.conversationId,
        },
      };
    },
  };
  core.externalMessaging.register(createDshImProvider(service, 'feishu')!);
  const settle = async () => {
    for (let i = 0; i < 4; i++) await tick();
    await core.runtime.whenIdle();
    await tick();
  };
  const bind = async (slug: string, app: App) => {
    const identity = await core.externalMessaging.identity(slug, {
      kind: 'bind',
      providerId: 'dsh-im/feishu',
      accountRef: app,
      fingerprint: fp(app),
    });
    await settle();
    return identity;
  };
  const query = (sql: string) =>
    attachOperationalModule(core.operationalDatabase, 'test').read((db) => db.prepare(sql).all());
  return {
    core,
    replies,
    bind,
    settle,
    query,
    methods: createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core }),
    async receive(app: App, id: string, group = false) {
      const consumer = consumers.get(app);
      if (!consumer) throw new Error(`${app} not subscribed`);
      const conversation = group ? 'oc_team' : `oc_dm_${app}`;
      const event: MessagingInboundEvent = {
        version: 1,
        channel: 'feishu',
        botId: app,
        fingerprint: fp(app),
        eventId: `ev-${id}`,
        messageId: `om-${id}`,
        actor: { kind: 'user', id: 'ou_human', name: 'Human' },
        conversation: { kind: group ? 'group' : 'dm', id: conversation },
        mentions: group ? [{ id: `ou-${app}`, key: '@_user_1' }] : [],
        mentionedAccount: group,
        at: '2026-10-07T00:00:00.000Z',
        text: group ? `@_user_1 hi ${id}` : `hi ${id}`,
        reply: { messageId: `om-${id}`, conversationId: conversation, actorId: 'ou_human' },
        replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
      };
      await consumer.onEvent(event, { signal: consumer.signal });
      await settle();
    },
    sourceId(messageId: string) {
      return (
        query(
          `SELECT source_event_id FROM source_events WHERE json_extract(payload_json, '$.external.event.messageId') = '${messageId}'`,
        )[0] as { source_event_id: string }
      ).source_event_id;
    },
  };
}

it('one Bot binds two Lark apps; each admits its own DMs and replies through the receiving app', async () => {
  const fx = await fixture();
  const first = await fx.bind('bea', 'lark-b');
  const second = await fx.bind('bea', 'lark-c');
  expect(first.id).not.toBe(second.id);
  await fx.receive('lark-b', 'b1');
  await fx.receive('lark-c', 'c1');
  expect(
    fx.query(
      "SELECT g.binding_id AS binding, json_extract(g.body, '$.receiveScope.conversationId') AS conversation FROM messaging_grants g ORDER BY conversation",
    ),
  ).toEqual([
    { binding: first.id, conversation: 'oc_dm_lark-b' },
    { binding: second.id, conversation: 'oc_dm_lark-c' },
  ]);
  expect(
    fx.query(
      "SELECT a.bot_slug AS bot, json_extract(e.payload_json, '$.external.grantId') IS NOT NULL AS attributed FROM inbox_admissions a JOIN source_events e USING(source_event_id)",
    ),
  ).toEqual([
    { bot: 'bea', attributed: 1 },
    { bot: 'bea', attributed: 1 },
  ]);
  await fx.core.externalMessaging.reply('bea', fx.sourceId('om-b1'), 'via b');
  await fx.core.externalMessaging.reply('bea', fx.sourceId('om-c1'), 'via c');
  await fx.settle();
  expect(fx.replies.map((r) => [r.app, r.text])).toEqual([
    ['lark-b', 'via b'],
    ['lark-c', 'via c'],
  ]);
});

it('an app bound to one Bot is listed with its owner and refused to another Bot', async () => {
  const fx = await fixture();
  const ada = await fx.bind('ada', 'lark-a');
  await expect(fx.bind('bea', 'lark-a')).rejects.toThrow('binding-conflict');
  const owners = async () =>
    Object.fromEntries(
      (await fx.core.externalMessaging.apps()).map((app) => [app.ref, app.boundBotSlug ?? null]),
    );
  expect(await owners()).toEqual({ 'lark-a': 'ada', 'lark-b': null, 'lark-c': null });
  expect((await fx.core.externalMessaging.snapshot('bea')).accounts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ ref: 'lark-a', boundBotSlug: 'ada', bindingId: ada.id }),
    ]),
  );
  await fx.core.externalMessaging.identity('ada', {
    kind: 'unbind',
    id: ada.id,
    expectedRevision: ada.revision,
  });
  expect(await owners()).toEqual({ 'lark-a': null, 'lark-b': null, 'lark-c': null });
  await fx.bind('bea', 'lark-a');
  expect((await owners())['lark-a']).toBe('bea');
});

it('a shared reply refuses when the responder has two apps in that group and works with one', async () => {
  const fx = await fixture();
  await fx.bind('ada', 'lark-a');
  await fx.bind('bea', 'lark-b');
  await fx.receive('lark-a', 'a1', true);
  await fx.receive('lark-b', 'b1', true);
  const created = fx.methods.channelCreate({ name: 'Shared', members: ['ada', 'bea'] });
  if (!created.ok) throw new Error(created.error.message);
  const channelId = created.value.channel.id;
  const adaGrant = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!;
  expect(
    await fx.methods.messagingChannelTarget({ slug: 'ada', grantId: adaGrant.id, channelId }),
  ).toEqual({ ok: true, value: { updated: true } });
  await fx.receive('lark-a', 'a2', true);
  const shared = fx.sourceId('om-a2');
  await fx.core.externalMessaging.reply('bea', shared, 'from bea');
  await fx.settle();
  expect(fx.replies.at(-1)).toMatchObject({ app: 'lark-b', text: 'from bea' });
  await fx.bind('bea', 'lark-c');
  await fx.receive('lark-c', 'c1', true);
  await expect(fx.core.externalMessaging.reply('bea', shared, 'again')).rejects.toThrow(
    'reply-target-ambiguous',
  );
});
