import { afterEach, expect, it, vi } from 'vitest';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import {
  MessagingProviderError,
  type MessagingApprovalAction,
  type MessagingApprovalRuleAction,
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
async function fixture(
  ordinaryRole = false,
  saveRules = false,
  allOpaque = false,
  allOpaqueAccount = allOpaque,
  ensureDm = true,
) {
  const core = createCore({ dshHome: createTempRoot('bh-lark-approval-') });
  cores.push(core);
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  if (ensureDm) core.channels.getOrCreateDm('ada', 'Ada');
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
    ...(saveRules ? { approvalRuleCardVersion: allOpaque ? (2 as const) : (1 as const) } : {}),
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
        ...(saveRules ? ['approval-rule-card-checked'] : []),
        ...(allOpaqueAccount ? ['approval-rule-all-opaque-card-checked'] : []),
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
      capabilities: saveRules ? ['approve', 'reject', 'save-rules'] : ['approve', 'reject'],
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
      : {
          capabilities: saveRules
            ? ['approve' as const, 'reject' as const, 'save-rules' as const]
            : ['approve' as const, 'reject' as const],
        }),
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
  const owner = new ChannelToolApproval(core.channels, core.ownership, core.toolRules);
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
    ruleAction(
      id: string,
      action: MessagingApprovalRuleAction['action'],
      confirmationId?: string,
      actorId = 'ou_alice',
    ) {
      return receiver!.onAction!(
        {
          kind: 'approval-rule',
          version: 1,
          channel: 'feishu',
          botId: 'lark-qa',
          fingerprint,
          actorId,
          conversationId: 'oc_private',
          messageId: 'om_card',
          requestId: id,
          action,
          ...(confirmationId ? { confirmationId } : {}),
        },
        { signal: receiver!.signal },
      );
    },
    repeat(callId: string, command = 'pwd', toolName = 'bash') {
      const execution = {
        agent,
        name: toolName,
        arguments: { command },
        callId,
        token: Symbol('repeat'),
      } as ToolExecution;
      owner.track(execution);
      return {
        execution,
        answer: owner.ask({ agent, toolName, callId }),
        guard: () => owner.executionGuard(agent, callId)?.(toolName, execution.arguments),
      };
    },
    failure(value: typeof fail) {
      fail = value;
    },
  };
}

it('exact Lark rules require a private second confirmation, are idempotent, and deny mismatched input or revoked creator authority', async () => {
  const f = await fixture(true, true);
  const first = await f.start();
  await vi.waitFor(() => expect(f.cards).toHaveBeenCalled());
  expect(f.cards.mock.calls[0]![2]).toMatchObject({ rules: ['exact'] });
  expect(
    await f.ruleAction(first.delivery.id, 'preview-exact', undefined, 'ou_stranger'),
  ).toMatchObject({ status: 'refused' });
  expect(
    await f.ruleAction(first.delivery.id, 'confirm-exact', '11111111-1111-4111-8111-111111111111'),
  ).toMatchObject({ status: 'refused' });
  expect(await f.ruleAction(first.delivery.id, 'preview-exact')).toMatchObject({
    status: 'queued',
  });
  expect(f.core.toolRules.list('ada')).toEqual([]);
  await vi.waitFor(() =>
    expect(
      f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]?.ruleConfirmation?.presented,
    ).toBe(true),
  );
  const confirmation =
    f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]!.ruleConfirmation!;
  expect(f.cards.mock.calls.at(-1)![2]).toMatchObject({
    ruleConfirmation: { id: confirmation.id, kind: 'exact' },
  });
  expect(f.cards.mock.calls.at(-1)![2].detail).toContain(confirmation.scopeKey);
  expect(await f.ruleAction(first.delivery.id, 'preview-exact')).toMatchObject({
    status: 'queued',
  });
  expect(
    f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]?.ruleConfirmation?.id,
  ).toBe(confirmation.id);
  expect(await f.action(first.delivery.id)).toMatchObject({ status: 'refused' });
  await f.ruleAction(first.delivery.id, 'confirm-exact', confirmation.id);
  await f.ruleAction(first.delivery.id, 'confirm-exact', confirmation.id);
  expect(await first.answer).toBe('allowed-once');
  expect(f.owner.validAfterDecision(first.execution.agent!, first.execution.callId)).toBe(true);
  const rules = f.core.toolRules.list('ada');
  expect(rules).toHaveLength(1);
  expect(rules[0]).toMatchObject({
    kind: 'exact',
    externalCreator: { pairingId: f.approved.id, actorId: 'ou_alice', bindingId: f.binding.id },
  });
  const matching = f.repeat('matching');
  expect(await matching.answer).toBe('allowed-once');
  expect(matching.guard()).toBe(true);
  const mismatch = f.repeat('different-input', 'pwd --different');
  await vi.waitFor(() => expect(f.owner.requests('ada')).toHaveLength(1));
  const request = f.owner.requests('ada')[0]!;
  await f.owner.decide('ada', request.messageId, 'rejected');
  expect(await mismatch.answer).toBe('rejected');
  const role = (await f.core.externalMessaging.snapshot('ada')).roles![0]!;
  f.core.externalMessaging.senderAccess('ada', {
    kind: 'edit-role',
    id: role.id,
    expectedRevision: role.revision,
    name: role.name,
    behavior: role.behavior,
    capabilities: ['approve', 'reject'],
  });
  expect(f.core.toolRules.list('ada')[0]?.revokedAt).toBeDefined();
  expect(matching.guard()).toBe(false);
  f.core.externalMessaging.senderAccess('ada', {
    kind: 'edit-role',
    id: role.id,
    expectedRevision: role.revision + 1,
    name: role.name,
    behavior: role.behavior,
    capabilities: ['approve', 'reject', 'save-rules'],
  });
  expect(f.core.toolRules.list('ada')[0]?.revokedAt).toBeDefined();
});

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

