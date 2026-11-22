import { afterEach, expect, it, vi } from 'vitest';
import { attachOperationalModule } from '../src/database/owner.js';
import {
  dm,
  mention,
  qqMention,
  fixture,
  ordinaryRole,
  fresh,
  grantFor,
  cleanup,
} from './messaging-default-traffic-fixtures.js';

afterEach(cleanup);

it('ordinary group text creates no pairing request or wake contribution for a restricted Bot', async () => {
  const fx = await fixture();
  await ordinaryRole(fx);
  for (let n = 0; n < 8; n++) await fx.receive(fresh(mention(`ordinary-${n}`, false)));
  expect(fx.core.externalMessaging.pairing.list('ada')).toEqual([]);
  expect(fx.admissions()).toEqual([]);
  expect(fx.runs).toEqual([]);
});

it('a bound Lark app admits a DM to the Inbox with no saved target and replies in the same DM', async () => {
  const fx = await fixture();
  expect(fx.identity.newConversations).toBe('auto');
  const snapshot = await fx.core.externalMessaging.snapshot('ada');
  expect(snapshot.identities?.[0]).toMatchObject({ reception: 'receiving' });
  expect(snapshot.grants).toEqual([]);
  await expect(fx.receive(dm('1'))).resolves.toEqual({ accepted: true });
  expect(fx.entries()).toEqual([
    { origin: 'implicit', kind: 'dm', conversation: 'oc_owner', revoked_at: null },
  ]);
  expect(fx.admissions()).toEqual([{ reason: 'human-dm', messageId: 'om-1' }]);
  expect(
    fx.core.externalMessaging.inbound.read('ada', fx.sourceId('om-1')).reception,
  ).toMatchObject({ kind: 'grant' });
  expect(fx.runs).toHaveLength(1);
  expect(fx.runs[0]!.inbox).toContain('hello 1');
  await fx.core.externalMessaging.reply('ada', fx.sourceId('om-1'), 'Hi from Ada');
  await fx.settle();
  expect(fx.replies).toEqual([
    {
      route: { messageId: 'om-1', conversationId: 'oc_owner', actorId: 'ou_owner' },
      text: 'Hi from Ada',
    },
  ]);
  const after = await fx.core.externalMessaging.snapshot('ada');
  expect(after.grants).toHaveLength(1);
  expect(after.grants[0]).toMatchObject({
    origin: 'implicit',
    targetName: 'Owner',
    canPost: false,
    reception: 'receiving',
    lastMessageAt: expect.any(String),
  });
  await fx.receive(dm('1'));
  await fx.receive(dm('2'));
  expect(fx.entries()).toHaveLength(1);
  expect(fx.admissions()).toEqual([
    { reason: 'human-dm', messageId: 'om-1' },
    { reason: 'human-dm', messageId: 'om-2' },
  ]);
});

it('admits a group mention and replies in its topic, but leaves unmentioned group text alone', async () => {
  const fx = await fixture();
  await fx.receive(mention('quiet', false));
  expect(fx.entries()).toEqual([]);
  expect(fx.admissions()).toEqual([]);
  await fx.receive(mention('ask'));
  expect(fx.entries()).toEqual([
    { origin: 'implicit', kind: 'group', conversation: 'oc_team', revoked_at: null },
  ]);
  expect(fx.admissions()).toEqual([{ reason: 'group-mention', messageId: 'om-ask' }]);
  await fx.receive(mention('quiet-2', false));
  expect(fx.admissions()).toHaveLength(1);
  await fx.core.externalMessaging.reply('ada', fx.sourceId('om-ask'), 'Answer');
  await fx.settle();
  expect(fx.replies[0]?.route).toMatchObject({
    conversationId: 'oc_team',
    threadId: 'omt-topic',
    rootId: 'om-root',
  });
});

