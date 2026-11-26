import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { expect } from 'vitest';
import type { MessagingInboundEvent } from '../src/messaging/provider.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { dm, fixture, ordinaryRole, fresh } from './messaging-default-traffic-fixtures.js';

export type Fixture = Awaited<ReturnType<typeof fixture>>;
export type Platform = 'slack' | 'discord';

export const ids = {
  slack: { channel: 'CQA1', reviewer: 'UQAREV', applicant: 'UQAUSER1', other: 'UQAUSER2' },
  discord: {
    channel: '222222222222',
    reviewer: '444444444444',
    applicant: '111111111111',
    other: '333333333333',
  },
};

export function channelMessage(
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

export function directMessage(platform: Platform, id: string, actorId: string, text = 'hello') {
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

export async function reviewerSetup(
  fx: Fixture,
  platform: Platform,
  capabilities = ['review-pairing'],
  delegable: ('approve' | 'reject' | 'review-pairing')[] = [],
) {
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
        delegableCapabilities: delegable,
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

export const pendingFor = (fx: Fixture, actorId: string) =>
  fx.core.externalMessaging.pairing.list('ada').find((item) => item.actorId === actorId)!;