it('all-opaque needs its own displayed confirmation and cannot replace an exact nonce', async () => {
  const f = await fixture(true, true, true);
  const first = await f.start();
  await vi.waitFor(() => expect(f.cards).toHaveBeenCalled());
  expect(f.cards.mock.calls[0]![2]).toMatchObject({ rules: ['exact', 'all-opaque'] });
  await f.ruleAction(first.delivery.id, 'preview-exact');
  await vi.waitFor(() =>
    expect(
      f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]?.ruleConfirmation?.presented,
    ).toBe(true),
  );
  const exact = f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]!.ruleConfirmation!;
  expect(await f.ruleAction(first.delivery.id, 'preview-all-opaque')).toMatchObject({
    status: 'refused',
  });
  expect(await f.ruleAction(first.delivery.id, 'confirm-all-opaque', exact.id)).toMatchObject({
    status: 'refused',
  });
  await f.ruleAction(first.delivery.id, 'cancel-rule', exact.id);
  expect(f.core.toolRules.list('ada')).toEqual([]);
  await f.ruleAction(first.delivery.id, 'preview-all-opaque');
  await vi.waitFor(() =>
    expect(
      f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]?.ruleConfirmation?.presented,
    ).toBe(true),
  );
  const broad = f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]!.ruleConfirmation!;
  expect(broad.kind).toBe('all-opaque');
  expect(broad.id).not.toBe(exact.id);
  expect(f.cards.mock.calls.at(-1)![2].detail).toContain('ALL opaque tools and ALL inputs');
  expect(f.cards.mock.calls.at(-1)![2].detail).toContain(broad.scopeKey);
  expect(await f.ruleAction(first.delivery.id, 'confirm-exact', broad.id)).toMatchObject({
    status: 'refused',
  });
  await f.ruleAction(first.delivery.id, 'confirm-all-opaque', broad.id);
  await f.ruleAction(first.delivery.id, 'confirm-all-opaque', broad.id);
  expect(await first.answer).toBe('allowed-once');
  expect(f.core.toolRules.list('ada')).toHaveLength(1);
  expect(f.core.toolRules.list('ada')[0]).toMatchObject({
    kind: 'all-opaque',
    toolName: '*',
    input: '',
    externalCreator: { pairingId: f.approved.id },
  });
  const different = f.repeat('different-tool-and-input', 'different command', 'pwsh');
  expect(await different.answer).toBe('allowed-once');
  expect(different.guard()).toBe(true);
  expect(f.core.externalMessaging.approvals.snapshot('ada').deliveries).toHaveLength(1);
  const nativeGrant = await f.start('native-session-grant', 'web-only');
  expect(f.owner.status('ada', nativeGrant.delivery.id)).toBe('pending');
  await vi.waitFor(() => expect(f.cards.mock.calls.at(-1)![2].status).toBe('web-required'));
  expect(await f.action(nativeGrant.delivery.id)).toMatchObject({ status: 'refused' });
  await f.owner.decide('ada', nativeGrant.delivery.requestMessageId!, 'rejected');
  expect(await nativeGrant.answer).toBe('rejected');
  Object.assign(first.execution.agent!.session.header, { cwd: '/tmp/different-scope' });
  const changedScope = f.repeat('changed-scope', 'different command', 'pwsh');
  await vi.waitFor(() => expect(f.owner.requests('ada')).toHaveLength(1));
  await f.owner.decide('ada', f.owner.requests('ada')[0]!.messageId, 'rejected');
  expect(await changedScope.answer).toBe('rejected');
  f.core.externalMessaging.pairing.review('ada', {
    kind: 'revoke',
    id: f.approved.id,
    expectedRevision: f.approved.revision,
  });
  expect(f.core.toolRules.list('ada')[0]?.revokedAt).toBeDefined();
});

