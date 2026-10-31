import { setImmediate as tick } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { attachOperationalModule } from '../src/database/owner.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import type { MessagingInboundEvent } from '../src/messaging/provider.js';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

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
async function fixture(proactive = true, media = false) {
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
    sendChecked: vi.fn(async (_account, _target, _text, options) => {
      expect(options.beforeSend?.()).toBe(true);
      return {
        sent: true as const,
        receipt: {
          version: 1 as const,
          messageId: 'own-contribution',
          conversationId: 'own-group',
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
    const dm = fx.core.channels.getOrCreateDm('ada', 'Ada')!;
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
