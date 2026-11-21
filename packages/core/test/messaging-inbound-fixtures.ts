import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { setImmediate as tick } from 'node:timers/promises';
import { expect, vi } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import type { MessagingInboundEvent, MessagingReplyRoute } from '../src/messaging/provider.js';
import type { OrchestratorAgentRun, BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createTempRoot } from './helpers.js';
import { type ImCommandServices } from '../src/messaging/im-commands.js';

export const fingerprint = 'a'.repeat(64);

const cores: BotHarnessCore[] = [];

export function event(overrides: Partial<MessagingInboundEvent> = {}): MessagingInboundEvent {
  return {
    version: 1,
    channel: 'feishu',
    botId: 'lark-app',
    fingerprint,
    eventId: 'ev-1',
    messageId: 'om-1',
    actor: { kind: 'user', id: 'ou-human' },
    conversation: { kind: 'group', id: 'oc-team' },
    mentions: [{ id: 'ou-bot', key: '@_user_1' }],
    mentionedAccount: true,
    at: '2026-10-01T00:00:00.000Z',
    text: '@_user_1 Please reply in this topic',
    reply: {
      messageId: 'om-1',
      conversationId: 'oc-team',
      actorId: 'ou-human',
      threadId: 'omt-topic',
      rootId: 'om-root',
      parentId: 'om-parent',
    },
    replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
    ...overrides,
  };
}

