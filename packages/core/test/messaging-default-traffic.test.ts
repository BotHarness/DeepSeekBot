import { setImmediate as tick } from 'node:timers/promises';
import { afterEach, expect, it } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import type { MessagingInboundEvent, MessagingReplyRoute } from '../src/messaging/provider.js';
import type { OrchestratorAgentRun, BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import type { MessagingIdentityInput } from '../src/messaging/identity.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
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

type Platform = 'feishu' | 'slack' | 'discord' | 'weixin' | 'qq';

function qqMention(id: string): MessagingInboundEvent {
  return dm(id, {
    channel: 'qq',
    at: new Date(Date.now() + 1000).toISOString(),
    conversation: { kind: 'group', id: 'qq-group' },
    mentionedAccount: true,
    mentions: [],
    reply: { messageId: `om-${id}`, conversationId: 'qq-group', actorId: 'ou_owner' },
  });
}

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

async function ordinaryRole(fx: Awaited<ReturnType<typeof fixture>>) {
  const methods = createBridgeMethods({ ...fx.core });
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
function fresh(event: MessagingInboundEvent): MessagingInboundEvent {
  return { ...event, at: new Date(Date.now() + 50).toISOString() };
}
function asActor(event: MessagingInboundEvent, actorId: string): MessagingInboundEvent {
  return {
    ...event,
    actor: { kind: 'user', id: actorId, name: actorId },
    reply: { ...event.reply, actorId },
  };
}

it('queries pageable current people, configured conversations and observed paired people without changing authority', async () => {
  const fx = await fixture();
  const role = await ordinaryRole(fx);
  const approve = async (actorId: string) => {
    await fx.receive(fresh(asActor(dm(`request-${actorId}`), actorId)));
    const request = fx.core.externalMessaging.pairing
      .list('ada')
      .find((p) => p.actorId === actorId)!;
    await fx.core.externalMessaging.reviewPairing('ada', {
      kind: 'approve',
      id: request.id,
      expectedRevision: request.revision,
      roleId: role.id,
      expectedRoleRevision: role.revision,
    });
  };
  await approve('ou_owner');
  await approve('ou_unobserved');
  expect(fx.runs).toEqual([]);
  await fx.receive(fresh(mention('directory-anchor')));
  const sourceEventId = fx.sourceId('om-directory-anchor');
  const query = fx.runs.at(-1)!.externalMessaging!.directory!;
  const before = {
    admissions: fx.admissions().length,
    replies: fx.replies.length,
    runs: fx.runs.length,
  };
  const first = query({ kind: 'people', limit: 1 });
  expect(first.rows).toHaveLength(1);
  expect(first.nextCursor).toBeDefined();
  const second = query({ kind: 'people', limit: 1, cursor: first.nextCursor! });
  expect(second.rows).toHaveLength(1);
  expect(second.nextCursor).toBeUndefined();
  expect([...first.rows, ...second.rows]).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ actorId: 'ou_owner', role }),
      expect.objectContaining({ actorId: 'ou_unobserved', role }),
    ]),
  );
  expect(() => query({ kind: 'conversations', cursor: first.nextCursor! })).toThrow(
    'directory-cursor-invalid',
  );
  expect(() => query({ kind: 'people', limit: 51 })).toThrow();
  expect(() => query({ kind: 'observed-people' })).toThrow('directory-source-required');
  expect(() => query({ kind: 'observed-people', sourceEventId: 'guessed' })).toThrow(
    'source-unavailable',
  );
  const conversations = query({ kind: 'conversations', limit: 1 });
  expect(conversations.nextCursor).toBeDefined();
  expect(
    query({ kind: 'conversations', limit: 1, cursor: conversations.nextCursor! }).rows,
  ).toHaveLength(1);
  expect(query({ kind: 'conversations' }).rows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        bindingId: fx.identity.id,
        conversation: expect.objectContaining({ id: 'oc_team' }),
        state: 'allowed',
      }),
    ]),
  );
  const observed = query({ kind: 'observed-people', sourceEventId });
  expect(observed.rows).toEqual([
    expect.objectContaining({
      actorId: 'ou_owner',
      role,
      firstObservedAt: expect.any(String),
      lastObservedAt: expect.any(String),
    }),
  ]);
  expect(observed.coverage).toMatchObject({
    incomplete: true,
    currentPlatformMembership: false,
    scanTruncated: false,
  });
  expect(fx.admissions()).toHaveLength(before.admissions);
  expect(fx.replies).toHaveLength(before.replies);
  expect(fx.runs).toHaveLength(before.runs);
  const request = fx.core.externalMessaging.pairing
    .list('ada')
    .find((p) => p.actorId === 'ou_owner')!;
  await fx.core.externalMessaging.reviewPairing('ada', {
    kind: 'revoke',
    id: request.id,
    expectedRevision: request.revision,
  });
  expect(query({ kind: 'people' }).rows).toEqual([
    expect.objectContaining({ actorId: 'ou_unobserved' }),
  ]);
  expect(query({ kind: 'observed-people', sourceEventId }).rows).toEqual([]);
  expect(fx.core.registry.create({ slug: 'grace', displayName: 'Grace' }).ok).toBe(true);
  expect(fx.core.externalMessaging.directory('grace', { kind: 'people' }).rows).toEqual([]);
  expect(() =>
    fx.core.externalMessaging.directory('grace', { kind: 'observed-people', sourceEventId }),
  ).toThrow('source-unavailable');
});

it('observations respect shared-source access and purge without treating other App identities as paired people', async () => {
  const fx = await fixture();
  const role = await ordinaryRole(fx);
  for (const actorId of ['ou_owner', 'ou_colleague']) {
    await fx.receive(fresh(asActor(dm(`request-${actorId}`), actorId)));
    const request = fx.core.externalMessaging.pairing
      .list('ada')
      .find((p) => p.actorId === actorId)!;
    await fx.core.externalMessaging.reviewPairing('ada', {
      kind: 'approve',
      id: request.id,
      expectedRevision: request.revision,
      roleId: role.id,
      expectedRoleRevision: role.revision,
    });
  }
  await fx.receive(fresh(mention('purge-anchor')));
  await fx.receive(fresh(asActor(mention('purge-colleague'), 'ou_colleague')));
  const anchor = fx.sourceId('om-purge-anchor');
  const colleague = fx.sourceId('om-purge-colleague');
  expect(
    fx.core.externalMessaging.directory('ada', { kind: 'observed-people', sourceEventId: anchor })
      .rows,
  ).toHaveLength(2);
  expect(fx.core.registry.create({ slug: 'grace', displayName: 'Grace' }).ok).toBe(true);
  const group = fx.core.channels.createGroup({
    name: 'Shared QA evidence',
    members: ['ada', 'grace'],
  });
  fx.core.externalMessaging.inbound.share('ada', colleague, group.id);
  expect(fx.core.externalMessaging.inbound.readShared('grace', colleague).event.actor.id).toBe(
    'ou_colleague',
  );
  expect(() =>
    fx.core.externalMessaging.directory('grace', {
      kind: 'observed-people',
      sourceEventId: colleague,
    }),
  ).toThrow('directory-scope-unavailable');
  fx.core.channels.deleteGroup(group.id);
  const preview = fx.core.contentPurge.preview(group.id, [colleague]);
  fx.core.contentPurge.confirm(group.id, preview.sourceEventIds, preview.token);
  expect(
    fx.core.externalMessaging.directory('ada', { kind: 'observed-people', sourceEventId: anchor })
      .rows,
  ).toEqual([expect.objectContaining({ actorId: 'ou_owner' })]);
  expect(() =>
    fx.core.externalMessaging.directory('ada', {
      kind: 'observed-people',
      sourceEventId: colleague,
    }),
  ).toThrow('content-purged');
  await fx.core.externalMessaging.identity('ada', {
    kind: 'unbind',
    id: fx.identity.id,
    expectedRevision: fx.identity.revision,
  });
  const replacement = await fx.core.externalMessaging.identity('ada', {
    kind: 'bind',
    providerId: 'dsh-im/feishu',
    accountRef: 'lark-app',
    fingerprint,
  });
  expect(replacement.id).not.toBe(fx.identity.id);
  expect(fx.core.externalMessaging.directory('ada', { kind: 'people' }).rows).toEqual([]);
  expect(fx.core.externalMessaging.directory('ada', { kind: 'conversations' }).rows).toEqual([]);
});

