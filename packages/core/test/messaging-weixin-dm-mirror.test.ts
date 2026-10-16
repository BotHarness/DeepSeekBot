import { setImmediate as tick } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { dmChannelId } from '../src/channels/channel.js';
import { createTempRoot } from './helpers.js';

const cores: BotHarnessCore[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

async function fixture(implicit = false) {
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
    if (receive) await core.externalMessaging.inbound.setEnabled('ada', grant.id, true);
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
  expect(bridged[0]!.id).toBe('dm-mirror-' + sourceEventId);
  expect(
    attachOperationalModule(core.operationalDatabase, 'test').read((db) =>
      db
        .prepare('SELECT channel_id FROM source_events WHERE source_event_id = ?')
        .get(sourceEventId),
    ),
  ).toEqual({ channel_id: null });
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
    webToWeixin: false,
  });
  expect((await core.externalMessaging.channelBridges(dm.id)).bridges[0]!.webToWeixin).toBe(false);
  await core.channels.appendMessage(dm.id, {
    id: randomUUID(),
    at: new Date().toISOString(),
    author: { kind: 'human' },
    body: 'Should stay local',
  });
  await tick();
  expect(transport.sendChecked).not.toHaveBeenCalled();
});

it('splits long web messages and falls back to the next grant when the first post fails', async () => {
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

it('resumes a split message on the next grant without resending delivered parts', async () => {
  const { core, transport, dm, grant, authorize } = await fixture();
  const second = await authorize('weixin-second');
  core.channels.getOrCreateDm('ada', 'Ada');
  const send = vi.mocked(transport.sendChecked).getMockImplementation()!;
  vi.mocked(transport.sendChecked)
    .mockImplementationOnce(send)
    .mockRejectedValueOnce({ code: 'send-permission-denied' });
  const messageId = randomUUID();
  const body = 'a'.repeat(3994) + 'b'.repeat(10);
  await core.channels.appendMessage(dm.id, {
    id: messageId,
    at: new Date().toISOString(),
    author: { kind: 'human' },
    body,
  });
  await vi.waitFor(() => expect(transport.sendChecked).toHaveBeenCalledTimes(3));
  await tick();
  expect(vi.mocked(transport.sendChecked).mock.calls.map((call) => [call[0], call[2]])).toEqual([
    ['weixin-qa', '【网页】我：' + 'a'.repeat(3994)],
    ['weixin-qa', 'b'.repeat(10)],
    ['weixin-second', 'b'.repeat(10)],
  ]);
  const accepted = attachOperationalModule(core.operationalDatabase, 'test').read((db) =>
    db
      .prepare("SELECT request_id FROM messaging_outbox WHERE state = 'provider-accepted'")
      .all()
      .map((row) => row.request_id),
  );
  expect(accepted.sort()).toEqual(
    [`web-mirror-${grant.id}-${messageId}-1`, `web-mirror-${second.id}-${messageId}-2`].sort(),
  );
});

it('mirrors WeChat media as display-only names without media references', async () => {
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
    .find((message) => message.id.startsWith('dm-mirror-'));
  expect(mirror?.body).toBe('Look at this\nimage');
  expect(mirror?.bridgeMedia).toBeUndefined();
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
  const update = (row: typeof stale, webToWeixin: boolean) =>
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
      webToWeixin,
    });
  await update(stale, false);
  await expect(update(stale, true)).rejects.toThrow();
  expect((await core.externalMessaging.channelBridges(dm.id)).bridges[0]!.webToWeixin).toBe(false);
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
    webToWeixin: false,
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
    return [...snapshot.bridges, ...snapshot.sources].map((row) => row.webToWeixinAvailable);
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