export async function fixture(
  options: {
    onRun?: (run: OrchestratorAgentRun) => Promise<void>;
    imCommands?: () => ImCommandServices;
    steer?: NonNullable<BotAgentAdapter['steerOrchestrator']>;
    receipts?: boolean;
    secondIdentity?: boolean;
    inheritedProvider?: boolean;
    history?: NonNullable<DshImOutboundService['historyChecked']>;
  } = {},
) {
  const home = createTempRoot('botharness-inbound-');
  const runs: OrchestratorAgentRun[] = [];
  const agents: BotAgentAdapter = {
    async runOrchestrator(run) {
      runs.push(run);
      await options.onRun?.(run);
    },
    async runAssignment() {},
    requestAssignment() {
      return { delivery: 'steer' };
    },
    async stopAssignment() {},
    async close() {},
    ...(options.steer === undefined ? {} : { steerOrchestrator: options.steer }),
  };
  let core = createCore({ dshHome: home, agents, imCommands: () => options.imCommands?.() });
  cores.push(core);
  expect(core.registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  type Consumer = Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1];
  let echoCallback: Consumer['onEcho'] | undefined;
  let callback: Consumer['onEvent'] | undefined;
  let consumerSignal: AbortSignal | undefined;
  let subscriptions = 0;
  const replies: { route: MessagingReplyRoute; text: string; botId: string }[] = [];
  let result: (() => Promise<{ sent: true }>) | undefined;
  let ready = true;
  const publicService: DshImOutboundService = {
    contractVersion: 1,
    ...(options.receipts ? { receiptVersion: 1 as const, echoVersion: 1 as const } : {}),
    ...(options.secondIdentity
      ? {
          replyContextVersion: 1 as const,
          replyFenceVersion: 1 as const,
          replyReceiptVersion: 1 as const,
          qualifyReplyChecked: vi.fn(async (_id, route) => ({
            ...route,
            actorId: 'ou-human-scoped-to-bea',
          })),
        }
      : {}),
    listBots: async () => [
      { botId: 'lark-app', channel: 'feishu' },
      ...(options.secondIdentity ? [{ botId: 'lark-bea', channel: 'feishu' }] : []),
    ],
    listTargets: async () => [
      { targetId: 'team', name: 'QA team', kind: 'group', route: { chatId: 'oc-team' } },
    ],
    describeBot: async (botId) => {
      if (!ready) throw Object.assign(new Error('Starting account'), { code: 'unknown-bot' });
      return {
        version: 1,
        channel: 'feishu',
        botId,
        account: {
          fingerprint: botId === 'lark-bea' ? 'b'.repeat(64) : fingerprint,
          name: botId === 'lark-bea' ? 'Bea Lark identity' : 'My Lark identity',
        },
        connected: true,
        capabilities: [
          'proactive-text-checked',
          ...(options.receipts ? ['proactive-receipt-checked', 'own-text-echo'] : []),
          'exclusive-text-consumer',
          'reply-text-checked',
          ...(options.secondIdentity
            ? ['reply-context-checked', 'reply-receipt-checked', 'reply-fence-checked']
            : []),
          ...(options.history ? ['history-text-checked', 'thread-history-text-checked'] : []),
        ],
      };
    },
    ...(options.history ? { historyChecked: options.history } : {}),
    sendChecked: vi.fn(async () => ({
      sent: true as const,
      ...(options.receipts
        ? { receipt: { version: 1 as const, messageId: 'om-report', conversationId: 'oc-team' } }
        : {}),
    })),
    consumeInbound: async (_id, input) => {
      ++subscriptions;
      callback = input.onEvent;
      echoCallback = input.onEcho;
      consumerSignal = input.signal;
      return () => {
        --subscriptions;
      };
    },
    replyChecked: async (botId, route, text, replyOptions) => {
      if (replyOptions.beforeSend && !replyOptions.beforeSend())
        throw Object.assign(new Error('stale-route'), { code: 'stale-route' });
      replies.push({ botId, route, text });
      expect(core.externalMessaging.history(botId === 'lark-bea' ? 'bea' : 'ada')[0]?.state).toBe(
        'in-flight',
      );
      return result
        ? result()
        : {
            sent: true,
            ...(options.secondIdentity
              ? {
                  receipt: {
                    version: 1 as const,
                    messageId: botId + '-reply',
                    conversationId: route.conversationId,
                  },
                }
              : {}),
          };
    },
  };
  const register = () => {
    const provider = createDshImProvider(publicService);
    if (!provider) throw new Error('Provider missing');
    return core.externalMessaging.register(
      options.inheritedProvider ? Object.create(provider) : provider,
    );
  };
  let dispose = register();
  const authorize = async () => {
    const targets = await core.externalMessaging.targets('dsh-im/feishu', 'lark-app');
    return core.externalMessaging.authorize({
      botSlug: 'ada',
      providerId: 'dsh-im/feishu',
      accountRef: 'lark-app',
      targetRef: 'team',
      fingerprint,
      targetDigest: targets[0]!.digest,
    });
  };
  const grant = await authorize();
  const query = (sql: string) =>
    attachOperationalModule(core.operationalDatabase, 'test').read((db) => db.prepare(sql).all());
  return {
    get core() {
      return core;
    },
    grant,
    runs,
    replies,
    publicService,
    query,
    get subscriptions() {
      return subscriptions;
    },
    get callback() {
      return callback;
    },
    async enable() {
      await core.externalMessaging.inbound.setEnabled('ada', grant.id, true);
    },
    async receive(raw: unknown = event()) {
      if (!callback || !consumerSignal) throw new Error('Not subscribed');
      return callback(raw, { signal: consumerSignal });
    },
    async echo(messageId = 'om-report', text = 'Morning report') {
      if (!echoCallback || !consumerSignal) throw new Error('Not subscribed');
      return echoCallback(
        {
          version: 1,
          botId: 'lark-app',
          fingerprint,
          eventId: 'echo-1',
          messageId,
          conversationId: 'oc-team',
          text,
          at: '2026-10-03T00:00:00.000Z',
        },
        { signal: consumerSignal },
      );
    },
    async idle() {
      await tick();
      await core.runtime.whenIdle();
      await tick();
    },
    setReady(value: boolean) {
      ready = value;
    },
    setReply(value: () => Promise<{ sent: true }>) {
      result = value;
    },
    dispose() {
      dispose();
    },
    async restart() {
      dispose();
      core.externalMessaging.close();
      await core.runtime.close();
      core.operationalDatabase.close();
      cores.splice(cores.indexOf(core), 1);
      core = createCore({ dshHome: home, agents, imCommands: () => options.imCommands?.() });
      cores.push(core);
      dispose = register();
      await tick();
      await tick();
    },
  };
}

export function contextEvent(
  messageId: string,
  text: string,
  mentionedAccount = false,
): MessagingInboundEvent {
  return event({
    messageId,
    eventId: `history:${messageId}`,
    text,
    mentionedAccount,
    reply: { ...event().reply, messageId },
  });
}

