import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { setImmediate as tick } from 'node:timers/promises';
import { expect, vi } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import type { MessagingInboundEvent, MessagingReplyRoute } from '../src/messaging/provider.js';
import type { OrchestratorAgentRun, BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import type { MessagingIdentityInput } from '../src/messaging/identity.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createTempRoot } from './helpers.js';

export const fingerprint = 'c'.repeat(64);

const cores: BotHarnessCore[] = [];

export function dm(
  id: string,
  overrides: Partial<MessagingInboundEvent> = {},
): MessagingInboundEvent {
  return {
    version: 1,
    channel: 'feishu',
    botId: 'lark-app',
    fingerprint,
    eventId: `ev-${id}`,
    messageId: `om-${id}`,
    actor: { kind: 'user', id: 'ou_owner', name: 'Owner' },
    conversation: { kind: 'dm', id: 'oc_owner' },
    mentions: [],
    mentionedAccount: false,
    at: '2026-10-07T00:00:00.000Z',
    text: `hello ${id}`,
    reply: { messageId: `om-${id}`, conversationId: 'oc_owner', actorId: 'ou_owner' },
    replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
    ...overrides,
  };
}

export function mention(id: string, mentioned = true): MessagingInboundEvent {
  return dm(id, {
    conversation: { kind: 'group', id: 'oc_team' },
    mentions: mentioned ? [{ id: 'ou-bot', key: '@_user_1' }] : [],
    mentionedAccount: mentioned,
    text: mentioned ? `@_user_1 question ${id}` : `chatter ${id}`,
    reply: {
      messageId: `om-${id}`,
      conversationId: 'oc_team',
      actorId: 'ou_owner',
      threadId: 'omt-topic',
      rootId: 'om-root',
    },
  });
}

type Platform = 'feishu' | 'slack' | 'discord' | 'weixin' | 'qq';

export function qqMention(id: string): MessagingInboundEvent {
  return dm(id, {
    channel: 'qq',
    at: new Date(Date.now() + 1000).toISOString(),
    conversation: { kind: 'group', id: 'qq-group' },
    mentionedAccount: true,
    mentions: [],
    reply: { messageId: `om-${id}`, conversationId: 'qq-group', actorId: 'ou_owner' },
  });
}

export async function fixture(
  platform: Platform = 'feishu',
  targets: Awaited<ReturnType<DshImOutboundService['listTargets']>> = [],
) {
  const home = createTempRoot('botharness-default-traffic-');
  const runs: OrchestratorAgentRun[] = [];
  const agents: BotAgentAdapter = {
    async runOrchestrator(run) {
      runs.push(run);
    },
    async runAssignment() {},
    requestAssignment() {
      return { delivery: 'steer' };
    },
    async stopAssignment() {},
    async close() {},
  };
  let core = createCore({ dshHome: home, agents });
  cores.push(core);
  expect(core.registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  type Consumer = Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1];
  let consumer: Consumer | undefined;
  let subscriptions = 0;
  const replies: { route: MessagingReplyRoute; text: string }[] = [];
  let prepareReply: (() => Promise<void>) | undefined;
  const service: DshImOutboundService = {
    contractVersion: 1,
    replyContextVersion: 1,
    replyReceiptVersion: 1,
    replyFenceVersion: 1,
    listBots: async () => [{ botId: 'lark-app', channel: platform }],
    listTargets: async () => targets,
    describeBot: async (botId) => ({
      version: 1,
      channel: platform,
      botId,
      account: { fingerprint, name: 'Support Lark app' },
      connected: true,
      capabilities: [
        ...(platform === 'qq' ? [] : ['proactive-text-checked', 'ordinary-text-consumer']),
        'exclusive-text-consumer',
        'reply-text-checked',
        'reply-context-checked',
        'reply-receipt-checked',
        'reply-fence-checked',
      ],
    }),
    sendChecked: async () => ({ sent: true as const }),
    consumeInbound: async (_id, input) => {
      ++subscriptions;
      consumer = input;
      return () => {
        --subscriptions;
      };
    },
    qualifyReplyChecked: async (_botId, route) => route,
    replyChecked: async (_botId, route, text, options) => {
      await prepareReply?.();
      if (options.beforeSend && !options.beforeSend())
        throw Object.assign(new Error('stale-route'), { code: 'stale-route' });
      replies.push({ route, text });
      return {
        sent: true,
        receipt: {
          version: 1,
          messageId: 'reply-' + route.messageId,
          conversationId: route.conversationId,
        },
      };
    },
  };
  const register = () => core.externalMessaging.register(createDshImProvider(service, platform)!);
  let dispose = register();
  const settle = async () => {
    for (let i = 0; i < 4; i++) await tick();
    await core.runtime.whenIdle();
    await tick();
  };
  const identity = await core.externalMessaging.identity('ada', {
    kind: 'bind',
    providerId: `dsh-im/${platform}`,
    accountRef: 'lark-app',
    fingerprint,
  });
  await settle();
  const query = (sql: string) =>
    attachOperationalModule(core.operationalDatabase, 'test').read((db) => db.prepare(sql).all());
  return {
    get core() {
      return core;
    },
    identity,
    service,
    runs,
    replies,
    prepareReply(prepare: () => Promise<void>) {
      prepareReply = prepare;
    },
    query,
    settle,
    get subscriptions() {
      return subscriptions;
    },
    async receive(event: MessagingInboundEvent, afterIntake?: () => void) {
      if (!consumer) throw new Error('Not subscribed');
      const result = await consumer.onEvent(
        { ...event, channel: platform },
        { signal: consumer.signal },
      );
      afterIntake?.();
      await settle();
      return result;
    },
    entries() {
      return query(
        "SELECT json_extract(body, '$.origin') AS origin, json_extract(body, '$.receiveScope.kind') AS kind, json_extract(body, '$.receiveScope.conversationId') AS conversation, revoked_at FROM messaging_grants ORDER BY created_at",
      );
    },
    admissions() {
      return query(
        "SELECT a.reason, json_extract(e.payload_json, '$.external.event.messageId') AS messageId FROM inbox_admissions a JOIN source_events e USING(source_event_id) ORDER BY e.created_at, messageId",
      );
    },
    sourceId(messageId: string) {
      return (
        query(
          `SELECT source_event_id FROM source_events WHERE json_extract(payload_json, '$.external.event.messageId') = '${messageId}'`,
        )[0] as { source_event_id: string }
      ).source_event_id;
    },
    async update(input: Partial<Extract<MessagingIdentityInput, { kind: 'update' }>>) {
      const current = (await core.externalMessaging.snapshot('ada')).identities![0]!;
      await core.externalMessaging.identity('ada', {
        kind: 'update',
        id: current.id,
        expectedRevision: current.revision,
        name: current.name,
        enabled: input.enabled ?? current.enabled,
        ...(input.newConversations ? { newConversations: input.newConversations } : {}),
        ...(input.inheritEnabled === undefined ? {} : { inheritEnabled: input.inheritEnabled }),
        ...(input.typingEnabled === undefined ? {} : { typingEnabled: input.typingEnabled }),
        ...(input.inheritTyping === undefined ? {} : { inheritTyping: input.inheritTyping }),
      });
      await settle();
    },
    async restart() {
      dispose();
      core.externalMessaging.close();
      await core.runtime.close();
      core.operationalDatabase.close();
      cores.splice(cores.indexOf(core), 1);
      core = createCore({ dshHome: home, agents });
      cores.push(core);
      dispose = register();
      await settle();
    },
    replaceProvider() {
      dispose();
      dispose = register();
    },
  };
}

export async function ordinaryRole(fx: Awaited<ReturnType<typeof fixture>>) {
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...fx.core });
  expect(
    await methods.senderAccess({
      slug: 'ada',
      input: {
        kind: 'create-role',
        name: 'Colleague',
        behavior: 'Answer questions about public documentation. Do not change code.',
      },
    }),
  ).toEqual({ ok: true, value: undefined });
  expect(
    await methods.senderAccess({
      slug: 'ada',
      input: { kind: 'policy', restricted: true, expectedRevision: 0 },
    }),
  ).toEqual({ ok: true, value: undefined });
  return (await fx.core.externalMessaging.snapshot('ada')).roles![0]!;
}

export function fresh(event: MessagingInboundEvent): MessagingInboundEvent {
  return { ...event, at: new Date(Date.now() + 50).toISOString() };
}

export function asActor(event: MessagingInboundEvent, actorId: string): MessagingInboundEvent {
  return {
    ...event,
    actor: { kind: 'user', id: actorId, name: actorId },
    reply: { ...event.reply, actorId },
  };
}

export async function grantFor(fx: Awaited<ReturnType<typeof fixture>>, conversation: string) {
  const snapshot = await fx.core.externalMessaging.snapshot('ada');
  return snapshot.grants.find(
    (grant) => !grant.revokedAt && grant.receiveScope?.conversationId === conversation,
  )!;
}

export const cleanup = async () => {
  vi.useRealTimers();
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
};
