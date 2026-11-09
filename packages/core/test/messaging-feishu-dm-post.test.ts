import { setImmediate as tick } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import type { MessagingInboundEvent } from '../src/messaging/provider.js';
import { createTempRoot } from './helpers.js';

const cores: BotHarnessCore[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

async function fixture() {
  const fingerprint = 'e'.repeat(64);
  let consumer: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1] | undefined;
  const groupChecks: string[] = [];
  const saved: { targetId: string; text: string; receipt: boolean }[] = [];
  const transport: DshImOutboundService = {
    contractVersion: 1,
    receiptVersion: 1,
    postFenceVersion: 1,
    reachableConversationVersion: 1,
    replyContextVersion: 1,
    replyReceiptVersion: 1,
    replyFenceVersion: 1,
    listBots: async () => [{ botId: 'feishu-qa', channel: 'feishu' }],
    listTargets: async () => [
      {
        targetId: 'owner-dm',
        name: 'Owner DM',
        kind: 'user',
        route: { openId: 'ou_owner', chatId: 'oc_ownerdm' },
      },
    ],
    describeBot: async (botId) => ({
      version: 1,
      botId,
      channel: 'feishu',
      connected: true,
      account: { fingerprint, name: 'Lark QA Bot' },
      capabilities: [
        'proactive-text-checked',
        'proactive-receipt-checked',
        'proactive-fence-checked',
        'reachable-conversations-checked',
        'exclusive-text-consumer',
        'reply-text-checked',
        'reply-context-checked',
        'reply-receipt-checked',
        'reply-fence-checked',
      ],
    }),
    sendChecked: vi.fn(async (_account, targetId, text, options) => {
      expect(options.beforeSend?.()).toBe(true);
      saved.push({ targetId, text, receipt: options.receipt === true });
      return {
        sent: true as const,
        receipt: { version: 1 as const, messageId: 'om_dm', conversationId: 'oc_ownerdm' },
      };
    }),
    consumeInbound: async (_account, options) => {
      consumer = options;
      return () => {};
    },
    qualifyReplyChecked: async (_account, route) => route,
    replyChecked: async (_account, route) => ({
      sent: true,
      receipt: { version: 1, messageId: 'om_reply', conversationId: route.conversationId },
    }),
    listReachableConversations: async () => ({ version: 1, conversations: [], hasMore: false }),
    postConversationChecked: async (_account, conversationId) => {
      groupChecks.push(conversationId);
      throw Object.assign(new Error('send-permission-denied'), {
        code: 'send-permission-denied',
      });
    },
  };
  const core = createCore({
    dshHome: createTempRoot('feishu-dm-post-'),
    agents: {
      async runOrchestrator() {},
      async runAssignment() {},
      requestAssignment() {
        return { delivery: 'steer' };
      },
      async stopAssignment() {},
      async close() {},
    },
  });
  cores.push(core);
  expect(core.registry.create({ slug: 'tob', displayName: 'Tob' }).ok).toBe(true);
  const provider = createDshImProvider(transport, 'feishu')!;
  core.externalMessaging.register(provider);
  const bound = await core.externalMessaging.identity('tob', {
    kind: 'bind',
    providerId: provider.id,
    accountRef: 'feishu-qa',
    fingerprint,
  });
  const binding = await core.externalMessaging.identity('tob', {
    kind: 'update',
    id: bound.id,
    expectedRevision: bound.revision,
    name: bound.name,
    enabled: true,
    newConversations: 'auto',
  });
  const source: MessagingInboundEvent = {
    version: 1,
    channel: 'feishu',
    botId: 'feishu-qa',
    fingerprint,
    eventId: 'gateway:qa:1',
    messageId: 'om_owner_1',
    actor: { kind: 'user', id: 'ou_owner' },
    conversation: { kind: 'dm', id: 'oc_ownerdm' },
    mentions: [],
    mentionedAccount: false,
    at: new Date().toISOString(),
    text: 'hello',
    reply: { messageId: 'om_owner_1', actorId: 'ou_owner', conversationId: 'oc_ownerdm' },
    replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
  };
  await tick();
  await consumer!.onEvent(source, { signal: consumer!.signal });
  await tick();
  await core.runtime.whenIdle();
  const implicit = (await core.externalMessaging.snapshot('tob')).grants.find(
    (grant) => grant.origin === 'implicit',
  )!;
  expect(implicit.receiveScope).toEqual({ kind: 'dm', conversationId: 'oc_ownerdm' });
  const target = (await provider.targets('feishu-qa'))[0]!;
  const explicit = await core.externalMessaging.authorize({
    botSlug: 'tob',
    providerId: provider.id,
    accountRef: 'feishu-qa',
    targetRef: target.ref,
    fingerprint,
    targetDigest: target.digest,
  });
  return { core, binding, implicit, explicit, groupChecks, saved };
}

it('lists only the saved DM target as postable, never the implicit DM grant', async () => {
  const { core, implicit, explicit } = await fixture();
  const grants = (await core.externalMessaging.snapshot('tob')).grants;
  expect(grants.find((grant) => grant.id === implicit.id)).toMatchObject({ canPost: false });
  expect(grants.find((grant) => grant.id === explicit.id)).toMatchObject({
    canPost: true,
    postConversationId: 'oc_ownerdm',
  });
});

it('a proactive post through the implicit DM grant uses the saved DM target', async () => {
  const { core, implicit, groupChecks, saved } = await fixture();
  const result = await core.externalMessaging.post('tob', implicit.id, 'dm-post-implicit', 'Hi');
  expect(result).toMatchObject({ state: 'provider-accepted', receipt: { messageId: 'om_dm' } });
  expect(groupChecks).toEqual([]);
  expect(saved).toEqual([{ targetId: 'owner-dm', text: 'Hi', receipt: true }]);
});

it('a proactive post through the saved DM target is delivered with a receipt', async () => {
  const { core, explicit, groupChecks, saved } = await fixture();
  const result = await core.externalMessaging.post('tob', explicit.id, 'dm-post-explicit', 'Hi');
  expect(result).toMatchObject({ state: 'provider-accepted', receipt: { messageId: 'om_dm' } });
  expect(groupChecks).toEqual([]);
  expect(saved).toEqual([{ targetId: 'owner-dm', text: 'Hi', receipt: true }]);
});

it('binding_id and the DM conversation_id resolve to the saved DM target', async () => {
  const { core, binding, groupChecks, saved } = await fixture();
  const result = await core.externalMessaging.postConversation(
    'tob',
    binding.id,
    'oc_ownerdm',
    'dm-post-binding',
    'Hi',
  );
  expect(result).toMatchObject({ state: 'provider-accepted' });
  expect(groupChecks).toEqual([]);
  expect(saved).toHaveLength(1);
});

it('without a saved DM target the implicit DM grant refuses as unsupported, not denied', async () => {
  const { core, implicit, explicit, groupChecks } = await fixture();
  await core.externalMessaging.revoke('tob', explicit.id);
  await expect(
    core.externalMessaging.post('tob', implicit.id, 'dm-post-no-target', 'Hi'),
  ).rejects.toMatchObject({ code: 'capability-unavailable' });
  expect(groupChecks).toEqual([]);
});