it('a bound QQ app admits one trusted group mention without a saved target and replies in that group', async () => {
  const fx = await fixture('qq');
  const incoming = dm('qq-mention', {
    at: new Date(Date.now() + 1000).toISOString(),
    conversation: { kind: 'group', id: 'qq-group-openid' },
    actor: { kind: 'user', id: 'qq-member-openid' },
    mentions: [],
    mentionedAccount: true,
    text: 'Please answer in this QQ group',
    reply: {
      messageId: 'om-qq-mention',
      conversationId: 'qq-group-openid',
      actorId: 'qq-member-openid',
    },
  });
  expect((await fx.core.externalMessaging.snapshot('ada')).grants).toEqual([]);
  await expect(fx.receive(incoming)).resolves.toEqual({ accepted: true });
  const attention = fx.core.attention.list({ botSlug: 'ada' }).items;
  expect(attention).toHaveLength(1);
  expect(attention[0]).toMatchObject({
    reason: 'group-mention',
    externalOrigin: {
      platform: 'qq',
      conversationId: 'qq-group-openid',
      senderId: 'qq-member-openid',
    },
  });
  expect(fx.runs).toHaveLength(1);
  expect(fx.runs[0]!.inbox).toContain('Please answer in this QQ group');
  await fx.core.externalMessaging.reply('ada', attention[0]!.id, 'Answer from Ada');
  await fx.settle();
  expect(fx.replies).toEqual([{ route: incoming.reply, text: 'Answer from Ada' }]);
  expect(fx.core.externalMessaging.history('ada')[0]).toMatchObject({
    state: 'provider-accepted',
    receipt: { conversationId: 'qq-group-openid', messageId: 'reply-om-qq-mention' },
  });
  await fx.receive(incoming);
  expect(fx.core.attention.list({ botSlug: 'ada' }).items).toHaveLength(1);
  expect(fx.runs).toHaveLength(1);
  expect((await fx.core.externalMessaging.snapshot('ada')).grants).toHaveLength(1);
});

it('refuses unqualified QQ private traffic without admitting or running it', async () => {
  const fx = await fixture('qq');
  await expect(fx.receive(dm('private'))).rejects.toMatchObject({ code: 'untrusted-source' });
  await expect(
    fx.receive(
      dm('thread', {
        conversation: { kind: 'group', id: 'qq-group' },
        reply: {
          messageId: 'source',
          conversationId: 'qq-group',
          actorId: 'member',
          threadId: 'thread',
        },
      }),
    ),
  ).rejects.toMatchObject({ code: 'untrusted-source' });
  expect(fx.core.attention.list({ botSlug: 'ada' }).items).toEqual([]);
  expect((await fx.core.externalMessaging.snapshot('ada')).grants).toEqual([]);
  expect(fx.runs).toEqual([]);
});

it('QQ admission is atomic and a rejected admission can be redelivered exactly once', async () => {
  const fx = await fixture('qq');
  const db = attachOperationalModule(fx.core.operationalDatabase, 'qq-admission-fault');
  db.transaction((raw) =>
    raw.exec(
      "CREATE TRIGGER reject_qq BEFORE INSERT ON inbox_admissions BEGIN SELECT RAISE(ABORT, 'fixture admission failure'); END;",
    ),
  );
  await expect(fx.receive(qqMention('atomic'))).rejects.toThrow();
  expect(fx.admissions()).toEqual([]);
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toEqual([]);
  expect(fx.runs).toEqual([]);
  db.transaction((raw) => raw.exec('DROP TRIGGER reject_qq'));
  await fx.receive(qqMention('atomic'));
  await fx.receive(qqMention('atomic'));
  expect(fx.admissions()).toHaveLength(1);
  expect(fx.runs).toHaveLength(1);
});

