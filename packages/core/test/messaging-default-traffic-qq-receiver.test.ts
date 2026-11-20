import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { setImmediate as tick } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import {
  fingerprint,
  qqMention,
  fixture,
  grantFor,
  cleanup,
} from './messaging-default-traffic-fixtures.js';

afterEach(cleanup);

it('QQ blocking during native preparation fences dispatch through replyChecked', async () => {
  const fx = await fixture('qq');
  await fx.receive(qqMention('send-race'));
  let prepared!: () => void;
  let resume!: () => void;
  const preparing = new Promise<void>((resolve) => {
    prepared = resolve;
  });
  const continueDispatch = new Promise<void>((resolve) => {
    resume = resolve;
  });
  fx.prepareReply(async () => {
    prepared();
    await continueDispatch;
  });
  const pending = fx.core.externalMessaging.reply('ada', fx.sourceId('om-send-race'), 'too late');
  const settled = pending.catch(() => undefined);
  await preparing;
  const grant = await grantFor(fx, 'qq-group');
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'block',
    grantId: grant.id,
    expectedRevision: grant.revision,
  });
  resume();
  await settled;
  await fx.settle();
  expect(fx.replies).toEqual([]);
  expect((await fx.core.externalMessaging.snapshot('ada')).blockedConversations).toHaveLength(1);
});

it('editing a proactive quota preserves a prepared source reply and its exclusive receiver', async () => {
  const fx = await fixture('qq');
  await fx.receive(qqMention('quota-reply'));
  let prepared!: () => void;
  let resume!: () => void;
  const preparing = new Promise<void>((resolve) => {
    prepared = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    resume = resolve;
  });
  fx.prepareReply(async () => {
    prepared();
    await gate;
  });
  const pending = fx.core.externalMessaging.reply(
    'ada',
    fx.sourceId('om-quota-reply'),
    'Still reply',
  );
  await preparing;
  const subscriptions = fx.subscriptions;
  try {
    const updated = await fx.core.externalMessaging.setPostLimit(
      'ada',
      fx.identity.id,
      fx.identity.postLimitRevision!,
      1,
    );
    expect(updated.revision).toBe(fx.identity.revision);
    expect(fx.subscriptions).toBe(subscriptions);
  } finally {
    resume();
  }
  expect((await pending).state).toBe('provider-accepted');
  expect(fx.replies).toMatchObject([{ text: 'Still reply' }]);
});

it('QQ Channel sync rejects a Human DM and preserves Inbox-only history when a Group route stops', async () => {
  const fx = await fixture('qq');
  await fx.receive(qqMention('qq-first'));
  const entry = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!;
  const dmChannel = fx.core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
  const input = {
    kind: 'add' as const,
    grantId: entry.id,
    expectedGrantRevision: entry.revision,
    delivery: 'channel' as const,
    name: 'QQ group',
    enabled: true,
    collection: 'mentions' as const,
    collectionInheritance: 'inherit' as const,
  };
  await expect(
    fx.core.externalMessaging.inbound.channelBridge(dmChannel.id, input),
  ).rejects.toMatchObject({ code: 'channel-unavailable' });
  const room = fx.core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
    name: 'QQ room',
    members: ['ada'],
  });
  await fx.core.externalMessaging.inbound.channelBridge(room.id, input);
  const later = (id: string) => ({
    ...qqMention(id),
    at: new Date(Date.now() + 1000).toISOString(),
  });
  await fx.receive(later('qq-synced'));
  const synced = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!;
  const route = synced.bridgeRoutes!.find((route) => route.channelId === room.id)!;
  await fx.core.externalMessaging.inbound.channelBridge(room.id, {
    ...input,
    kind: 'update',
    grantId: synced.id,
    expectedGrantRevision: synced.revision,
    routeId: route.id,
    expectedRevision: route.revision,
    enabled: false,
  });
  await fx.receive(later('qq-inbox-only'));
  expect(
    fx.core.externalMessaging.inbound.read('ada', fx.sourceId('om-qq-inbox-only')).reception,
  ).toMatchObject({ kind: 'grant' });
  expect(fx.core.externalMessaging.inbound.available('ada', fx.sourceId('om-qq-inbox-only'))).toBe(
    true,
  );
  expect(fx.core.channels.readMessages(room.id).map((message) => message.body)).toEqual([
    'hello qq-synced',
  ]);
  expect(fx.admissions()).toHaveLength(3);
  await fx.restart();
  const retained = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!;
  expect(retained.bridgeRoutes!.find((route) => route.channelId === room.id)?.enabled).toBe(false);
  expect(fx.admissions()).toHaveLength(3);
  expect(fx.core.channels.readMessages(room.id).map((message) => message.body)).toEqual([
    'hello qq-synced',
  ]);
  expect(fx.core.channels.readMessages(dmChannel.id)).toEqual([]);
});

it('QQ keeps a conversation mute preference after the same app is unbound, restarted and bound again', async () => {
  const fx = await fixture('qq');
  await fx.receive(qqMention('before-rebind'));
  const original = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!;
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'mute',
    grantId: original.id,
    expectedRevision: original.preferenceRevision ?? 0,
    muted: true,
  });
  const identity = (await fx.core.externalMessaging.snapshot('ada')).identities![0]!;
  await fx.core.externalMessaging.identity('ada', {
    kind: 'unbind',
    id: identity.id,
    expectedRevision: identity.revision,
  });
  await fx.restart();
  await fx.core.externalMessaging.identity('ada', {
    kind: 'bind',
    providerId: 'dsh-im/qq',
    accountRef: 'lark-app',
    fingerprint,
  });
  await fx.settle();
  await fx.receive({ ...qqMention('after-rebind'), at: new Date(Date.now() + 1000).toISOString() });
  const restored = (await fx.core.externalMessaging.snapshot('ada')).grants.find(
    (grant) => !grant.revokedAt,
  )!;
  expect(restored.id).not.toBe(original.id);
  expect(restored).toMatchObject({ muted: true, preferenceRevision: 1 });
  expect(fx.runs).toHaveLength(1);
  expect(
    fx.core.channels.readMessages(
      fx.core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!.id,
    ),
  ).toEqual([]);
});