it('unknown Lark requests are bounded controls; Web ordinary-role review asks again and only fresh messages run', async () => {
  const fx = await fixture();
  const role = await ordinaryRole(fx);
  const blocked = fresh(dm('unknown', { text: 'PRIVATE BLOCKED BODY' }));
  await fx.receive(blocked);
  await fx.receive(blocked);
  expect(fx.runs).toHaveLength(0);
  expect(fx.admissions()).toEqual([]);
  expect(fx.query('SELECT * FROM source_events')).toEqual([]);
  expect(fx.query('SELECT * FROM assignments')).toEqual([]);
  const request = fx.core.externalMessaging.pairing.list('ada')[0]!;
  expect(request).toMatchObject({
    purpose: 'conversation',
    status: 'pending',
    capabilities: [],
    attempts: 1,
  });
  expect(JSON.stringify(request)).not.toContain(blocked.text);
  expect(fx.replies).toHaveLength(1);
  expect(fx.replies[0]!.text).not.toContain(blocked.text);
  const methods = createBridgeMethods({ ...fx.core });
  const review = {
    kind: 'approve' as const,
    id: request.id,
    expectedRevision: request.revision,
    roleId: role.id,
    expectedRoleRevision: role.revision,
  };
  expect(await methods.pairingReview({ slug: 'ada', input: review })).toMatchObject({
    ok: true,
    value: { pairing: { roleId: role.id, capabilities: [] } },
  });
  expect(fx.replies.at(-1)!.text).toContain('send your question again');
  expect(fx.runs).toHaveLength(0);
  await fx.receive(blocked);
  expect(fx.admissions()).toEqual([]);
  await fx.receive(fresh(dm('new')));
  expect(fx.runs).toHaveLength(1);
  expect(fx.runs[0]!.inbox).not.toContain('Colleague');
  expect(fx.runs[0]!.inbox).not.toContain(role.behavior);
  expect(fx.runs[0]!.inbox).toContain('lark-app-open-id');
  const permissions = fx.runs[0]!.externalMessaging!.senderPermissions!(fx.sourceId('om-new'));
  expect(permissions).toMatchObject({
    status: 'paired',
    role,
    policyRevision: 1,
    sender: { actorId: 'ou_owner', bindingId: fx.identity.id },
  });
  expect(Number.isFinite(Date.parse(permissions.queriedAt))).toBe(true);
  expect(() =>
    fx.core.externalMessaging.senderPermissions('another-bot', fx.sourceId('om-new')),
  ).toThrow();
  expect(() => fx.core.externalMessaging.senderPermissions('ada', 'guessed-source')).toThrow(
    'source-unavailable',
  );
  expect(fx.runs[0]!.inbox).not.toContain(blocked.text);
  expect(() =>
    fx.core.externalMessaging.pairing.assert('ada', fx.identity.id, 'ou_owner', 'approve'),
  ).toThrow('pairing-unauthorized');
  await fx.core.externalMessaging.reply('ada', fx.sourceId('om-new'), 'Fresh reply');
  expect(fx.replies.at(-1)).toMatchObject({
    route: { messageId: 'om-new', conversationId: 'oc_owner' },
    text: 'Fresh reply',
  });
  const paired = fx.core.externalMessaging.pairing.list('ada')[0]!;
  await methods.pairingReview({
    slug: 'ada',
    input: { kind: 'revoke', id: paired.id, expectedRevision: paired.revision },
  });
  expect(fx.core.externalMessaging.senderPermissions('ada', fx.sourceId('om-new'))).toMatchObject({
    status: 'revoked',
  });
  expect(
    fx.core.externalMessaging.senderPermissions('ada', fx.sourceId('om-new')).role,
  ).toBeUndefined();
  await fx.receive(fresh(dm('revoked')));
  expect(fx.runs).toHaveLength(1);
  expect(fx.admissions()).toHaveLength(1);
});

it('one active run refreshes role edits and reassignment while dated permission results and legacy management remain distinct', async () => {
  const fx = await fixture();
  const role = await ordinaryRole(fx);
  await fx.receive(fresh(dm('role-request')));
  const pending = fx.core.externalMessaging.pairing.list('ada')[0]!;
  fx.core.externalMessaging.pairing.review('ada', {
    kind: 'approve',
    id: pending.id,
    expectedRevision: pending.revision,
    roleId: role.id,
    expectedRoleRevision: role.revision,
  });
  await fx.receive(fresh(dm('role-question')));
  const lookup = fx.runs[0]!.externalMessaging!.senderPermissions!;
  const source = fx.sourceId('om-role-question');
  const prior = lookup(source);
  const edit = {
    kind: 'edit-role' as const,
    id: role.id,
    expectedRevision: role.revision,
    name: 'Reviewer',
    behavior: 'Read docs and reject approval requests only.',
    capabilities: ['reject' as const],
  };
  fx.core.externalMessaging.senderAccess('ada', edit);
  expect(lookup(source)).toMatchObject({
    role: { name: 'Reviewer', revision: 2, capabilities: ['reject'] },
    policyRevision: 2,
  });
  expect(prior).toMatchObject({
    role: { name: 'Colleague', revision: 1, capabilities: [] },
    policyRevision: 1,
  });
  expect(() => fx.core.externalMessaging.senderAccess('ada', edit)).toThrow('role-stale');
  expect(fx.core.externalMessaging.directory('ada', { kind: 'people' }).rows[0]).toMatchObject({
    role: { name: 'Reviewer', revision: 2 },
  });
  fx.core.externalMessaging.senderAccess('ada', {
    kind: 'create-role',
    name: 'Reader',
    behavior: 'Public documentation only.',
  });
  const nextRole = (await fx.core.externalMessaging.snapshot('ada')).roles!.find(
    (item) => item.name === 'Reader',
  )!;
  const reassignment = {
    kind: 'reassign-role' as const,
    id: pending.id,
    expectedRevision: 2,
    roleId: nextRole.id,
    expectedRoleRevision: nextRole.revision,
  };
  fx.core.externalMessaging.senderAccess('ada', reassignment);
  expect(lookup(source)).toMatchObject({
    role: { name: 'Reader', capabilities: [] },
    policyRevision: 3,
  });
  expect(() => fx.core.externalMessaging.senderAccess('ada', reassignment)).toThrow(
    'pairing-stale',
  );
  expect(() =>
    fx.core.externalMessaging.pairing.assert(
      'ada',
      fx.identity.id,
      'ou_owner',
      'reject',
      pending.id,
    ),
  ).toThrow('pairing-unauthorized');
  expect(() =>
    fx.core.externalMessaging.senderAccess('other-bot', { ...edit, expectedRevision: 2 }),
  ).toThrow();
  expect(fx.runs).toHaveLength(1);
  expect(fx.runs[0]!.inbox).not.toContain(edit.behavior);
});