it('QQ keeps canonical sources across restart and fences paused, blocked and unbound intake', async () => {
  const fx = await fixture('qq');
  await fx.receive(qqMention('first'));
  await fx.restart();
  await fx.receive(qqMention('first'));
  expect(fx.admissions()).toHaveLength(1);
  expect(fx.subscriptions).toBe(1);
  await fx.update({ enabled: false });
  expect(fx.subscriptions).toBe(0);
  await fx.update({ enabled: true });
  fx.core.registry.setPaused('ada', true);
  await expect(fx.receive(qqMention('paused'))).rejects.toThrow('consumer-unavailable');
  fx.core.registry.setPaused('ada', false);
  await fx.receive(qqMention('second'));
  const grant = await grantFor(fx, 'qq-group');
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'block',
    grantId: grant.id,
    expectedRevision: grant.revision,
  });
  await fx.settle();
  await fx.receive(qqMention('blocked'));
  await fx.restart();
  await fx.receive(qqMention('blocked-after-restart'));
  expect(fx.admissions()).toHaveLength(2);
  await expect(
    fx.core.externalMessaging.reply('ada', fx.sourceId('om-second'), 'too late'),
  ).rejects.toThrow();
  expect(fx.replies).toEqual([]);
  const current = (await fx.core.externalMessaging.snapshot('ada')).identities![0]!;
  await fx.core.externalMessaging.identity('ada', {
    kind: 'unbind',
    id: current.id,
    expectedRevision: current.revision,
  });
  await fx.settle();
  expect(fx.subscriptions).toBe(0);
  expect(fx.entries().every((row) => (row as { revoked_at: unknown }).revoked_at !== null)).toBe(
    true,
  );
});

it('QQ retains an unknown native reply outcome across restart and never blindly resends', async () => {
  const fx = await fixture('qq');
  let sends = 0;
  fx.service.replyChecked = async () => {
    sends++;
    throw Object.assign(new Error('uncertain'), { code: 'reply-result-unknown' });
  };
  await fx.receive(qqMention('uncertain'));
  const id = fx.sourceId('om-uncertain');
  const outcome = await fx.core.externalMessaging.reply('ada', id, 'one answer');
  expect(outcome.state).toBe('unknown-outcome');
  await fx.restart();
  expect(await fx.core.externalMessaging.reply('ada', id, 'one answer')).toEqual(outcome);
  expect(sends).toBe(1);
  expect(fx.core.externalMessaging.history('ada')[0]?.state).toBe('unknown-outcome');
});

it('a Bot stop leaves an in-flight external reply delivery-unknown and never resends it', async () => {
  const fx = await fixture('qq');
  let sends = 0;
  let release!: () => void;
  const provider = new Promise<void>((resolve) => {
    release = resolve;
  });
  fx.service.replyChecked = async () => {
    sends++;
    await provider;
    throw Object.assign(new Error('uncertain'), { code: 'reply-result-unknown' });
  };
  await fx.receive(qqMention('stopped-mid-send'));
  const id = fx.sourceId('om-stopped-mid-send');
  const reply = fx.core.externalMessaging.reply('ada', id, 'one answer');
  await vi.waitFor(() => expect(sends).toBe(1));

  await fx.core.runtime.stopTurn!('ada');
  release();
  const outcome = await reply;
  expect(outcome.state).toBe('unknown-outcome');
  await fx.core.runtime.whenIdle();
  await fx.settle();

  expect(sends).toBe(1);
  expect(fx.core.externalMessaging.history('ada')[0]?.state).toBe('unknown-outcome');
  expect(await fx.core.externalMessaging.reply('ada', id, 'one answer')).toEqual(outcome);
  expect(sends).toBe(1);
});

it('admits nothing from new conversations in ask mode while existing entries keep working', async () => {
  const fx = await fixture();
  await fx.receive(dm('1'));
  await fx.update({ newConversations: 'ask' });
  expect((await fx.core.externalMessaging.snapshot('ada')).identities?.[0]).toMatchObject({
    newConversations: 'ask',
  });
  await fx.receive(mention('new-group'));
  expect(fx.entries()).toHaveLength(1);
  await fx.receive(dm('2'));
  expect(fx.admissions().map((row) => (row as { messageId: string }).messageId)).toEqual([
    'om-1',
    'om-2',
  ]);
});

