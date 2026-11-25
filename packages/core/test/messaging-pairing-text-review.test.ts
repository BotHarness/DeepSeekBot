import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { afterEach, expect, it } from 'vitest';
import type { MessagingInboundEvent } from '../src/messaging/provider.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { parsePairingReply } from '../src/messaging/interactions/pairing-text.js';
import { dm, fixture, ordinaryRole, fresh, cleanup } from './messaging-default-traffic-fixtures.js';

afterEach(cleanup);

type Fixture = Awaited<ReturnType<typeof fixture>>;
type Platform = 'slack' | 'discord';

const ids = {
  slack: { channel: 'CQA1', reviewer: 'UQAREV', applicant: 'UQAUSER1', other: 'UQAUSER2' },
  discord: {
    channel: '222222222222',
    reviewer: '444444444444',
    applicant: '111111111111',
    other: '333333333333',
  },
};

function channelMessage(
  platform: Platform,
  id: string,
  actorId: string,
  text: string,
  reply: Partial<MessagingInboundEvent['reply']> = {},
  mentioned = true,
): MessagingInboundEvent {
  const conversationId = ids[platform].channel;
  return fresh(
    dm(id, {
      channel: platform,
      actor: { kind: 'user', id: actorId, name: actorId },
      conversation: { kind: 'group', id: conversationId },
      mentions: mentioned ? [{ id: 'bot', key: '@bot' }] : [],
      mentionedAccount: mentioned,
      text: mentioned ? `@bot ${text}` : text,
      reply: { messageId: `om-${id}`, conversationId, actorId, ...reply },
    }),
  );
}

function directMessage(platform: Platform, id: string, actorId: string, text = 'hello') {
  const conversationId = platform === 'slack' ? 'DQAREV' : '555555555555';
  return fresh(
    dm(id, {
      channel: platform,
      actor: { kind: 'user', id: actorId, name: 'Reviewer' },
      conversation: { kind: 'dm', id: conversationId },
      text,
      reply: { messageId: `om-${id}`, conversationId, actorId },
    }),
  );
}

async function reviewerSetup(fx: Fixture, platform: Platform, capabilities = ['review-pairing']) {
  const colleague = await ordinaryRole(fx);
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...fx.core });
  await methods.senderAccess({
    slug: 'ada',
    input: { kind: 'create-role', name: 'Reviewer', behavior: 'Reviews pairing requests.' },
  });
  const created = (await fx.core.externalMessaging.snapshot('ada')).roles!.find(
    (role) => role.name === 'Reviewer',
  )!;
  expect(
    await methods.senderAccess({
      slug: 'ada',
      input: {
        kind: 'edit-role',
        id: created.id,
        expectedRevision: created.revision,
        name: 'Reviewer',
        behavior: created.behavior,
        capabilities: capabilities as ('approve' | 'review-pairing')[],
      },
    }),
  ).toMatchObject({ ok: true });
  const reviewerRole = (await fx.core.externalMessaging.snapshot('ada')).roles!.find(
    (role) => role.name === 'Reviewer',
  )!;
  await fx.receive(directMessage(platform, 'reviewer-pair', ids[platform].reviewer));
  const request = fx.core.externalMessaging.pairing
    .list('ada')
    .find((item) => item.actorId === ids[platform].reviewer)!;
  const paired = fx.core.externalMessaging.pairing.review('ada', {
    kind: 'approve',
    id: request.id,
    expectedRevision: request.revision,
    roleId: reviewerRole.id,
    expectedRoleRevision: reviewerRole.revision,
  });
  await fx.settle();
  return { colleague, reviewerRole, paired };
}

const pendingFor = (fx: Fixture, actorId: string) =>
  fx.core.externalMessaging.pairing.list('ada').find((item) => item.actorId === actorId)!;

it('parses pairing review replies without catching ordinary words', () => {
  expect(parsePairingReply('同意')).toEqual({ decision: 'approve' });
  expect(parsePairingReply('同意 Colleague')).toEqual({ decision: 'approve', role: 'Colleague' });
  expect(parsePairingReply('approve colleague #abcdef0123')).toEqual({
    decision: 'approve',
    role: 'colleague',
    reference: 'ABCDEF0123',
  });
  expect(parsePairingReply('#ABCDEF0123 拒绝。')).toEqual({
    decision: 'reject',
    reference: 'ABCDEF0123',
  });
  expect(parsePairingReply('不同意')).toEqual({ decision: 'reject' });
  expect(parsePairingReply('approved')).toBeUndefined();
  expect(parsePairingReply('拒绝 他')).toBeUndefined();
  expect(parsePairingReply('hello')).toBeUndefined();
});

