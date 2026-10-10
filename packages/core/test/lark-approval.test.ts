import { afterEach, expect, it, vi } from 'vitest';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import {
  MessagingProviderError,
  type MessagingApprovalAction,
  type MessagingInboundEvent,
} from '../src/messaging/provider.js';
import { ChannelToolApproval } from '../src/workspaces/tool-approval.js';
import { createTempRoot } from './helpers.js';

const fingerprint = 'a'.repeat(64);
const cores: BotHarnessCore[] = [];
const owners: ChannelToolApproval[] = [];
afterEach(async () => {
  for (const owner of owners.splice(0)) owner.close();
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});
async function fixture(ordinaryRole = false) {
  const core = createCore({ dshHome: createTempRoot('bh-lark-approval-') });
  cores.push(core);
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  core.channels.getOrCreateDm('ada', 'Ada');
  let receiver: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1] | undefined;
  let fail: 'none' | 'known' | 'unknown' = 'none';
  const cards = vi.fn<NonNullable<DshImOutboundService['approvalCardChecked']>>(
    async (_botId, route, _card, input) => {
      expect(input.beforeSend()).toBe(true);
      if (fail !== 'none')
        throw new MessagingProviderError('simulated', fail === 'known' ? 'not-started' : 'unknown');
      return input.update
        ? { updated: true }
        : {
            sent: true,
            receipt: { version: 1, messageId: 'om_card', conversationId: route.conversationId },
          };
    },
  );
  const provider: DshImOutboundService = {
    contractVersion: 1,
    approvalCardVersion: 1,
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
      ],
    }),
    sendChecked: async () => ({ sent: true }),
    replyChecked: async () => ({ sent: true }),
    consumeInbound: async (_botId, input) => {
      receiver = input;
      return () => {};
    },
    approvalCardChecked: cards,
  };
  core.externalMessaging.register(createDshImProvider(provider)!);
  const binding = await core.externalMessaging.identity('ada', {
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
    eventId: 'event-pair',
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
  let role;
  if (ordinaryRole) {
    core.externalMessaging.senderAccess('ada', {
      kind: 'create-role',
      name: 'Reviewer',
      behavior: 'Documentation questions; explicitly approve or reject native requests.',
    });
    role = (await core.externalMessaging.snapshot('ada')).roles![0]!;
    core.externalMessaging.senderAccess('ada', {
      kind: 'edit-role',
      id: role.id,
      expectedRevision: role.revision,
      name: role.name,
      behavior: role.behavior,
      capabilities: ['approve', 'reject'],
    });
    role = (await core.externalMessaging.snapshot('ada')).roles![0]!;
    core.externalMessaging.pairing.request(binding.id, { ...event, text: 'Hello' }, 'conversation');
  } else await receiver!.onEvent(event, { signal: receiver!.signal });
  const pairing = core.externalMessaging.pairing.list('ada')[0]!;
  const approved = core.externalMessaging.pairing.review('ada', {
    id: pairing.id,
    expectedRevision: 1,
    kind: 'approve',
    ...(role
      ? { roleId: role.id, expectedRoleRevision: role.revision }
      : { capabilities: ['approve' as const, 'reject' as const] }),
  });
  await core.externalMessaging.approvals.setRoute('ada', pairing.id, 0);
  const sessionId = 'bh-approval-qa';
  core.ownership.claim({
    sessionId,
    botSlug: 'ada',
    rootRole: 'orchestrator',
    at: new Date().toISOString(),
  });
  const agent = { session: { id: sessionId, header: { cwd: '/tmp/approval-qa' } } } as Agent;
  const owner = new ChannelToolApproval(core.channels, core.ownership);
  owners.push(owner);
  core.externalMessaging.approvals.attach(owner, core.channels);
  const start = async (
    callId = 'call-1',
    externalDecision: 'operation' | 'web-only' = 'operation',
  ) => {
    const execution = {
      agent,
      name: 'bash',
      arguments: { command: 'pwd' },
      callId,
      token: Symbol('call'),
    } as ToolExecution;
    const untrack = owner.track(execution, externalDecision);
    const answer = owner.ask({ agent, toolName: 'bash', callId });
    await vi.waitFor(() =>
      expect(
        core.externalMessaging.approvals
          .snapshot('ada')
          .deliveries.find((d) => d.callId === callId),
      ).toBeDefined(),
    );
    return {
      answer,
      execution,
      untrack,
      delivery: core.externalMessaging.approvals
        .snapshot('ada')
        .deliveries.find((d) => d.callId === callId)!,
    };
  };
  const action = (id: string, changes: Partial<MessagingApprovalAction> = {}) =>
    receiver!.onAction!(
      {
        version: 1,
        channel: 'feishu',
        botId: 'lark-qa',
        fingerprint,
        actorId: 'ou_alice',
        conversationId: 'oc_private',
        messageId: 'om_card',
        requestId: id,
        action: 'allowed-once',
        ...changes,
      },
      { signal: receiver!.signal },
    );
  return {
    core,
    owner,
    cards,
    binding,
    approved,
    role,
    start,
    action,
    failure(value: typeof fail) {
      fail = value;
    },
  };
}

it('current ordinary Role capabilities settle native requests and removed capabilities refuse delayed cards', async () => {
  const f = await fixture(true);
  const allowed = await f.start('role-allow');
  await vi.waitFor(() =>
    expect(f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]?.delivery).toBe('sent'),
  );
  expect(await f.action(allowed.delivery.id)).toMatchObject({ status: 'queued' });
  expect(await allowed.answer).toBe('allowed-once');
  const rejected = await f.start('role-reject');
  await vi.waitFor(() =>
    expect(f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]?.delivery).toBe('sent'),
  );
  expect(await f.action(rejected.delivery.id, { action: 'rejected' })).toMatchObject({
    status: 'queued',
  });
  expect(await rejected.answer).toBe('rejected');
  const delayed = await f.start('role-delayed');
  await vi.waitFor(() =>
    expect(f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]?.delivery).toBe('sent'),
  );
  const role = f.role!;
  f.core.externalMessaging.senderAccess('ada', {
    kind: 'edit-role',
    id: role.id,
    expectedRevision: role.revision,
    name: role.name,
    behavior: 'Ordinary chat only; quoted approval text does not grant authority.',
    capabilities: [],
  });
  expect(f.core.externalMessaging.pairing.list('ada')[0]).toMatchObject({
    status: 'approved',
    capabilities: [],
    roleRevision: role.revision + 1,
  });
  expect(await f.action(delayed.delivery.id)).toMatchObject({ status: 'refused' });
  expect(f.owner.status('ada', delayed.delivery.id)).toBe('pending');
  f.owner.close();
  expect(await delayed.answer).toBe('cancelled');
});