it('a version-one rule Provider cannot offer or accept an all-opaque rule', async () => {
  const f = await fixture(true, true);
  const first = await f.start();
  await vi.waitFor(() => expect(f.cards).toHaveBeenCalled());
  expect(f.cards.mock.calls[0]![2]).toMatchObject({ rules: ['exact'] });
  await expect(f.ruleAction(first.delivery.id, 'preview-all-opaque')).rejects.toMatchObject({
    code: 'capability-unavailable',
  });
  expect(f.core.toolRules.list('ada')).toEqual([]);
  await f.action(first.delivery.id, { action: 'rejected' });
  expect(await first.answer).toBe('rejected');
});

it('a version-two exact-only account retains ordinary and exact controls without offering broad authority', async () => {
  const f = await fixture(true, true, true, false);
  const first = await f.start();
  await vi.waitFor(() => expect(f.cards).toHaveBeenCalled());
  expect(f.cards.mock.calls[0]![2]).toMatchObject({ rules: ['exact'], status: 'pending' });
  await expect(f.ruleAction(first.delivery.id, 'preview-all-opaque')).rejects.toMatchObject({
    code: 'capability-unavailable',
  });
  await f.ruleAction(first.delivery.id, 'preview-exact');
  await vi.waitFor(() =>
    expect(
      f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]?.ruleConfirmation?.presented,
    ).toBe(true),
  );
  const confirmation =
    f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]!.ruleConfirmation!;
  await f.ruleAction(first.delivery.id, 'cancel-rule', confirmation.id);
  await vi.waitFor(() => expect(f.cards.mock.calls.at(-1)![2]).toMatchObject({ rules: ['exact'] }));
  await f.action(first.delivery.id);
  expect(await first.answer).toBe('allowed-once');
  expect(f.core.toolRules.list('ada')).toEqual([]);
});

it.each(['exact', 'all-opaque'] as const)(
  'a delayed %s decision refuses Back and cannot activate after current save-rules Deny',
  async (kind) => {
    const f = await fixture(true, true, true);
    const first = await f.start();
    await vi.waitFor(() => expect(f.cards).toHaveBeenCalled());
    await f.ruleAction(
      first.delivery.id,
      kind === 'exact' ? 'preview-exact' : 'preview-all-opaque',
    );
    await vi.waitFor(() =>
      expect(
        f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]?.ruleConfirmation
          ?.presented,
      ).toBe(true),
    );
    const confirmation =
      f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]!.ruleConfirmation!;
    const append = f.core.channels.appendMessage.bind(f.core.channels);
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let writing = false;
    vi.spyOn(f.core.channels, 'appendMessage').mockImplementation(async (id, message) => {
      if (message.toolApprovalDecision) {
        writing = true;
        await blocked;
      }
      return append(id, message);
    });
    await f.ruleAction(
      first.delivery.id,
      kind === 'exact' ? 'confirm-exact' : 'confirm-all-opaque',
      confirmation.id,
    );
    await vi.waitFor(() => expect(writing).toBe(true));
    expect(await f.ruleAction(first.delivery.id, 'cancel-rule', confirmation.id)).toMatchObject({
      status: 'refused',
    });
    f.core.externalMessaging.senderAccess('ada', {
      kind: 'create-group',
      bindingId: f.binding.id,
      name: 'Deny while append is pending',
      allow: [],
      deny: ['save-rules'],
      memberIds: [f.approved.id],
    });
    release();
    expect(await first.answer).not.toBe('allowed-once');
    expect(f.core.toolRules.list('ada').some((r) => !r.revokedAt)).toBe(false);
  },
);

