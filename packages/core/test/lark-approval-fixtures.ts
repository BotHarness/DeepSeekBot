import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { afterEach, expect, vi } from 'vitest';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import {
  MessagingProviderError,
  type MessagingApprovalAction,
  type MessagingApprovalRuleAction,
  type MessagingInboundEvent,
} from '../src/messaging/provider.js';
import { ChannelToolApproval } from '../src/workspaces/tool-approval.js';
import { createTempRoot } from './helpers.js';

export const fingerprint = 'a'.repeat(64);
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
export async function fixture(
  ordinaryRole = false,
  saveRules = false,
  allOpaque = false,
  allOpaqueAccount = allOpaque,
  ensureDm = true,
) {
  const core = createCore({ dshHome: createTempRoot('bh-lark-approval-') });
  cores.push(core);
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  if (ensureDm) core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
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

export async function savedExact() {
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