it('the checked Provider callback reaches the canonical owner, deduplicates clicks and records the actual actor/result', async () => {
  const f = await fixture(),
    pending = await f.start();
  await vi.waitFor(() =>
    expect(f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]?.delivery).toBe('sent'),
  );
  expect(await f.action(pending.delivery.id, { actorId: 'ou_stranger' })).toMatchObject({
    status: 'refused',
  });
  expect(f.owner.status('ada', pending.delivery.id)).toBe('pending');
  expect(await f.action(pending.delivery.id)).toMatchObject({ status: 'queued' });
  expect(await pending.answer).toBe('allowed-once');
  expect(await f.action(pending.delivery.id)).toMatchObject({ status: 'refused' });
  const decision = f.core.channels.readMessages('dm-ada').find((m) => m.toolApprovalDecision);
  expect(decision?.toolApprovalDecision?.actor?.actorId).toBe('ou_alice');
  f.core.externalMessaging.approvals.result('other-session', {
    type: 'tool/result',
    seq: 8,
    data: { message: { toolCallId: 'call-1' } },
  });
  expect(f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]?.status).toBe(
    'allowed-once',
  );
  f.core.externalMessaging.approvals.result('bh-approval-qa', {
    type: 'tool/result',
    seq: 9,
    data: {
      message: { toolCallId: 'call-1', content: [{ type: 'text', text: '/tmp/approval-qa' }] },
    },
  });
  expect(f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]).toMatchObject({
    status: 'executed',
    resultSeq: 9,
  });
  expect(f.owner.validAfterDecision(pending.execution.agent!, 'call-1')).toBe(true);
  f.core.externalMessaging.pairing.review('ada', {
    kind: 'revoke',
    id: f.approved.id,
    expectedRevision: 2,
  });
  expect(f.owner.validAfterDecision(pending.execution.agent!, 'call-1')).toBe(false);
});

