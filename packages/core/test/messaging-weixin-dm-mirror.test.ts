import { setImmediate as tick } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { channelBridgeRoutes } from '../src/messaging/channel-bridge.js';
import { dmChannelId, type ChannelMessage } from '../src/channels/channel.js';
import { createTempRoot } from './helpers.js';

const cores: BotHarnessCore[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

async function fixture(implicit = false, optIn = true) {
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
    core.channels.getOrCreateDm('ada', 'Ada');
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

it('mirrors an accepted WeChat DM into the local DM once and mirrors accepted replies as Bot messages', async () => {
  const { core, transport, grant, dm, receive, runs, sources } = await fixture();
  await receive('one');
  await tick();
  await core.runtime.whenIdle();
  await tick();
  expect(runs).toHaveLength(1);
  const bridged = core.channels.readMessages(dm.id).filter((m) => m.author.kind === 'bridged');
  expect(bridged).toHaveLength(1);
  expect(bridged[0]).toMatchObject({
    author: { kind: 'bridged', source: 'Owner' },
    body: 'WeChat one',
    bridgeOrigin: { platform: 'weixin', senderName: 'Owner' },
  });
  const sourceEventId = bridged[0]!.bridgeOrigin!.sourceEventId;
  expect(bridged[0]!.id).toBe(sourceEventId);
  expect(
    attachOperationalModule(core.operationalDatabase, 'test').read((db) =>
      db
        .prepare('SELECT channel_id FROM source_events WHERE source_event_id = ?')
        .get(sourceEventId),
    ),
  ).toEqual({ channel_id: dm.id });
  const intent = await core.externalMessaging.reply(
    'ada',
    bridged[0]!.bridgeOrigin!.sourceEventId,
    'DM answer',
  );
  expect(intent.state).toBe('provider-accepted');
  await tick();
  expect(transport.replyChecked).toHaveBeenCalledTimes(1);
  const botMessages = core.channels.readMessages(dm.id).filter((m) => m.author.kind === 'bot');
  expect(botMessages).toHaveLength(1);
  expect(botMessages[0]).toMatchObject({
    author: { kind: 'bot', slug: 'ada' },
    body: 'DM answer',
  });
  await receive('one');
  await tick();
  await core.runtime.whenIdle();
  expect(runs).toHaveLength(1);
  expect(sources()).toHaveLength(1);
  expect(core.channels.readMessages(dm.id).filter((m) => m.author.kind === 'bridged')).toHaveLength(
    1,
  );
  await core.externalMessaging.inbound.channelBridge(dm.id, {
    kind: 'add',
    grantId: grant.id,
    expectedGrantRevision: (await core.externalMessaging.snapshot('ada')).grants[0]!.revision,
    name: 'Local DM',
    enabled: true,
    collection: 'all',
  });
  await receive('two');
  expect(core.channels.readMessages(dm.id).filter((m) => m.body === 'WeChat two')).toHaveLength(1);
});

it('mirrors nothing when dmMirror is off, including accepted replies', async () => {
  const { core, transport, dm, receive, runs, sources } = await fixture();
  core.channels.getOrCreateDm('ada', 'Ada');
  const snapshot = await core.externalMessaging.snapshot('ada');
  const row = (await core.externalMessaging.channelBridges(dm.id)).bridges[0]!;
  await core.externalMessaging.inbound.channelBridge(dm.id, {
    kind: 'update',
    routeId: row.routeId,
    delivery: row.delivery,
    grantId: row.grantId,
    expectedGrantRevision: snapshot.grants[0]!.revision,
    expectedRevision: row.revision,
    name: row.name,
    enabled: true,
    collection: 'all',
    collectionInheritance: 'custom',
    dmMirror: false,
  });
  expect((await core.externalMessaging.channelBridges(dm.id)).bridges[0]!.dmMirror).toBe(false);
  await receive('quiet');
  await tick();
  await core.runtime.whenIdle();
  await tick();
  expect(runs).toHaveLength(1);
  expect(core.channels.readMessages(dm.id)).toHaveLength(0);
  const intent = await core.externalMessaging.reply(
    'ada',
    String(sources()[0]!.source_event_id),
    'Quiet answer',
  );
  expect(intent.state).toBe('provider-accepted');
  expect(transport.replyChecked).toHaveBeenCalledTimes(1);
  expect(core.channels.readMessages(dm.id)).toHaveLength(0);
});

it('forwards each web DM message once when implicit and explicit grants share the owner conversation', async () => {
  const { core, transport, dm, grant: implicitGrant, authorize } = await fixture(true);
  expect(implicitGrant.origin).toBe('implicit');
  const grant = await authorize();
  const mirrors = core.channels.readMessages(dm.id);
  core.channels.getOrCreateDm('ada', 'Ada');
  const humanId = randomUUID();
  const botId = randomUUID();
  await core.channels.appendMessage(dm.id, {
    id: humanId,
    at: new Date().toISOString(),
    author: { kind: 'human' },
    body: 'Hello web',
  });
  await core.channels.appendMessage(dm.id, {
    id: botId,
    at: new Date().toISOString(),
    author: { kind: 'bot', slug: 'ada' },
    body: 'Bot reply',
  });
  await vi.waitFor(() => expect(transport.sendChecked).toHaveBeenCalledTimes(2));
  for (const commit of core.channels.messagesAfter(dm.id, 0)!) {
    await core.externalMessaging.forwardWebDm(commit);
  }
  expect(transport.sendChecked).toHaveBeenCalledTimes(2);
  expect(
    vi
      .mocked(transport.sendChecked)
      .mock.calls.map((call) => call[2])
      .sort(),
  ).toEqual(['Bot reply', '【网页】我：Hello web']);
  const requestIds = (
    attachOperationalModule(core.operationalDatabase, 'test').read((db) =>
      db
        .prepare(
          "SELECT request_id FROM messaging_outbox WHERE bot_slug = ? AND state = 'provider-accepted'",
        )
        .all('ada'),
    ) as { request_id: string }[]
  ).map((row) => row.request_id);
  expect(requestIds.sort()).toEqual(
    [`web-mirror-${grant.id}-${humanId}`, `web-mirror-${grant.id}-${botId}`].sort(),
  );
  expect(core.channels.readMessages(dm.id).filter((m) => m.id.startsWith('dm-mirror-'))).toEqual(
    mirrors,
  );
});

it('does not forward bridged or mirrored messages and forwards nothing when the toggle is off', async () => {
  const { core, transport, dm, receive } = await fixture();
  core.channels.getOrCreateDm('ada', 'Ada');
  await receive('loop');
  await tick();
  await core.runtime.whenIdle();
  await tick();
  const bridged = core.channels.readMessages(dm.id).filter((m) => m.author.kind === 'bridged');
  expect(bridged).toHaveLength(1);
  const intent = await core.externalMessaging.reply(
    'ada',
    bridged[0]!.bridgeOrigin!.sourceEventId,
    'Mirrored answer',
  );
  expect(intent.state).toBe('provider-accepted');
  await core.channels.appendMessage(dm.id, {
    id: randomUUID(),
    at: new Date().toISOString(),
    author: { kind: 'bridged', source: 'Owner' },
    body: 'Bridged body',
  });
  await core.channels.appendMessage(dm.id, {
    id: 'dm-mirror-' + randomUUID(),
    at: new Date().toISOString(),
    author: { kind: 'bot', slug: 'ada' },
    body: 'Mirrored body',
  });
  await tick();
  expect(transport.sendChecked).not.toHaveBeenCalled();
  const row = (await core.externalMessaging.channelBridges(dm.id)).bridges[0]!;
  await core.externalMessaging.inbound.channelBridge(dm.id, {
    kind: 'update',
    routeId: row.routeId,
    delivery: row.delivery,
    grantId: row.grantId,
    expectedGrantRevision: row.grantRevision,
    expectedRevision: row.revision,
    name: row.name,
    enabled: true,
    collection: 'all',
    collectionInheritance: 'custom',
    dmMirror: row.dmMirror,
    dmForward: false,
  });
  expect((await core.externalMessaging.channelBridges(dm.id)).bridges[0]!.dmForward).toBe(false);
  await core.channels.appendMessage(dm.id, {
    id: randomUUID(),
    at: new Date().toISOString(),
    author: { kind: 'human' },
    body: 'Should stay local',
  });
  await tick();
  expect(transport.sendChecked).not.toHaveBeenCalled();
});

it('splits each enabled account independently without falling back across accounts', async () => {
  const { core, transport, dm, grant, authorize } = await fixture();
  const second = await authorize('weixin-second');
  core.channels.getOrCreateDm('ada', 'Ada');
  vi.mocked(transport.sendChecked).mockRejectedValueOnce({ code: 'send-permission-denied' });
  const messageId = randomUUID();
  const body = 'a'.repeat(3993) + '😀' + 'b'.repeat(5);
  await core.channels.appendMessage(dm.id, {
    id: messageId,
    at: new Date().toISOString(),
    author: { kind: 'human' },
    body,
  });
  await vi.waitFor(() =>
    expect(
      core.externalMessaging
        .history('ada')
        .map((intent) => intent.state)
        .sort(),
    ).toEqual(['failed', 'provider-accepted', 'provider-accepted']),
  );
  expect(transport.sendChecked).toHaveBeenCalledTimes(3);
  const texts = vi
    .mocked(transport.sendChecked)
    .mock.calls.filter((call) => call[0] === 'weixin-second')
    .map((call) => call[2]);
  expect(texts).toEqual(['【网页】我：' + 'a'.repeat(3993), '😀' + 'b'.repeat(5)]);
  expect(texts.join('')).toBe('【网页】我：' + body);
  const requestIds = attachOperationalModule(core.operationalDatabase, 'test').read((db) =>
    db
      .prepare('SELECT request_id FROM messaging_outbox')
      .all()
      .map((row) => row.request_id),
  );
  expect(requestIds.sort()).toEqual(
    [
      `web-mirror-${grant.id}-${messageId}-1`,
      ...[1, 2].map((part) => `web-mirror-${second.id}-${messageId}-${part}`),
    ].sort(),
  );
  for (const commit of core.channels.messagesAfter(dm.id, 0)!) {
    await core.externalMessaging.forwardWebDm(commit);
  }
  expect(transport.sendChecked).toHaveBeenCalledTimes(3);
});

it('preserves checked canonical media references without copying resource keys', async () => {
  const { core, dm, receive } = await fixture();
  await receive('pic', {
    text: 'Look at this',
    attachments: [
      {
        id: 'c'.repeat(64),
        messageId: 'pic',
        resourceKey: 'pic-resource',
        name: 'image',
        mediaType: 'image/unknown',
      },
    ],
  });
  await tick();
  await core.runtime.whenIdle();
  await tick();
  const mirror = core.channels
    .readMessages(dm.id)
    .find((message) => message.author.kind === 'bridged');
  expect(mirror?.body).toBe('Look at this\nimage');
  expect(mirror?.bridgeMedia).toBeUndefined();
  expect(JSON.stringify(mirror)).not.toContain('pic-resource');
});

it('forwards an attachment-only web DM message as its file names', async () => {
  const { core, transport, dm } = await fixture();
  core.channels.getOrCreateDm('ada', 'Ada');
  await core.externalMessaging.forwardWebDm({
    channelId: dm.id,
    revision: 1,
    message: {
      id: randomUUID(),
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: '',
      attachments: [
        { hash: 'sha256:' + 'f'.repeat(64), name: 'report.pdf', mime: 'application/pdf', size: 3 },
      ],
    },
  });
  expect(transport.sendChecked).toHaveBeenCalledTimes(1);
  expect(vi.mocked(transport.sendChecked).mock.calls[0]![2]).toBe('【网页】我：report.pdf');
});

it('rejects a stale dialog that would re-enable a switch another dialog turned off', async () => {
  const { core, dm } = await fixture();
  core.channels.getOrCreateDm('ada', 'Ada');
  const stale = (await core.externalMessaging.channelBridges(dm.id)).bridges[0]!;
  const update = (row: typeof stale, dmForward: boolean) =>
    core.externalMessaging.inbound.channelBridge(dm.id, {
      kind: 'update',
      routeId: row.routeId,
      delivery: row.delivery,
      grantId: row.grantId,
      expectedGrantRevision: row.grantRevision,
      expectedRevision: row.revision,
      name: row.name,
      enabled: row.enabled,
      collection: 'all',
      collectionInheritance: 'custom',
      dmMirror: row.dmMirror,
      dmForward,
    });
  await update(stale, false);
  await expect(update(stale, true)).rejects.toThrow();
  expect((await core.externalMessaging.channelBridges(dm.id)).bridges[0]!.dmForward).toBe(false);
});

it('keeps reply authority for accepted messages after a sync switch changes', async () => {
  const { core, dm, receive } = await fixture();
  core.channels.getOrCreateDm('ada', 'Ada');
  await receive('keep');
  await tick();
  await core.runtime.whenIdle();
  await tick();
  const mirror = core.channels
    .readMessages(dm.id)
    .find((message) => message.author.kind === 'bridged' && message.body === 'WeChat keep')!;
  const grantRevision = (await core.externalMessaging.snapshot('ada')).grants[0]!.revision;
  const row = (await core.externalMessaging.channelBridges(dm.id)).bridges[0]!;
  await core.externalMessaging.inbound.channelBridge(dm.id, {
    kind: 'update',
    routeId: row.routeId,
    delivery: row.delivery,
    grantId: row.grantId,
    expectedGrantRevision: row.grantRevision,
    expectedRevision: row.revision,
    name: row.name,
    enabled: row.enabled,
    collection: 'all',
    collectionInheritance: 'custom',
    dmMirror: false,
    dmForward: false,
  });
  expect((await core.externalMessaging.snapshot('ada')).grants[0]!.revision).toBe(grantRevision);
  const intent = await core.externalMessaging.reply(
    'ada',
    mirror.bridgeOrigin!.sourceEventId,
    'Still answerable',
  );
  expect(intent.state).toBe('provider-accepted');
});

it('forwards through a send-only proactive target of the paired owner', async () => {
  const { core, transport, dm, authorize } = await fixture(true);
  core.channels.getOrCreateDm('ada', 'Ada');
  const rows = async () => {
    const snapshot = await core.externalMessaging.channelBridges(dm.id);
    return [...snapshot.bridges, ...snapshot.sources].map((row) => row.dmForwardAvailable);
  };
  expect(await rows()).not.toContain(true);
  const target = await authorize('weixin-qa', false);
  expect(target.receiveScope).toBeUndefined();
  expect(await rows()).toContain(true);
  const messageId = randomUUID();
  await core.channels.appendMessage(dm.id, {
    id: messageId,
    at: new Date().toISOString(),
    author: { kind: 'human' },
    body: 'Send-only target',
  });
  await vi.waitFor(() => expect(transport.sendChecked).toHaveBeenCalledTimes(1));
  expect(vi.mocked(transport.sendChecked).mock.calls[0]![2]).toBe('【网页】我：Send-only target');
  expect(
    attachOperationalModule(core.operationalDatabase, 'test').read((db) =>
      db
        .prepare("SELECT request_id FROM messaging_outbox WHERE state = 'provider-accepted'")
        .all()
        .map((row) => row.request_id),
    ),
  ).toEqual([`web-mirror-${target.id}-${messageId}`]);
  const posted = await core.externalMessaging.post('ada', target.id, 'proactive-1', 'Proactive hi');
  expect(posted.state).toBe('provider-accepted');
  await vi.waitFor(() =>
    expect(core.channels.readMessages(dm.id)).toContainEqual(
      expect.objectContaining({ id: 'dm-mirror-' + posted.id, body: 'Proactive hi' }),
    ),
  );
});

it('purging a canonical WeChat source also removes its DM mirror body', async () => {
  const { core, grant, dm, receive } = await fixture();
  const created = createBridgeMethods({ ...core }).channelCreate({
    name: 'Review purge source',
    members: ['ada'],
  });
  if (!created.ok) throw new Error(created.error.message);
  const group = created.value.channel;
  const snapshot = await core.externalMessaging.snapshot('ada');
  await core.externalMessaging.inbound.channelBridge(group.id, {
    kind: 'add',
    grantId: grant.id,
    expectedGrantRevision: snapshot.grants[0]!.revision,
    delivery: 'channel',
    name: 'Review paired-owner DM',
    enabled: true,
    collection: 'all',
    collectionInheritance: 'custom',
  });
  const secret = 'review-only-wechat-body-to-purge';
  await receive('purge-review', { text: secret });
  await tick();
  await core.runtime.whenIdle();
  await tick();
  const original = core.channels.readMessages(group.id).find((message) => message.body === secret)!;
  expect(original).toBeDefined();
  expect(core.channels.readMessages(dm.id).some((message) => message.body === secret)).toBe(true);
  const sourceEventId = original.bridgeOrigin!.sourceEventId;
  await core.externalMessaging.reply('ada', sourceEventId, 'Reply quoting ' + secret);
  await tick();
  expect(
    core.channels.readMessages(dm.id).some((message) => message.body === 'Reply quoting ' + secret),
  ).toBe(true);
  core.channels.deleteGroup(group.id);
  const preview = core.contentPurge.preview(group.id, [sourceEventId]);
  expect(core.contentPurge.confirm(group.id, preview.sourceEventIds, preview.token)).toEqual({
    accepted: 1,
  });
  expect(
    core.contentPurge
      .sources(group.id)
      .sources.find((source) => source.sourceEventId === sourceEventId)?.body,
  ).toBe('');
  expect(core.channels.readMessages(dm.id).some((message) => message.body.includes(secret))).toBe(
    false,
  );
});

it('disabling sync while checking the target cancels the unsent forward', async () => {
  const { core, transport, dm } = await fixture();
  core.channels.getOrCreateDm('ada', 'Ada');
  const row = (await core.externalMessaging.channelBridges(dm.id)).bridges[0]!;
  let release!: () => void;
  let entered!: () => void;
  const hold = new Promise<void>((r) => {
    release = r;
  });
  const started = new Promise<void>((r) => {
    entered = r;
  });
  const original = transport.describeBot;
  transport.describeBot = vi.fn(original).mockImplementationOnce(async (...args) => {
    entered();
    await hold;
    return original(...args);
  });
  const pending = core.externalMessaging.forwardWebDm({
    channelId: dm.id,
    revision: 1,
    message: {
      id: randomUUID(),
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'Cancel this pending forwarding',
    },
  });
  await started;
  await core.externalMessaging.inbound.channelBridge(dm.id, {
    kind: 'update',
    routeId: row.routeId,
    delivery: row.delivery,
    grantId: row.grantId,
    expectedGrantRevision: row.grantRevision,
    expectedRevision: row.revision,
    name: row.name,
    enabled: row.enabled,
    collection: 'all',
    collectionInheritance: 'custom',
    dmMirror: row.dmMirror,
    dmForward: false,
  });
  expect((await core.externalMessaging.channelBridges(dm.id)).bridges[0]!.dmForward).toBe(false);
  release();
  await pending;
  expect(transport.sendChecked).not.toHaveBeenCalled();
});

it('disabling forwarding on account A routes through enabled account B', async () => {
  const { core, transport, dm, grant, authorize } = await fixture();
  const second = await authorize('weixin-second');
  core.channels.getOrCreateDm('ada', 'Ada');
  const rows = await core.externalMessaging.channelBridges(dm.id);
  const row = rows.bridges.find((candidate) => candidate.grantId === grant.id)!;
  await core.externalMessaging.inbound.channelBridge(dm.id, {
    kind: 'update',
    routeId: row.routeId,
    delivery: row.delivery,
    grantId: row.grantId,
    expectedGrantRevision: row.grantRevision,
    expectedRevision: row.revision,
    name: row.name,
    enabled: row.enabled,
    collection: 'all',
    collectionInheritance: 'custom',
    dmForward: false,
  });
  expect(
    (await core.externalMessaging.channelBridges(dm.id)).bridges.find(
      (candidate) => candidate.grantId === grant.id,
    )?.dmForward,
  ).toBe(false);
  await core.externalMessaging.forwardWebDm({
    channelId: dm.id,
    revision: 1,
    message: {
      id: randomUUID(),
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'Only account B is enabled',
    },
  });
  expect(second.accountRef).toBe('weixin-second');
  expect(vi.mocked(transport.sendChecked).mock.calls.map((call) => call[0])).toEqual([
    'weixin-second',
  ]);
});

async function setForwarding(core: BotHarnessCore, dmId: string, enabled: boolean) {
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

it('defaults both directions off for a new grant and does not backfill when enabled', async () => {
  const { core, transport, dm, receive, sources } = await fixture(false, false);
  core.channels.getOrCreateDm('ada', 'Ada');
  const row = (await core.externalMessaging.channelBridges(dm.id)).bridges[0]!;
  expect(row).toMatchObject({ dmMirror: false, dmForward: false });
  const at = new Date(Date.now() + 10).toISOString();
  await receive('old', { at });
  await tick();
  await core.runtime.whenIdle();
  expect(sources()).toHaveLength(1);
  expect(core.channels.readMessages(dm.id)).toHaveLength(0);
  await core.externalMessaging.forwardWebDm({
    channelId: dm.id,
    revision: 1,
    message: { id: randomUUID(), at, body: 'local only', author: { kind: 'human' } },
  });
  expect(transport.sendChecked).not.toHaveBeenCalled();
  await core.externalMessaging.inbound.channelBridge(dm.id, {
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
    dmMirror: true,
  });
  await receive('old', { at });
  expect(core.channels.readMessages(dm.id)).toHaveLength(0);
  await receive('new');
  expect(core.channels.readMessages(dm.id).map((m) => m.body)).toEqual(['WeChat new']);
  expect((await core.externalMessaging.channelBridges(dm.id)).bridges[0]!.dmForward).toBe(false);
});

it('checks opt-out at the provider final-send fence even after target inspection passed', async () => {
  const { core, transport, dm } = await fixture();
  let release!: () => void;
  let entered!: () => void;
  const held = new Promise<void>((r) => {
    release = r;
  });
  const started = new Promise<void>((r) => {
    entered = r;
  });
  const accepted = vi.mocked(transport.sendChecked).getMockImplementation()!;
  const delivered: string[] = [];
  vi.mocked(transport.sendChecked).mockImplementation(async (...args) => {
    entered();
    await held;
    if (!args[3]?.beforeSend?.()) throw { code: 'grant-revoked', outcome: 'not-started' };
    delivered.push(args[2]);
    return accepted(...args);
  });
  const pending = core.externalMessaging.forwardWebDm({
    channelId: dm.id,
    revision: 1,
    message: {
      id: randomUUID(),
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'held',
    },
  });
  await started;
  await setForwarding(core, dm.id, false);
  await setForwarding(core, dm.id, true);
  release();
  await pending;
  expect(delivered).toEqual([]);
});

it('stops later fragments after opt-out while preserving the already accepted fragment', async () => {
  const { core, transport, dm } = await fixture();
  const accepted = vi.mocked(transport.sendChecked).getMockImplementation()!;
  vi.mocked(transport.sendChecked).mockImplementation(async (...args) => {
    const result = await accepted(...args);
    await setForwarding(core, dm.id, false);
    return result;
  });
  await core.externalMessaging.forwardWebDm({
    channelId: dm.id,
    revision: 1,
    message: {
      id: randomUUID(),
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'a'.repeat(8000),
    },
  });
  expect(transport.sendChecked).toHaveBeenCalledTimes(1);
  expect(core.externalMessaging.history('ada').map((intent) => intent.state)).toEqual([
    'provider-accepted',
  ]);
});

it('allows disabling both directions while the provider is offline', async () => {
  const { core, transport, dm } = await fixture();
  const row = (await core.externalMessaging.channelBridges(dm.id)).bridges[0]!;
  transport.describeBot = vi.fn(async () => {
    throw new Error('offline');
  });
  await core.externalMessaging.inbound.channelBridge(dm.id, {
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
    dmMirror: false,
    dmForward: false,
  });
  const stored = attachOperationalModule(core.operationalDatabase, 'test').read((db) =>
    db.prepare('SELECT body FROM messaging_grants WHERE id = ?').get(row.grantId),
  );
  expect(JSON.parse(String(stored!.body))).toMatchObject({ dmMirror: false, dmForward: false });
});

it('shares opt-in and opt-out with a later explicit receiver in the same Binding', async () => {
  const { core, transport, dm, authorize } = await fixture(true);
  const target = await authorize();
  expect(
    (await core.externalMessaging.snapshot('ada')).grants
      .filter((g) => g.bindingId === target.bindingId)
      .every((g) => g.dmMirror && g.dmForward),
  ).toBe(true);
  await setForwarding(core, dm.id, false);
  expect(
    (await core.externalMessaging.snapshot('ada')).grants
      .filter((g) => g.bindingId === target.bindingId)
      .every((g) => g.dmForward === false),
  ).toBe(true);
  await core.externalMessaging.forwardWebDm({
    channelId: dm.id,
    revision: 1,
    message: {
      id: randomUUID(),
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'no alias bypass',
    },
  });
  expect(transport.sendChecked).not.toHaveBeenCalled();
});

it('keeps original connector media and reduces only the additional mirror placement', async () => {
  const { core, grant, dm, receive } = await fixture();
  const created = createBridgeMethods({ ...core }).channelCreate({
    name: 'Media group',
    members: ['ada'],
  });
  if (!created.ok) throw new Error(created.error.message);
  const group = created.value.channel;
  await core.externalMessaging.inbound.channelBridge(group.id, {
    kind: 'add',
    grantId: grant.id,
    expectedGrantRevision: (await core.externalMessaging.snapshot('ada')).grants[0]!.revision,
    name: 'Media source',
    enabled: true,
    collection: 'all',
    collectionInheritance: 'custom',
  });
  await receive('media-route', {
    attachments: [
      {
        id: 'c'.repeat(64),
        messageId: 'media-route',
        resourceKey: 'private-resource',
        name: 'photo',
        mediaType: 'image/png',
      },
    ],
  });
  expect(core.channels.readMessages(group.id)[0]!.bridgeMedia?.items).toHaveLength(1);
  expect(core.channels.readMessages(dm.id)[0]!.bridgeMedia).toBeUndefined();
  expect(core.channels.readMessages(dm.id)[0]!.body).toContain('photo');
});

it('recovers missing eligible projections on provider restart without resending or resurrecting purged content', async () => {
  const { core, transport, dm, receive, sources } = await fixture();
  await receive('recover');
  await tick();
  await core.runtime.whenIdle();
  const source = String(sources()[0]!.source_event_id);
  const reply = await core.externalMessaging.reply('ada', source, 'Recovered reply');
  const database = attachOperationalModule(core.operationalDatabase, 'test');
  database.transaction((db) => {
    db.prepare('DELETE FROM channel_placements WHERE channel_id = ?').run(dm.id);
    db.prepare('DELETE FROM source_events WHERE source_event_id = ?').run('dm-mirror-' + reply.id);
  });
  core.externalMessaging.register(createDshImProvider(transport, 'weixin')!);
  await vi.waitFor(() =>
    expect(
      core.channels
        .readMessages(dm.id)
        .map((m) => m.body)
        .sort(),
    ).toEqual(['Recovered reply', 'WeChat recover']),
  );
  expect(transport.replyChecked).toHaveBeenCalledTimes(1);
  expect(transport.sendChecked).not.toHaveBeenCalled();
  expect(sources()).toHaveLength(1);
});

it('recovers in ascending order beyond an ineligible batch without retrying sends', async () => {
  const { core, transport, dm, grant } = await fixture();
  const accepted = await core.externalMessaging.post('ada', grant.id, 'recovery-seed', 'Seed');
  const database = attachOperationalModule(core.operationalDatabase, 'test');
  database.transaction((db) => {
    const row = db.prepare('SELECT body FROM messaging_outbox WHERE id = ?').get(accepted.id)!;
    const seed = JSON.parse(String(row.body));
    for (let i = 0; i < 103; i++) {
      const id = randomUUID();
      const next = {
        ...seed,
        id,
        requestId: 'recovery-' + i,
        text: 'Recovered ' + i,
        dmMirror: { ...seed.dmMirror, ...(i < 101 ? { epoch: 'obsolete' } : {}) },
      };
      db.prepare(
        'INSERT INTO messaging_outbox (id, bot_slug, grant_id, request_id, state, created_at, body) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(
        id,
        'ada',
        grant.id,
        next.requestId,
        'provider-accepted',
        next.createdAt,
        JSON.stringify(next),
      );
    }
  });
  core.externalMessaging.register(createDshImProvider(transport, 'weixin')!);
  await vi.waitFor(() =>
    expect(core.channels.messagesAfter(dm.id, 0)!.map((c) => c.message.body)).toEqual([
      'Seed',
      'Recovered 101',
      'Recovered 102',
    ]),
  );
  expect(transport.sendChecked).toHaveBeenCalledTimes(1);
});

it('replays a projection-ready notification received during an active recovery pass', async () => {
  const { core, transport, dm, receive, sources, grant } = await fixture();
  await receive('overlap');
  await tick();
  await core.runtime.whenIdle();
  const source = String(sources()[0]!.source_event_id);
  const accepted = await core.externalMessaging.reply('ada', source, 'Overlapping recovery reply');
  const database = attachOperationalModule(core.operationalDatabase, 'test');
  database.transaction((db) => {
    db.prepare('DELETE FROM channel_placements WHERE channel_id = ?').run(dm.id);
    db.prepare('DELETE FROM source_events WHERE source_event_id = ?').run(
      'dm-mirror-' + accepted.id,
    );
    const seed = JSON.parse(
      String(db.prepare('SELECT body FROM messaging_outbox WHERE id = ?').get(accepted.id)!.body),
    );
    for (let i = 0; i < 101; i++) {
      const next = {
        ...seed,
        id: randomUUID(),
        requestId: 'overlap-' + i,
        dmMirror: { ...seed.dmMirror, epoch: 'obsolete' },
      };
      db.prepare(
        'INSERT INTO messaging_outbox (id, bot_slug, grant_id, request_id, state, created_at, body) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(
        next.id,
        'ada',
        grant.id,
        next.requestId,
        'provider-accepted',
        next.createdAt,
        JSON.stringify(next),
      );
    }
  });
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  const consume = transport.consumeInbound!;
  transport.consumeInbound = async (...args) => {
    await ready;
    return consume(...args);
  };
  const getDm = core.channels.getOrCreateDm.bind(core.channels);
  let released = false;
  const spy = vi.spyOn(core.channels, 'getOrCreateDm').mockImplementation((...args) => {
    if (!released) {
      released = true;
      queueMicrotask(release);
    }
    return getDm(...args);
  });
  try {
    core.externalMessaging.register(createDshImProvider(transport, 'weixin')!);
    await vi.waitFor(() =>
      expect(core.channels.messagesAfter(dm.id, 0)!.map((c) => c.message.body)).toEqual([
        'WeChat overlap',
        'Overlapping recovery reply',
      ]),
    );
    expect(transport.replyChecked).toHaveBeenCalledTimes(1);
    expect(transport.sendChecked).not.toHaveBeenCalled();
  } finally {
    spy.mockRestore();
  }
});

it('keeps structured local Bot cards out of WeChat while forwarding ordinary replies', async () => {
  const { core, transport, dm } = await fixture();
  const cards = [
    {
      toolApprovalRequest: {
        sessionId: 'session',
        callId: 'call',
        toolName: 'shell',
        role: 'orchestrator',
        cwd: '/workspace',
        input: 'private operation',
      },
    },
    { userQuestionRequest: { sessionId: 'session', questions: [] } },
    {
      privateInputRequest: {
        account: 'test',
        purpose: 'Private credential setup',
        fields: [{ id: 'token', label: 'Token', required: true }],
      },
    },
    {
      sessionFailure: { role: 'orchestrator', sessionId: 'session', detail: 'Internal diagnostic' },
    },
    { grantRequest: true },
    { botDmAction: { channelId: 'dm-other', messageId: 'other', recipientBotSlug: 'other' } },
    { botChannelPost: { channelId: 'group-test', messageId: 'post' } },
    { botCreateAction: { botSlug: 'other', displayName: 'Other' } },
  ] satisfies Partial<ChannelMessage>[];
  for (const card of cards) {
    const message: ChannelMessage = {
      id: randomUUID(),
      at: new Date().toISOString(),
      author: { kind: 'bot', slug: 'ada' },
      body: 'Local control card, not conversation text',
      ...card,
    };
    await core.externalMessaging.forwardWebDm({ channelId: dm.id, revision: 1, message });
  }
  expect(transport.sendChecked).not.toHaveBeenCalled();
  expect((await core.externalMessaging.snapshot('ada')).intents).toHaveLength(0);
  await core.channels.appendMessage(dm.id, {
    id: randomUUID(),
    at: new Date().toISOString(),
    author: { kind: 'bot', slug: 'ada' },
    body: 'Ordinary reply',
  });
  await vi.waitFor(() => expect(transport.sendChecked).toHaveBeenCalledTimes(1));
  expect(vi.mocked(transport.sendChecked).mock.calls[0]?.[2]).toBe('Ordinary reply');
});
