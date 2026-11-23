import { OWNER_HUMAN_CONTEXT } from '../../src/humans/context.js';
import { setImmediate as tick } from 'node:timers/promises';
import type { StatementSync } from 'node:sqlite';
import { vi } from 'vitest';
import { createCore, type BotHarnessCore } from '../../src/plugin.js';
import { createDshImProvider, type DshImOutboundService } from '../../src/messaging/dsh-im.js';
import type { OrchestratorAgentRun } from '../../src/runtime/bot-runtime.js';
import { attachOperationalModule } from '../../src/database/owner.js';
import { channelBridgeRoutes } from '../../src/messaging/channel-bridge.js';
import { dmChannelId } from '../../src/channels/channel.js';
import { createTempRoot } from '../helpers.js';

export const cores: BotHarnessCore[] = [];

type WeixinGrant = Awaited<ReturnType<BotHarnessCore['externalMessaging']['authorize']>>;
type InboundConsumer = Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1];

interface WeixinDmMirrorFixture {
  core: BotHarnessCore;
  transport: DshImOutboundService;
  grant: WeixinGrant;
  dm: { id: string };
  receive: (messageId: string, extra?: object) => ReturnType<InboundConsumer['onEvent']>;
  runs: { slug: string; inbox: string }[];
  sources: () => ReturnType<StatementSync['all']>;
  authorize: (accountRef?: string, receive?: boolean) => Promise<WeixinGrant>;
}

export async function fixture(implicit = false, optIn = true): Promise<WeixinDmMirrorFixture> {
  const home = createTempRoot('botharness-weixin-dm-mirror-');
  const fingerprint = 'd'.repeat(64);
  let consumer: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1] | undefined;
  const runs: { slug: string; inbox: string }[] = [];
  const agents = {
    async runOrchestrator(run: OrchestratorAgentRun) {
      runs.push({ slug: run.bot.slug, inbox: run.inbox });
    },
    async runAssignment() {},
    requestAssignment() {
      return { delivery: 'steer' as const };
    },
    async stopAssignment() {},
    async close() {},
  };
  const core = createCore({ dshHome: home, agents });
  cores.push(core);
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  const transport: DshImOutboundService = {
    contractVersion: 1,
    replyContextVersion: 1,
    replyReceiptVersion: 1,
    replyFenceVersion: 1,
    receiptVersion: 1,
    postFenceVersion: 1,
    listBots: async () =>
      ['weixin-qa', 'weixin-second'].map((botId) => ({ botId, channel: 'weixin' })),
    listTargets: async () => [
      { targetId: 'qa', name: 'Paired owner', kind: 'user', route: { toUserId: 'owner' } },
    ],
    describeBot: async (botId) => ({
      version: 1,
      botId,
      channel: 'weixin',
      connected: true,
      account: {
        fingerprint: botId === 'weixin-qa' ? fingerprint : 'e'.repeat(64),
        name: 'WeChat QA identity',
      },
      capabilities: [
        'proactive-text-checked',
        'proactive-receipt-checked',
        'proactive-fence-checked',
        'exclusive-text-consumer',
        'reply-text-checked',
        'reply-context-checked',
        'reply-receipt-checked',
        'reply-fence-checked',
      ],
    }),
    sendChecked: vi.fn<DshImOutboundService['sendChecked']>(async (_account, _target, text) => ({
      sent: true,
      receipt: {
        version: 1,
        messageId: 'sent-' + text.length,
        conversationId: 'owner',
        identityKind: 'client-acknowledgement',
      },
    })),
    consumeInbound: async (_account, options) => {
      consumer = options;
      return () => {};
    },
    qualifyReplyChecked: async (_account, route) => route,
    replyChecked: vi.fn<NonNullable<DshImOutboundService['replyChecked']>>(
      async (_account, route) => ({
        sent: true,
        receipt: {
          version: 1,
          messageId: 'client-ack',
          conversationId: route.conversationId,
          identityKind: 'client-acknowledgement',
        },
      }),
    ),
  };
  core.externalMessaging.register(createDshImProvider(transport, 'weixin')!);
  const enableSync = async (grantId: string) => {
    core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
    const current = (await core.externalMessaging.snapshot('ada')).grants.find(
      (g) => g.id === grantId,
    )!;
    const route = channelBridgeRoutes(current)[0]!;
    await core.externalMessaging.inbound.channelBridge(dmChannelId('ada'), {
      kind: 'update',
      grantId,
      routeId: route.id,
      delivery: 'inbox',
      expectedGrantRevision: current.revision,
      expectedRevision: route.revision,
      name: route.name,
      enabled: true,
      collection: 'all',
      collectionInheritance: 'custom',
      dmMirror: true,
      dmForward: true,
    });
  };
  const authorize = async (accountRef = 'weixin-qa', receive = true) => {
    const target = (await core.externalMessaging.targets('dsh-im/weixin', accountRef))[0]!;
    const grant = await core.externalMessaging.authorize({
      botSlug: 'ada',
      providerId: 'dsh-im/weixin',
      accountRef,
      targetRef: 'qa',
      fingerprint: accountRef === 'weixin-qa' ? fingerprint : 'e'.repeat(64),
      targetDigest: target.digest,
    });
    if (receive) {
      await core.externalMessaging.inbound.setEnabled('ada', grant.id, true);
      if (optIn) await enableSync(grant.id);
    }
    return grant;
  };
  const explicitGrant = implicit ? undefined : await authorize();
  if (implicit)
    await core.externalMessaging.identity('ada', {
      kind: 'bind',
      providerId: 'dsh-im/weixin',
      accountRef: 'weixin-qa',
      fingerprint,
    });
  const dm = { id: dmChannelId('ada') };
  const sources = () =>
    attachOperationalModule(core.operationalDatabase, 'test').read((db) =>
      db.prepare('SELECT source_event_id FROM inbox_admissions WHERE bot_slug = ?').all('ada'),
    );
  const receive = (messageId: string, extra: object = {}) =>
    consumer!.onEvent(
      {
        version: 1,
        channel: 'weixin',
        botId: 'weixin-qa',
        fingerprint,
        eventId: 'delivery-' + messageId,
        messageId,
        actor: { kind: 'user', id: 'owner', name: 'Owner' },
        conversation: { kind: 'dm', id: 'owner' },
        mentions: [],
        mentionedAccount: false,
        at: new Date(Date.now() + 10).toISOString(),
        text: 'WeChat ' + messageId,
        reply: { messageId, actorId: 'owner', conversationId: 'owner' },
        replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
        ...extra,
      },
      { signal: consumer!.signal },
    );
  if (implicit) {
    await receive('binding');
    await tick();
    await core.runtime.whenIdle();
  }
  if (implicit && optIn)
    await enableSync((await core.externalMessaging.snapshot('ada')).grants[0]!.id);
  const grant = explicitGrant ?? (await core.externalMessaging.snapshot('ada')).grants[0]!;
  return { core, transport, grant, dm, receive, runs, sources, authorize };
}

export async function setForwarding(
  core: BotHarnessCore,
  dmId: string,
  enabled: boolean,
): Promise<void> {
  const row = (await core.externalMessaging.channelBridges(dmId)).bridges[0]!;
  await core.externalMessaging.inbound.channelBridge(dmId, {
    kind: 'update',
    grantId: row.grantId,
    routeId: row.routeId,
    delivery: row.delivery,
    expectedGrantRevision: row.grantRevision,
    expectedRevision: row.revision,
    name: row.name,
    enabled: row.enabled,
    collection: 'all',
    collectionInheritance: 'custom',
    dmForward: enabled,
  });
}