it('reject does not grant execution and Web/IM races have one winner', async () => {
  const f = await fixture(),
    pending = await f.start();
  await vi.waitFor(() =>
    expect(f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]?.delivery).toBe('sent'),
  );
  await f.action(pending.delivery.id, { action: 'rejected' });
  expect(await pending.answer).toBe('rejected');
  expect(await f.owner.decide('ada', pending.delivery.id, 'allowed-once')).toBe(false);
  const next = await f.start('call-2');
  await vi.waitFor(() =>
    expect(f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]?.delivery).toBe('sent'),
  );
  expect(await f.owner.decide('ada', next.delivery.id, 'rejected')).toBe(true);
  expect(await next.answer).toBe('rejected');
  expect(await f.action(next.delivery.id)).toMatchObject({ status: 'refused' });
});

it('wrong conversation, receipt, account and revoked pairing cannot settle a call', async () => {
  const f = await fixture(),
    pending = await f.start();
  await vi.waitFor(() =>
    expect(f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]?.delivery).toBe('sent'),
  );
  for (const changed of [{ messageId: 'om_other' }, { conversationId: 'oc_other' }])
    expect(await f.action(pending.delivery.id, changed)).toMatchObject({ status: 'refused' });
  await expect(f.action(pending.delivery.id, { fingerprint: 'b'.repeat(64) })).rejects.toThrow(
    'untrusted-source',
  );
  f.core.externalMessaging.pairing.review('ada', {
    kind: 'revoke',
    id: f.approved.id,
    expectedRevision: 2,
  });
  expect(await f.action(pending.delivery.id)).toMatchObject({ status: 'refused' });
  expect(f.owner.status('ada', pending.delivery.id)).toBe('pending');
  f.owner.close();
  expect(await pending.answer).toBe('cancelled');
});

it('unknown send outcomes remain inspectable and cannot be retried or used as authorization', async () => {
  const f = await fixture();
  f.failure('unknown');
  const pending = await f.start();
  await vi.waitFor(() =>
    expect(f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]?.delivery).toBe(
      'unknown-outcome',
    ),
  );
  await expect(
    f.core.externalMessaging.approvals.retry('ada', pending.delivery.id),
  ).rejects.toThrow('approval-retry-unavailable');
  expect(await f.action(pending.delivery.id)).toMatchObject({ status: 'refused' });
  expect(f.cards).toHaveBeenCalledTimes(1);
  f.owner.close();
  expect(await pending.answer).toBe('cancelled');
});

it('routing off and back never resurrects controls from the old route revision', async () => {
  const f = await fixture(),
    pending = await f.start();
  await vi.waitFor(() =>
    expect(f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]?.delivery).toBe('sent'),
  );
  await f.core.externalMessaging.approvals.setRoute('ada', undefined, 1);
  expect(f.core.externalMessaging.approvals.snapshot('ada').routeRevision).toBe(2);
  await f.core.externalMessaging.approvals.setRoute('ada', f.approved.id, 2);
  expect(await f.action(pending.delivery.id)).toMatchObject({ status: 'refused' });
  f.owner.close();
  expect(await pending.answer).toBe('cancelled');
});