it('QQ exposes observed connection gaps after recovery without claiming a missed-message count', async () => {
  const fx = await fixture('qq');
  await fx.receive(qqMention('connection-history'));
  await fx.core.externalMessaging.snapshot('ada');
  const describe = fx.service.describeBot!;
  fx.service.describeBot = async (botId) => ({ ...(await describe(botId)), connected: false });
  expect(await fx.core.externalMessaging.snapshot('ada')).toMatchObject({
    receptionHistory: [
      expect.objectContaining({ reason: 'provider-unavailable', boundary: 'observed' }),
    ],
  });
  fx.service.describeBot = describe;
  await fx.restart();
  expect(await fx.core.externalMessaging.snapshot('ada')).toMatchObject({
    receptionHistory: expect.arrayContaining([
      expect.objectContaining({ reason: 'provider-unavailable', endedAt: expect.any(String) }),
    ]),
  });
});

it('QQ grant fanout waits for the replacement account receiver boundary', async () => {
  const fx = await fixture('qq');
  await fx.receive(qqMention('before-replacement'));
  const describe = fx.service.describeBot!;
  let started!: () => void;
  let resume!: () => void;
  const inspecting = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    resume = resolve;
  });
  let calls = 0;
  fx.service.describeBot = async (botId) => {
    if (++calls === 1) {
      started();
      await gate;
    }
    return describe(botId);
  };
  fx.replaceProvider();
  await inspecting;
  for (let i = 0; i < 4; i++) await tick();
  const prematureSubscriptions = fx.subscriptions;
  const delayed = {
    ...qqMention('during-replacement'),
    at: new Date(Date.now() - 1).toISOString(),
  };
  resume();
  await fx.settle();
  expect(prematureSubscriptions).toBe(0);
  await fx.receive(delayed);
  expect(fx.admissions()).toHaveLength(1);
  await fx.receive(qqMention('after-replacement'));
  expect(fx.admissions()).toHaveLength(2);
});

it('QQ resumes with a fresh eligibility boundary for known and unseen conversations', async () => {
  const fx = await fixture('qq');
  await fx.receive(qqMention('before-pause'));
  await fx.update({ enabled: false });
  vi.useFakeTimers({ toFake: ['Date'] });
  const pausedAt = Date.now();
  const delayed = { ...qqMention('during-pause'), at: new Date(pausedAt).toISOString() };
  vi.setSystemTime(pausedAt + 1);
  await fx.update({ enabled: true });
  await fx.receive(delayed);
  await fx.receive({
    ...delayed,
    eventId: 'unseen-event',
    messageId: 'unseen-message',
    conversation: { kind: 'group', id: 'unseen-group' },
    reply: { ...delayed.reply, messageId: 'unseen-message', conversationId: 'unseen-group' },
  });
  expect(fx.admissions()).toHaveLength(1);
  expect((await fx.core.externalMessaging.snapshot('ada')).grants).toHaveLength(1);
  await fx.receive({ ...qqMention('after-resume'), at: new Date(Date.now() + 1000).toISOString() });
  expect(fx.admissions()).toHaveLength(2);
});

it('QQ retains local pause and block boundaries after allowing future traffic', async () => {
  const fx = await fixture('qq');
  await fx.receive(qqMention('local-boundaries'));
  await fx.update({ enabled: false });
  await fx.update({ enabled: true });
  const grant = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!;
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'block',
    grantId: grant.id,
    expectedRevision: grant.revision,
  });
  const blocked = (await fx.core.externalMessaging.snapshot('ada')).blockedConversations![0]!;
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'allow',
    bindingId: blocked.bindingId!,
    conversation: blocked.conversation,
    from: 'blocked',
    expectedRevision: blocked.revision,
  });
  expect(await fx.core.externalMessaging.snapshot('ada')).toMatchObject({
    receptionHistory: expect.arrayContaining([
      expect.objectContaining({
        reason: 'identity-paused',
        boundary: 'local-command',
        endedAt: expect.any(String),
      }),
      expect.objectContaining({
        reason: 'blocked',
        boundary: 'local-command',
        endedAt: expect.any(String),
      }),
    ]),
  });
});

it('QQ allowing a blocked conversation refuses redelivery from the blocked interval', async () => {
  const fx = await fixture('qq');
  await fx.receive(qqMention('before-block'));
  const grant = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!;
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'block',
    grantId: grant.id,
    expectedRevision: grant.revision,
  });
  vi.useFakeTimers({ toFake: ['Date'] });
  const blockedAt = Date.now();
  const blockedMessage = { ...qqMention('during-block'), at: new Date(blockedAt).toISOString() };
  await fx.receive(blockedMessage);
  const blocked = (await fx.core.externalMessaging.snapshot('ada')).blockedConversations![0]!;
  vi.setSystemTime(blockedAt + 1);
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'allow',
    bindingId: blocked.bindingId!,
    conversation: blocked.conversation,
    from: 'blocked',
    expectedRevision: blocked.revision,
  });
  await fx.settle();
  await fx.receive(blockedMessage);
  await fx.receive({ ...qqMention('after-allow'), at: new Date(Date.now() + 1000).toISOString() });
  expect(fx.core.attention.list({ botSlug: 'ada' }).items).toHaveLength(2);
  expect(fx.runs).toHaveLength(2);
});
