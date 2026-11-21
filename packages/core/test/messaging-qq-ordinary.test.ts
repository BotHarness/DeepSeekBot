import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { setImmediate as tick } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { attachOperationalModule } from '../src/database/owner.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import type { MessagingInboundEvent } from '../src/messaging/provider.js';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { messagingSource } from '../src/features/messaging/rpc.js';
import { createBotMessageTool } from '../src/runtime/bot-message-tool.js';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';

const cores = new Set<BotHarnessCore>();
async function stop(core: BotHarnessCore) {
  core.externalMessaging.close();
  await core.runtime.close();
  core.operationalDatabase.close();
  cores.delete(core);
}
afterEach(async () => {
  vi.useRealTimers();
  for (const core of cores) await stop(core);
});

const policy = { collection: 'all', wake: 'digest', count: 2, intervalSeconds: 60 } as const;
async function fixture(proactive = true, media = false, allByDefault = false, secondGroup = false) {
  const fingerprint = 'a'.repeat(64);
  const home = createTempRoot('qq-ordinary-');
  type Consumer = Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1];
  let consumer: Consumer | undefined;
  const runs: OrchestratorAgentRun[] = [];
  const logs: string[] = [];
  const transport: DshImOutboundService = {
    contractVersion: 1,
    receiptVersion: 1,
    replyContextVersion: 1,
    replyReceiptVersion: 1,
    replyFenceVersion: 1,
    ...(media ? { fileVersion: 1 as const } : {}),
    listBots: async () => [{ botId: 'own-app', channel: 'qq' }],
    listTargets: async () => [
      { targetId: 'qa-group', kind: 'group', name: 'QQ QA', route: { groupOpenId: 'own-group' } },
      ...(secondGroup
        ? [
            {
              targetId: 'other-qa-group',
              kind: 'group',
              name: 'Other QA',
              route: { groupOpenId: 'other-group' },
            },
          ]
        : []),
    ],
    describeBot: async (botId) => ({
      version: 1,
      botId,
      channel: 'qq',
      account: { fingerprint },
      connected: true,
      capabilities: [
        'exclusive-text-consumer',
        'ordinary-text-consumer',
        'reply-text-checked',
        'reply-context-checked',
        'reply-receipt-checked',
        'reply-fence-checked',
        ...(media
          ? [
              'source-image-checked',
              'reply-image-fence-checked',
              'source-file-checked',
              'reply-file-checked',
              'source-generic-file-checked',
              'reply-file-fence-checked',
            ]
          : []),
        ...(proactive
          ? ['proactive-text-checked', 'proactive-receipt-checked', 'proactive-fence-checked']
          : []),
      ],
    }),
    consumeInbound: async (_account, input) => {
      expect(input.ordinaryText).toBe(true);
      if (media) {
        expect(input.sourceImages).toBe(true);
        expect(input.sourceFiles).toBe(true);
      }
      consumer = input;
      return () => {
        if (consumer === input) consumer = undefined;
      };
    },
    qualifyReplyChecked: async (_account, route) => route,
    ...(media
      ? {
          readSourceFile: async () =>
            (async function* () {
              yield new Uint8Array([1]);
            })(),
        }
      : {}),
    replyChecked: vi.fn(async () => {
      throw Object.assign(new Error('Ordinary collection cannot create a QQ source reply'), {
        code: 'capability-unavailable',
      });
    }),
    sendChecked: vi.fn(async (_account, target, _text, options) => {
      expect(options.beforeSend?.()).toBe(true);
      return {
        sent: true as const,
        receipt: {
          version: 1 as const,
          messageId: 'own-contribution',
          conversationId: target === 'other-qa-group' ? 'other-group' : 'own-group',
        },
      };
    }),
  };
  const provider = createDshImProvider(transport, 'qq')!;
  const boot = () => {
    const core = createCore({
      dshHome: home,
      warn: (entry) => logs.push(entry),
      agents: {
        async runOrchestrator(run) {
          runs.push(run);
          if (!run.inbox.includes('count-two')) return;
          const target = (await run.externalMessaging?.targets?.())?.find(
            (item) => item.canPost && item.conversationId === 'own-group',
          );
          if (target)
            await run.externalMessaging?.post?.(
              target.grantId,
              'qq_1155_intentional_contribution',
              'The blue plan is confirmed for twelve attendees.',
            );
        },
        async runAssignment() {},
        requestAssignment() {
          throw new Error('Assignments are outside this ordinary-ingress test');
        },
        async close() {},
      },
    });
    cores.add(core);
    core.externalMessaging.register(provider);
    return core;
  };
  let core = boot();
  if (allByDefault) {
    expect(
      await createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core }).messagingDefaultsSet({
        platform: 'qq',
        expectedRevision: 0,
        collection: 'all',
        wake: 'digest',
        count: 10,
        intervalSeconds: 600,
        identityEnabled: true,
        newConversations: 'auto',
      }),
    ).toMatchObject({ ok: true });
  }
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  const target = (await provider.targets('own-app'))[0]!;
  const grant = await core.externalMessaging.authorize({
    botSlug: 'ada',
    providerId: provider.id,
    accountRef: 'own-app',
    fingerprint,
    targetRef: target.ref,
    targetDigest: target.digest,
  });
  const otherTarget = secondGroup
    ? (await provider.targets('own-app')).find(
        (item) => item.receiveScope?.conversationId === 'other-group',
      )
    : undefined;
  const otherGrant =
    otherTarget &&
    (await core.externalMessaging.authorize({
      botSlug: 'ada',
      providerId: provider.id,
      accountRef: 'own-app',
      fingerprint,
      targetRef: otherTarget.ref,
      targetDigest: otherTarget.digest,
    }));
  const enabled = async () => {
    await core.externalMessaging.inbound.setEnabled('ada', grant.id, true);
    for (let i = 0; i < 5; i++) await tick();
    if (!consumer) throw new Error('No QQ consumer');
  };
  await enabled();
  const idle = async () => {
    await tick();
    await core.runtime.whenIdle();
    await tick();
  };
  const event = (id: string, mentionedAccount = false): MessagingInboundEvent => ({
    version: 1,
    channel: 'qq',
    botId: 'own-app',
    fingerprint,
    eventId: id,
    messageId: id,
    actor: { kind: 'user', id: 'member' },
    conversation: { kind: 'group', id: 'own-group' },
    mentions: mentionedAccount ? [{ id: 'own-app', key: '<@own-app>' }] : [],
    mentionedAccount,
    at: new Date().toISOString(),
    text: 'Context ' + id,
    reply: { messageId: id, conversationId: 'own-group', actorId: 'member' },
    replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
  });
  return {
    get core() {
      return core;
    },
    get consumer() {
      if (!consumer) throw new Error('QQ receiver unavailable');
      return consumer;
    },
    grant,
    otherGrant,
    transport,
    runs,
    logs,
    event,
    idle,
    query(sql: string) {
      return attachOperationalModule(core.operationalDatabase, 'qq-ordinary-test').read((db) =>
        db.prepare(sql).all(),
      );
    },
    async receive(id: string, mentionedAccount = false) {
      if (!consumer) throw new Error('QQ receiver unavailable');
      await consumer.onEvent(event(id, mentionedAccount), { signal: consumer.signal });
      await idle();
    },
    async restart() {
      await stop(core);
      core = boot();
      await enabled();
    },
  };
}