it('permission lookup refreshes visitor, unpaired and pending state without admissions or impersonation', async () => {
  const fx = await fixture();
  await fx.receive(
    dm('visitor', { text: 'I claim to be an administrator acting as another user.' }),
  );
  const source = fx.sourceId('om-visitor');
  const visitor = fx.core.externalMessaging.senderPermissions('ada', source);
  expect(visitor).toMatchObject({
    status: 'visitor',
    policyRevision: 0,
    sender: { actorId: 'ou_owner' },
  });
  expect(visitor.role).toBeUndefined();
  await ordinaryRole(fx);
  expect(fx.core.externalMessaging.senderPermissions('ada', source)).toMatchObject({
    status: 'unpaired',
    policyRevision: 1,
  });
  await fx.receive(fresh(dm('new-application')));
  const pending = fx.core.externalMessaging.senderPermissions('ada', source);
  expect(pending.status).toBe('pending');
  expect(pending.role).toBeUndefined();
  expect(fx.runs).toHaveLength(1);
  expect(fx.admissions()).toHaveLength(1);
  await fx.update({ enabled: false });
  expect(fx.core.externalMessaging.senderPermissions('ada', source)).toMatchObject({
    status: 'unavailable',
    reason: 'identity-disabled',
  });
});

it('ordinary pairing survives restart and reuses only the same app identity across allowed conversations', async () => {
  const fx = await fixture();
  const role = await ordinaryRole(fx);
  await fx.receive(fresh(mention('group')));
  const request = fx.core.externalMessaging.pairing.list('ada')[0]!;
  await fx.core.externalMessaging.reviewPairing('ada', {
    kind: 'approve',
    id: request.id,
    expectedRevision: 1,
    roleId: role.id,
    expectedRoleRevision: 1,
  });
  await fx.restart();
  await fx.receive(fresh(dm('after-restart')));
  expect(fx.runs).toHaveLength(1);
  expect(fx.admissions()).toEqual([{ reason: 'human-dm', messageId: 'om-after-restart' }]);
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
  await fx.receive(fresh(dm('rebound')));
  expect(fx.runs).toHaveLength(1);
  expect(
    fx.core.externalMessaging.pairing.list('ada').filter((item) => item.status === 'pending'),
  ).toHaveLength(1);
});

it('failed re-ask notification preserves approval and stale review never launches or replays a request', async () => {
  const fx = await fixture();
  const role = await ordinaryRole(fx);
  await fx.receive(fresh(dm('failure')));
  const request = fx.core.externalMessaging.pairing.list('ada')[0]!;
  fx.prepareReply(async () => {
    throw new Error('offline');
  });
  const input = {
    kind: 'approve' as const,
    id: request.id,
    expectedRevision: 1,
    roleId: role.id,
    expectedRoleRevision: 1,
  };
  const approved = await fx.core.externalMessaging.reviewPairing('ada', input);
  expect(approved.status).toBe('approved');
  expect(approved.notifications?.at(-1)).toMatchObject({ outcome: 'unconfirmed', attempts: 1 });
  await expect(fx.core.externalMessaging.reviewPairing('ada', input)).rejects.toThrow(
    'pairing-stale',
  );
  expect(fx.runs).toEqual([]);
  expect(fx.admissions()).toEqual([]);
  fx.prepareReply(async () => {});
  await fx.receive(fresh(dm('later')));
  expect(fx.runs).toHaveLength(1);
});

it('ordinary group text creates no pairing request or wake contribution for a restricted Bot', async () => {
  const fx = await fixture();
  await ordinaryRole(fx);
  for (let n = 0; n < 8; n++) await fx.receive(fresh(mention(`ordinary-${n}`, false)));
  expect(fx.core.externalMessaging.pairing.list('ada')).toEqual([]);
  expect(fx.admissions()).toEqual([]);
  expect(fx.runs).toEqual([]);
});

it.each(['restrict', 'revoke'] as const)(
  'pending collected messages close with a supported durable state on %s',
  async (action) => {
    const fx = await fixture();
    let pairing;
    if (action === 'revoke') {
      const role = await ordinaryRole(fx);
      await fx.receive(fresh(dm('pending-pair')));
      pairing = fx.core.externalMessaging.pairing.list('ada')[0]!;
      fx.core.externalMessaging.pairing.review('ada', {
        kind: 'approve',
        id: pairing.id,
        expectedRevision: pairing.revision,
        roleId: role.id,
        expectedRoleRevision: role.revision,
      });
    }
    await fx.receive(fresh(mention('pending-bootstrap')));
    const {
      revision,
      changedAt: _at,
      ...preferences
    } = fx.core.externalMessaging.defaults('feishu');
    await fx.core.externalMessaging.setDefaults({
      ...preferences,
      expectedRevision: revision,
      collection: 'all',
      wake: 'digest',
      count: 100,
      intervalSeconds: 86400,
    });
    await fx.receive(fresh(mention('pending-collected', false)));
    const source = fx.sourceId('om-pending-collected');
    expect(
      fx.query(`SELECT attempt_state FROM inbox_admissions WHERE source_event_id = '${source}'`),
    ).toEqual([{ attempt_state: 'pending' }]);
    const runs = fx.runs.length;
    if (pairing)
      fx.core.externalMessaging.pairing.review('ada', {
        kind: 'revoke',
        id: pairing.id,
        expectedRevision: 2,
      });
    else await ordinaryRole(fx);
    expect(
      fx.query(
        `SELECT attempt_state, wake_count, wake_interval_ms, ignored_at IS NOT NULL AS ignored FROM inbox_admissions WHERE source_event_id = '${source}'`,
      ),
    ).toEqual([{ attempt_state: 'handled', wake_count: null, wake_interval_ms: null, ignored: 1 }]);
    await fx.restart();
    expect(fx.runs).toHaveLength(runs);
  },
);

it('automatic pairing acknowledges intake before a checked reply enters the Provider transition queue', async () => {
  const fx = await fixture();
  await ordinaryRole(fx);
  let intakeReturned = false;
  fx.prepareReply(async () => {
    if (!intakeReturned) throw new Error('provider-transition-still-locked');
  });
  await fx.receive(fresh(dm('queue-fence')), () => {
    intakeReturned = true;
  });
  expect(fx.replies).toHaveLength(1);
  expect(fx.core.externalMessaging.pairing.list('ada')[0]!.notifications?.[0]?.outcome).toBe(
    'accepted',
  );
  expect(fx.admissions()).toEqual([]);
});

it('restricted chatting preserves explicit management pairing without granting ordinary chat eligibility', async () => {
  const fx = await fixture();
  await ordinaryRole(fx);
  await fx.receive(fresh({ ...dm('management'), text: '/pair' }));
  const management = fx.core.externalMessaging.pairing.list('ada')[0]!;
  expect(management.purpose ?? 'management').toBe('management');
  await fx.core.externalMessaging.reviewPairing('ada', {
    kind: 'approve',
    id: management.id,
    expectedRevision: management.revision,
    capabilities: ['approve'],
  });
  expect(() =>
    fx.core.externalMessaging.pairing.assert('ada', fx.identity.id, 'ou_owner', 'approve'),
  ).not.toThrow();
  await fx.receive(fresh(dm('still-needs-chat-role')));
  expect(fx.runs).toEqual([]);
  expect(fx.admissions()).toEqual([]);
  expect(
    fx.core.externalMessaging.pairing.list('ada').filter((item) => item.purpose === 'conversation'),
  ).toMatchObject([{ status: 'pending', capabilities: [] }]);
});

it('chat review refuses a different Bot role and an outdated role revision', async () => {
  const fx = await fixture();
  const ownRole = await ordinaryRole(fx);
  expect(fx.core.registry.create({ slug: 'grace', displayName: 'Grace' }).ok).toBe(true);
  fx.core.externalMessaging.senderAccess('grace', {
    kind: 'create-role',
    name: 'Other Bot role',
    behavior: 'Another Bot policy',
  });
  const foreignRole = (await fx.core.externalMessaging.snapshot('grace')).roles![0]!;
  await fx.receive(fresh(dm('role-review')));
  const request = fx.core.externalMessaging.pairing.list('ada')[0]!;
  for (const role of [foreignRole, { ...ownRole, revision: ownRole.revision + 1 }])
    await expect(
      fx.core.externalMessaging.reviewPairing('ada', {
        kind: 'approve',
        id: request.id,
        expectedRevision: request.revision,
        roleId: role.id,
        expectedRoleRevision: role.revision,
      }),
    ).rejects.toThrow('role-stale');
  expect(fx.core.externalMessaging.pairing.list('ada')[0]!.status).toBe('pending');
  expect(fx.runs).toEqual([]);
});

