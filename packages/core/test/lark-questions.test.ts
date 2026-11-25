import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { afterEach, expect, it, vi } from 'vitest';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { AskUserQuestionItem } from '@deepseek-ai/dsh-user-questions/types';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { ChannelUserQuestions } from '../src/channels/user-questions.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import {
  MessagingProviderError,
  type MessagingQuestionAction,
  type MessagingInboundEvent,
} from '../src/messaging/provider.js';
import { createTempRoot } from './helpers.js';
import { createQuestionMessaging } from '../src/messaging/question-messaging.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { dmChannelId } from '../src/channels/channel.js';
import { placeGroupSource } from './messaging-group-source.js';
import { commitMessagingDefaults, messagingDefaults } from '../src/messaging/defaults.js';

const fingerprint = 'a'.repeat(64);
const cores: BotHarnessCore[] = [];
const owners: ChannelUserQuestions[] = [];
afterEach(async () => {
  for (const owner of owners.splice(0)) owner.close();
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});
async function fixture(textOnly = false) {
  const core = createCore({ dshHome: createTempRoot('bh-lark-question-') });
  cores.push(core);
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
  let receiver: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1] | undefined;
  let fail: 'none' | 'known' | 'unknown' = 'none';
  const cards = vi.fn<NonNullable<DshImOutboundService['questionCardChecked']>>(
    async (_bot, route, card, input) => {
      expect(input.beforeSend?.()).toBe(true);
      if (fail !== 'none')
        throw new MessagingProviderError('simulated', fail === 'known' ? 'not-started' : 'unknown');
      return input.update
        ? { updated: true }
        : {
            sent: true,
            receipt: {
              version: 1,
              messageId: 'om_' + card.requestId,
              conversationId: route.conversationId,
            },
          };
    },
  );
  let sent = 0;
  const replies = vi.fn<NonNullable<DshImOutboundService['replyChecked']>>(
    async (_bot, _route, _text, input) => {
      expect(input.beforeSend?.()).toBe(true);
      return textOnly
        ? {
            sent: true,
            receipt: {
              version: 1,
              messageId: `om_text_${++sent}`,
              conversationId: _route.conversationId,
            },
          }
        : { sent: true };
    },
  );
  const host: DshImOutboundService = {
    contractVersion: 1,
    approvalCardVersion: 1,
    ...(textOnly ? { replyReceiptVersion: 1 as const } : { questionCardVersion: 1 as const }),
    replyFenceVersion: 1,
    listBots: async () => [{ botId: 'lark-qa', channel: 'feishu' }],
    listTargets: async () => [],
    describeBot: async (botId) => ({
      version: 1,
      botId,
      channel: 'feishu',
      connected: true,
      account: { fingerprint, name: 'QA Lark' },
      capabilities: [
        'proactive-text-checked',
        'exclusive-text-consumer',
        'reply-text-checked',
        'approval-card-checked',
        'approval-card-update-checked',
        'approval-action-consumer',
        'question-card-checked',
        'question-card-update-checked',
        'question-action-consumer',
      ],
    }),
    sendChecked: async () => ({ sent: true }),
    replyChecked: replies,
    approvalCardChecked: async () => ({ sent: true }),
    ...(textOnly ? {} : { questionCardChecked: cards }),
    consumeInbound: async (_bot, input) => {
      receiver = input;
      return () => {};
    },
  };
  core.externalMessaging.register(createDshImProvider(host)!);
  await core.externalMessaging.identity('ada', {
    kind: 'bind',
    providerId: 'dsh-im/feishu',
    accountRef: 'lark-qa',
    fingerprint,
  });
  await vi.waitFor(() => expect(receiver).toBeDefined());
  const event: MessagingInboundEvent = {
    version: 1,
    channel: 'feishu',
    botId: 'lark-qa',
    fingerprint,
    eventId: 'pair',
    messageId: 'om_pair',
    actor: { kind: 'user', id: 'ou_alice', name: 'Alice QA' },
    conversation: { kind: 'dm', id: 'oc_private' },
    mentions: [],
    mentionedAccount: false,
    at: new Date().toISOString(),
    text: '/pair',
    reply: { messageId: 'om_pair', conversationId: 'oc_private', actorId: 'ou_alice' },
    replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
  };
  await receiver!.onEvent(event, { signal: receiver!.signal });
  const pairing = core.externalMessaging.pairing.list('ada')[0]!;
  const approved = core.externalMessaging.pairing.review('ada', {
    id: pairing.id,
    expectedRevision: 1,
    kind: 'approve',
    capabilities: ['answer'],
  });
  await core.externalMessaging.approvals.setRoute('ada', pairing.id, 0);
  const sessionId = 'bh-question-qa';
  core.ownership.claim({
    sessionId,
    botSlug: 'ada',
    rootRole: 'orchestrator',
    at: new Date().toISOString(),
  });
  const agent = { session: { id: sessionId, header: { cwd: process.cwd() } } } as Agent;
  const owner = new ChannelUserQuestions(core.channels, core.ownership);
  owners.push(owner);
  core.externalMessaging.questions.attach(owner, core.channels);
  const management = createBridgeMethods(OWNER_HUMAN_CONTEXT, {
    registry: core.registry,
    states: core.states,
    channels: core.channels,
    ownership: core.ownership,
    roster: core.roster,
    externalMessaging: core.externalMessaging,
  });
  const start = async (
    questions: AskUserQuestionItem[] = [
      {
        id: 'choice',
        question: 'Choose a branch',
        options: [
          { label: 'main', description: 'Current' },
          { label: 'qa', description: 'Test' },
        ],
      },
    ],
  ) => {
    const previous = new Set(
      core.externalMessaging.questions.snapshot('ada').map((value) => value.id),
    );
    const answer = owner.ask({ agent, questions });
    void answer.catch(() => undefined);
    await vi.waitFor(() =>
      expect(
        core.externalMessaging.questions
          .snapshot('ada')
          .some((d) => !previous.has(d.id) && d.delivery !== 'pending' && d.delivery !== 'sending'),
      ).toBe(true),
    );
    const delivery = core.externalMessaging.questions.snapshot('ada')[0]!;
    await vi.waitFor(() =>
      expect(
        core.externalMessaging.questions.snapshot('ada').find((d) => d.id === delivery.id)
          ?.delivery,
      ).not.toMatch(/pending|sending/),
    );
    return { answer, delivery };
  };
  const action = (id: string, changes: Partial<MessagingQuestionAction> = {}) =>
    receiver!.onAction!(
      {
        version: 1,
        channel: 'feishu',
        botId: 'lark-qa',
        fingerprint,
        actorId: 'ou_alice',
        conversationId: 'oc_private',
        messageId: 'om_' + id,
        requestId: id,
        action: 'answer',
        values: [{ selected: [0] }],
        ...changes,
      },
      { signal: receiver!.signal },
    );
  const text = (
    text: string,
    parentId?: string,
    from: {
      actorId?: string;
      conversation?: MessagingInboundEvent['conversation'];
      mentions?: MessagingInboundEvent['mentions'];
    } = {},
  ) => {
    const messageId = crypto.randomUUID();
    const conversation = from.conversation ?? event.conversation;
    const actorId = from.actorId ?? event.actor.id;
    return receiver!.onEvent(
      {
        ...event,
        eventId: crypto.randomUUID(),
        messageId,
        text,
        actor: { ...event.actor, id: actorId },
        conversation,
        ...(from.mentions ? { mentions: from.mentions, mentionedAccount: true } : {}),
        reply: {
          messageId,
          conversationId: conversation.id,
          actorId,
          ...(parentId ? { parentId } : {}),
        },
      },
      { signal: receiver!.signal },
    );
  };
  return {
    core,
    owner,
    cards,
    replies,
    approved,
    start,
    action,
    text,
    host,
    agent,
    management,
    failure(value: typeof fail) {
      fail = value;
    },
  };
}