it('QQ inherits all-message defaults before delivery proof and retains collection after restart', async () => {
  const fx = await fixture(true, false, true);
  expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]).toMatchObject({
    ordinaryDelivery: 'unverified',
    groupPolicy: { collection: 'all', inheritance: 'inherit' },
  });
  await fx.receive('first-ordinary');
  expect(fx.query("SELECT * FROM inbox_admissions WHERE reason = 'group-ordinary'")).toHaveLength(
    1,
  );
  await fx.restart();
  await fx.receive('ordinary-after-restart');
  expect(fx.query("SELECT * FROM inbox_admissions WHERE reason = 'group-ordinary'")).toHaveLength(
    2,
  );
  expect(fx.runs).toHaveLength(0);
});

it('explains a non-addressed QQ source and prevents a proactive fallback in the same run', async () => {
  const fx = await fixture(true, false, true, true);
  await fx.receive('ordinary-follow-up');
  await fx.receive('addressed-request', true);
  const run = fx.runs.at(-1)!;
  const sourceFor = (messageId: string) => {
    const sourceId = run
      .triage!.current()
      .find((id) => run.externalMessaging?.read(id).event.messageId === messageId);
    if (sourceId === undefined) throw new Error(`Missing QQ source for ${messageId}`);
    return sourceId;
  };
  const ordinary = sourceFor('ordinary-follow-up');
  const addressed = sourceFor('addressed-request');
  const tool = createBotMessageTool(() => run);
  const send = async (id: string, args: Parameters<typeof tool.execute>[0]) => {
    const callId = ToolCallId(id);
    const execution: ToolRunContext = {
      callId,
      rootCallId: callId,
      token: Symbol(id) as ToolRunContext['token'],
      name: tool.name,
      arguments: args,
      signal: AbortSignal.timeout(5000),
      deferContext: vi.fn(),
      concludeTurn: vi.fn(),
    };
    return JSON.parse(String(await tool.execute(args, execution)));
  };
  const body = 'Answer from the original group';
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...fx.core });
  const qualify = vi.fn<NonNullable<DshImOutboundService['qualifyReplyChecked']>>(
    async (_account, route) => route,
  );
  fx.transport.qualifyReplyChecked = qualify;
  expect(await methods.messagingSource({ slug: 'ada', sourceEventId: ordinary })).toMatchObject({
    ok: true,
    value: { source: { replyCapability: { state: 'unavailable', reason: 'qq-mention-required' } } },
  });
  expect(qualify).not.toHaveBeenCalled();
  const checked = await messagingSource(methods, 'ada', addressed);
  expect(checked.source.replyCapability).toEqual({ state: 'provider-checked' });
  expect(qualify).toHaveBeenCalledWith(
    'own-app',
    expect.objectContaining({ conversationId: 'own-group', messageId: 'addressed-request' }),
    expect.anything(),
  );
  qualify.mockRejectedValueOnce(
    Object.assign(new Error('expired'), { code: 'reply-window-expired' }),
  );
  expect(await methods.messagingSource({ slug: 'ada', sourceEventId: addressed })).toMatchObject({
    ok: true,
    value: {
      source: { replyCapability: { state: 'unavailable', reason: 'reply-window-expired' } },
    },
  });
  const failure = await send('ordinary', { source_event_id: ordinary, body });
  expect(failure).toMatchObject({ status: 'refused', reason: 'qq-mention-required' });
  expect(fx.transport.replyChecked).not.toHaveBeenCalled();
  const fallback = await send('fallback', { grant_id: fx.otherGrant!.id, body });
  expect(fallback).toMatchObject({ status: 'refused', reason: 'reply-destination-required' });
  expect(fx.transport.sendChecked).not.toHaveBeenCalled();
  fx.transport.replyChecked = vi.fn(async () => {
    throw Object.assign(new Error('provider diagnostic'), { code: 'reply-window-expired' });
  });
  const expired = await send('expired', { source_event_id: addressed, body });
  expect(expired).toMatchObject({
    status: 'failed',
    reason: 'reply-window-expired',
    replyCapability: { state: 'unavailable', reason: 'reply-window-expired' },
  });
  expect(expired).not.toHaveProperty('grantId');
  expect(expired).not.toHaveProperty('conversationId');
  fx.transport.replyChecked = vi.fn(async (_account, route) => ({
    sent: true as const,
    receipt: {
      version: 1 as const,
      messageId: 'addressed-answer',
      conversationId: route.conversationId,
    },
  }));
  const reply = await send('addressed', { source_event_id: addressed, body });
  expect(reply).toMatchObject({ status: 'committed', messageId: 'addressed-answer' });
});