it('a bound Lark app admits a DM to the Inbox with no saved target and replies in the same DM', async () => {
  const fx = await fixture();
  expect(fx.identity.newConversations).toBe('auto');
  const snapshot = await fx.core.externalMessaging.snapshot('ada');
  expect(snapshot.identities?.[0]).toMatchObject({ reception: 'receiving' });
  expect(snapshot.grants).toEqual([]);
  await expect(fx.receive(dm('1'))).resolves.toEqual({ accepted: true });
  expect(fx.entries()).toEqual([
    { origin: 'implicit', kind: 'dm', conversation: 'oc_owner', revoked_at: null },
  ]);
  expect(fx.admissions()).toEqual([{ reason: 'human-dm', messageId: 'om-1' }]);
  expect(fx.runs).toHaveLength(1);
  expect(fx.runs[0]!.inbox).toContain('hello 1');
  await fx.core.externalMessaging.reply('ada', fx.sourceId('om-1'), 'Hi from Ada');
  await fx.settle();
  expect(fx.replies).toEqual([
    {
      route: { messageId: 'om-1', conversationId: 'oc_owner', actorId: 'ou_owner' },
      text: 'Hi from Ada',
    },
  ]);
  const after = await fx.core.externalMessaging.snapshot('ada');
  expect(after.grants).toHaveLength(1);
  expect(after.grants[0]).toMatchObject({
    origin: 'implicit',
    targetName: 'Owner',
    canPost: false,
    reception: 'receiving',
    lastMessageAt: expect.any(String),
  });
  await fx.receive(dm('1'));
  await fx.receive(dm('2'));
  expect(fx.entries()).toHaveLength(1);
  expect(fx.admissions()).toEqual([
    { reason: 'human-dm', messageId: 'om-1' },
    { reason: 'human-dm', messageId: 'om-2' },
  ]);
});

it('admits a group mention and replies in its topic, but leaves unmentioned group text alone', async () => {
  const fx = await fixture();
  await fx.receive(mention('quiet', false));
  expect(fx.entries()).toEqual([]);
  expect(fx.admissions()).toEqual([]);
  await fx.receive(mention('ask'));
  expect(fx.entries()).toEqual([
    { origin: 'implicit', kind: 'group', conversation: 'oc_team', revoked_at: null },
  ]);
  expect(fx.admissions()).toEqual([{ reason: 'group-mention', messageId: 'om-ask' }]);
  await fx.receive(mention('quiet-2', false));
  expect(fx.admissions()).toHaveLength(1);
  await fx.core.externalMessaging.reply('ada', fx.sourceId('om-ask'), 'Answer');
  await fx.settle();
  expect(fx.replies[0]?.route).toMatchObject({
    conversationId: 'oc_team',
    threadId: 'omt-topic',
    rootId: 'om-root',
  });
});

it('a bound QQ app admits one trusted group mention without a saved target and replies in that group', async () => {
  const fx = await fixture('qq');
  const incoming = dm('qq-mention', {
    at: new Date(Date.now() + 1000).toISOString(),
    conversation: { kind: 'group', id: 'qq-group-openid' },
    actor: { kind: 'user', id: 'qq-member-openid' },
    mentions: [],
    mentionedAccount: true,
    text: 'Please answer in this QQ group',
    reply: {
      messageId: 'om-qq-mention',
      conversationId: 'qq-group-openid',
      actorId: 'qq-member-openid',
    },
  });
  expect((await fx.core.externalMessaging.snapshot('ada')).grants).toEqual([]);
  await expect(fx.receive(incoming)).resolves.toEqual({ accepted: true });
  const attention = fx.core.attention.list({ botSlug: 'ada' }).items;
  expect(attention).toHaveLength(1);
  expect(attention[0]).toMatchObject({
    reason: 'group-mention',
    externalOrigin: {
      platform: 'qq',
      conversationId: 'qq-group-openid',
      senderId: 'qq-member-openid',
    },
  });
  expect(fx.runs).toHaveLength(1);
  expect(fx.runs[0]!.inbox).toContain('Please answer in this QQ group');
  await fx.core.externalMessaging.reply('ada', attention[0]!.id, 'Answer from Ada');
  await fx.settle();
  expect(fx.replies).toEqual([{ route: incoming.reply, text: 'Answer from Ada' }]);
  expect(fx.core.externalMessaging.history('ada')[0]).toMatchObject({
    state: 'provider-accepted',
    receipt: { conversationId: 'qq-group-openid', messageId: 'reply-om-qq-mention' },
  });
  await fx.receive(incoming);
  expect(fx.core.attention.list({ botSlug: 'ada' }).items).toHaveLength(1);
  expect(fx.runs).toHaveLength(1);
  expect((await fx.core.externalMessaging.snapshot('ada')).grants).toHaveLength(1);
});

it('refuses unqualified QQ private traffic without admitting or running it', async () => {
  const fx = await fixture('qq');
  await expect(fx.receive(dm('private'))).rejects.toMatchObject({ code: 'untrusted-source' });
  await expect(
    fx.receive(
      dm('thread', {
        conversation: { kind: 'group', id: 'qq-group' },
        reply: {
          messageId: 'source',
          conversationId: 'qq-group',
          actorId: 'member',
          threadId: 'thread',
        },
      }),
    ),
  ).rejects.toMatchObject({ code: 'untrusted-source' });
  expect(fx.core.attention.list({ botSlug: 'ada' }).items).toEqual([]);
  expect((await fx.core.externalMessaging.snapshot('ada')).grants).toEqual([]);
  expect(fx.runs).toEqual([]);
});

it('QQ admission is atomic and a rejected admission can be redelivered exactly once', async () => {
  const fx = await fixture('qq');
  const db = attachOperationalModule(fx.core.operationalDatabase, 'qq-admission-fault');
  db.transaction((raw) =>
    raw.exec(
      "CREATE TRIGGER reject_qq BEFORE INSERT ON inbox_admissions BEGIN SELECT RAISE(ABORT, 'fixture admission failure'); END;",
    ),
  );
  await expect(fx.receive(qqMention('atomic'))).rejects.toThrow();
  expect(fx.admissions()).toEqual([]);
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toEqual([]);
  expect(fx.runs).toEqual([]);
  db.transaction((raw) => raw.exec('DROP TRIGGER reject_qq'));
  await fx.receive(qqMention('atomic'));
  await fx.receive(qqMention('atomic'));
  expect(fx.admissions()).toHaveLength(1);
  expect(fx.runs).toHaveLength(1);
});

