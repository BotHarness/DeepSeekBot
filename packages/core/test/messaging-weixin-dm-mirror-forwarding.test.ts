import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { setImmediate as tick } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { attachOperationalModule } from '../src/database/owner.js';
import { type ChannelMessage } from '../src/channels/channel.js';
import { cores, fixture, setForwarding } from './support/messaging-weixin-dm-mirror.js';

afterEach(async () => {
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

it('forwards each web DM message once when implicit and explicit grants share the owner conversation', async () => {
  const { core, transport, dm, grant: implicitGrant, authorize } = await fixture(true);
  expect(implicitGrant.origin).toBe('implicit');
  const grant = await authorize();
  const mirrors = core.channels.readMessages(dm.id);
  core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
  const humanId = randomUUID();
  const botId = randomUUID();
  await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
    id: humanId,
    at: new Date().toISOString(),
    author: { kind: 'human' },
    body: 'Hello web',
  });
  await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
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
  core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
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
  await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
    id: randomUUID(),
    at: new Date().toISOString(),
    author: { kind: 'bridged', source: 'Owner' },
    body: 'Bridged body',
  });
  await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
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
  await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
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
  core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
  vi.mocked(transport.sendChecked).mockRejectedValueOnce({ code: 'send-permission-denied' });
  const messageId = randomUUID();
  const body = 'a'.repeat(3993) + '😀' + 'b'.repeat(5);
  await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
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

it('forwards an attachment-only web DM message as its file names', async () => {
  const { core, transport, dm } = await fixture();
  core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
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

it('forwards through a send-only proactive target of the paired owner', async () => {
  const { core, transport, dm, authorize } = await fixture(true);
  core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
  const rows = async () => {
    const snapshot = await core.externalMessaging.channelBridges(dm.id);
    return [...snapshot.bridges, ...snapshot.sources].map((row) => row.dmForwardAvailable);
  };
  expect(await rows()).not.toContain(true);
  const target = await authorize('weixin-qa', false);
  expect(target.receiveScope).toBeUndefined();
  expect(await rows()).toContain(true);
  const messageId = randomUUID();
  await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
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

it('disabling sync while checking the target cancels the unsent forward', async () => {
  const { core, transport, dm } = await fixture();
  core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
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
  core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
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
    if (!args[3]?.beforeSend?.())
      throw Object.assign(new Error('grant-revoked'), {
        code: 'grant-revoked',
        outcome: 'not-started',
      });
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
  await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
    id: randomUUID(),
    at: new Date().toISOString(),
    author: { kind: 'bot', slug: 'ada' },
    body: 'Ordinary reply',
  });
  await vi.waitFor(() => expect(transport.sendChecked).toHaveBeenCalledTimes(1));
  expect(vi.mocked(transport.sendChecked).mock.calls[0]?.[2]).toBe('Ordinary reply');
});