it('QQ ordinary permission evidence does not collect or wake until the conversation explicitly opts in', async () => {
  const fx = await fixture();
  await expect(
    fx.core.externalMessaging.inbound.setPolicy('ada', fx.grant.id, policy, { kind: 'human' }),
  ).rejects.toThrow('ordinary-delivery-unverified');
  const oldEvent = {
    ...fx.event('old-permission-probe'),
    at: new Date(Date.now() - 60_000).toISOString(),
  };
  await fx.consumer.onEvent(oldEvent, { signal: fx.consumer.signal });
  expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]?.ordinaryDelivery).toBe(
    'unverified',
  );
  await fx.receive('permission-probe');
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    0,
  );
  expect(fx.runs).toHaveLength(0);
  expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]).toMatchObject({
    ordinaryDelivery: 'verified',
    groupPolicy: { collection: 'mentions' },
  });
  await fx.core.externalMessaging.inbound.setPolicy('ada', fx.grant.id, policy, { kind: 'human' });
  await fx.receive('collected');
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    1,
  );
  expect(fx.runs).toHaveLength(0);
  await fx.core.externalMessaging.inbound.setPolicy(
    'ada',
    fx.grant.id,
    { ...policy, collection: 'mentions' },
    { kind: 'human' },
  );
  await fx.receive('after-switch-off');
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    1,
  );
  expect(fx.transport.sendChecked).not.toHaveBeenCalled();
  expect(fx.logs.filter((entry) => entry.includes('ordinary-delivery-verified'))).toHaveLength(1);
});