it('answer-only pairing settles the original native question, with actual actor and one canonical answer', async () => {
  const f = await fixture(),
    pending = await f.start([
      {
        id: 'choice',
        question: 'Choose a branch',
        options: [{ label: 'main', description: 'Current' }],
      },
      { id: 'notes', question: 'What should I remember?' },
    ]);
  expect(
    await f.action(pending.delivery.id, {
      values: [{ selected: [0] }, { selected: [], custom: 'Remember this' }],
    }),
  ).toMatchObject({ status: 'queued' });
  expect(await pending.answer).toEqual({
    answers: [
      { id: 'choice', selected: ['main'] },
      { id: 'notes', selected: [], custom: 'Remember this' },
    ],
  });
  const resolutions = f.core.channels
    .readMessages('dm-ada')
    .filter((m) => m.userQuestionResolution);
  expect(resolutions).toHaveLength(1);
  expect(resolutions[0]?.userQuestionResolution?.actor).toMatchObject({
    actorId: 'ou_alice',
    pairingId: f.approved.id,
  });
  expect(await f.action(pending.delivery.id)).toMatchObject({ status: 'refused' });
  expect(f.core.channels.readMessages('dm-ada').some((m) => m.toolApprovalDecision)).toBe(false);
  await vi.waitFor(() => expect(f.cards.mock.calls.at(-1)?.[2].status).toBe('answered'));
});

