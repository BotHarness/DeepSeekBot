import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { afterEach, expect, it, vi } from 'vitest';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import type { MessagingInboundEvent } from '../src/messaging/provider.js';
import { ChannelToolApproval } from '../src/workspaces/tool-approval.js';
import { createTempRoot } from './helpers.js';

const fingerprint = 'b'.repeat(64);
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

async function fixture() {
  const core = createCore({ dshHome: createTempRoot('bh-slack-approval-') });
  cores.push(core);
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
  let receiver: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1] | undefined;
  let sent = 0;
  const replies = vi.fn<NonNullable<DshImOutboundService['replyChecked']>>(async (_bot, route) => ({
    sent: true,
    receipt: { version: 1, messageId: `171.${++sent}`, conversationId: route.conversationId },
  }));
  const provider: DshImOutboundService = {
    contractVersion: 1,
    replyReceiptVersion: 1,
    listBots: async () => [{ botId: 'slack-qa', channel: 'slack' }],
    listTargets: async () => [],
    describeBot: async (botId) => ({
      version: 1,
      botId,
      channel: 'slack',
      connected: true,
      account: { fingerprint, name: 'QA Slack' },
      capabilities: ['proactive-text-checked', 'exclusive-text-consumer', 'reply-text-checked'],
    }),
    sendChecked: async () => ({ sent: true }),
    replyChecked: replies,
    consumeInbound: async (_bot, input) => {
      receiver = input;
      return () => {};
    },
  };
  core.externalMessaging.register(createDshImProvider(provider, 'slack')!);
  await core.externalMessaging.identity('ada', {
    kind: 'bind',
    providerId: 'dsh-im/slack',
    accountRef: 'slack-qa',
    fingerprint,
  });
  await vi.waitFor(() => expect(receiver).toBeDefined());
  let inbound = 0;
  const text = (body: string, parentId?: string, actorId = 'U0ALICE') => {
    const messageId = `170.${++inbound}`;
    const event: MessagingInboundEvent = {
      version: 1,
      channel: 'slack',
      botId: 'slack-qa',
      fingerprint,
      eventId: `event-${messageId}`,
      messageId,
      actor: { kind: 'user', id: actorId, name: actorId },
      conversation: { kind: 'dm', id: 'D0QA' },
      mentions: [],
      mentionedAccount: false,
      at: new Date().toISOString(),
      text: body,
      reply: {
        messageId,
        conversationId: 'D0QA',
        actorId,
        ...(parentId ? { parentId } : {}),
      },
      replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
    };
    return receiver!.onEvent(event, { signal: receiver!.signal });
  };
  return { core, replies, text };
}

it('pairs a Slack DM for management and decides an approval by text', async () => {
  const f = await fixture();
  await f.text('/pair');
  const pairing = f.core.externalMessaging.pairing.list('ada')[0]!;
  expect(pairing).toMatchObject({ status: 'pending', actorId: 'U0ALICE' });
  f.core.externalMessaging.pairing.review('ada', {
    id: pairing.id,
    expectedRevision: 1,
    kind: 'approve',
    capabilities: ['approve', 'reject'],
  });
  await f.core.externalMessaging.approvals.setRoute('ada', pairing.id, 0);
  const sessionId = 'bh-slack-approval';
  f.core.ownership.claim({
    sessionId,
    botSlug: 'ada',
    rootRole: 'orchestrator',
    at: new Date().toISOString(),
  });
  const agent = { session: { id: sessionId, header: { cwd: '/tmp/slack-qa' } } } as Agent;
  const owner = new ChannelToolApproval(f.core.channels, f.core.ownership, f.core.toolRules);
  owners.push(owner);
  f.core.externalMessaging.approvals.attach(owner, f.core.channels);
  const execution = {
    agent,
    name: 'bash',
    arguments: { command: 'pwd' },
    callId: 'call-1',
    token: Symbol('call'),
  } as ToolExecution;
  owner.track(execution, 'operation');
  const answer = owner.ask({ agent, toolName: 'bash', callId: 'call-1' });
  await vi.waitFor(() =>
    expect(f.replies.mock.calls.some((call) => String(call[2]).includes('「允许」'))).toBe(true),
  );
  const receipt = f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]!.receipt!;
  await f.text('allow', receipt.messageId, 'U0MALLORY');
  await f.text('reject', receipt.messageId);
  expect(await answer).toBe('rejected');
});