it.each(['deadline', 'caller cancellation'] as const)(
  'stops the QQ reply-capability query on %s during account inspection',
  async (stop) => {
    const fx = await fixture();
    await fx.receive('addressed-request', true);
    const sourceId = fx.runs.at(-1)?.triage?.current()[0];
    if (sourceId === undefined) throw new Error('Missing addressed QQ source');
    const messaging = fx.core.externalMessaging;
    const source = messaging.inbound.read('ada', sourceId);
    let markStarted = () => {};
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    let release = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const describe = fx.transport.describeBot;
    fx.transport.describeBot = async (botId) => {
      markStarted();
      await released;
      return describe(botId);
    };
    const deadline = new AbortController();
    const caller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(deadline.signal);
    const cancelled = new Error('Caller cancelled the reply-capability query');
    try {
      const result = messaging.replyCapability('ada', source, caller.signal).then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      await started;
      if (stop === 'deadline') deadline.abort();
      else caller.abort(cancelled);
      const completed = await Promise.race([result, tick('inspection pending')]);
      expect(completed).toEqual(
        stop === 'deadline'
          ? { value: { state: 'unavailable', reason: 'provider-timeout' } }
          : { error: cancelled },
      );
      expect(fx.transport.replyChecked).not.toHaveBeenCalled();
    } finally {
      timeout.mockRestore();
      fx.transport.describeBot = describe;
      release();
    }
  },
);

it.each(['image/png', 'application/octet-stream'])(
  'retains ordinary QQ %s in canonical storage only while the authorized group collects all',
  async (mediaType) => {
    const fx = await fixture(false, true);
    const receive = async (messageId: string, conversationId = 'own-group') => {
      const event: MessagingInboundEvent = {
        ...fx.event(messageId),
        conversation: { kind: 'group', id: conversationId },
        reply: { messageId, conversationId, actorId: 'member' },
        attachments: [
          {
            id: 'b'.repeat(64),
            messageId,
            resourceKey: 'private-selector',
            name: 'sample',
            mediaType,
          },
        ],
        contentParts: [{ kind: 'attachment', id: 'b'.repeat(64) }],
      };
      await fx.consumer.onEvent(event, { signal: fx.consumer.signal });
      await fx.idle();
      return event;
    };
    await receive('probe');
    expect(
      fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'"),
    ).toHaveLength(0);
    await fx.core.externalMessaging.inbound.setPolicy('ada', fx.grant.id, policy, {
      kind: 'human',
    });
    const event = await receive('retained');
    const sources = fx.query(
      "SELECT source_event_id FROM source_events WHERE source_kind = 'bridge-message'",
    );
    expect(sources).toHaveLength(1);
    const source = sources[0];
    if (!source) throw new Error('Missing canonical QQ Source Event');
    expect(
      fx.core.externalMessaging.inbound.read('ada', String(source['source_event_id'])).event,
    ).toMatchObject({
      attachments: event.attachments,
      contentParts: event.contentParts,
      mentionedAccount: false,
      actor: event.actor,
      conversation: event.conversation,
    });
    await receive('other-group', 'unapproved-group');
    await fx.core.externalMessaging.inbound.setPolicy(
      'ada',
      fx.grant.id,
      { ...policy, collection: 'mentions' },
      { kind: 'human' },
    );
    await receive('disabled');
    expect(
      fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'"),
    ).toHaveLength(1);
    expect(fx.transport.replyChecked).not.toHaveBeenCalled();
    expect(fx.transport.sendChecked).not.toHaveBeenCalled();
  },
);