async function savedExact() {
  const f = await fixture(true, true);
  const first = await f.start();
  await vi.waitFor(() => expect(f.cards).toHaveBeenCalled());
  await f.ruleAction(first.delivery.id, 'preview-exact');
  await vi.waitFor(() =>
    expect(
      f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]?.ruleConfirmation?.presented,
    ).toBe(true),
  );
  const confirmation =
    f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]!.ruleConfirmation!;
  await f.ruleAction(first.delivery.id, 'confirm-exact', confirmation.id);
  expect(await first.answer).toBe('allowed-once');
  return { ...f, first };
}

it.each(['cancel', 'scope', 'input', 'untrack'] as const)(
  'a %s change during canonical decision append cannot activate a standing rule',
  async (change) => {
    const f = await fixture(true, true);
    const first = await f.start();
    await vi.waitFor(() => expect(f.cards).toHaveBeenCalled());
    const append = f.core.channels.appendMessage.bind(f.core.channels);
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    let writing = false;
    vi.spyOn(f.core.channels, 'appendMessage').mockImplementation(async (id, message) => {
      if (message.toolApprovalDecision) {
        writing = true;
        await delayed;
      }
      return append(id, message);
    });
    const confirmed = f.owner.decide(
      'ada',
      first.delivery.requestMessageId!,
      'allowed-always-exact',
    );
    await vi.waitFor(() => expect(writing).toBe(true));
    if (change === 'cancel') f.owner.close();
    if (change === 'untrack') first.untrack?.();
    if (change === 'scope')
      Object.assign(first.execution.agent!.session.header, { cwd: '/tmp/new-scope' });
    if (change === 'input')
      Object.assign(first.execution.arguments as Record<string, unknown>, { command: 'changed' });
    release();
    expect(await confirmed).toBe(false);
    expect(await first.answer).not.toBe('allowed-once');
    expect(f.core.toolRules.list('ada').some((rule) => !rule.revokedAt)).toBe(false);
  },
);

it('creator pairing revocation updates only its own receipt and re-pairing cannot restore the saved rule', async () => {
  const f = await savedExact();
  f.core.externalMessaging.pairing.review('ada', {
    kind: 'revoke',
    id: f.approved.id,
    expectedRevision: f.approved.revision,
  });
  await vi.waitFor(() => {
    const last = f.cards.mock.calls.at(-1)!;
    expect(last[2]).toMatchObject({
      title: 'Approval rule disabled / 审批规则已停用',
      status: 'expired',
    });
    expect(last[2].detail).not.toContain('pwd');
    expect(last[1]).toMatchObject({ messageId: 'om_card', conversationId: 'oc_private' });
    expect(last[3].update).toBe(true);
  });
  expect(f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]).toMatchObject({
    savedRuleStatus: 'revoked',
  });
  const next = f.core.externalMessaging.pairing.request(
    f.binding.id,
    {
      version: 1,
      channel: 'feishu',
      botId: 'lark-qa',
      fingerprint,
      eventId: 'pair-again',
      messageId: 'om_new_pair',
      actor: { kind: 'user', id: 'ou_alice', name: 'Alice QA' },
      conversation: { kind: 'dm', id: 'oc_private' },
      mentions: [],
      mentionedAccount: false,
      at: new Date().toISOString(),
      text: 'New request',
      reply: { messageId: 'om_new_pair', conversationId: 'oc_private', actorId: 'ou_alice' },
      replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
    },
    'conversation',
  )!;
  expect(next.id).not.toBe(f.approved.id);
  f.core.externalMessaging.pairing.review('ada', {
    kind: 'approve',
    id: next.id,
    expectedRevision: next.revision,
    roleId: f.role!.id,
    expectedRoleRevision: f.role!.revision,
  });
  expect(f.core.toolRules.list('ada')[0]?.revokedAt).toBeDefined();
  const repeated = f.repeat('after-repair');
  await vi.waitFor(() => expect(f.owner.requests('ada')).toHaveLength(1));
  await f.owner.decide('ada', f.owner.requests('ada')[0]!.messageId, 'rejected');
  expect(await repeated.answer).toBe('rejected');
});