for (const platform of ['slack', 'discord'] as const)
  it(`${platform} channel: a reviewer approves an unpaired member by replying in the thread`, async () => {
    const fx = await fixture(platform);
    const { colleague } = await reviewerSetup(fx, platform);
    const { applicant, reviewer } = ids[platform];
    await fx.receive(channelMessage(platform, 'blocked', applicant, 'question'));
    expect(fx.runs).toHaveLength(0);
    const request = pendingFor(fx, applicant);
    expect(request).toMatchObject({ status: 'pending', conversationKind: 'group' });
    const notice = fx.replies.at(-1)!;
    expect(notice.text).toContain(`#${request.reference}`);
    expect(notice.text).toContain('「同意」「同意 <角色>」');
    expect(pendingFor(fx, applicant).notifications).toEqual([
      expect.objectContaining({
        outcome: 'accepted',
        receipt: { messageId: 'reply-om-blocked', conversationId: ids[platform].channel },
      }),
    ]);

    const anchor =
      platform === 'slack'
        ? { threadId: 'om-blocked', rootId: 'om-blocked' }
        : { parentId: 'reply-om-blocked' };
    await fx.receive(channelMessage(platform, 'self', applicant, '同意', anchor, false));
    expect(fx.replies.at(-1)!.text).toContain('Only people allowed to review pairing');
    expect(pendingFor(fx, applicant).status).toBe('pending');

    await fx.receive(
      channelMessage(platform, 'denied-role', reviewer, '同意 Reviewer', anchor, false),
    );
    expect(fx.replies.at(-1)!.text).toContain('You cannot assign the Role "Reviewer"');
    await fx.receive(
      channelMessage(platform, 'unknown-role', reviewer, '同意 Nobody', anchor, false),
    );
    const [privateList, publicNotice] = fx.replies.slice(-2);
    expect(privateList!.route.conversationId).not.toBe(ids[platform].channel);
    expect(privateList!.text).toContain('Roles you can assign / 可分配的角色: Colleague');
    expect(publicNotice!.route.conversationId).toBe(ids[platform].channel);
    expect(publicNotice!.text).toContain('可分配的角色已私信发给你');
    expect(publicNotice!.text).not.toContain('Colleague');
    expect(pendingFor(fx, applicant).status).toBe('pending');

    await fx.receive(channelMessage(platform, 'approve', reviewer, '同意', anchor, false));
    expect(pendingFor(fx, applicant)).toMatchObject({
      status: 'approved',
      roleId: colleague.id,
      reviewedBy: 'paired-reviewer',
      reviewerActorId: reviewer,
    });
    expect(fx.replies.map((reply) => reply.text)).toEqual(
      expect.arrayContaining([
        `Approved pairing request ${request.reference}. / 已批准配对申请 ${request.reference}。`,
        expect.stringContaining('send your question again'),
      ]),
    );
    expect(fx.runs).toHaveLength(0);
    expect(fx.admissions()).toEqual([]);

    await fx.receive(channelMessage(platform, 'fresh', applicant, 'question again'));
    expect(fx.runs).toHaveLength(1);
  });

it('a reference picks the request, reject works, and settled requests say so', async () => {
  const fx = await fixture('discord');
  await reviewerSetup(fx, 'discord');
  const { applicant, other, reviewer } = ids.discord;
  await fx.receive(channelMessage('discord', 'first', applicant, 'question'));
  await fx.receive(channelMessage('discord', 'second', other, 'question'));
  const first = pendingFor(fx, applicant);
  const second = pendingFor(fx, other);

  await fx.receive(channelMessage('discord', 'bare', reviewer, '拒绝', {}, false));
  expect(fx.runs).toHaveLength(0);
  expect(pendingFor(fx, applicant).status).toBe('pending');
  expect(pendingFor(fx, other).status).toBe('pending');

  await fx.receive(
    channelMessage('discord', 'ref', reviewer, `拒绝 #${second.reference}`, {}, false),
  );
  expect(pendingFor(fx, other).status).toBe('rejected');
  expect(pendingFor(fx, applicant).status).toBe('pending');
  expect(fx.replies.at(-1)!.text).toContain(`Rejected pairing request ${second.reference}`);

  await fx.receive(
    channelMessage('discord', 'again', reviewer, `同意 #${second.reference}`, {}, false),
  );
  expect(fx.replies.at(-1)!.text).toContain('no longer waiting for review');

  await fx.receive(channelMessage('discord', 'single', reviewer, 'approve', {}, false));
  expect(pendingFor(fx, applicant)).toMatchObject({ status: 'approved' });
  expect(first.reference).not.toBe(second.reference);
  expect(fx.runs).toHaveLength(0);
});