it('QQ keeps canonical sources across restart and fences paused, blocked and unbound intake', async () => {
  const fx = await fixture('qq');
  await fx.receive(qqMention('first'));
  await fx.restart();
  await fx.receive(qqMention('first'));
  expect(fx.admissions()).toHaveLength(1);
  expect(fx.subscriptions).toBe(1);
  await fx.update({ enabled: false });
  expect(fx.subscriptions).toBe(0);
  await fx.update({ enabled: true });
  fx.core.registry.setPaused('ada', true);
  await expect(fx.receive(qqMention('paused'))).rejects.toThrow('consumer-unavailable');
  fx.core.registry.setPaused('ada', false);
  await fx.receive(qqMention('second'));
  const grant = await grantFor(fx, 'qq-group');
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'block',
    grantId: grant.id,
    expectedRevision: grant.revision,
  });
  await fx.settle();
  await fx.receive(qqMention('blocked'));
  await fx.restart();
  await fx.receive(qqMention('blocked-after-restart'));
  expect(fx.admissions()).toHaveLength(2);
  await expect(
    fx.core.externalMessaging.reply('ada', fx.sourceId('om-second'), 'too late'),
  ).rejects.toThrow();
  expect(fx.replies).toEqual([]);
  const current = (await fx.core.externalMessaging.snapshot('ada')).identities![0]!;
  await fx.core.externalMessaging.identity('ada', {
    kind: 'unbind',
    id: current.id,
    expectedRevision: current.revision,
  });
  await fx.settle();
  expect(fx.subscriptions).toBe(0);
  expect(fx.entries().every((row) => (row as { revoked_at: unknown }).revoked_at !== null)).toBe(
    true,
  );
});

it('QQ retains an unknown native reply outcome across restart and never blindly resends', async () => {
  const fx = await fixture('qq');
  let sends = 0;
  fx.service.replyChecked = async () => {
    sends++;
    throw Object.assign(new Error('uncertain'), { code: 'reply-result-unknown' });
  };
  await fx.receive(qqMention('uncertain'));
  const id = fx.sourceId('om-uncertain');
  const outcome = await fx.core.externalMessaging.reply('ada', id, 'one answer');
  expect(outcome.state).toBe('unknown-outcome');
  await fx.restart();
  expect(await fx.core.externalMessaging.reply('ada', id, 'one answer')).toEqual(outcome);
  expect(sends).toBe(1);
  expect(fx.core.externalMessaging.history('ada')[0]?.state).toBe('unknown-outcome');
});

it('keeps /pair with pairing and admits nothing for it', async () => {
  const fx = await fixture();
  await fx.receive(dm('pair', { text: '/pair' }));
  expect(fx.admissions()).toEqual([]);
  expect(fx.entries()).toEqual([]);
  expect((await fx.core.externalMessaging.snapshot('ada')).pairings).toHaveLength(1);
});

it('admits nothing from new conversations in ask mode while existing entries keep working', async () => {
  const fx = await fixture();
  await fx.receive(dm('1'));
  await fx.update({ newConversations: 'ask' });
  expect((await fx.core.externalMessaging.snapshot('ada')).identities?.[0]).toMatchObject({
    newConversations: 'ask',
  });
  await fx.receive(mention('new-group'));
  expect(fx.entries()).toHaveLength(1);
  await fx.receive(dm('2'));
  expect(fx.admissions().map((row) => (row as { messageId: string }).messageId)).toEqual([
    'om-1',
    'om-2',
  ]);
});

it('keeps entries across a restart and keeps admitting without duplicates', async () => {
  const fx = await fixture();
  await fx.receive(dm('1'));
  await fx.restart();
  await fx.receive(dm('1'));
  await fx.receive(dm('2'));
  expect(fx.entries()).toHaveLength(1);
  expect(fx.admissions()).toHaveLength(2);
  expect(fx.subscriptions).toBe(1);
});

it('stops admission on pause and invalidates entries on unbind', async () => {
  const fx = await fixture();
  await fx.receive(dm('1'));
  await fx.update({ enabled: false });
  expect(fx.subscriptions).toBe(0);
  await fx.update({ enabled: true });
  await fx.receive(dm('2'));
  expect(fx.admissions()).toHaveLength(2);
  const current = (await fx.core.externalMessaging.snapshot('ada')).identities![0]!;
  await fx.core.externalMessaging.identity('ada', {
    kind: 'unbind',
    id: current.id,
    expectedRevision: current.revision,
  });
  await fx.settle();
  expect(fx.subscriptions).toBe(0);
  expect(fx.entries()).toEqual([
    {
      origin: 'implicit',
      kind: 'dm',
      conversation: 'oc_owner',
      revoked_at: expect.any(String),
    },
  ]);
  await expect(
    fx.core.externalMessaging.reply('ada', fx.sourceId('om-2'), 'too late'),
  ).rejects.toThrow();
});

it.each(['slack', 'discord'] as const)(
  'a bound %s app admits DMs and mentions and replies in place',
  async (platform) => {
    const fx = await fixture(platform);
    expect((await fx.core.externalMessaging.snapshot('ada')).identities?.[0]).toMatchObject({
      reception: 'receiving',
    });
    await fx.receive(dm('1'));
    await fx.receive(mention('quiet', false));
    await fx.receive(mention('ask'));
    expect(fx.entries()).toEqual([
      { origin: 'implicit', kind: 'dm', conversation: 'oc_owner', revoked_at: null },
      { origin: 'implicit', kind: 'group', conversation: 'oc_team', revoked_at: null },
    ]);
    expect(fx.admissions()).toEqual([
      { reason: 'human-dm', messageId: 'om-1' },
      { reason: 'group-mention', messageId: 'om-ask' },
    ]);
    await fx.core.externalMessaging.reply('ada', fx.sourceId('om-1'), 'DM answer');
    await fx.core.externalMessaging.reply('ada', fx.sourceId('om-ask'), 'Topic answer');
    await fx.settle();
    expect(fx.replies.map((item) => item.route)).toEqual([
      { messageId: 'om-1', conversationId: 'oc_owner', actorId: 'ou_owner' },
      expect.objectContaining({ conversationId: 'oc_team', threadId: 'omt-topic' }),
    ]);
  },
);

it('WeChat inherits future defaults, preserves overrides and authority, and restores inheritance across restart', async () => {
  const fx = await fixture('weixin', [
    { targetId: 'owner', name: 'QR paired owner', kind: 'user', route: { toUserId: 'oc_owner' } },
  ]);
  const identity = async () => (await fx.core.externalMessaging.snapshot('ada')).identities![0]!;
  const defaults = async (identityEnabled: boolean, typingEnabled: boolean) => {
    const {
      revision,
      changedAt: _at,
      ...preferences
    } = fx.core.externalMessaging.defaults('weixin');
    await fx.core.externalMessaging.setDefaults({
      ...preferences,
      expectedRevision: revision,
      identityEnabled,
      typingEnabled,
    });
    await fx.settle();
  };
  const fresh = (id: string) => dm(id, { at: new Date(Date.now() + 1000).toISOString() });
  expect(await identity()).toMatchObject({
    enabledInheritance: 'inherit',
    typingInheritance: 'inherit',
    typingEnabled: true,
  });
  await fx.receive(fresh('inherited'));
  expect(fx.admissions()).toHaveLength(1);
  const entries = fx.entries();
  await defaults(false, false);
  expect(await identity()).toMatchObject({ enabled: false, typingEnabled: false });
  expect(fx.entries()).toEqual(entries);
  await fx.update({ enabled: true, typingEnabled: true });
  expect(await identity()).toMatchObject({
    enabled: true,
    enabledInheritance: 'custom',
    typingEnabled: true,
    typingInheritance: 'custom',
  });
  await fx.receive(fresh('custom'));
  await defaults(true, false);
  expect(await identity()).toMatchObject({
    enabled: true,
    typingEnabled: true,
    typingInheritance: 'custom',
  });
  await fx.update({ inheritEnabled: true, inheritTyping: true });
  expect(await identity()).toMatchObject({
    enabled: true,
    typingEnabled: false,
    enabledInheritance: 'inherit',
    typingInheritance: 'inherit',
  });
  await defaults(false, false);
  await defaults(true, true);
  await fx.restart();
  expect(await identity()).toMatchObject({
    enabled: true,
    typingEnabled: true,
    enabledInheritance: 'inherit',
    typingInheritance: 'inherit',
  });
  await fx.receive(dm('old-disabled-time'));
  await fx.receive(fresh('restored'));
  await fx.receive(
    dm('stranger-after-defaults', {
      conversation: { kind: 'dm', id: 'oc_stranger' },
      reply: {
        messageId: 'om-stranger-after-defaults',
        conversationId: 'oc_stranger',
        actorId: 'ou_owner',
      },
    }),
  );
  await fx.receive(mention('unsupported-group'));
  expect(fx.admissions()).toEqual([
    { reason: 'human-dm', messageId: 'om-inherited' },
    { reason: 'human-dm', messageId: 'om-custom' },
    { reason: 'human-dm', messageId: 'om-restored' },
  ]);
  expect(fx.entries()).toEqual(entries);
  await fx.core.externalMessaging.reply('ada', fx.sourceId('om-restored'), '912 restored owner');
  expect(fx.replies.at(-1)?.route).toMatchObject({
    conversationId: 'oc_owner',
    messageId: 'om-restored',
  });
});

