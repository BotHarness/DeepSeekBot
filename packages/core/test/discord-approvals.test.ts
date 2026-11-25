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
  const core = createCore({ dshHome: createTempRoot('bh-discord-approval-') });
  cores.push(core);
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
  let receiver: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1] | undefined;
  let sent = 0;
  const replies = vi.fn<NonNullable<DshImOutboundService['replyChecked']>>(async (_bot, route) => {
    if (route.threadId || route.rootId || route.parentId || route.conversationId !== '9000000001')
      throw Object.assign(new Error('stale-route'), { code: 'stale-route' });
    return {
      sent: true,
      receipt: { version: 1, messageId: `81000000${++sent}`, conversationId: route.conversationId },
    };
  });
  const provider: DshImOutboundService = {
    contractVersion: 1,
    replyReceiptVersion: 1,
    listBots: async () => [{ botId: 'discord-qa', channel: 'discord' }],
    listTargets: async () => [],
    describeBot: async (botId) => ({
      version: 1,
      botId,
      channel: 'discord',
      connected: true,
      account: { fingerprint, name: 'QA Discord' },
      capabilities: [
        'proactive-text-checked',
        'exclusive-text-consumer',
        'reply-text-checked',
        'reply-standalone-checked',
      ],
    }),
    sendChecked: async () => ({ sent: true }),
    replyChecked: replies,
    consumeInbound: async (_bot, input) => {
      receiver = input;
      return () => {};
    },
  };
  core.externalMessaging.register(createDshImProvider(provider, 'discord')!);
  await core.externalMessaging.identity('ada', {
    kind: 'bind',
    providerId: 'dsh-im/discord',
    accountRef: 'discord-qa',
    fingerprint,
  });
  await vi.waitFor(() => expect(receiver).toBeDefined());
  let inbound = 0;
  const text = (body: string, parentId?: string, actorId = '7000000001') => {
    const messageId = `80000000${++inbound}`;
    const event: MessagingInboundEvent = {
      version: 1,
      channel: 'discord',
      botId: 'discord-qa',
      fingerprint,
      eventId: `event-${messageId}`,
      messageId,
      actor: { kind: 'user', id: actorId, name: actorId },
      conversation: { kind: 'dm', id: '9000000001' },
      mentions: [],
      mentionedAccount: false,
      at: new Date().toISOString(),
      text: body,
      reply: {
        messageId,
        conversationId: '9000000001',
        actorId,
        ...(parentId ? { parentId } : {}),
      },
      replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
    };
    return receiver!.onEvent(event, { signal: receiver!.signal });
  };
  return { core, replies, text };
}

it('pairs a Discord DM for management and decides an approval by text', async () => {
  const f = await fixture();
  await f.text('/pair');
  expect((await f.core.externalMessaging.snapshot('ada')).pairingReceivers).toEqual([
    expect.objectContaining({ name: 'QA Discord' }),
  ]);
  const pairing = f.core.externalMessaging.pairing.list('ada')[0]!;
  expect(pairing).toMatchObject({ status: 'pending', actorId: '7000000001' });
  f.core.externalMessaging.pairing.review('ada', {
    id: pairing.id,
    expectedRevision: 1,
    kind: 'approve',
    capabilities: ['approve', 'reject'],
  });
  await f.core.externalMessaging.approvals.setRoute('ada', pairing.id, 0);
  const sessionId = 'bh-discord-approval';
  f.core.ownership.claim({
    sessionId,
    botSlug: 'ada',
    rootRole: 'orchestrator',
    at: new Date().toISOString(),
  });
  const agent = { session: { id: sessionId, header: { cwd: '/tmp/discord-qa' } } } as Agent;
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
  expect(receipt.conversationId).toBe('9000000001');
  await f.text('allow', undefined, '7000000002');
  await f.text('reject');
  expect(await answer).toBe('rejected');
  const prompt = f.replies.mock.calls.find((call) => String(call[2]).includes('「允许」'))!;
  expect(prompt[3]).toMatchObject({ standalone: true });
  await vi.waitFor(() => expect(f.replies.mock.calls.length).toBeGreaterThan(1));
  expect(f.replies.mock.calls.at(-1)![3]).not.toHaveProperty('standalone');
});
