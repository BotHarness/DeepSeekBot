import { setImmediate as tick } from 'node:timers/promises';
import { afterEach, expect, it } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import type { MessagingInboundEvent, MessagingReplyRoute } from '../src/messaging/provider.js';
import type { OrchestratorAgentRun, BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

const fingerprint = 'c'.repeat(64);
const cores: BotHarnessCore[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

function dm(id: string, overrides: Partial<MessagingInboundEvent> = {}): MessagingInboundEvent {
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

function mention(id: string, mentioned = true): MessagingInboundEvent {
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

type Platform = 'feishu' | 'slack' | 'discord' | 'weixin';

async function fixture(
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
        'proactive-text-checked',
        'exclusive-text-consumer',
        'ordinary-text-consumer',
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
    runs,
    replies,
    query,
    settle,
    get subscriptions() {
      return subscriptions;
    },
    async receive(event: MessagingInboundEvent) {
      if (!consumer) throw new Error('Not subscribed');
      const result = await consumer.onEvent(
        { ...event, channel: platform },
        { signal: consumer.signal },
      );
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
    async update(input: { enabled?: boolean; newConversations?: 'auto' | 'ask' }) {
      const current = (await core.externalMessaging.snapshot('ada')).identities![0]!;
      await core.externalMessaging.identity('ada', {
        kind: 'update',
        id: current.id,
        expectedRevision: current.revision,
        name: current.name,
        enabled: input.enabled ?? current.enabled,
        ...(input.newConversations ? { newConversations: input.newConversations } : {}),
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
  };
}

function chatter(id: string, mentioned = false): MessagingInboundEvent {
  return { ...mention(id, mentioned), at: new Date(Date.now() + 1000).toISOString() };
}

async function connected() {
  const fx = await fixture();
  expect(fx.core.registry.create({ slug: 'bea', displayName: 'Bea' }).ok).toBe(true);
  await fx.receive(mention('first'));
  const group = fx.core.channels.createGroup({ name: 'Team', members: ['ada', 'bea'] });
  const before = fx.core.externalMessaging.inbound.ingests(group.id);
  expect(before.ingests).toEqual([]);
  expect(before.candidates).toEqual([
    {
      bindingId: fx.identity.id,
      botSlug: 'ada',
      platform: 'feishu',
      accountName: expect.any(String),
      conversations: [{ kind: 'group', id: 'oc_team', name: 'oc_team' }],
    },
  ]);
  await fx.core.externalMessaging.inbound.ingest(group.id, {
    kind: 'add',
    bindingId: fx.identity.id,
    conversation: { kind: 'group', id: 'oc_team' },
  });
  await fx.settle();
  const placed = () =>
    fx.query(
      `SELECT e.body, json_extract(e.payload_json, '$.external.ingestId') AS ingest
         FROM channel_placements p JOIN source_events e USING(source_event_id)
        WHERE p.channel_id = '${group.id}' ORDER BY p.revision`,
    ) as { body: string; ingest: string | null }[];
  const ingest = () => fx.core.externalMessaging.inbound.ingests(group.id).ingests[0]!;
  return { fx, group, placed, ingest };
}

it('streams every message of a connected group into the Channel as context without waking Bots', async () => {
  const { fx, placed, ingest } = await connected();
  expect(ingest()).toMatchObject({ state: 'waiting', enabled: true, wake: { mode: 'mentions' } });
  for (const id of ['a', 'b', 'c']) await fx.receive(chatter(id));
  expect(placed().map((row) => row.body)).toEqual(['chatter a', 'chatter b', 'chatter c']);
  expect(placed().every((row) => row.ingest === ingest().id)).toBe(true);
  expect(
    fx.query(
      `SELECT bot_slug, reason, wake_mode, wake_count FROM inbox_admissions
        WHERE source_event_id IN (SELECT source_event_id FROM channel_placements) ORDER BY bot_slug`,
    ),
  ).toEqual(
    ['ada', 'ada', 'ada', 'bea', 'bea', 'bea'].map((bot_slug) => ({
      bot_slug,
      reason: 'group-ordinary',
      wake_mode: 'mentions',
      wake_count: null,
    })),
  );
  expect(fx.runs).toHaveLength(1);
  expect(ingest()).toMatchObject({ state: 'receiving', lastMessageAt: expect.any(String) });
});

it('independent collection keeps a restricted Bot passive without transferring another member authority', async () => {
  const { fx, group, placed } = await connected();
  fx.core.externalMessaging.senderAccess('ada', {
    kind: 'policy',
    restricted: true,
    expectedRevision: 0,
  });
  const before = fx.runs.length;
  for (const id of ['passive-a', 'passive-b', 'passive-c']) await fx.receive(chatter(id));
  expect(placed()).toHaveLength(3);
  expect(
    fx.query(
      "SELECT wake_mode, source_policy_wake_mode, wake_count FROM inbox_admissions WHERE bot_slug = 'ada' AND source_policy_wake_mode = 'context'",
    ),
  ).toEqual(
    Array.from({ length: 3 }, () => ({
      wake_mode: 'silent',
      source_policy_wake_mode: 'context',
      wake_count: null,
    })),
  );
  expect(fx.runs).toHaveLength(before);
  expect(fx.core.externalMessaging.pairing.list('ada')).toHaveLength(0);
  await fx.receive(chatter('restricted-mention', true));
  expect(placed()).toHaveLength(3);
  expect(fx.runs).toHaveLength(before);
  expect(fx.core.externalMessaging.pairing.list('ada')[0]?.status).toBe('pending');
  fx.core.externalMessaging.senderAccess('bea', {
    kind: 'policy',
    restricted: true,
    expectedRevision: 0,
  });
  await fx.receive(chatter('other-member'));
  expect(
    fx.query(
      "SELECT a.bot_slug FROM inbox_admissions a JOIN source_events e USING(source_event_id) WHERE json_extract(e.payload_json, '$.external.event.messageId') = 'om-other-member'",
    ),
  ).toEqual([{ bot_slug: 'ada' }]);
  expect(fx.core.externalMessaging.inbound.ingests(group.id).ingests[0]?.enabled).toBe(true);
});

it('places a mention once and keeps it answerable through the bound app', async () => {
  const { fx, placed } = await connected();
  await fx.receive(chatter('ask', true));
  expect(placed()).toEqual([{ body: '@_user_1 question ask', ingest: null }]);
  expect(fx.runs).toHaveLength(2);
  await fx.core.externalMessaging.reply('ada', fx.sourceId('om-ask'), 'Answer');
  await fx.settle();
  expect(fx.replies.at(-1)?.text).toBe('Answer');
});

it('keeps streaming after a restart and stops on pause and delete while history stays', async () => {
  const { fx, group, placed, ingest } = await connected();
  await fx.receive(chatter('a'));
  await fx.restart();
  await fx.receive(chatter('b'));
  expect(placed()).toHaveLength(2);
  const inbound = () => fx.core.externalMessaging.inbound;
  await inbound().ingest(group.id, {
    kind: 'update',
    ingestId: ingest().id,
    expectedRevision: ingest().revision,
    enabled: false,
  });
  expect(ingest().state).toBe('paused');
  await fx.receive(chatter('c'));
  expect(placed()).toHaveLength(2);
  await expect(
    inbound().ingest(group.id, {
      kind: 'delete',
      ingestId: ingest().id,
      expectedRevision: 1,
    }),
  ).rejects.toThrow('ingest-changed');
  await inbound().ingest(group.id, {
    kind: 'delete',
    ingestId: ingest().id,
    expectedRevision: ingest().revision,
  });
  await fx.receive(chatter('d'));
  expect(placed().map((row) => row.body)).toEqual(['chatter a', 'chatter b']);
  expect(inbound().ingests(group.id).ingests).toEqual([]);
});

it('refuses unknown conversations and a second connection of the same group', async () => {
  const { fx, group } = await connected();
  await expect(
    fx.core.externalMessaging.inbound.ingest(group.id, {
      kind: 'add',
      bindingId: fx.identity.id,
      conversation: { kind: 'group', id: 'oc_other' },
    }),
  ).rejects.toThrow('conversation-unavailable');
  await expect(
    fx.core.externalMessaging.inbound.ingest(group.id, {
      kind: 'add',
      bindingId: fx.identity.id,
      conversation: { kind: 'group', id: 'oc_team' },
    }),
  ).rejects.toThrow('ingest-exists');
});

it('shows the real group name on the connection, the placed source and the bound entry', async () => {
  const { fx, group, ingest } = await connected();
  const named = (id: string, mentioned = false): MessagingInboundEvent => {
    const event = chatter(id, mentioned);
    return { ...event, conversation: { ...event.conversation, name: 'Team chat' } };
  };
  await fx.receive(named('a'));
  expect(ingest().conversation).toEqual({ kind: 'group', id: 'oc_team', name: 'Team chat' });
  await fx.receive(chatter('b'));
  expect(ingest().conversation.name).toBe('Team chat');
  await fx.receive(named('ask', true));
  expect(
    fx.query(
      `SELECT json_extract(e.payload_json, '$.external.conversationName') AS name,
              json_extract(e.payload_json, '$.external.event.conversation.id') AS id
         FROM channel_placements p JOIN source_events e USING(source_event_id)
        WHERE p.channel_id = '${group.id}' ORDER BY p.revision`,
    ),
  ).toEqual(['Team chat', 'Team chat', 'Team chat'].map((name) => ({ name, id: 'oc_team' })));
  expect(
    fx.query(
      "SELECT json_extract(body, '$.targetName') AS name FROM messaging_grants WHERE json_extract(body, '$.receiveScope.kind') = 'group'",
    ),
  ).toEqual([{ name: 'Team chat' }]);
});

it('checks the original ingress Binding before resolving a connected group sender Role', async () => {
  const { fx } = await connected();
  await fx.receive(chatter('sender-permissions'));
  const id = fx.sourceId('om-sender-permissions');
  const permissions = () => fx.core.externalMessaging.senderPermissions('ada', id);
  expect(permissions()).toMatchObject({ status: 'visitor', sender: { bindingId: fx.identity.id } });
  await fx.update({ enabled: false });
  expect(permissions()).toMatchObject({ status: 'unavailable', reason: 'identity-disabled' });
  await fx.update({ enabled: true });
  const current = (await fx.core.externalMessaging.snapshot('ada')).identities![0]!;
  await fx.core.externalMessaging.identity('ada', {
    kind: 'unbind',
    id: current.id,
    expectedRevision: current.revision,
  });
  await fx.core.externalMessaging.identity('ada', {
    kind: 'bind',
    providerId: 'dsh-im/feishu',
    accountRef: 'lark-app',
    fingerprint,
  });
  await fx.settle();
  expect(permissions()).toMatchObject({ status: 'unavailable', reason: 'binding-replaced' });
  await fx.receive(chatter('fresh-sender-permissions'));
  expect(
    fx.core.externalMessaging.senderPermissions('ada', fx.sourceId('om-fresh-sender-permissions')),
  ).toMatchObject({ status: 'visitor' });
});

it('does not guess a replacement Binding for legacy ingested sources without ingress evidence', async () => {
  const { fx } = await connected();
  await fx.receive(chatter('legacy-sender'));
  const id = fx.sourceId('om-legacy-sender');
  attachOperationalModule(fx.core.operationalDatabase, 'test').transaction((db) => {
    db.prepare(
      "UPDATE source_events SET payload_json = json_remove(payload_json, '$.external.ingressBindingId') WHERE source_event_id = ?",
    ).run(id);
  });
  expect(fx.core.externalMessaging.senderPermissions('ada', id)).toMatchObject({
    status: 'unavailable',
    reason: 'no-current-scoped-identity',
  });
});

it('rejects sender Role lookup after its Conversation Ingest is paused', async () => {
  const { fx, group, ingest } = await connected();
  await fx.receive(chatter('paused-ingest'));
  const current = ingest();
  await fx.core.externalMessaging.inbound.ingest(group.id, {
    kind: 'update',
    ingestId: current.id,
    expectedRevision: current.revision,
    enabled: false,
  });
  expect(
    fx.core.externalMessaging.senderPermissions('ada', fx.sourceId('om-paused-ingest')),
  ).toMatchObject({ status: 'unavailable', reason: 'ingest-disabled' });
});

it('resolves a shared ingested source from a different Group placement', async () => {
  const { fx, group } = await connected();
  const second = fx.core.channels.createGroup({ name: 'Second', members: ['ada', 'bea'] });
  await fx.core.externalMessaging.inbound.ingest(second.id, {
    kind: 'add',
    bindingId: fx.identity.id,
    conversation: { kind: 'group', id: 'oc_team' },
  });
  await fx.settle();
  await fx.receive(chatter('shared-permissions'));
  const id = fx.sourceId('om-shared-permissions');
  fx.core.channels.removeGroupMember(group.id, 'ada');
  expect(fx.core.externalMessaging.senderPermissions('ada', id)).toMatchObject({
    status: 'visitor',
  });
});