export async function sharedTarget(fx: Awaited<ReturnType<typeof fixture>>) {
  expect(fx.core.registry.create({ slug: 'bea', displayName: 'Bea' }).ok).toBe(true);
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...fx.core });
  const result = methods.channelCreate({ name: 'Shared Lark work', members: ['ada', 'bea'] });
  if (!result.ok) throw new Error(result.error.message);
  const channelId = result.value.channel.id;
  expect(
    await methods.messagingChannelTarget({ slug: 'ada', grantId: fx.grant.id, channelId }),
  ).toEqual({ ok: true, value: { updated: true } });
  return channelId;
}

export function ordinaryEvent(id: string): MessagingInboundEvent {
  return event({
    eventId: 'ev-' + id,
    messageId: id,
    text: 'Ordinary ' + id,
    at: new Date().toISOString(),
    mentionedAccount: false,
    mentions: [],
    reply: { messageId: id, conversationId: 'oc-team', actorId: 'ou-human' },
  });
}

export const reception = {
  collection: 'all',
  wake: 'digest',
  count: 2,
  intervalSeconds: 60,
} as const;

export function ordinaryThread(id: string, threadId = 'omt-topic'): MessagingInboundEvent {
  const plain = ordinaryEvent(id);
  return {
    ...plain,
    reply: {
      ...plain.reply,
      threadId,
      rootId: threadId === 'omt-topic' ? 'om-root' : 'root-' + threadId,
      parentId: 'parent-' + threadId,
    },
  };
}

export function externalAnchor(fx: Awaited<ReturnType<typeof fixture>>): string {
  const item = fx.core.attention
    .list({ botSlug: 'ada' })
    .items.find((item) => item.sourceKind === 'bridge-message');
  if (!item) throw new Error('No external anchor');
  return item.id;
}

export const botEditor = { kind: 'bot', botSlug: 'ada' } as const;

export function managedEvent(
  fx: Awaited<ReturnType<typeof fixture>>,
  overrides: Partial<MessagingInboundEvent> = {},
) {
  const value = fx.query(
    "SELECT body FROM messaging_grants WHERE id = '" + fx.grant.id + "'",
  )[0] as { body: string };
  const after = (
    JSON.parse(value.body).bridgeRoutes?.find(
      (route: { channelId: string | null }) => route.channelId,
    ) ?? JSON.parse(value.body).channelBridge
  ).intakeAfter as string;
  return event({ at: new Date(Date.parse(after) + 1).toISOString(), ...overrides });
}

export async function addManagedBridge(fx: Awaited<ReturnType<typeof fixture>>, enabled = true) {
  const result = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...fx.core }).channelCreate({
    name: 'Managed Lark',
    members: ['ada'],
  });
  if (!result.ok) throw new Error(result.error.message);
  const channelId = result.value.channel.id;
  const grant = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!;
  await fx.core.externalMessaging.inbound.channelBridge(channelId, {
    kind: 'add',
    grantId: grant.id,
    expectedGrantRevision: grant.revision,
    name: 'Work intake',
    enabled,
    collection: 'mentions',
  });
  return channelId;
}

export async function bridgeRow(fx: Awaited<ReturnType<typeof fixture>>, channelId: string) {
  return (await fx.core.externalMessaging.channelBridges(channelId)).bridges[0]!;
}

export async function addRoute(
  fx: Awaited<ReturnType<typeof fixture>>,
  channelId: string,
  delivery: 'channel' | 'inbox' = 'channel',
  collection: 'mentions' | 'all' = 'mentions',
) {
  const g = (await fx.core.externalMessaging.snapshot('ada')).grants.find(
    (g) => g.id === fx.grant.id,
  )!;
  await fx.core.externalMessaging.inbound.channelBridge(channelId, {
    kind: 'add',
    grantId: g.id,
    expectedGrantRevision: g.revision,
    name: delivery === 'inbox' ? 'Private intake' : 'Shared intake',
    enabled: true,
    collection,
    collectionInheritance: 'custom',
    delivery,
  });
}

export function createRouteGroup(
  fx: Awaited<ReturnType<typeof fixture>>,
  name: string,
  members = ['ada'],
) {
  const result = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...fx.core }).channelCreate({
    name,
    members,
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value.channel.id;
}

export const cleanup = async () => {
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
};