it('WeChat resumes only future owner DMs before any conversation Grant exists', async () => {
  const fx = await fixture('weixin', [
    { targetId: 'owner', name: 'QR paired owner', kind: 'user', route: { toUserId: 'oc_owner' } },
  ]);
  for (const identityEnabled of [false, true]) {
    const {
      revision,
      changedAt: _at,
      ...preferences
    } = fx.core.externalMessaging.defaults('weixin');
    await fx.core.externalMessaging.setDefaults({
      ...preferences,
      expectedRevision: revision,
      identityEnabled,
    });
    await fx.settle();
  }
  expect(fx.entries()).toEqual([]);
  await fx.restart();
  await fx.receive(dm('old-before-first-grant'));
  expect(fx.entries()).toEqual([]);
  expect(fx.admissions()).toEqual([]);
  await fx.receive(dm('fresh-first-grant', { at: new Date(Date.now() + 1000).toISOString() }));
  expect(fx.admissions()).toEqual([{ reason: 'human-dm', messageId: 'om-fresh-first-grant' }]);
});

it.each(['implicit', 'explicit'] as const)(
  'WeChat explicit identity resume fences an existing %s Grant',
  async (origin) => {
    const fx = await fixture('weixin', [
      { targetId: 'owner', name: 'QR paired owner', kind: 'user', route: { toUserId: 'oc_owner' } },
    ]);
    if (origin === 'explicit') {
      const targets = await fx.core.externalMessaging.targets('dsh-im/weixin', 'lark-app');
      const grant = await fx.core.externalMessaging.authorize({
        botSlug: 'ada',
        providerId: 'dsh-im/weixin',
        accountRef: 'lark-app',
        targetRef: 'owner',
        fingerprint,
        targetDigest: targets[0]!.digest,
      });
      await fx.core.externalMessaging.inbound.setEnabled('ada', grant.id, true);
      await fx.settle();
    }
    await fx.receive(dm('before-explicit-pause'));
    expect(fx.admissions()).toHaveLength(1);
    const entries = fx.entries();
    await fx.update({ enabled: false });
    await fx.update({ inheritEnabled: true });
    await fx.restart();
    await fx.receive(dm('late-explicit-pause'));
    await fx.receive(
      dm('fresh-explicit-resume', { at: new Date(Date.now() + 1000).toISOString() }),
    );
    expect(fx.admissions()).toEqual([
      { reason: 'human-dm', messageId: 'om-before-explicit-pause' },
      { reason: 'human-dm', messageId: 'om-fresh-explicit-resume' },
    ]);
    expect(fx.entries()).toEqual(entries);
  },
);

it('a bound WeChat app admits only its paired owner DM', async () => {
  const fx = await fixture('weixin', [
    { targetId: 'owner', name: 'QR paired owner', kind: 'user', route: { toUserId: 'oc_owner' } },
  ]);
  await fx.receive(
    dm('stranger', {
      conversation: { kind: 'dm', id: 'oc_stranger' },
      reply: { messageId: 'om-stranger', conversationId: 'oc_stranger', actorId: 'ou_owner' },
    }),
  );
  await fx.receive(mention('group'));
  expect(fx.entries()).toEqual([]);
  await fx.receive(dm('1'));
  expect(fx.entries()).toEqual([
    { origin: 'implicit', kind: 'dm', conversation: 'oc_owner', revoked_at: null },
  ]);
  expect(fx.admissions()).toEqual([{ reason: 'human-dm', messageId: 'om-1' }]);
  await fx.core.externalMessaging.reply('ada', fx.sourceId('om-1'), 'Hi owner');
  await fx.settle();
  expect(fx.replies).toHaveLength(1);
});

it('a recorded group follows the platform default: collecting all text admits unmentioned messages', async () => {
  const fx = await fixture();
  await fx.receive(mention('ask'));
  await fx.receive(mention('quiet', false));
  expect(fx.admissions()).toHaveLength(1);
  const defaults = fx.core.externalMessaging.defaults('feishu');
  const { revision, changedAt: _at, ...preferences } = defaults;
  await fx.core.externalMessaging.setDefaults({
    ...preferences,
    expectedRevision: revision,
    collection: 'all',
  });
  await fx.settle();
  await fx.receive(mention('chatter', false));
  expect(fx.admissions()).toEqual([
    { reason: 'group-mention', messageId: 'om-ask' },
    { reason: 'group-ordinary', messageId: 'om-chatter' },
  ]);
});

async function grantFor(fx: Awaited<ReturnType<typeof fixture>>, conversation: string) {
  const snapshot = await fx.core.externalMessaging.snapshot('ada');
  return snapshot.grants.find(
    (grant) => !grant.revokedAt && grant.receiveScope?.conversationId === conversation,
  )!;
}

it('blocking an entry stops admission and survives restart and rebind; allowing again admits only new messages', async () => {
  const fx = await fixture();
  await fx.receive(mention('ask'));
  const grant = await grantFor(fx, 'oc_team');
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'block',
    grantId: grant.id,
    expectedRevision: grant.revision,
  });
  await fx.settle();
  await fx.receive(mention('after-block'));
  expect(fx.admissions()).toEqual([{ reason: 'group-mention', messageId: 'om-ask' }]);
  await fx.restart();
  await fx.receive(mention('after-restart'));
  expect(fx.admissions()).toHaveLength(1);
  const snapshot = await fx.core.externalMessaging.snapshot('ada');
  expect(snapshot.blockedConversations).toEqual([
    expect.objectContaining({
      conversation: { kind: 'group', id: 'oc_team' },
      bindingId: snapshot.identities![0]!.id,
      revision: 1,
    }),
  ]);
  const identity = snapshot.identities![0]!;
  await fx.core.externalMessaging.identity('ada', {
    kind: 'unbind',
    id: identity.id,
    expectedRevision: identity.revision,
  });
  await fx.settle();
  const rebound = await fx.core.externalMessaging.identity('ada', {
    kind: 'bind',
    providerId: 'dsh-im/feishu',
    accountRef: 'lark-app',
    fingerprint,
  });
  await fx.settle();
  await fx.receive(mention('after-rebind'));
  expect(fx.admissions()).toHaveLength(1);
  const blocked = (await fx.core.externalMessaging.snapshot('ada')).blockedConversations![0]!;
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'allow',
    bindingId: rebound.id,
    conversation: blocked.conversation,
    from: 'blocked',
    expectedRevision: blocked.revision,
  });
  await fx.settle();
  expect((await fx.core.externalMessaging.snapshot('ada')).blockedConversations).toEqual([]);
  await fx.receive({ ...mention('allowed'), at: new Date(Date.now() + 1000).toISOString() });
  expect(
    fx
      .admissions()
      .map((row) => (row as { messageId: string }).messageId)
      .sort(),
  ).toEqual(['om-allowed', 'om-ask']);
});

