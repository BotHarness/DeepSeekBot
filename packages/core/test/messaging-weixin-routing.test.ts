import { setImmediate as tick } from 'node:timers/promises';
import { afterEach, expect, it } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import { attachOperationalModule } from '../src/database/owner.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
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
  const home = createTempRoot('botharness-weixin-routes-');
  const fingerprint = 'd'.repeat(64);
  let consumer: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1];
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
  let core = createCore({ dshHome: home, agents });
  cores.push(core);
  for (const slug of ['ada', 'bea'])
    expect(core.registry.create({ slug, displayName: slug }).ok).toBe(true);
  const transport: DshImOutboundService = {
    contractVersion: 1,
    replyContextVersion: 1,
    replyReceiptVersion: 1,
    replyFenceVersion: 1,
    listBots: async () => [{ botId: 'weixin-qa', channel: 'weixin' }],
    listTargets: async () => [
      { targetId: 'qa', name: 'Paired owner', kind: 'user', route: { toUserId: 'owner' } },
    ],
    describeBot: async (botId) => ({
      version: 1,
      botId,
      channel: 'weixin',
      connected: true,
      account: { fingerprint, name: 'WeChat QA identity' },
      capabilities: [
        'proactive-text-checked',
        'exclusive-text-consumer',
        'reply-text-checked',
        'reply-context-checked',
        'reply-receipt-checked',
        'reply-fence-checked',
      ],
    }),
    sendChecked: async () => ({ sent: true }),
    consumeInbound: async (_account, options) => {
      consumer = options;
      return () => {};
    },
    qualifyReplyChecked: async (_account, route) => route,
    replyChecked: async (_account, route) => ({
      sent: true,
      receipt: {
        version: 1,
        messageId: 'client-ack',
        conversationId: route.conversationId,
        identityKind: 'client-acknowledgement',
      },
    }),
  };
  const register = () => core.externalMessaging.register(createDshImProvider(transport, 'weixin')!);
  register();
  const target = (await core.externalMessaging.targets('dsh-im/weixin', 'weixin-qa'))[0]!;
  const grant = await core.externalMessaging.authorize({
    botSlug: 'ada',
    providerId: 'dsh-im/weixin',
    accountRef: 'weixin-qa',
    targetRef: 'qa',
    fingerprint,
    targetDigest: target.digest,
  });
  await core.externalMessaging.inbound.setEnabled('ada', grant.id, true);
  const created = createBridgeMethods({ ...core }).channelCreate({
    name: 'WeChat shared',
    members: ['ada', 'bea'],
  });
  if (!created.ok) throw new Error(created.error.message);
  const group = created.value.channel;
  const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
  const query = (sql: string) =>
    attachOperationalModule(core.operationalDatabase, 'test').read((db) => db.prepare(sql).all());
  const route = async (id: string, delivery: 'channel' | 'inbox' = 'channel') => {
    const snapshot = await core.externalMessaging.snapshot('ada');
    await core.externalMessaging.inbound.channelBridge(id, {
      kind: 'add',
      grantId: grant.id,
      expectedGrantRevision: snapshot.grants[0]!.revision,
      delivery,
      name: 'Paired-owner DM',
      enabled: true,
      collection: 'all',
      collectionInheritance: 'custom',
    });
  };
  const receive = async (messageId: string, at = new Date(Date.now() + 10).toISOString()) =>
    consumer.onEvent(
      {
        version: 1,
        channel: 'weixin',
        botId: 'weixin-qa',
        fingerprint,
        eventId: 'delivery-' + messageId,
        messageId,
        actor: { kind: 'user', id: 'owner' },
        conversation: { kind: 'dm', id: 'owner' },
        mentions: [],
        mentionedAccount: false,
        at,
        text: 'WeChat ' + messageId,
        reply: { messageId, actorId: 'owner', conversationId: 'owner' },
        replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
      },
      { signal: consumer.signal },
    );
  const idle = async () => {
    await tick();
    await core.runtime.whenIdle();
    await tick();
  };
  return {
    get core() {
      return core;
    },
    grant,
    group,
    dm,
    runs,
    query,
    route,
    receive,
    idle,
    async restart() {
      core.externalMessaging.close();
      await core.runtime.close();
      core.operationalDatabase.close();
      cores.splice(cores.indexOf(core), 1);
      core = createCore({ dshHome: home, agents });
      cores.push(core);
      register();
      await tick();
    },
  };
}
it('fans out a WeChat DM through one canonical source with independent Channel harvest and Inbox-only; never lends the receiver identity', async () => {
  const f = await fixture();
  await f.route(f.group.id);
  f.core.channels.setGroupWakePolicy(f.group.id, 'ada', {
    mode: 'silent',
    count: 2,
    intervalSeconds: 60,
  });
  f.core.channels.setGroupWakePolicy(f.group.id, 'bea', {
    mode: 'digest',
    count: 2,
    intervalSeconds: 60,
  });
  await f.receive('one');
  await f.idle();
  expect(f.runs.map((r) => r.slug)).toEqual(['ada']);
  expect(f.runs[0]!.inbox).toContain('External private message');
  expect(f.runs[0]!.inbox).not.toContain('External work-group');
  const source = f.core.channels.readMessages(f.group.id)[0]!;
  expect(source.author.kind).toBe('bridged');
  expect(f.core.externalMessaging.inbound.read('bea', source.id).event.conversation.kind).toBe(
    'dm',
  );
  await expect(f.core.externalMessaging.reply('bea', source.id, 'Cannot borrow')).rejects.toThrow(
    'own-reply-grant-unavailable',
  );
  expect(f.core.channels.readMessages(f.dm.id)).toEqual([]);
  expect(f.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    1,
  );
  expect(f.query('SELECT * FROM messaging_source_paths')).toHaveLength(3);
  await f.restart();
  await f.receive('two');
  await f.idle();
  expect(f.runs.filter((r) => r.slug === 'ada')).toHaveLength(2);
  expect(f.runs.filter((r) => r.slug === 'bea')).toHaveLength(1);
  expect(f.runs.find((r) => r.slug === 'bea')!.inbox).toContain('WeChat one');
  expect(f.runs.find((r) => r.slug === 'bea')!.inbox).toContain('WeChat two');
  await f.receive('two');
  await f.idle();
  expect(
    f.core.channels.readMessages(f.group.id).filter((m) => m.author.kind === 'bridged'),
  ).toHaveLength(2);
  expect(f.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    2,
  );
});
it('keeps accepted history across toggle, delete, receiver membership loss and restart without replaying into new routes', async () => {
  const f = await fixture();
  await f.route(f.group.id);
  const firstAt = new Date(Date.now() + 10).toISOString();
  await f.receive('first', firstAt);
  await f.idle();
  let row = (await f.core.externalMessaging.channelBridges(f.group.id)).bridges[0]!;
  const toggle = async (enabled: boolean) => {
    await f.core.externalMessaging.inbound.channelBridge(f.group.id, {
      kind: 'update',
      routeId: row.routeId,
      grantId: row.grantId,
      expectedGrantRevision: row.grantRevision,
      expectedRevision: row.revision,
      name: row.name,
      enabled,
      collection: 'all',
      collectionInheritance: 'custom',
    });
    row = (await f.core.externalMessaging.channelBridges(f.group.id)).bridges[0]!;
  };
  await toggle(false);
  await f.receive('paused');
  await f.idle();
  expect(f.core.channels.readMessages(f.group.id)).toHaveLength(1);
  expect(f.core.attention.list({ botSlug: 'ada' }).items).toHaveLength(2);
  await toggle(true);
  await f.receive('first', firstAt);
  await f.receive('fresh');
  await f.idle();
  expect(
    f.core.channels.readMessages(f.group.id).filter((m) => m.author.kind === 'bridged'),
  ).toHaveLength(2);
  await f.core.externalMessaging.inbound.channelBridge(f.group.id, {
    kind: 'delete',
    routeId: row.routeId,
    grantId: row.grantId,
    expectedGrantRevision: row.grantRevision,
    expectedRevision: row.revision,
  });
  await f.restart();
  await f.receive('deleted');
  await f.idle();
  expect(
    f.core.channels.readMessages(f.group.id).filter((m) => m.author.kind === 'bridged'),
  ).toHaveLength(2);
  await f.route(f.group.id);
  f.core.channels.removeGroupMember(f.group.id, 'ada');
  await f.receive('no-member');
  await f.idle();
  expect(
    f.core.channels.readMessages(f.group.id).filter((m) => m.author.kind === 'bridged'),
  ).toHaveLength(2);
  expect(f.core.channels.readMessages(f.dm.id)).toEqual([]);
});

it('places WeChat in a local DM only when explicitly connected, keeping the private-message policy', async () => {
  const f = await fixture();
  await f.route(f.dm.id);
  await f.receive('explicit-dm');
  await f.idle();
  const messages = f.core.channels.readMessages(f.dm.id);
  expect(messages).toHaveLength(1);
  expect(messages[0]!.author.kind).toBe('bridged');
  expect(f.core.channels.readMessages(f.group.id)).toHaveLength(0);
  expect(f.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    1,
  );
  const source = f.core.externalMessaging.inbound.read('ada', messages[0]!.id);
  expect(source.event.conversation.kind).toBe('dm');
  expect(source.receptionPaths).toHaveLength(2);
  expect(
    source.receptionPaths!.every((path) => path.reason === 'human-dm' && path.mode === 'immediate'),
  ).toBe(true);
  expect(f.runs.map((run) => run.slug)).toEqual(['ada']);
});