it('an unanchored approval word from a non-reviewer reaches the Bot as ordinary chat', async () => {
  const fx = await fixture('slack');
  const { colleague } = await reviewerSetup(fx, 'slack');
  const { applicant, other } = ids.slack;
  await fx.receive(channelMessage('slack', 'member', other, 'question'));
  const member = pendingFor(fx, other);
  fx.core.externalMessaging.pairing.review('ada', {
    kind: 'approve',
    id: member.id,
    expectedRevision: member.revision,
    roleId: colleague.id,
    expectedRoleRevision: colleague.revision,
  });
  await fx.receive(channelMessage('slack', 'blocked', applicant, 'question'));
  expect(pendingFor(fx, applicant).status).toBe('pending');
  await fx.receive(channelMessage('slack', 'chat', other, 'approve'));
  expect(pendingFor(fx, applicant).status).toBe('pending');
  expect(fx.runs).toHaveLength(1);
});

it('the approval route receives the full review and can approve from its own conversation', async () => {
  const fx = await fixture('slack');
  const { colleague, paired } = await reviewerSetup(fx, 'slack', ['approve', 'review-pairing']);
  const snapshot = fx.core.externalMessaging.approvals.snapshot('ada');
  await fx.core.externalMessaging.approvals.setRoute('ada', paired.id, snapshot.routeRevision);
  const { applicant, reviewer } = ids.slack;
  await fx.receive(channelMessage('slack', 'blocked', applicant, 'question'));
  await fx.settle();
  const request = pendingFor(fx, applicant);
  const review = fx.replies.find((reply) => reply.text.startsWith('Pairing review'))!;
  expect(review.route.conversationId).toBe('DQAREV');
  expect(review.text).toContain(`#${request.reference}`);
  expect(review.text).toContain('可分配角色: Colleague');
  expect(review.text).not.toContain('1. Colleague');
  expect(review.text).not.toContain('question');
  expect(request.notifications).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        key: `route:${paired.id}`,
        outcome: 'accepted',
        receipt: expect.objectContaining({ conversationId: 'DQAREV' }),
      }),
    ]),
  );
  await fx.receive(directMessage('slack', 'route-approve', reviewer, '同意 Colleague'));
  expect(pendingFor(fx, applicant)).toMatchObject({ status: 'approved', roleId: colleague.id });
  expect(fx.replies.slice(-2)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        route: expect.objectContaining({ conversationId: 'CQA1' }),
        text: expect.stringContaining('send your question again'),
      }),
      expect.objectContaining({
        route: expect.objectContaining({ conversationId: 'DQAREV' }),
        text: expect.stringContaining(`Approved pairing request ${request.reference}`),
      }),
    ]),
  );
  await fx.receive(directMessage('slack', 'route-redelivered', reviewer, '同意 Colleague'));
  expect(fx.replies.at(-1)).toMatchObject({
    route: expect.objectContaining({ conversationId: 'DQAREV' }),
    text: expect.stringContaining(`Pairing request ${request.reference} is no longer waiting`),
  });
  expect(fx.runs).toHaveLength(0);
  expect(fx.admissions()).toEqual([]);
});

it('a notice repeated in a second channel binds the reply there', async () => {
  const fx = await fixture('slack');
  await reviewerSetup(fx, 'slack');
  const { applicant, reviewer } = ids.slack;
  const inSecond = (event: MessagingInboundEvent): MessagingInboundEvent => ({
    ...event,
    conversation: { kind: 'group', id: 'CQA2' },
    reply: { ...event.reply, conversationId: 'CQA2' },
  });
  await fx.receive(channelMessage('slack', 'first', applicant, 'question'));
  await fx.receive(inSecond(channelMessage('slack', 'second', applicant, 'question')));
  const request = pendingFor(fx, applicant);
  expect(request.conversationId).toBe('CQA1');
  expect(request.notifications?.map((notice) => notice.receipt?.conversationId)).toContain('CQA2');
  await fx.receive(
    inSecond(
      channelMessage(
        'slack',
        'approve-second',
        reviewer,
        '同意 Colleague',
        { threadId: 'om-second', rootId: 'om-second' },
        false,
      ),
    ),
  );
  expect(pendingFor(fx, applicant).status).toBe('approved');
  expect(fx.replies.some((reply) => reply.text.includes('send your question again'))).toBe(true);
  expect(fx.runs).toHaveLength(0);
});