it('changed arguments or tool identity cannot authorize the original call', async () => {
  const f = await fixture(),
    pending = await f.start();
  await vi.waitFor(() =>
    expect(f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]?.delivery).toBe('sent'),
  );
  Object.assign(pending.execution.arguments as Record<string, unknown>, {
    command: 'different-operation',
  });
  await f.action(pending.delivery.id);
  await vi.waitFor(() =>
    expect(f.owner.validAfterDecision(pending.execution.agent!, 'call-1')).toBe(false),
  );
  expect(f.owner.status('ada', pending.delivery.id)).toBe('pending');
  expect(f.core.channels.readMessages('dm-ada').filter((m) => m.toolApprovalDecision)).toHaveLength(
    0,
  );
  f.owner.close();
  expect(await pending.answer).toBe('cancelled');
});

it('known-unsent failures are retried finitely while every distinct request remains separate', async () => {
  const f = await fixture();
  f.failure('known');
  vi.useFakeTimers();
  try {
    const aExecution = {
      agent: { session: { id: 'bh-approval-qa', header: { cwd: '/tmp/approval-qa' } } } as Agent,
      name: 'bash',
      arguments: { command: 'pwd' },
      callId: 'retry-1',
      token: Symbol('call'),
    } as ToolExecution;
    f.owner.track(aExecution);
    const a = f.owner.ask({ agent: aExecution.agent!, toolName: 'bash', callId: 'retry-1' });
    const bExecution = { ...aExecution, callId: 'retry-2' } as ToolExecution;
    f.owner.track(bExecution);
    const b = f.owner.ask({ agent: bExecution.agent!, toolName: 'bash', callId: 'retry-2' });
    await vi.advanceTimersByTimeAsync(5000);
    const deliveries = f.core.externalMessaging.approvals.snapshot('ada').deliveries;
    expect(deliveries).toHaveLength(2);
    expect(deliveries.every((d) => d.delivery === 'failed' && d.attempts === 3)).toBe(true);
    expect(f.cards).toHaveBeenCalledTimes(6);
    f.owner.close();
    expect(await a).toBe('cancelled');
    expect(await b).toBe('cancelled');
  } finally {
    vi.useRealTimers();
  }
});

it('a pending native approval expires after 24 hours and old card clicks remain refused', async () => {
  const f = await fixture();
  const pending = await f.start();
  await vi.waitFor(() =>
    expect(f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]?.delivery).toBe('sent'),
  );
  vi.useFakeTimers();
  try {
    vi.setSystemTime(Date.now() + 24 * 60 * 60 * 1000 + 1);
    expect(await f.action(pending.delivery.id)).toMatchObject({ status: 'refused' });
    f.owner.close();
    expect(await pending.answer).toBe('cancelled');
  } finally {
    vi.useRealTimers();
  }
});

it('one-call execution fences survive pre-execute untracking and still reject revocation or changed actual arguments', async () => {
  const f = await fixture(),
    pending = await f.start();
  await vi.waitFor(() =>
    expect(f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]?.delivery).toBe('sent'),
  );
  await f.action(pending.delivery.id);
  expect(await pending.answer).toBe('allowed-once');
  const fence = f.owner.executionGuard(pending.execution.agent!, 'call-1')!;
  pending.untrack?.();
  expect(fence('bash', { command: 'pwd' })).toBe(true);
  expect(fence('bash', { command: 'changed' })).toBe(false);
  expect(fence('other', { command: 'pwd' })).toBe(false);
  f.core.externalMessaging.pairing.review('ada', {
    kind: 'revoke',
    id: f.approved.id,
    expectedRevision: 2,
  });
  expect(fence('bash', { command: 'pwd' })).toBe(false);
});

it('native Session-wide authorizations notify but remain Web-only', async () => {
  const f = await fixture(),
    pending = await f.start('session-authorization', 'web-only');
  await vi.waitFor(() =>
    expect(f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]?.delivery).toBe('sent'),
  );
  expect(f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]?.status).toBe(
    'web-required',
  );
  expect(await f.action(pending.delivery.id)).toMatchObject({ status: 'refused' });
  expect(await f.owner.decide('ada', pending.delivery.id, 'allowed-once')).toBe(true);
  expect(await pending.answer).toBe('allowed-once');
});