it('forged actor, receipt, shape and revoked answer authority preserve the original ask', async () => {
  const f = await fixture(),
    pending = await f.start();
  for (const changed of [
    { actorId: 'ou_other' },
    { messageId: 'om_other' },
    { conversationId: 'oc_other' },
  ])
    expect(await f.action(pending.delivery.id, changed)).toMatchObject({ status: 'refused' });
  await expect(f.action(pending.delivery.id, { values: [] })).rejects.toThrow();
  expect(await f.action(pending.delivery.id, { values: [{ selected: [99] }] })).toMatchObject({
    status: 'refused',
  });
  expect(f.owner.pending('ada', pending.delivery.id)).toBeDefined();
  f.core.externalMessaging.pairing.review('ada', {
    kind: 'revoke',
    id: f.approved.id,
    expectedRevision: 2,
  });
  expect(await f.action(pending.delivery.id)).toMatchObject({ status: 'refused' });
  expect(f.owner.pending('ada', pending.delivery.id)).toBeDefined();
});

it('Web and Lark answer races have exactly one winner', async () => {
  const f = await fixture(),
    pending = await f.start();
  const web = f.owner.answer(
    'ada',
    pending.delivery.id,
    {
      answers: [{ id: 'choice', selected: ['qa'] }],
    },
    OWNER_HUMAN_CONTEXT,
  );
  await f.action(pending.delivery.id);
  expect(await web).toBe(true);
  expect(await pending.answer).toEqual({ answers: [{ id: 'choice', selected: ['qa'] }] });
  expect(
    f.core.channels.readMessages('dm-ada').filter((m) => m.userQuestionResolution),
  ).toHaveLength(1);
});

it('known-unsent delivery can be repaired, while uncertain delivery cannot be resent', async () => {
  const f = await fixture();
  f.failure('known');
  const first = await f.start();
  expect(first.delivery.delivery).toBe('failed');
  f.failure('none');
  await f.core.externalMessaging.questions.retry('ada', first.delivery.id);
  expect(f.core.externalMessaging.questions.snapshot('ada')[0]?.delivery).toBe('sent');
  f.failure('unknown');
  const second = await f.start();
  expect(second.delivery.delivery).toBe('unknown-outcome');
  const count = f.cards.mock.calls.length;
  await expect(f.core.externalMessaging.questions.retry('ada', second.delivery.id)).rejects.toThrow(
    'question-repair-unavailable',
  );
  expect(f.cards).toHaveBeenCalledTimes(count);
});

it('explicit references disambiguate questions; ordinary conversation and mismatched replies never answer', async () => {
  const f = await fixture(),
    first = await f.start(),
    second = await f.start();
  await f.text('ordinary clarification');
  expect(f.owner.pending('ada', first.delivery.id)).toBeDefined();
  await f.text('/answer');
  expect(f.replies.mock.calls.at(-1)?.[2]).toContain(first.delivery.reference);
  await f.text(`/answer ${second.delivery.reference} wrong question`, 'om_' + first.delivery.id);
  expect(f.owner.pending('ada', first.delivery.id)).toBeDefined();
  await f.text(`/answer ${first.delivery.reference} custom branch`);
  expect(await first.answer).toEqual({
    answers: [{ id: 'choice', selected: [], custom: 'custom branch' }],
  });
  expect(f.owner.pending('ada', second.delivery.id)).toBeDefined();
});