it.each(['binding', 'defaults', 'bot'] as const)(
  '%s disablement permanently revokes an external rule before later re-enable',
  async (kind) => {
    const f = await savedExact();
    if (kind === 'defaults') {
      const prior = f.core.externalMessaging.defaults();
      const { revision, changedAt: _changed, ...input } = prior;
      await f.core.externalMessaging.setDefaults({
        ...input,
        expectedRevision: revision,
        identityEnabled: false,
      });
      await f.core.externalMessaging.setDefaults({
        ...input,
        expectedRevision: revision + 1,
        identityEnabled: true,
      });
    } else if (kind === 'binding') {
      const disabled = await f.core.externalMessaging.identity('ada', {
        kind: 'update',
        id: f.binding.id,
        expectedRevision: f.binding.revision,
        name: f.binding.name,
        enabled: false,
      });
      await f.core.externalMessaging.identity('ada', {
        kind: 'update',
        id: f.binding.id,
        expectedRevision: disabled.revision,
        name: f.binding.name,
        enabled: true,
      });
    } else await f.core.externalMessaging.disableBot('ada');
    expect(f.core.toolRules.list('ada')[0]?.revokedAt).toBeDefined();
    expect(
      f.owner.executionGuard(f.first.execution.agent!, f.first.execution.callId)?.('bash', {
        command: 'pwd',
      }),
    ).toBe(false);
  },
);

it('Web revocation updates the saved-rule receipt from the same canonical rule', async () => {
  const f = await savedExact();
  const rule = f.core.toolRules.list('ada')[0]!;
  expect(
    createBridgeMethods({ ...f.core }).toolApprovalRuleRevoke({ slug: 'ada', id: rule.id }),
  ).toMatchObject({
    ok: true,
  });
  await vi.waitFor(() =>
    expect(f.cards.mock.calls.at(-1)![2]).toMatchObject({
      title: 'Approval rule disabled / 审批规则已停用',
      status: 'expired',
    }),
  );
  expect(f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]?.savedRuleStatus).toBe(
    'revoked',
  );
});

it('removing one save-rules source preserves a standing rule while another current group still grants it', async () => {
  const f = await savedExact();
  f.core.externalMessaging.senderAccess('ada', {
    kind: 'create-group',
    bindingId: f.binding.id,
    name: 'Independent save grant',
    allow: ['save-rules'],
    deny: [],
    memberIds: [f.approved.id],
  });
  const role = f.role!;
  f.core.externalMessaging.senderAccess('ada', {
    kind: 'edit-role',
    id: role.id,
    expectedRevision: role.revision,
    name: role.name,
    behavior: role.behavior,
    capabilities: ['approve', 'reject'],
  });
  expect(f.core.toolRules.list('ada')[0]?.revokedAt).toBeUndefined();
  const repeated = f.repeat('still-authorized');
  expect(await repeated.answer).toBe('allowed-once');
  expect(repeated.guard()).toBe(true);
});

it('delayed exact confirmation cannot save a rule after current save-rules Deny', async () => {
  const f = await fixture(true, true);
  const first = await f.start();
  await vi.waitFor(() =>
    expect(first.delivery.delivery === 'sent' || f.cards.mock.calls.length).toBeTruthy(),
  );
  await f.ruleAction(first.delivery.id, 'preview-exact');
  await vi.waitFor(() =>
    expect(
      f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]?.ruleConfirmation?.presented,
    ).toBe(true),
  );
  const confirmation =
    f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]!.ruleConfirmation!;
  f.core.externalMessaging.senderAccess('ada', {
    kind: 'create-group',
    bindingId: f.binding.id,
    name: 'No saved rules',
    allow: [],
    deny: ['save-rules'],
    memberIds: [f.approved.id],
  });
  expect(await f.ruleAction(first.delivery.id, 'confirm-exact', confirmation.id)).toMatchObject({
    status: 'refused',
  });
  expect(f.core.toolRules.list('ada')).toEqual([]);
  await f.owner.decide('ada', first.delivery.requestMessageId!, 'rejected');
  expect(await first.answer).toBe('rejected');
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
  expect(await f.owner.decide('ada', delayed.delivery.id, 'allowed-once')).toBe(true);
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