it.each([true, false])(
  'QQ count harvest understands local sources and posting remains independent: proactive=%s',
  async (proactive) => {
    const fx = await fixture(proactive);
    const dm = fx.core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    const before = fx.core.channels.readMessages(dm.id);
    await fx.receive('permission-probe');
    await fx.core.externalMessaging.inbound.setPolicy('ada', fx.grant.id, policy, {
      kind: 'human',
    });
    await fx.receive('count-one');
    expect(fx.runs).toHaveLength(0);
    await fx.receive('count-two');
    expect(fx.runs).toHaveLength(1);
    expect(fx.runs[0]?.inbox).toContain('count-one');
    expect(fx.runs[0]?.inbox).toContain('count-two');
    expect(fx.runs[0]?.inbox).toContain('ordinary message; no reply required');
    expect(fx.transport.replyChecked).not.toHaveBeenCalled();
    expect(fx.transport.sendChecked).toHaveBeenCalledTimes(proactive ? 1 : 0);
    expect(fx.core.channels.readMessages(dm.id)).toEqual(before);
    await fx.receive('count-one');
    await fx.receive('count-two');
    expect(fx.runs).toHaveLength(1);
    const sources = fx.query(
      "SELECT source_event_id FROM source_events WHERE source_kind = 'bridge-message'",
    );
    expect(sources).toHaveLength(2);
    for (const source of sources)
      expect(
        fx.core.externalMessaging.inbound.read('ada', String(source['source_event_id'])).event,
      ).toMatchObject({
        mentionedAccount: false,
        actor: { id: 'member' },
        conversation: { id: 'own-group' },
      });
    const intents = fx.core.externalMessaging.history('ada');
    expect(intents).toHaveLength(proactive ? 1 : 0);
    if (proactive)
      expect(intents[0]).toMatchObject({
        state: 'provider-accepted',
        report: { platform: 'qq', conversationId: 'own-group' },
        receipt: { messageId: 'own-contribution', conversationId: 'own-group' },
      });
  },
);

it('QQ reconnect retains collection preference but discards old ordinary proof and stale lease callbacks', async () => {
  const fx = await fixture();
  await fx.receive('permission-probe');
  await fx.core.externalMessaging.inbound.setPolicy('ada', fx.grant.id, policy, { kind: 'human' });
  const old = fx.consumer;
  await fx.restart();
  expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]).toMatchObject({
    ordinaryDelivery: 'unverified',
    groupPolicy: { collection: 'all' },
  });
  await expect(old.onEvent(fx.event('stale'), { signal: old.signal })).rejects.toThrow();
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    0,
  );
  await fx.receive('fresh-after-reconnect');
  expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]?.ordinaryDelivery).toBe(
    'verified',
  );
  const current = fx.consumer;
  await fx.core.externalMessaging.inbound.setEnabled('ada', fx.grant.id, false);
  await current.onEvent(fx.event('disabled'), { signal: current.signal });
  expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]?.reception).toBe('off');
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    1,
  );
});

it('QQ local time harvest wakes once without requiring a reply for each collected message', async () => {
  const fx = await fixture();
  await fx.receive('permission-probe');
  await fx.core.externalMessaging.inbound.setPolicy(
    'ada',
    fx.grant.id,
    { ...policy, count: 10, intervalSeconds: 1 },
    { kind: 'human' },
  );
  await fx.receive('time-context');
  expect(fx.runs).toHaveLength(0);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await fx.idle();
  expect(fx.runs).toHaveLength(1);
  expect(fx.runs[0]?.inbox).toContain('time-context');
  expect(fx.transport.replyChecked).not.toHaveBeenCalled();
  expect(fx.transport.sendChecked).not.toHaveBeenCalled();
  await fx.receive('time-context');
  expect(fx.runs).toHaveLength(1);
});