it('uncertain submission reconciles the original owner without replaying the answer', async () => {
  const f = await fixture(),
    pending = await f.start();
  const append = f.core.channels.appendMessage;
  vi.spyOn(f.core.channels, 'appendMessage').mockImplementationOnce(async (...args) => {
    await append(...args);
    throw new Error('Result lost after commit');
  });
  await f.action(pending.delivery.id);
  await vi.waitFor(() =>
    expect(f.core.externalMessaging.questions.snapshot('ada')[0]?.submission).toBe(
      'unknown-outcome',
    ),
  );
  expect(f.owner.pending('ada', pending.delivery.id)).toBeDefined();
  expect(await f.action(pending.delivery.id)).toMatchObject({ status: 'refused' });
  expect(
    await f.management.questionRetry({ slug: 'other-bot', id: pending.delivery.id }),
  ).toMatchObject({ ok: false, error: { code: 'question-repair-unavailable' } });
  expect(await f.management.questionRetry({ slug: 'ada', id: 'not-a-question' })).toMatchObject({
    ok: false,
  });
  expect(await f.management.questionRetry({ slug: 'ada', id: pending.delivery.id })).toEqual({
    ok: true,
    value: { updated: true },
  });
  expect(await pending.answer).toEqual({ answers: [{ id: 'choice', selected: ['main'] }] });
  expect(
    f.core.channels.readMessages('dm-ada').filter((m) => m.userQuestionResolution),
  ).toHaveLength(1);
});

it('a restarted notification service expires old controls and updates the original receipt without restoring the native owner', async () => {
  const f = await fixture(),
    pending = await f.start();
  f.core.externalMessaging.questions.close();
  const nextOwner = new ChannelUserQuestions(f.core.channels, f.core.ownership);
  owners.push(nextOwner);
  const restarted = createQuestionMessaging({
    database: attachOperationalModule(f.core.operationalDatabase, 'question-recovery-test'),
    pairing: f.core.externalMessaging.pairing,
    approvals: f.core.externalMessaging.approvals,
    provider: () => createDshImProvider(f.host)!,
    isBotActive: () => true,
  });
  try {
    restarted.attach(nextOwner, f.core.channels);
    expect(restarted.snapshot('ada')[0]?.status).toBe('expired');
    expect(nextOwner.pending('ada', pending.delivery.id)).toBeUndefined();
    expect(
      await restarted.action(
        'dsh-im/feishu',
        {
          version: 1,
          channel: 'feishu',
          botId: 'lark-qa',
          fingerprint,
          actorId: 'ou_alice',
          conversationId: 'oc_private',
          messageId: 'om_' + pending.delivery.id,
          requestId: pending.delivery.id,
          action: 'answer',
          values: [{ selected: [0] }],
        },
        new AbortController().signal,
      ),
    ).toMatchObject({ status: 'refused' });
    await vi.waitFor(() => expect(f.cards.mock.calls.at(-1)?.[2].status).toBe('expired'));
  } finally {
    restarted.close();
  }
});

it('text replies answer with letters, several questions, a #reference, or a bare option for the only waiting question', async () => {
  const f = await fixture();
  const bare = await f.start();
  await f.text('I think we should talk first');
  expect(f.owner.pending('ada', bare.delivery.id)).toBeDefined();
  await f.text('b');
  expect(await bare.answer).toEqual({ answers: [{ id: 'choice', selected: ['qa'] }] });

  const form = await f.start([
    {
      id: 'targets',
      question: 'Which targets?',
      multiSelect: true,
      options: [{ label: 'web' }, { label: 'ios' }, { label: 'android' }],
    },
    { id: 'note', question: 'Anything else?' },
  ]);
  await f.text('1A D 2 none', 'om_' + form.delivery.id);
  expect(f.replies.mock.calls.at(-1)?.[2]).toMatch(/Question 1: that option does not exist/);
  expect(f.replies.mock.calls.at(-1)?.[2]).toContain(`#${form.delivery.reference}`);
  expect(f.owner.pending('ada', form.delivery.id)).toBeDefined();
  await f.text(`#${form.delivery.reference.toLowerCase()} 1 a c\n2 ship at 3 pm`);
  expect(await form.answer).toEqual({
    answers: [
      { id: 'targets', selected: ['web', 'android'] },
      { id: 'note', selected: [], custom: 'ship at 3 pm' },
    ],
  });
});

