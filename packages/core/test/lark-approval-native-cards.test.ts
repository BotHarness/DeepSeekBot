import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { expect, it, vi } from 'vitest';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import { fingerprint, fixture } from './lark-approval-fixtures.js';

it('an IM-only Bot can request native approval before anyone opens its Web DM', async () => {
  const f = await fixture(true, true, true, true, false);
  expect(f.core.channels.get('dm-ada')).toBeUndefined();
  const call = f.repeat('im-only-first-call');
  await vi.waitFor(() => expect(f.cards).toHaveBeenCalled());
  const delivery = f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]!;
  expect(f.core.channels.get('dm-ada')).toMatchObject({ botSlug: 'ada', name: 'Ada', type: 'dm' });
  await f.action(delivery.id, { action: 'rejected' });
  expect(await call.answer).toBe('rejected');
});

it('current group grants execute Allow once/Reject and a new group Deny refuses an already delivered native card', async () => {
  const f = await fixture(true);
  const role = f.role!;
  f.core.externalMessaging.senderAccess('ada', {
    kind: 'edit-role',
    id: role.id,
    expectedRevision: role.revision,
    name: role.name,
    behavior: role.behavior,
    capabilities: [],
  });
  f.core.externalMessaging.senderAccess('ada', {
    kind: 'create-group',
    bindingId: f.binding.id,
    name: 'Reviewers',
    allow: ['approve', 'reject'],
    deny: [],
    memberIds: [f.approved.id],
  });
  const allowed = await f.start('group-allow');
  await vi.waitFor(() =>
    expect(
      f.core.externalMessaging.approvals
        .snapshot('ada')
        .deliveries.find((delivery) => delivery.id === allowed.delivery.id)?.delivery,
    ).toBe('sent'),
  );
  expect(await f.action(allowed.delivery.id)).toMatchObject({ status: 'queued' });
  expect(await allowed.answer).toBe('allowed-once');
  const rejected = await f.start('group-reject');
  await vi.waitFor(() =>
    expect(
      f.core.externalMessaging.approvals
        .snapshot('ada')
        .deliveries.find((delivery) => delivery.id === rejected.delivery.id)?.delivery,
    ).toBe('sent'),
  );
  expect(await f.action(rejected.delivery.id, { action: 'rejected' })).toMatchObject({
    status: 'queued',
  });
  expect(await rejected.answer).toBe('rejected');
  const delayed = await f.start('group-delayed');
  await vi.waitFor(() =>
    expect(
      f.core.externalMessaging.approvals
        .snapshot('ada')
        .deliveries.find((delivery) => delivery.id === delayed.delivery.id)?.delivery,
    ).toBe('sent'),
  );
  f.core.externalMessaging.senderAccess('ada', {
    kind: 'create-group',
    bindingId: f.binding.id,
    name: 'Suspended approval',
    allow: [],
    deny: ['approve'],
    memberIds: [f.approved.id],
  });
  expect(await f.action(delayed.delivery.id)).toMatchObject({ status: 'refused' });
  expect(f.owner.status('ada', delayed.delivery.id)).toBe('pending');
  expect(
    await f.owner.decide(OWNER_HUMAN_CONTEXT, 'ada', delayed.delivery.id, 'allowed-once'),
  ).toBe(true);
  expect(await delayed.answer).toBe('allowed-once');
});

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
  expect(
    await f.owner.decide(OWNER_HUMAN_CONTEXT, 'ada', pending.delivery.id, 'allowed-once'),
  ).toBe(false);
  const next = await f.start('call-2');
  await vi.waitFor(() =>
    expect(f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]?.delivery).toBe('sent'),
  );
  expect(await f.owner.decide(OWNER_HUMAN_CONTEXT, 'ada', next.delivery.id, 'rejected')).toBe(true);
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
  expect(
    await f.owner.decide(OWNER_HUMAN_CONTEXT, 'ada', pending.delivery.id, 'allowed-once'),
  ).toBe(true);
  expect(await pending.answer).toBe('allowed-once');
});