it('a Lark Approver can always allow a secret_cli kind, and revoking the pairing stops the rule', async () => {
  const f = await fixture(true, true, true);
  const agent = (await f.start()).execution.agent!;
  await f.owner.decide('ada', f.owner.requests('ada')[0]!.messageId, 'rejected');
  const secretCli = (callId: string, args: string[], account = 'github-work') => {
    const execution = {
      agent,
      name: 'secret_cli',
      arguments: {
        account,
        references: ['private:00000000-0000-0000-0000-000000000000:token'],
        program: 'gh',
        args,
        env: [{ name: 'GH_TOKEN', value: '{{token}}' }],
      },
      callId,
      token: Symbol(callId),
    } as ToolExecution;
    f.owner.track(execution);
    return {
      answer: f.owner.ask({ agent, toolName: 'secret_cli', callId }),
      guard: () => f.owner.executionGuard(agent, callId)?.('secret_cli', execution.arguments),
    };
  };
  const first = secretCli('secret-1', ['repo', 'list']);
  const secretCard = () =>
    f.cards.mock.calls
      .filter((c) => (c[2] as { requestId?: string }).requestId === delivery?.id)
      .at(-1)?.[2];
  let delivery: { id: string } | undefined;
  await vi.waitFor(() => {
    delivery = f.core.externalMessaging.approvals
      .snapshot('ada')
      .deliveries.find((d) => d.callId === 'secret-1');
    expect(secretCard()).toBeDefined();
  });
  expect(secretCard()).toMatchObject({ status: 'pending', rules: ['exact'] });
  expect(await f.ruleAction(delivery!.id, 'preview-all-opaque')).toMatchObject({
    status: 'refused',
  });
  await f.ruleAction(delivery!.id, 'preview-exact');
  await vi.waitFor(() =>
    expect(
      f.core.externalMessaging.approvals
        .snapshot('ada')
        .deliveries.find((d) => d.id === delivery!.id)?.ruleConfirmation?.presented,
    ).toBe(true),
  );
  const confirmation = f.core.externalMessaging.approvals
    .snapshot('ada')
    .deliveries.find((d) => d.id === delivery!.id)!.ruleConfirmation!;
  expect(secretCard()!.detail).toContain('with any arguments');
  await f.ruleAction(delivery!.id, 'confirm-exact', confirmation.id);
  expect(await first.answer).toBe('allowed-once');
  expect(f.core.toolRules.list('ada')).toMatchObject([
    {
      kind: 'secret-cli',
      toolName: 'secret_cli',
      input: '{"program":"gh","account":"github-work","env":["GH_TOKEN"]}',
      externalCreator: { pairingId: f.approved.id },
    },
  ]);
  await vi.waitFor(() =>
    expect(
      f.core.externalMessaging.approvals
        .snapshot('ada')
        .deliveries.find((d) => d.id === delivery!.id)?.savedRuleKind,
    ).toBe('secret-cli'),
  );
  const second = secretCli('secret-2', ['issue', 'list']);
  expect(await second.answer).toBe('allowed-once');
  expect(second.guard()).toBe(true);
  const otherAccount = secretCli('secret-3', ['repo', 'list'], 'github-personal');
  await vi.waitFor(() => expect(f.owner.requests('ada')).toHaveLength(1));
  await f.owner.decide('ada', f.owner.requests('ada')[0]!.messageId, 'rejected');
  expect(await otherAccount.answer).toBe('rejected');
  f.core.externalMessaging.pairing.review('ada', {
    kind: 'revoke',
    id: f.approved.id,
    expectedRevision: f.approved.revision,
  });
  expect(f.core.toolRules.list('ada')[0]?.revokedAt).toBeDefined();
  expect(second.guard()).toBe(false);
  const afterRevoke = secretCli('secret-4', ['issue', 'list']);
  await vi.waitFor(() => expect(f.owner.requests('ada')).toHaveLength(1));
  await f.owner.decide('ada', f.owner.requests('ada')[0]!.messageId, 'rejected');
  expect(await afterRevoke.answer).toBe('rejected');
});