it('a question asked while the turn handles a bridged Lark group message goes to that group, and a turn from elsewhere stays in the DM', async () => {
  const f = await fixture();
  const bridged = placeGroupSource(f.core, {
    channelId: dmChannelId('ada'),
    fingerprint,
    conversationId: 'oc_bridged',
    messageId: 'om_bridged_ask',
    placed: false,
  });
  placeGroupSource(f.core, {
    channelId: dmChannelId('ada'),
    fingerprint,
    conversationId: 'oc_stale',
    messageId: 'om_stale_ask',
  });
  const turn = vi.spyOn(f.core.runtime, 'turnSourceEventIds').mockReturnValue([bridged]);
  const asked = await f.start();
  expect(asked.delivery.destination).toMatchObject({ kind: 'group', conversationId: 'oc_bridged' });
  expect(f.cards.mock.calls.at(-1)?.[1]).toMatchObject({
    messageId: 'om_bridged_ask',
    conversationId: 'oc_bridged',
  });
  turn.mockReturnValue(['local-source']);
  const local = await f.start();
  expect(local.delivery.destination).toBeUndefined();
  turn.mockReturnValue(undefined);
  const idle = await f.start();
  expect(idle.delivery.destination).toMatchObject({ kind: 'group', conversationId: 'oc_stale' });
});

it('a quoted group answer drops only the leading @Bot and keeps other people it mentions', async () => {
  const f = await fixture();
  placeGroupSource(f.core, {
    channelId: dmChannelId('ada'),
    fingerprint,
    conversationId: 'oc_team',
    messageId: 'om_team_ask',
  });
  const asked = await f.start([{ id: 'who', question: 'Who reviews?' }]);
  await f.text('@_user_1 ask @_user_2', 'om_' + asked.delivery.id, {
    conversation: { kind: 'group', id: 'oc_team' },
    mentions: [
      { id: 'ou_bot', key: '@_user_1', name: 'QA Bot' },
      { id: 'ou_bob', key: '@_user_2', name: 'Bob' },
    ],
  });
  expect(await asked.answer).toEqual({
    answers: [{ id: 'who', selected: [], custom: 'ask @Bob' }],
  });
});

it('a question whose group card the provider refuses is sent to the DM instead and answered there', async () => {
  const f = await fixture();
  placeGroupSource(f.core, {
    channelId: dmChannelId('ada'),
    fingerprint,
    conversationId: 'oc_team',
    messageId: 'om_team_ask',
  });
  f.cards.mockImplementationOnce(async () => {
    throw Object.assign(new Error('stale-route'), { code: 'stale-route' });
  });
  const asked = await f.start();
  const id = asked.delivery.id;
  const delivered = () =>
    f.core.externalMessaging.questions.snapshot('ada').find((value) => value.id === id);
  await vi.waitFor(() => expect(delivered()?.delivery).toBe('sent'));
  expect(delivered()?.destination).toBeUndefined();
  expect(f.cards.mock.calls.map((call) => call[1].conversationId)).toEqual([
    'oc_team',
    'oc_private',
  ]);
  await f.text('B', 'om_' + id);
  expect(await asked.answer).toEqual({ answers: [{ id: 'choice', selected: ['qa'] }] });
});