it('a trusted QQ direct mention still wakes independently of silent ordinary observation', async () => {
  const fx = await fixture();
  await fx.receive('permission-probe');
  await fx.core.externalMessaging.inbound.setPolicy(
    'ada',
    fx.grant.id,
    { ...policy, wake: 'silent' },
    { kind: 'human' },
  );
  await fx.receive('quiet-context');
  expect(fx.runs).toHaveLength(0);
  await fx.receive('direct-request', true);
  expect(fx.runs).toHaveLength(1);
  expect(fx.runs[0]?.inbox).toContain('direct-request');
  expect(fx.transport.sendChecked).not.toHaveBeenCalled();
});

it('a QQ event from the blocked interval cannot qualify the newly allowed conversation', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const started = Date.parse('2026-10-14T00:00:00.000Z');
  vi.setSystemTime(started);
  const fx = await fixture();
  const current = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!;
  vi.setSystemTime(started + 60_000);
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'block',
    grantId: current.id,
    expectedRevision: current.revision,
  });
  const blocked = (await fx.core.externalMessaging.snapshot('ada')).blockedConversations?.[0];
  if (!blocked) throw new Error('No blocked QQ conversation');
  vi.setSystemTime(started + 120_000);
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'allow',
    bindingId: current.bindingId,
    conversation: { kind: 'group', id: 'own-group' },
    from: 'blocked',
    expectedRevision: blocked.revision,
  });
  await fx.idle();
  const active = (await fx.core.externalMessaging.snapshot('ada')).grants.find((g) => !g.revokedAt);
  if (!active) throw new Error('No newly allowed QQ conversation');
  const stale = { ...fx.event('blocked-interval'), at: new Date(started + 90_000).toISOString() };
  await fx.consumer.onEvent(stale, { signal: fx.consumer.signal });
  expect(
    (await fx.core.externalMessaging.snapshot('ada')).grants.find((g) => g.id === active.id)
      ?.ordinaryDelivery,
  ).toBe('unverified');
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    0,
  );
  vi.setSystemTime(started + 121_000);
  await fx.receive('fresh-after-allow');
  expect(
    (await fx.core.externalMessaging.snapshot('ada')).grants.find((g) => g.id === active.id)
      ?.ordinaryDelivery,
  ).toBe('verified');
});

it("a group's louder custom wake cannot override a Bot's only-direct-mention setting", async () => {
  const fx = await fixture();
  await fx.receive('permission-probe');
  await fx.core.externalMessaging.inbound.setPolicy(
    'ada',
    fx.grant.id,
    { ...policy, wake: 'immediate' },
    { kind: 'human' },
  );
  fx.core.sourcePolicy.setGroupOrdinary('ada', 'mentions', 5, 30, { kind: 'human' });
  await fx.receive('ordinary-chatter');
  expect(fx.runs).toHaveLength(0);
  await fx.receive('direct-request', true);
  expect(fx.runs).toHaveLength(1);
  expect(fx.runs[0]?.inbox).toContain('direct-request');
});

it('records each inbound QQ event as handled or skipped with a reason, without its text', async () => {
  const fx = await fixture();
  await fx.receive('permission-probe');
  await fx.receive('direct-request', true);
  const traces = fx.logs
    .filter(
      (entry) => entry.includes('"messaging-inbound"') && !entry.includes('ordinary-delivery'),
    )
    .map((entry) => JSON.parse(entry) as Record<string, unknown>)
    .filter((trace) => typeof trace['mentioned'] === 'boolean');
  expect(traces.map((trace) => [trace['phase'], trace['mentioned']])).toEqual([
    ['skipped', false],
    ['handled', true],
  ]);
  expect(traces[0]).toMatchObject({
    platform: 'qq',
    conversation: 'group',
    reason: 'not-admitted',
  });
  expect(JSON.stringify(traces)).not.toMatch(/permission-probe|direct-request/u);
});