it('a thread reply matching two requests asks for the reference instead of guessing', async () => {
  const fx = await fixture('slack');
  await reviewerSetup(fx, 'slack');
  const { applicant, other, reviewer } = ids.slack;
  const thread = { threadId: 'om-root', rootId: 'om-root' };
  await fx.receive(channelMessage('slack', 'first', applicant, 'question', thread));
  await fx.receive(channelMessage('slack', 'second', other, 'question', thread));
  await fx.receive(channelMessage('slack', 'which', reviewer, '同意 Colleague', thread, false));
  expect(fx.replies.at(-1)!.text).toContain('Several pairing requests match');
  expect(pendingFor(fx, applicant).status).toBe('pending');
  expect(pendingFor(fx, other).status).toBe('pending');
  const second = pendingFor(fx, other);
  await fx.receive(
    channelMessage('slack', 'pick', reviewer, `同意 Colleague #${second.reference}`, thread, false),
  );
  expect(pendingFor(fx, other).status).toBe('approved');
  expect(pendingFor(fx, applicant).status).toBe('pending');
  expect(fx.runs).toHaveLength(0);
});

async function secondRole(fx: Fixture) {
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...fx.core });
  await methods.senderAccess({
    slug: 'ada',
    input: { kind: 'create-role', name: 'Guest', behavior: 'Short answers only.' },
  });
  return methods;
}

it('a bare approval in a channel uses the default Role, and the review marks it', async () => {
  const fx = await fixture('slack');
  const { paired } = await reviewerSetup(fx, 'slack', ['approve', 'review-pairing']);
  const methods = await secondRole(fx);
  const before = await fx.core.externalMessaging.snapshot('ada');
  const guest = before.roles!.find((role) => role.name === 'Guest')!;
  expect(
    await methods.senderAccess({
      slug: 'ada',
      input: { kind: 'default-role', roleId: guest.id, expectedRevision: 0 },
    }),
  ).toMatchObject({ ok: false });
  expect(
    await methods.senderAccess({
      slug: 'ada',
      input: {
        kind: 'default-role',
        roleId: guest.id,
        expectedRevision: before.senderPolicy!.revision,
      },
    }),
  ).toMatchObject({ ok: true });
  expect((await fx.core.externalMessaging.snapshot('ada')).senderPolicy).toMatchObject({
    defaultRoleId: guest.id,
  });
  const snapshot = fx.core.externalMessaging.approvals.snapshot('ada');
  await fx.core.externalMessaging.approvals.setRoute('ada', paired.id, snapshot.routeRevision);
  const { applicant, reviewer } = ids.slack;
  await fx.receive(channelMessage('slack', 'blocked', applicant, 'question'));
  await fx.settle();
  const review = fx.replies.find((reply) => reply.text.startsWith('Pairing review'))!;
  expect(review.text).toContain('Guest (default / 默认)');
  expect(review.text).toContain('「同意」使用默认角色');
  await fx.receive(
    channelMessage(
      'slack',
      'approve',
      reviewer,
      '同意',
      { threadId: 'om-blocked', rootId: 'om-blocked' },
      false,
    ),
  );
  expect(pendingFor(fx, applicant)).toMatchObject({ status: 'approved', roleId: guest.id });
  expect(
    fx.replies.some(
      (reply) => reply.text.includes('Guest') && reply.route.conversationId === 'CQA1',
    ),
  ).toBe(false);
  expect(fx.runs).toHaveLength(0);
});

it('without a default Role, the choices go to the reviewer privately and a DM reply approves', async () => {
  const fx = await fixture('slack');
  await reviewerSetup(fx, 'slack');
  await secondRole(fx);
  const { applicant, reviewer } = ids.slack;
  await fx.receive(channelMessage('slack', 'blocked', applicant, 'question'));
  const request = pendingFor(fx, applicant);
  await fx.receive(
    channelMessage(
      'slack',
      'bare',
      reviewer,
      '同意',
      { threadId: 'om-blocked', rootId: 'om-blocked' },
      false,
    ),
  );
  const [privateList, publicNotice] = fx.replies.slice(-2);
  expect(privateList).toMatchObject({
    route: expect.objectContaining({ conversationId: 'DQAREV' }),
    text: expect.stringContaining('Colleague, Guest'),
  });
  expect(privateList!.text).toContain(`#${request.reference}`);
  expect(publicNotice).toMatchObject({
    route: expect.objectContaining({ conversationId: 'CQA1' }),
    text: expect.stringContaining('可分配的角色已私信发给你'),
  });
  expect(pendingFor(fx, applicant).status).toBe('pending');
  expect(pendingFor(fx, applicant).notifications).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        key: `private:${reviewer}`,
        receipt: expect.objectContaining({ conversationId: 'DQAREV' }),
      }),
    ]),
  );

  await fx.receive(directMessage('slack', 'dm-approve', reviewer, '同意 Guest'));
  expect(pendingFor(fx, applicant)).toMatchObject({ status: 'approved' });
  expect(fx.replies.at(-1)).toMatchObject({
    route: expect.objectContaining({ conversationId: 'DQAREV' }),
    text: expect.stringContaining(`Approved pairing request ${request.reference} with Role Guest`),
  });
  expect(fx.runs).toHaveLength(0);
});
