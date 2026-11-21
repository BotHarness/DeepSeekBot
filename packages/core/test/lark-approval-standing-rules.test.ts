import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { expect, it, vi } from 'vitest';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { fingerprint, fixture, savedExact } from './lark-approval-fixtures.js';

it('saves an explicit permission-management rule from Lark and re-prompts after revocation', async () => {
  const f = await fixture(true, true, true);
  const command = 'deepseekbot grant-write-set ada --grant project --enabled';
  const first = f.repeat('policy-first', command);
  await vi.waitFor(() => expect(f.cards).toHaveBeenCalled());
  const delivery = f.core.externalMessaging.approvals
    .snapshot('ada')
    .deliveries.find((row) => row.callId === 'policy-first')!;
  expect(f.cards.mock.calls.at(-1)![2]).toMatchObject({ rules: ['exact'] });
  expect(await f.ruleAction(delivery.id, 'preview-all-opaque')).toMatchObject({
    status: 'refused',
  });
  expect(await f.ruleAction(delivery.id, 'preview-exact')).toMatchObject({ status: 'queued' });
  await vi.waitFor(() =>
    expect(
      f.core.externalMessaging.approvals
        .snapshot('ada')
        .deliveries.find((row) => row.id === delivery.id)?.ruleConfirmation?.presented,
    ).toBe(true),
  );
  const confirmation = f.core.externalMessaging.approvals
    .snapshot('ada')
    .deliveries.find((row) => row.id === delivery.id)!.ruleConfirmation!;
  await f.ruleAction(delivery.id, 'confirm-exact', confirmation.id);
  expect(await first.answer).toBe('allowed-once');
  const rule = f.core.toolRules.list('ada')[0]!;
  expect(rule).toMatchObject({ kind: 'exact', externalCreator: { actorId: 'ou_alice' } });
  const repeat = f.repeat('policy-repeat', command);
  expect(await repeat.answer).toBe('allowed-once');
  f.core.toolRules.revoke('ada', rule.id);
  expect(repeat.guard()).toBe(false);
  const revoked = f.repeat('policy-revoked', command);
  await vi.waitFor(() =>
    expect(
      f.core.externalMessaging.approvals
        .snapshot('ada')
        .deliveries.some((row) => row.callId === 'policy-revoked'),
    ).toBe(true),
  );
  const pending = f.core.externalMessaging.approvals
    .snapshot('ada')
    .deliveries.find((row) => row.callId === 'policy-revoked')!;
  await f.action(pending.id, { action: 'rejected' });
  expect(await revoked.answer).toBe('rejected');
});

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
  await f.owner.decide(OWNER_HUMAN_CONTEXT, 'ada', request.messageId, 'rejected');
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
  await f.owner.decide(
    OWNER_HUMAN_CONTEXT,
    'ada',
    nativeGrant.delivery.requestMessageId!,
    'rejected',
  );
  expect(await nativeGrant.answer).toBe('rejected');
  Object.assign(first.execution.agent!.session.header, { cwd: '/tmp/different-scope' });
  const changedScope = f.repeat('changed-scope', 'different command', 'pwsh');
  await vi.waitFor(() => expect(f.owner.requests('ada')).toHaveLength(1));
  await f.owner.decide(
    OWNER_HUMAN_CONTEXT,
    'ada',
    f.owner.requests('ada')[0]!.messageId,
    'rejected',
  );
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
    vi.spyOn(f.core.channels, 'appendMessage').mockImplementation(async (human, id, message) => {
      if (message.toolApprovalDecision) {
        writing = true;
        await blocked;
      }
      return append(human, id, message);
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
    vi.spyOn(f.core.channels, 'appendMessage').mockImplementation(async (human, id, message) => {
      if (message.toolApprovalDecision) {
        writing = true;
        await delayed;
      }
      return append(human, id, message);
    });
    const confirmed = f.owner.decide(
      OWNER_HUMAN_CONTEXT,
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
  await f.owner.decide(
    OWNER_HUMAN_CONTEXT,
    'ada',
    f.owner.requests('ada')[0]!.messageId,
    'rejected',
  );
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
    createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...f.core }).toolApprovalRuleRevoke({
      slug: 'ada',
      id: rule.id,
    }),
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
  await f.owner.decide(OWNER_HUMAN_CONTEXT, 'ada', first.delivery.requestMessageId!, 'rejected');
  expect(await first.answer).toBe('rejected');
});

it('a Lark Approver can always allow a secret_cli kind, and revoking the pairing stops the rule', async () => {
  const f = await fixture(true, true, true);
  const agent = (await f.start()).execution.agent!;
  await f.owner.decide(
    OWNER_HUMAN_CONTEXT,
    'ada',
    f.owner.requests('ada')[0]!.messageId,
    'rejected',
  );
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
  await f.owner.decide(
    OWNER_HUMAN_CONTEXT,
    'ada',
    f.owner.requests('ada')[0]!.messageId,
    'rejected',
  );
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
  await f.owner.decide(
    OWNER_HUMAN_CONTEXT,
    'ada',
    f.owner.requests('ada')[0]!.messageId,
    'rejected',
  );
  expect(await afterRevoke.answer).toBe('rejected');
});
