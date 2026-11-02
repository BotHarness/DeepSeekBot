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
async function fixture() {
  const core = createCore({ dshHome: createTempRoot('bh-lark-question-') });
  cores.push(core);
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  core.channels.getOrCreateDm('ada', 'Ada');
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
  const replies = vi.fn<NonNullable<DshImOutboundService['replyChecked']>>(
    async (_bot, _route, _text, input) => {
      expect(input.beforeSend?.()).toBe(true);
      return { sent: true };
    },
  );
  const host: DshImOutboundService = {
    contractVersion: 1,
    approvalCardVersion: 1,
    questionCardVersion: 1,
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
    questionCardChecked: cards,
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
  const management = createBridgeMethods({
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
  const text = (text: string, parentId?: string) => {
    const messageId = crypto.randomUUID();
    return receiver!.onEvent(
      {
        ...event,
        eventId: crypto.randomUUID(),
        messageId,
        text,
        reply: { ...event.reply, messageId, ...(parentId ? { parentId } : {}) },
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
  const web = f.owner.answer('ada', pending.delivery.id, {
    answers: [{ id: 'choice', selected: ['qa'] }],
  });
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