it('a stale revision is refused and blocking revokes the old reply route', async () => {
  const fx = await fixture();
  await fx.receive(dm('1'));
  const grant = await grantFor(fx, 'oc_owner');
  await expect(
    fx.core.externalMessaging.conversation('ada', {
      kind: 'block',
      grantId: grant.id,
      expectedRevision: grant.revision + 5,
    }),
  ).rejects.toMatchObject({ code: 'conversation-stale' });
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'block',
    grantId: grant.id,
    expectedRevision: grant.revision,
  });
  await fx.settle();
  await expect(
    fx.core.externalMessaging.reply('ada', fx.sourceId('om-1'), 'too late'),
  ).rejects.toThrow();
  expect(fx.replies).toEqual([]);
});

it('QQ blocking during native preparation fences dispatch through replyChecked', async () => {
  const fx = await fixture('qq');
  await fx.receive(qqMention('send-race'));
  let prepared!: () => void;
  let resume!: () => void;
  const preparing = new Promise<void>((resolve) => {
    prepared = resolve;
  });
  const continueDispatch = new Promise<void>((resolve) => {
    resume = resolve;
  });
  fx.prepareReply(async () => {
    prepared();
    await continueDispatch;
  });
  const pending = fx.core.externalMessaging.reply('ada', fx.sourceId('om-send-race'), 'too late');
  const settled = pending.catch(() => undefined);
  await preparing;
  const grant = await grantFor(fx, 'qq-group');
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'block',
    grantId: grant.id,
    expectedRevision: grant.revision,
  });
  resume();
  await settled;
  await fx.settle();
  expect(fx.replies).toEqual([]);
  expect((await fx.core.externalMessaging.snapshot('ada')).blockedConversations).toHaveLength(1);
});

it('a muted entry is admitted silently without a run and can still be answered', async () => {
  const fx = await fixture();
  await fx.receive(mention('ask'));
  expect(fx.runs).toHaveLength(1);
  const grant = await grantFor(fx, 'oc_team');
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'mute',
    grantId: grant.id,
    expectedRevision: grant.preferenceRevision ?? 0,
    muted: true,
  });
  await fx.settle();
  expect(await grantFor(fx, 'oc_team')).toMatchObject({ muted: true, revision: grant.revision });
  await fx.receive(mention('muted'));
  expect(fx.runs).toHaveLength(1);
  expect(
    fx.query(
      "SELECT a.wake_mode FROM inbox_admissions a JOIN source_events e USING(source_event_id) WHERE json_extract(e.payload_json, '$.external.event.messageId') = 'om-muted'",
    ),
  ).toEqual([{ wake_mode: 'silent' }]);
  await fx.core.externalMessaging.reply('ada', fx.sourceId('om-muted'), 'Seen');
  await fx.settle();
  expect(fx.replies.map((item) => item.text)).toEqual(['Seen']);
  const muted = await grantFor(fx, 'oc_team');
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'mute',
    grantId: muted.id,
    expectedRevision: muted.preferenceRevision ?? 0,
    muted: false,
  });
  await fx.settle();
  await fx.receive(mention('loud'));
  expect(fx.runs).toHaveLength(2);
});

it('ask mode holds a new conversation without a Source Event until it is allowed', async () => {
  const fx = await fixture();
  await fx.update({ newConversations: 'ask' });
  await fx.receive(mention('first'));
  await fx.receive(mention('second'));
  expect(fx.query('SELECT count(*) AS n FROM source_events')).toEqual([{ n: 0 }]);
  const snapshot = await fx.core.externalMessaging.snapshot('ada');
  expect(snapshot.heldConversations).toEqual([
    expect.objectContaining({
      conversation: { kind: 'group', id: 'oc_team' },
      reason: 'ask',
      count: 2,
    }),
  ]);
  const held = snapshot.heldConversations![0]!;
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'allow',
    bindingId: held.bindingId,
    conversation: held.conversation,
    from: 'held',
    expectedRevision: held.revision,
  });
  await fx.settle();
  expect((await fx.core.externalMessaging.snapshot('ada')).heldConversations).toEqual([]);
  expect(fx.admissions()).toEqual([]);
  await fx.receive({ ...mention('third'), at: new Date(Date.now() + 1000).toISOString() });
  expect(fx.admissions()).toEqual([{ reason: 'group-mention', messageId: 'om-third' }]);
});

it('blocking a held conversation keeps it out of the Inbox', async () => {
  const fx = await fixture();
  await fx.update({ newConversations: 'ask' });
  await fx.receive(dm('1'));
  const held = (await fx.core.externalMessaging.snapshot('ada')).heldConversations![0]!;
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'block-held',
    bindingId: held.bindingId,
    conversation: held.conversation,
    expectedRevision: held.revision,
  });
  await fx.update({ newConversations: 'auto' });
  await fx.receive(dm('2'));
  const snapshot = await fx.core.externalMessaging.snapshot('ada');
  expect(snapshot.heldConversations).toEqual([]);
  expect(snapshot.blockedConversations).toEqual([
    expect.objectContaining({ conversation: { kind: 'dm', id: 'oc_owner' }, name: 'Owner' }),
  ]);
  expect(fx.admissions()).toEqual([]);
});

it('holds new conversations past the hourly limit instead of creating entries', async () => {
  const fx = await fixture();
  for (let i = 0; i < 21; i++)
    await fx.receive(
      dm(`n${i}`, {
        conversation: { kind: 'dm', id: `oc_${i}` },
        reply: { messageId: `om-n${i}`, conversationId: `oc_${i}`, actorId: 'ou_owner' },
      }),
    );
  expect(fx.entries()).toHaveLength(20);
  expect((await fx.core.externalMessaging.snapshot('ada')).heldConversations).toEqual([
    expect.objectContaining({ conversation: { kind: 'dm', id: 'oc_20' }, reason: 'hourly-limit' }),
  ]);
});

it('syncs an implicit group entry into a Channel, which then receives its later mentions', async () => {
  const fx = await fixture();
  await fx.receive(mention('first'));
  const entry = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!;
  const room = fx.core.channels.createGroup({ name: 'Team room', members: ['ada'] });
  await fx.core.externalMessaging.inbound.channelBridge(room.id, {
    kind: 'add',
    grantId: entry.id,
    expectedGrantRevision: entry.revision,
    delivery: 'channel',
    name: 'Team',
    enabled: true,
    collection: 'mentions',
    collectionInheritance: 'inherit',
  });
  await fx.receive({ ...mention('second'), at: new Date(Date.now() + 1000).toISOString() });
  const placed = fx.query(
    `SELECT json_extract(e.payload_json, '$.external.event.messageId') AS messageId FROM channel_placements p JOIN source_events e USING(source_event_id) WHERE p.channel_id = '${room.id}'`,
  );
  expect(placed).toEqual([{ messageId: 'om-second' }]);
  const routes = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!.bridgeRoutes;
  expect(routes?.map((route) => route.channelId)).toContain(room.id);
  const synced = await fx.core.externalMessaging.channelBridges(room.id);
  expect(synced.bridges.map((row) => [row.name, row.delivery])).toEqual([['Team', 'channel']]);
  const dm = fx.core.channels.getOrCreateDm('ada', 'Ada')!;
  expect((await fx.core.externalMessaging.channelBridges(dm.id)).bridges).toEqual([]);
});