it('a question raised from a Lark group conversation is answered in that group by paired people only, and the Binding or its platform default can send it back to the DM', async () => {
  const f = await fixture();
  const group = { kind: 'group' as const, id: 'oc_team' };
  placeGroupSource(f.core, {
    channelId: dmChannelId('ada'),
    fingerprint,
    conversationId: 'oc_team',
    messageId: 'om_team_ask',
  });
  placeGroupSource(f.core, {
    channelId: dmChannelId('ada'),
    fingerprint,
    conversationId: 'oc_stale',
    messageId: 'om_stale_ask',
    revision: 0,
  });
  const asked = await f.start();
  expect(asked.delivery.destination).toMatchObject({ kind: 'group', conversationId: 'oc_team' });
  expect(f.cards.mock.calls.at(-1)?.[1]).toMatchObject({
    messageId: 'om_team_ask',
    conversationId: 'oc_team',
  });
  const card = 'om_' + asked.delivery.id;
  await f.text('A', card, { actorId: 'ou_bob', conversation: group });
  await f.text('B', undefined, { conversation: group });
  expect(f.owner.pending('ada', asked.delivery.id)).toBeDefined();
  await f.text('@_user_1 B', card, {
    conversation: group,
    mentions: [{ id: 'ou_bot', key: '@_user_1', name: 'QA Bot' }],
  });
  expect(await asked.answer).toEqual({ answers: [{ id: 'choice', selected: ['qa'] }] });
  const actor = f.core.channels
    .readMessages(dmChannelId('ada'))
    .find((message) => message.userQuestionResolution?.requestMessageId === asked.delivery.id)
    ?.userQuestionResolution?.actor;
  expect(actor).toMatchObject({
    platform: 'feishu',
    actorId: 'ou_alice',
    conversationId: 'oc_team',
  });

  const binding = () =>
    attachOperationalModule(f.core.operationalDatabase, 'messaging').read(
      (db) =>
        db
          .prepare(
            "SELECT id, group_interactions_revision AS revision FROM messaging_bindings WHERE bot_slug = 'ada'",
          )
          .get() as { id: string; revision: number },
    );
  const setBinding = (enabled: boolean | null) =>
    f.core.externalMessaging.setGroupInteractions({
      botSlug: 'ada',
      bindingId: binding().id,
      expectedRevision: binding().revision,
      enabled,
    });
  expect(await setBinding(false)).toMatchObject({
    groupInteractions: false,
    groupInteractionsInheritance: 'custom',
  });
  const bindingOff = await f.start();
  expect(bindingOff.delivery.destination).toBeUndefined();
  await expect(
    f.core.externalMessaging.setGroupInteractions({
      botSlug: 'ada',
      bindingId: binding().id,
      expectedRevision: 1,
      enabled: null,
    }),
  ).rejects.toMatchObject({ code: 'identity-changed' });

  await setBinding(null);
  attachOperationalModule(f.core.operationalDatabase, 'messaging').transaction((db) => {
    const { revision, changedAt: _at, ...preferences } = messagingDefaults(db, 'feishu');
    commitMessagingDefaults(db, {
      ...preferences,
      expectedRevision: revision,
      groupInteractions: false,
    });
  });
  const private_ = await f.start();
  expect(private_.delivery.destination).toBeUndefined();
  expect(f.cards.mock.calls.at(-1)?.[1]).toMatchObject({ conversationId: 'oc_private' });

  expect(await setBinding(true)).toMatchObject({
    groupInteractions: true,
    groupInteractionsInheritance: 'custom',
  });
  const bindingOn = await f.start();
  expect(bindingOn.delivery.destination).toMatchObject({
    kind: 'group',
    conversationId: 'oc_team',
  });
  await setBinding(false);
  await f.text('A', 'om_' + bindingOn.delivery.id, { conversation: group });
  expect(f.owner.pending('ada', bindingOn.delivery.id)).toBeDefined();
});

it('asks by text when cards are unavailable and takes a quoted letter', async () => {
  const f = await fixture(true);
  const { answer, delivery } = await f.start();
  expect(f.cards).not.toHaveBeenCalled();
  const asked = f.replies.mock.calls.find((call) => String(call[2]).includes('Choose a branch'))!;
  expect(asked[2]).toContain('B. qa');
  expect(asked[2]).toContain(`#${delivery.reference}`);
  const receipt = f.core.externalMessaging.questions.snapshot('ada')[0]!.receipt!.messageId;
  await f.text('B', receipt);
  expect(await answer).toEqual({ answers: [{ id: 'choice', selected: ['qa'] }] });
  await vi.waitFor(() => expect(f.replies.mock.calls.at(-1)![2]).toContain('Answered / 已回答'));
});

it('a quoted free-text question does not take an unknown #reference as its answer', async () => {
  const f = await fixture(true);
  const { answer, delivery } = await f.start([{ id: 'note', question: 'Anything to add?' }]);
  const receipt = f.core.externalMessaging.questions.snapshot('ada')[0]!.receipt!.messageId;
  await f.text('#0123456789AB allow', receipt);
  await vi.waitFor(() =>
    expect(f.replies.mock.calls.at(-1)![2]).toContain(`#${delivery.reference}`),
  );
  expect(f.owner.pending('ada', delivery.id)).toBeDefined();
  await f.text('Ship it', receipt);
  expect(await answer).toEqual({ answers: [{ id: 'note', selected: [], custom: 'Ship it' }] });
});