it('keeps entries across a restart and keeps admitting without duplicates', async () => {
  const fx = await fixture();
  await fx.receive(dm('1'));
  await fx.restart();
  await fx.receive(dm('1'));
  await fx.receive(dm('2'));
  expect(fx.entries()).toHaveLength(1);
  expect(fx.admissions()).toHaveLength(2);
  expect(fx.subscriptions).toBe(1);
});

it('stops admission on pause and invalidates entries on unbind', async () => {
  const fx = await fixture();
  await fx.receive(dm('1'));
  await fx.update({ enabled: false });
  expect(fx.subscriptions).toBe(0);
  await fx.update({ enabled: true });
  await fx.receive(dm('2'));
  expect(fx.admissions()).toHaveLength(2);
  const current = (await fx.core.externalMessaging.snapshot('ada')).identities![0]!;
  await fx.core.externalMessaging.identity('ada', {
    kind: 'unbind',
    id: current.id,
    expectedRevision: current.revision,
  });
  await fx.settle();
  expect(fx.subscriptions).toBe(0);
  expect(fx.entries()).toEqual([
    {
      origin: 'implicit',
      kind: 'dm',
      conversation: 'oc_owner',
      revoked_at: expect.any(String),
    },
  ]);
  await expect(
    fx.core.externalMessaging.reply('ada', fx.sourceId('om-2'), 'too late'),
  ).rejects.toThrow();
});

it.each(['slack', 'discord'] as const)(
  'a bound %s app admits DMs and mentions and replies in place',
  async (platform) => {
    const fx = await fixture(platform);
    expect((await fx.core.externalMessaging.snapshot('ada')).identities?.[0]).toMatchObject({
      reception: 'receiving',
    });
    await fx.receive(dm('1'));
    await fx.receive(mention('quiet', false));
    await fx.receive(mention('ask'));
    expect(fx.entries()).toEqual([
      { origin: 'implicit', kind: 'dm', conversation: 'oc_owner', revoked_at: null },
      { origin: 'implicit', kind: 'group', conversation: 'oc_team', revoked_at: null },
    ]);
    expect(fx.admissions()).toEqual([
      { reason: 'human-dm', messageId: 'om-1' },
      { reason: 'group-mention', messageId: 'om-ask' },
    ]);
    await fx.core.externalMessaging.reply('ada', fx.sourceId('om-1'), 'DM answer');
    await fx.core.externalMessaging.reply('ada', fx.sourceId('om-ask'), 'Topic answer');
    await fx.settle();
    expect(fx.replies.map((item) => item.route)).toEqual([
      { messageId: 'om-1', conversationId: 'oc_owner', actorId: 'ou_owner' },
      expect.objectContaining({ conversationId: 'oc_team', threadId: 'omt-topic' }),
    ]);
  },
);

it('a recorded group follows the platform default: collecting all text admits unmentioned messages', async () => {
  const fx = await fixture();
  await fx.receive(mention('ask'));
  await fx.receive(mention('quiet', false));
  expect(fx.admissions()).toHaveLength(1);
  const defaults = fx.core.externalMessaging.defaults('feishu');
  const { revision, changedAt: _at, ...preferences } = defaults;
  await fx.core.externalMessaging.setDefaults({
    ...preferences,
    expectedRevision: revision,
    collection: 'all',
  });
  await fx.settle();
  await fx.receive(mention('chatter', false));
  expect(fx.admissions()).toEqual([
    { reason: 'group-mention', messageId: 'om-ask' },
    { reason: 'group-ordinary', messageId: 'om-chatter' },
  ]);
});

it('wakes for one external message longer than the group context budget', async () => {
  const fx = await fixture();
  fx.core.registry.setPromptSettings('ada', {
    limits: { 'context-message-chars': 20_000, 'group-context-chars': 2_000 },
  });
  await fx.receive(dm('long', { text: 'x'.repeat(6_000) }));
  expect(fx.runs).toHaveLength(1);
  expect(fx.runs[0]!.inbox).toContain('x'.repeat(2_000));
});
