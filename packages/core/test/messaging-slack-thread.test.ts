import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { afterEach, expect, it } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import type { MessagingInboundEvent } from '../src/messaging/provider.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createTempRoot } from './helpers.js';

const cores: BotHarnessCore[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

async function fixture(shared: boolean) {
  const fingerprint = 'c'.repeat(64);
  let callback: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1] | undefined;
  const core = createCore({ dshHome: createTempRoot('botharness-slack-topic-') });
  cores.push(core);
  for (const slug of ['ada', 'bea']) core.registry.create({ slug, displayName: slug });
  const service: DshImOutboundService = {
    contractVersion: 1,
    replyContextVersion: 1,
    replyReceiptVersion: 1,
    replyFenceVersion: 1,
    listBots: async () => [{ botId: 'slack-topic', channel: 'slack' }],
    listTargets: async () => [
      { targetId: 'qa', name: 'QA', kind: 'conversation', route: { channelId: 'C12345678' } },
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
    replyChecked: async (_id, route, _text, options) => {
      expect(options.beforeSend?.()).toBe(true);
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
  core.externalMessaging.register(createDshImProvider(service, 'slack')!);
  const target = (await core.externalMessaging.targets('dsh-im/slack', 'slack-topic'))[0]!;
  const grant = await core.externalMessaging.authorize({
    botSlug: 'ada',
    providerId: 'dsh-im/slack',
    accountRef: 'slack-topic',
    targetRef: target.ref,
    fingerprint,
    targetDigest: target.digest,
  });
  let channelId: string | undefined;
  if (shared) {
    channelId = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'Topic team',
      members: ['ada', 'bea'],
    }).id;
    core.channels.setGroupWakePolicy(channelId, 'bea', {
      mode: 'silent',
      count: 7,
      intervalSeconds: 60,
    });
    await core.externalMessaging.inbound.channelBridge(channelId, {
      kind: 'add',
      grantId: grant.id,
      expectedGrantRevision: grant.revision,
      name: 'Topic source',
      enabled: true,
      collection: 'mentions',
    });
  } else await core.externalMessaging.inbound.setEnabled('ada', grant.id, true);
  const event = (
    id: string,
    threadId = '1791127600.000001',
    mentionedAccount = false,
  ): MessagingInboundEvent => ({
    version: 1,
    channel: 'slack',
    botId: 'slack-topic',
    fingerprint,
    eventId: 'Ev-' + id,
    messageId: id,
    actor: { kind: 'user', id: 'U87654321', name: 'QA Human' },
    conversation: { kind: 'group', id: 'C12345678' },
    mentions: mentionedAccount ? [{ id: 'U12345678', key: '<@U12345678>' }] : [],
    mentionedAccount,
    at: new Date(Date.now() + 1000).toISOString(),
    text: 'Topic ' + id,
    reply: {
      messageId: id,
      conversationId: 'C12345678',
      actorId: 'U87654321',
      threadId,
      rootId: threadId,
    },
    replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
  });
  const receive = (e: MessagingInboundEvent) => callback!.onEvent(e, { signal: callback!.signal });
  const db = attachOperationalModule(core.operationalDatabase, 'test');
  const query = (sql: string) => db.read((d) => d.prepare(sql).all());
  return { core, grant, channelId, event, receive, query };
}

it.each([false, true])(
  'Slack native topic policies gate proof, follow, independent admission and Human overrides (shared=%s)',
  async (shared) => {
    const fx = await fixture(shared);
    const { core, grant, event, receive, query } = fx;
    const bot = { kind: 'bot', botSlug: 'ada' } as const;
    await receive(event('1791127601.000001', undefined, true));
    let anchor = core.attention.list({ botSlug: 'ada' }).items[0]!.id;
    const rows = () => core.externalMessaging.inbound.threads('ada', grant.id);
    expect(rows()[0]).toMatchObject({
      mode: 'inherit',
      revision: 0,
      rootId: '1791127600.000001',
      ordinaryDelivery: 'unverified',
    });
    const set = (revision: number, mode: 'follow' | 'inherit' = 'follow') =>
      core.externalMessaging.inbound.setThread(
        'ada',
        anchor,
        {
          mode,
          expectedRevision: revision,
          wake: { wake: 'digest', count: 2, intervalSeconds: 60 },
        },
        bot,
      );
    await expect(set(0)).rejects.toThrow('thread-delivery-unverified');
    await receive(event('1791127600.000001'));
    await receive(event('1791127602.000001', '1791127500.000001'));
    expect(rows()[0]!.ordinaryDelivery).toBe('unverified');
    await expect(set(0)).rejects.toThrow('thread-delivery-unverified');
    await receive(event('1791127603.000001'));
    expect(rows()[0]!.ordinaryDelivery).toBe('verified');
    expect(query("SELECT * FROM inbox_admissions WHERE reason = 'group-ordinary'")).toHaveLength(0);
    await set(0);
    const ordinary = event('1791127604.000001');
    await receive(ordinary);
    await receive({ ...ordinary, eventId: 'Ev-redelivery' });
    await receive(event('1791127605.000001'));
    await receive(event('1791127606.000001', '1791127400.000001'));
    await receive(event('1791127700.000001', '1791127700.000001'));
    expect(
      query(
        "SELECT wake_count, external_thread_policy_revision FROM inbox_admissions WHERE reason = 'group-ordinary' AND bot_slug = 'ada'",
      ),
    ).toEqual([
      { wake_count: 2, external_thread_policy_revision: 1 },
      { wake_count: 2, external_thread_policy_revision: 1 },
    ]);
    if (shared) {
      expect(core.channels.readMessages(fx.channelId!)).toHaveLength(3);
      expect(
        query(
          "SELECT wake_count, wake_mode FROM inbox_admissions WHERE reason = 'group-ordinary' AND bot_slug = 'bea'",
        ),
      ).toEqual([
        { wake_count: null, wake_mode: 'silent' },
        { wake_count: null, wake_mode: 'silent' },
      ]);
    }
    await expect(set(0)).rejects.toThrow('thread-policy-conflict');
    const bridge = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core });
    expect(
      await bridge.messagingThreadPolicy({
        slug: 'ada',
        sourceEventId: anchor,
        policy: { mode: 'exclude', expectedRevision: 1, wake: null },
      }),
    ).toMatchObject({ ok: true });
    await expect(set(2)).rejects.toThrow('human-thread-override');
    await receive(event('1791127607.000001'));
    expect(
      query("SELECT * FROM inbox_admissions WHERE reason = 'group-ordinary' AND bot_slug = 'ada'"),
    ).toHaveLength(2);
    expect(
      await bridge.messagingThreadPolicy({
        slug: 'ada',
        sourceEventId: anchor,
        policy: { mode: 'inherit', expectedRevision: 2, wake: null },
      }),
    ).toMatchObject({ ok: true });
    await set(3);
    await set(4, 'inherit');
    await receive(event('1791127608.000001'));
    expect(
      query("SELECT * FROM inbox_admissions WHERE reason = 'group-ordinary' AND bot_slug = 'ada'"),
    ).toHaveLength(2);
    await core.externalMessaging.inbound.setEnabled('ada', grant.id, false);
    await core.externalMessaging.inbound.setEnabled('ada', grant.id, true);
    expect(rows()).toEqual([]);
    await receive(event('1791127609.000001', undefined, true));
    anchor = rows()[0]!.anchorSourceEventId;
    expect(rows()[0]).toMatchObject({
      mode: 'inherit',
      revision: 5,
      ordinaryDelivery: 'unverified',
    });
    await expect(set(5)).rejects.toThrow('thread-delivery-unverified');
    await receive(event('1791127610.000001'));
    await set(5);
    await core.externalMessaging.revoke('ada', grant.id);
    await expect(set(6)).rejects.toThrow();
  },
);

it.each(['root-mismatch', 'fabricated-parent'] as const)(
  'refuses a Slack topic route with %s instead of treating it as a Lark route',
  async (kind) => {
    const { core, grant, event, receive } = await fixture(false);
    const invalid = event('1791127601.000001', undefined, true);
    invalid.reply = {
      ...invalid.reply,
      ...(kind === 'root-mismatch'
        ? { rootId: '1791127500.000001' }
        : { parentId: '1791127600.000001' }),
    };
    await receive(invalid);
    expect(core.externalMessaging.inbound.threads('ada', grant.id)).toEqual([]);
    const sourceEventId = core.attention.list({ botSlug: 'ada' }).items[0]!.id;
    await expect(
      core.externalMessaging.inbound.setThread(
        'ada',
        sourceEventId,
        { mode: 'follow', expectedRevision: 0, wake: null },
        { kind: 'bot', botSlug: 'ada' },
      ),
    ).rejects.toThrow('thread-unavailable');
  },
);