it('QQ Channel sync rejects a Human DM and preserves Inbox-only history when a Group route stops', async () => {
  const fx = await fixture('qq');
  await fx.receive(qqMention('qq-first'));
  const entry = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!;
  const dmChannel = fx.core.channels.getOrCreateDm('ada', 'Ada')!;
  const input = {
    kind: 'add' as const,
    grantId: entry.id,
    expectedGrantRevision: entry.revision,
    delivery: 'channel' as const,
    name: 'QQ group',
    enabled: true,
    collection: 'mentions' as const,
    collectionInheritance: 'inherit' as const,
  };
  await expect(
    fx.core.externalMessaging.inbound.channelBridge(dmChannel.id, input),
  ).rejects.toMatchObject({ code: 'channel-unavailable' });
  const room = fx.core.channels.createGroup({ name: 'QQ room', members: ['ada'] });
  await fx.core.externalMessaging.inbound.channelBridge(room.id, input);
  const later = (id: string) => ({
    ...qqMention(id),
    at: new Date(Date.now() + 1000).toISOString(),
  });
  await fx.receive(later('qq-synced'));
  const synced = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!;
  const route = synced.bridgeRoutes!.find((route) => route.channelId === room.id)!;
  await fx.core.externalMessaging.inbound.channelBridge(room.id, {
    ...input,
    kind: 'update',
    grantId: synced.id,
    expectedGrantRevision: synced.revision,
    routeId: route.id,
    expectedRevision: route.revision,
    enabled: false,
  });
  await fx.receive(later('qq-inbox-only'));
  expect(fx.core.channels.readMessages(room.id).map((message) => message.body)).toEqual([
    'hello qq-synced',
  ]);
  expect(fx.admissions()).toHaveLength(3);
  await fx.restart();
  const retained = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!;
  expect(retained.bridgeRoutes!.find((route) => route.channelId === room.id)?.enabled).toBe(false);
  expect(fx.admissions()).toHaveLength(3);
  expect(fx.core.channels.readMessages(room.id).map((message) => message.body)).toEqual([
    'hello qq-synced',
  ]);
  expect(fx.core.channels.readMessages(dmChannel.id)).toEqual([]);
});

it('QQ keeps a conversation mute preference after the same app is unbound, restarted and bound again', async () => {
  const fx = await fixture('qq');
  await fx.receive(qqMention('before-rebind'));
  const original = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!;
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'mute',
    grantId: original.id,
    expectedRevision: original.preferenceRevision ?? 0,
    muted: true,
  });
  const identity = (await fx.core.externalMessaging.snapshot('ada')).identities![0]!;
  await fx.core.externalMessaging.identity('ada', {
    kind: 'unbind',
    id: identity.id,
    expectedRevision: identity.revision,
  });
  await fx.restart();
  await fx.core.externalMessaging.identity('ada', {
    kind: 'bind',
    providerId: 'dsh-im/qq',
    accountRef: 'lark-app',
    fingerprint,
  });
  await fx.settle();
  await fx.receive({ ...qqMention('after-rebind'), at: new Date(Date.now() + 1000).toISOString() });
  const restored = (await fx.core.externalMessaging.snapshot('ada')).grants.find(
    (grant) => !grant.revokedAt,
  )!;
  expect(restored.id).not.toBe(original.id);
  expect(restored).toMatchObject({ muted: true, preferenceRevision: 1 });
  expect(fx.runs).toHaveLength(1);
  expect(fx.core.channels.readMessages(fx.core.channels.getOrCreateDm('ada', 'Ada')!.id)).toEqual(
    [],
  );
});

it('QQ exposes observed connection gaps after recovery without claiming a missed-message count', async () => {
  const fx = await fixture('qq');
  await fx.receive(qqMention('connection-history'));
  await fx.core.externalMessaging.snapshot('ada');
  const describe = fx.service.describeBot!;
  fx.service.describeBot = async (botId) => ({ ...(await describe(botId)), connected: false });
  expect(await fx.core.externalMessaging.snapshot('ada')).toMatchObject({
    receptionHistory: [
      expect.objectContaining({ reason: 'provider-unavailable', boundary: 'observed' }),
    ],
  });
  fx.service.describeBot = describe;
  await fx.restart();
  expect(await fx.core.externalMessaging.snapshot('ada')).toMatchObject({
    receptionHistory: expect.arrayContaining([
      expect.objectContaining({ reason: 'provider-unavailable', endedAt: expect.any(String) }),
    ]),
  });
});

it('QQ grant fanout waits for the replacement account receiver boundary', async () => {
  const fx = await fixture('qq');
  await fx.receive(qqMention('before-replacement'));
  const describe = fx.service.describeBot!;
  let started!: () => void;
  let resume!: () => void;
  const inspecting = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    resume = resolve;
  });
  let calls = 0;
  fx.service.describeBot = async (botId) => {
    if (++calls === 1) {
      started();
      await gate;
    }
    return describe(botId);
  };
  fx.replaceProvider();
  await inspecting;
  for (let i = 0; i < 4; i++) await tick();
  const prematureSubscriptions = fx.subscriptions;
  const delayed = {
    ...qqMention('during-replacement'),
    at: new Date(Date.now() - 1).toISOString(),
  };
  resume();
  await fx.settle();
  expect(prematureSubscriptions).toBe(0);
  await fx.receive(delayed);
  expect(fx.admissions()).toHaveLength(1);
  await fx.receive(qqMention('after-replacement'));
  expect(fx.admissions()).toHaveLength(2);
});

it('QQ resumes with a fresh eligibility boundary for known and unseen conversations', async () => {
  const fx = await fixture('qq');
  await fx.receive(qqMention('before-pause'));
  await fx.update({ enabled: false });
  const delayed = { ...qqMention('during-pause'), at: new Date().toISOString() };
  await fx.update({ enabled: true });
  await fx.receive(delayed);
  await fx.receive({
    ...delayed,
    eventId: 'unseen-event',
    messageId: 'unseen-message',
    conversation: { kind: 'group', id: 'unseen-group' },
    reply: { ...delayed.reply, messageId: 'unseen-message', conversationId: 'unseen-group' },
  });
  expect(fx.admissions()).toHaveLength(1);
  expect((await fx.core.externalMessaging.snapshot('ada')).grants).toHaveLength(1);
  await fx.receive({ ...qqMention('after-resume'), at: new Date(Date.now() + 1000).toISOString() });
  expect(fx.admissions()).toHaveLength(2);
});

it('QQ retains local pause and block boundaries after allowing future traffic', async () => {
  const fx = await fixture('qq');
  await fx.receive(qqMention('local-boundaries'));
  await fx.update({ enabled: false });
  await fx.update({ enabled: true });
  const grant = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!;
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'block',
    grantId: grant.id,
    expectedRevision: grant.revision,
  });
  const blocked = (await fx.core.externalMessaging.snapshot('ada')).blockedConversations![0]!;
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'allow',
    bindingId: blocked.bindingId!,
    conversation: blocked.conversation,
    from: 'blocked',
    expectedRevision: blocked.revision,
  });
  expect(await fx.core.externalMessaging.snapshot('ada')).toMatchObject({
    receptionHistory: expect.arrayContaining([
      expect.objectContaining({
        reason: 'identity-paused',
        boundary: 'local-command',
        endedAt: expect.any(String),
      }),
      expect.objectContaining({
        reason: 'blocked',
        boundary: 'local-command',
        endedAt: expect.any(String),
      }),
    ]),
  });
});

it('QQ allowing a blocked conversation refuses redelivery from the blocked interval', async () => {
  const fx = await fixture('qq');
  await fx.receive(qqMention('before-block'));
  const grant = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!;
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'block',
    grantId: grant.id,
    expectedRevision: grant.revision,
  });
  const blockedMessage = { ...qqMention('during-block'), at: new Date().toISOString() };
  await fx.receive(blockedMessage);
  const blocked = (await fx.core.externalMessaging.snapshot('ada')).blockedConversations![0]!;
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'allow',
    bindingId: blocked.bindingId!,
    conversation: blocked.conversation,
    from: 'blocked',
    expectedRevision: blocked.revision,
  });
  await fx.settle();
  await fx.receive(blockedMessage);
  await fx.receive({ ...qqMention('after-allow'), at: new Date(Date.now() + 1000).toISOString() });
  expect(fx.core.attention.list({ botSlug: 'ada' }).items).toHaveLength(2);
  expect(fx.runs).toHaveLength(2);
});
