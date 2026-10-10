import { setImmediate as tick } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import type { MessagingInboundEvent, MessagingReplyRoute } from '../src/messaging/provider.js';
import type { OrchestratorAgentRun, BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createTempRoot } from './helpers.js';

const fingerprint = 'a'.repeat(64);
const cores: BotHarnessCore[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

function event(overrides: Partial<MessagingInboundEvent> = {}): MessagingInboundEvent {
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

async function fixture(
  options: {
    onRun?: (run: OrchestratorAgentRun) => Promise<void>;
    steer?: (botSlug: string, text: string) => boolean;
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
  let core = createCore({ dshHome: home, agents });
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
      core = createCore({ dshHome: home, agents });
      cores.push(core);
      dispose = register();
      await tick();
      await tick();
    },
  };
}

it('requires Human receive authorization, commits before ACK, runs the real Inbox without a DM placement, and replies via the trusted source', async () => {
  const fx = await fixture({
    onRun: async (run) => {
      expect(run.inboundChannelId).toBeUndefined();
      expect(run.inbox).toContain('My Lark identity');
      expect(run.inbox).toContain('omt-topic');
      const item = fx.core.attention
        .list({ botSlug: 'ada' })
        .items.find((item) => item.sourceKind === 'bridge-message');
      if (!item) throw new Error('Admission not projected');
      await expect(run.channels.send({ body: 'Wrong local destination' })).rejects.toThrow(
        'No inbound local Channel',
      );
      expect(run.externalMessaging?.read(item.id).event.actor.id).toBe('ou-human');
      await run.externalMessaging?.reply(item.id, 'Original-topic response');
    },
  });
  expect(fx.subscriptions).toBe(0);
  await fx.enable();
  expect(fx.subscriptions).toBe(1);
  expect(await fx.receive()).toEqual({ accepted: true });
  expect(
    fx.query("SELECT source_kind FROM source_events WHERE source_kind = 'bridge-message'"),
  ).toHaveLength(1);
  const stored = fx.query(
    "SELECT body, payload_json FROM source_events WHERE source_kind = 'bridge-message'",
  )[0] as { body: string; payload_json: string };
  expect(stored.body).toBe(event().text);
  const payload = JSON.parse(stored.payload_json);
  expect(payload.external).not.toHaveProperty('body');
  expect(payload.external.event).not.toHaveProperty('text');
  expect(fx.query('SELECT * FROM channel_placements')).toHaveLength(0);
  await fx.idle();
  expect(fx.runs).toHaveLength(1);
  expect(fx.replies).toEqual([
    { botId: 'lark-app', route: event().reply, text: 'Original-topic response' },
  ]);
  expect(fx.core.externalMessaging.history('ada')[0]).toMatchObject({
    state: 'provider-accepted',
    sourceEventId: expect.any(String),
  });
  expect(
    fx.query("SELECT last_error FROM inbox_admissions WHERE reason = 'group-mention'"),
  ).toEqual([{ last_error: null }]);
  const item = fx.core.attention.list({ botSlug: 'ada' }).items[0];
  expect(item).toMatchObject({
    state: 'handled',
    authorKind: 'bridged',
    externalOrigin: {
      conversationName: 'QA team',
      accountName: 'My Lark identity',
      senderId: 'ou-human',
    },
  });
});

it('ignores ordinary traffic, other group traffic and non-user sources; rejects forged account/route evidence', async () => {
  const fx = await fixture();
  await fx.enable();
  await fx.receive(
    event({ mentionedAccount: false, mentions: [{ id: 'ou-other-bot', key: '@_user_1' }] }),
  );
  await fx.receive(
    event({
      conversation: { kind: 'group', id: 'oc-other' },
      reply: { ...event().reply, conversationId: 'oc-other' },
    }),
  );
  await expect(fx.receive({ ...event(), actor: { kind: 'bot', id: 'ou-bot' } })).rejects.toThrow();
  await expect(fx.receive(event({ fingerprint: 'b'.repeat(64) }))).rejects.toThrow(
    'untrusted-source',
  );
  await expect(
    fx.receive(event({ reply: { ...event().reply, actorId: 'ou-other' } })),
  ).rejects.toThrow('untrusted-source');
  await fx.idle();
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    0,
  );
  expect(fx.runs).toHaveLength(0);
});

it('deduplicates redelivery and restart without duplicate admission, attention or reply', async () => {
  const fx = await fixture({
    onRun: async (run) => {
      const id = fx.core.attention
        .list({ botSlug: 'ada' })
        .items.find((item) => item.sourceKind === 'bridge-message')?.id;
      if (id) await run.externalMessaging?.reply(id, 'One reply');
    },
  });
  await fx.enable();
  await fx.receive();
  await fx.receive();
  await fx.idle();
  await fx.restart();
  await fx.receive();
  await fx.idle();
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    1,
  );
  expect(fx.runs).toHaveLength(1);
  expect(fx.replies).toHaveLength(1);
  expect(fx.subscriptions).toBe(1);
});

it('fails closed for revocation, old callbacks, cross-Bot sources and stopped consumers', async () => {
  const fx = await fixture();
  await fx.enable();
  await fx.receive();
  await fx.idle();
  const id = fx.core.attention.list({ botSlug: 'ada' }).items[0]!.id;
  expect(() => fx.core.externalMessaging.inbound.read('other-bot', id)).toThrow(
    'source-unavailable',
  );
  fx.core.externalMessaging.revoke('ada', fx.grant.id);
  expect(fx.subscriptions).toBe(0);
  await expect(fx.receive()).rejects.toThrow();
  await expect(fx.core.externalMessaging.reply('ada', id, 'Forbidden')).rejects.toThrow(
    'source-unavailable',
  );
  expect(fx.core.externalMessaging.inbound.read('ada', id).body).toBe(event().text);
  expect(fx.replies).toHaveLength(0);
});

it('does not repeat unknown reply outcomes and refuses a changed payload for the same source', async () => {
  const fx = await fixture();
  await fx.enable();
  await fx.receive();
  await fx.idle();
  const id = fx.core.attention.list({ botSlug: 'ada' }).items[0]!.id;
  fx.setReply(async () => {
    throw new Error('network uncertainty');
  });
  expect((await fx.core.externalMessaging.reply('ada', id, 'hello')).state).toBe('unknown-outcome');
  expect((await fx.core.externalMessaging.reply('ada', id, 'hello')).state).toBe('unknown-outcome');
  await expect(fx.core.externalMessaging.reply('ada', id, 'different')).rejects.toThrow(
    'request-conflict',
  );
  expect(fx.replies).toHaveLength(1);
});

it('marks stale/deleted remote sources as definite failure rather than rerouting to a group send', async () => {
  const fx = await fixture();
  await fx.enable();
  await fx.receive();
  await fx.idle();
  const id = fx.core.attention.list({ botSlug: 'ada' }).items[0]!.id;
  fx.setReply(async () => {
    throw Object.assign(new Error('stale'), { code: 'stale-route' });
  });
  expect(await fx.core.externalMessaging.reply('ada', id, 'hello')).toMatchObject({
    state: 'failed',
    reason: 'stale-route',
  });
  expect(fx.publicService.sendChecked).not.toHaveBeenCalled();
});

it('keeps receive lifecycle separate from proactive authorization and exposes it through the real RPC methods', async () => {
  const fx = await fixture();
  const methods = createBridgeMethods({ ...fx.core });
  expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]?.reception).toBe('off');
  expect(
    await methods.messagingReceive({ slug: 'ada', grantId: fx.grant.id, enabled: true }),
  ).toEqual({ ok: true, value: { updated: true } });
  expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]?.reception).toBe('receiving');
  await fx.receive();
  await fx.idle();
  const id = fx.core.attention.list({ botSlug: 'ada' }).items[0]!.id;
  expect(await methods.messagingSource({ slug: 'ada', sourceEventId: id })).toMatchObject({
    ok: true,
    value: { source: { body: event().text } },
  });
  expect(
    await methods.messagingReceive({ slug: 'other', grantId: fx.grant.id, enabled: false }),
  ).toMatchObject({ ok: false });
  await methods.messagingReceive({ slug: 'ada', grantId: fx.grant.id, enabled: false });
  expect(fx.subscriptions).toBe(0);
  expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]?.reception).toBe('off');
});

it('keeps a failed external turn observable without an unbounded automatic retry', async () => {
  const fx = await fixture({
    onRun: async () => {
      throw new Error('known failure');
    },
  });
  await fx.enable();
  await fx.receive();
  await fx.idle();
  await fx.idle();
  expect(fx.runs).toHaveLength(1);
  expect(
    fx.query(
      "SELECT attempt_state, last_error FROM inbox_admissions WHERE reason = 'group-mention'",
    ),
  ).toEqual([{ attempt_state: 'retryable', last_error: 'Error: known failure' }]);
});

it('archives fail closed before admission and stops consumer loss from authorizing a reply', async () => {
  const fx = await fixture();
  await fx.enable();
  fx.core.registry.setPaused('ada', true);
  await expect(fx.receive()).rejects.toThrow('consumer-unavailable');
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    0,
  );
  fx.core.registry.setPaused('ada', false);
  await fx.receive();
  await fx.idle();
  const id = fx.core.attention.list({ botSlug: 'ada' }).items[0]!.id;
  fx.dispose();
  expect(fx.subscriptions).toBe(0);
  expect(fx.core.externalMessaging.inbound.available('ada', id)).toBe(false);
  await expect(fx.core.externalMessaging.reply('ada', id, 'no borrowed identity')).rejects.toThrow(
    'source-unavailable',
  );
});

it('recovers pending committed events only after its exclusive provider lease returns', async () => {
  const fx = await fixture();
  await fx.enable();
  await fx.receive();
  fx.dispose();
  await fx.idle();
  expect(fx.runs).toHaveLength(0);
  await fx.restart();
  await fx.idle();
  expect(fx.runs).toHaveLength(1);
  expect(fx.core.attention.list({ botSlug: 'ada' }).items[0]).toMatchObject({ state: 'handled' });
});

it('uses existing group-mention steer when an Orchestrator is already active', async () => {
  let release: (() => void) | undefined;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const steer = vi.fn((_bot: string, _text: string) => true);
  const fx = await fixture({ steer, onRun: async () => waiting });
  await fx.enable();
  await fx.receive();
  await tick();
  expect(fx.runs).toHaveLength(1);
  const second = event({
    eventId: 'ev-2',
    messageId: 'om-2',
    text: 'second mention',
    reply: { ...event().reply, messageId: 'om-2' },
  });
  await fx.receive(second);
  await tick();
  expect(steer).toHaveBeenCalledWith('ada', expect.stringContaining('second mention'));
  release?.();
  await fx.idle();
  expect(fx.runs).toHaveLength(1);
  expect(fx.core.attention.list({ botSlug: 'ada' }).items.map((item) => item.state)).toEqual([
    'handled',
    'handled',
  ]);
});

it('restores exclusive intake after a cold-start account registration race without widening the grant', async () => {
  const fx = await fixture();
  await fx.enable();
  const revision = (await fx.core.externalMessaging.snapshot('ada')).grants[0]?.revision;
  fx.setReady(false);
  await fx.restart();
  expect(fx.subscriptions).toBe(0);
  fx.setReady(true);
  await vi.waitFor(() => expect(fx.subscriptions).toBe(1), { timeout: 1500 });
  expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]?.revision).toBe(revision);
  await fx.receive();
  await fx.idle();
  expect(fx.runs).toHaveLength(1);
});

it('rejects an older receive toggle without stopping the newer authorized consumer', async () => {
  const fx = await fixture();
  await fx.enable();
  const describe = fx.publicService.describeBot;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let delayOnce = true;
  fx.publicService.describeBot = async (id) => {
    if (delayOnce) {
      delayOnce = false;
      await gate;
    }
    return describe(id);
  };
  const stale = fx.enable();
  await tick();
  await fx.enable();
  const current = (await fx.core.externalMessaging.snapshot('ada')).grants[0];
  expect(fx.subscriptions).toBe(1);
  release();
  await expect(stale).rejects.toThrow();
  expect(fx.subscriptions).toBe(1);
  expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]).toMatchObject({
    revision: current?.revision,
    reception: 'receiving',
  });
});

it.each([true, false])(
  'harvests external and Assignment attention together (existing DM: %s)',
  async (withDm) => {
    const fx = await fixture({
      onRun: async (run) => {
        expect(run.inbox).toContain('Assignment completed');
        expect(run.inbox).toContain('Please reply in this topic');
        expect(run.inboundChannelId).toBe(withDm ? dm?.id : undefined);
        if (withDm) await run.channels.send({ body: 'Assignment acknowledgement' });
      },
    });
    const dm = withDm ? fx.core.channels.getOrCreateDm('ada', 'Ada') : undefined;
    const database = attachOperationalModule(fx.core.operationalDatabase, 'test');
    database.transaction(
      (db) => {
        db.prepare(`INSERT INTO source_events
      (source_event_id, source_kind, bot_slug, body, created_at)
      VALUES ('lifecycle-test', 'assignment-lifecycle', 'ada', 'Assignment completed', '2026-10-01T00:00:00Z')`).run();
        db.prepare(`INSERT INTO inbox_admissions (source_event_id, bot_slug, reason)
      VALUES ('lifecycle-test', 'ada', 'assignment-lifecycle')`).run();
      },
      ['source-event', 'bot-inbox'],
    );
    await fx.enable();
    await fx.receive();
    await fx.idle();
    expect(fx.runs).toHaveLength(1);
    expect(fx.runs[0]?.inbox).toContain('Assignment completed');
    expect(fx.runs[0]?.inboundChannelId).toBe(withDm ? dm?.id : undefined);
    expect(
      fx.query(
        `SELECT attempt_state FROM inbox_admissions WHERE source_event_id = 'lifecycle-test'`,
      ),
    ).toEqual([{ attempt_state: 'handled' }]);
  },
);

function contextEvent(
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

it('reads remote context through the bound identity, retains canonical sources without admission, and exposes exact returned context to Human', async () => {
  let anchor = '';
  const history = vi.fn<NonNullable<DshImOutboundService['historyChecked']>>(
    async (account, route, query, options) => {
      expect(account).toBe('lark-app');
      expect(route).toEqual(event().reply);
      expect(options.expectedFingerprint).toBe(fingerprint);
      return {
        version: 1,
        scope: query.scope,
        events: [event(), contextEvent('om-near', 'Unmentioned launch code: ORCHID')],
        omitted: 1,
        hasMore: false,
        coverage: 'provider-visible-human-text',
      };
    },
  );
  const fx = await fixture({
    history,
    onRun: async (run) => {
      anchor = fx.core.attention
        .list({ botSlug: 'ada' })
        .items.find((item) => item.sourceKind === 'bridge-message')!.id;
      const page = await run.externalMessaging!.context(anchor, { scope: 'thread' });
      expect(page.messages.map((item) => item.text)).toContain('Unmentioned launch code: ORCHID');
      expect(page).toMatchObject({ omitted: 1, incomplete: true });
      await run.externalMessaging!.reply(anchor, 'ORCHID');
    },
  });
  await fx.enable();
  await fx.receive();
  await fx.idle();
  expect(history).toHaveBeenCalledTimes(1);
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    2,
  );
  expect(fx.query('SELECT * FROM inbox_admissions')).toHaveLength(1);
  expect(fx.query('SELECT * FROM channel_placements')).toHaveLength(0);
  expect(fx.runs).toHaveLength(1);
  const source = fx.core.externalMessaging.inbound.read('ada', anchor);
  expect(source.contextReads?.[0]).toMatchObject({
    outcome: 'read',
    scope: 'thread',
    incomplete: true,
  });
  expect(source.contextMessages?.[1]?.text).toBe('Unmentioned launch code: ORCHID');
  const second = contextEvent('om-later', 'Later mention', true);
  history.mockResolvedValueOnce({
    version: 1,
    scope: 'group',
    events: [second],
    omitted: 0,
    hasMore: false,
    coverage: 'provider-visible-human-text',
  });
  await fx.core.externalMessaging.inbound.context('ada', anchor, 'test-read', { scope: 'group' });
  expect(fx.query('SELECT * FROM inbox_admissions')).toHaveLength(1);
  await fx.receive(second);
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    3,
  );
  expect(fx.query('SELECT * FROM inbox_admissions')).toHaveLength(2);
});

it('binds bounded continuations to source/scope, returns omitted content later, and never consumes it early', async () => {
  const large = contextEvent('om-large', 'x'.repeat(5000));
  const history = vi.fn<NonNullable<DshImOutboundService['historyChecked']>>(
    async (_account, _route, query) => ({
      version: 1,
      scope: query.scope,
      events: [large, contextEvent('om-small', 'small')],
      omitted: 0,
      hasMore: query.cursor === undefined,
      ...(query.cursor === undefined ? { nextCursor: 'provider-page-2' } : {}),
      coverage: 'provider-visible-human-text',
    }),
  );
  const fx = await fixture({ history });
  await fx.enable();
  await fx.receive();
  await fx.idle();
  const anchor = fx.core.attention.list({ botSlug: 'ada' }).items[0]!.id;
  const page = await fx.core.externalMessaging.inbound.context('ada', anchor, 'test-read', {
    scope: 'group',
    maxCharacters: 1000,
  });
  expect(page.messages).toHaveLength(0);
  expect(page.requiredCharacters).toBeGreaterThan(5000);
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    1,
  );
  await expect(
    fx.core.externalMessaging.inbound.context('ada', anchor, 'test-read', {
      scope: 'thread',
      cursor: page.nextCursor!,
    }),
  ).rejects.toThrow('history-cursor-unavailable');
  const full = await fx.core.externalMessaging.inbound.context('ada', anchor, 'test-read', {
    scope: 'group',
    cursor: page.nextCursor!,
    maxCharacters: 12000,
  });
  expect(full.messages).toHaveLength(2);
  const next = await fx.core.externalMessaging.inbound.context('ada', anchor, 'test-read', {
    scope: 'group',
    cursor: full.nextCursor!,
  });
  expect(history.mock.calls.at(-1)?.[2].cursor).toBe('provider-page-2');
  expect(next.nextCursor).toBeUndefined();
  expect(fx.query('SELECT * FROM inbox_admissions')).toHaveLength(1);
});

it('resumes the same character-limited page when its opaque Provider continuation is renewed', async () => {
  let signing = 0;
  const history = vi.fn<NonNullable<DshImOutboundService['historyChecked']>>(
    async (_account, _route, query) => ({
      version: 1,
      scope: query.scope,
      events: [contextEvent('om-large', 'x'.repeat(5000))],
      omitted: 0,
      hasMore: true,
      nextCursor: `signed-${++signing}`,
      coverage: 'provider-visible-human-text',
    }),
  );
  const fx = await fixture({ history });
  await fx.enable();
  await fx.receive();
  await fx.idle();
  const anchor = fx.core.attention.list({ botSlug: 'ada' }).items[0]!.id;
  const first = await fx.core.externalMessaging.inbound.context('ada', anchor, 'read', {
    scope: 'group',
    maxCharacters: 1000,
  });
  const resumed = await fx.core.externalMessaging.inbound.context('ada', anchor, 'read', {
    scope: 'group',
    cursor: first.nextCursor!,
    maxCharacters: 12000,
  });
  expect(resumed.messages.map((message) => message.messageId)).toEqual(['om-large']);
  await fx.core.externalMessaging.inbound.context('ada', anchor, 'read', {
    scope: 'group',
    cursor: resumed.nextCursor!,
  });
  expect(history.mock.calls.at(-1)?.[2].cursor).toBe('signed-2');
  expect(fx.query('SELECT * FROM inbox_admissions')).toHaveLength(1);
});

it.each([1000, 12000])(
  'refuses an unchanged provider continuation before retaining its page (budget %i)',
  async (maxCharacters) => {
    const history = vi.fn<NonNullable<DshImOutboundService['historyChecked']>>(
      async (_account, _route, query) => ({
        version: 1,
        scope: query.scope,
        events: [
          contextEvent(
            query.cursor === undefined ? 'om-first' : 'om-repeated-page',
            query.cursor === undefined ? 'first page' : 'x'.repeat(5000),
          ),
        ],
        omitted: 0,
        hasMore: true,
        nextCursor: 'provider-same',
        coverage: 'provider-visible-human-text',
      }),
    );
    const fx = await fixture({ history });
    await fx.enable();
    await fx.receive();
    await fx.idle();
    const anchor = fx.core.attention.list({ botSlug: 'ada' }).items[0]!.id;
    const first = await fx.core.externalMessaging.inbound.context('ada', anchor, 'test-read', {
      scope: 'group',
    });
    const retained = fx.query('SELECT source_event_id FROM source_events ORDER BY source_event_id');
    await expect(
      fx.core.externalMessaging.inbound.context('ada', anchor, 'test-read', {
        scope: 'group',
        cursor: first.nextCursor!,
        maxCharacters,
      }),
    ).rejects.toThrow('untrusted-source');
    expect(history).toHaveBeenCalledTimes(2);
    expect(history.mock.calls[1]?.[2].cursor).toBe('provider-same');
    expect(fx.query('SELECT source_event_id FROM source_events ORDER BY source_event_id')).toEqual(
      retained,
    );
    expect(fx.query('SELECT * FROM inbox_admissions')).toHaveLength(1);
    const read = fx.core.externalMessaging.inbound.read('ada', anchor);
    expect(read.contextMessages?.map((message) => message.messageId)).toEqual(['om-first']);
    expect(read.contextReads?.at(-1)).toMatchObject({
      outcome: 'refused',
      reason: 'untrusted-source',
      sourceEventIds: [],
    });
  },
);

it('refuses another Bot, guessed source, cross-group evidence and missing capability without leaking content', async () => {
  const history = vi.fn<NonNullable<DshImOutboundService['historyChecked']>>(
    async (_account, _route, query) => ({
      version: 1,
      scope: query.scope,
      events: [event({ conversation: { kind: 'group', id: 'oc-other' } })],
      omitted: 0,
      hasMore: false,
      coverage: 'provider-visible-human-text',
    }),
  );
  const fx = await fixture({ history });
  await fx.enable();
  await fx.receive();
  await fx.idle();
  const anchor = fx.core.attention.list({ botSlug: 'ada' }).items[0]!.id;
  await expect(
    fx.core.externalMessaging.inbound.context('bob', anchor, 'test-read', { scope: 'group' }),
  ).rejects.toThrow('source-unavailable');
  await expect(
    fx.core.externalMessaging.inbound.context('ada', 'guess', 'test-read', { scope: 'group' }),
  ).rejects.toThrow('source-unavailable');
  expect(history).not.toHaveBeenCalled();
  await expect(
    fx.core.externalMessaging.inbound.context('ada', anchor, 'test-read', { scope: 'group' }),
  ).rejects.toThrow('untrusted-source');
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    1,
  );
  expect(fx.core.externalMessaging.inbound.read('ada', anchor).contextReads?.at(-1)?.reason).toBe(
    'untrusted-source',
  );
  history.mockRejectedValueOnce(
    Object.assign(new Error('permission'), { code: 'history-permission-denied' }),
  );
  await expect(
    fx.core.externalMessaging.inbound.context('ada', anchor, 'test-read', { scope: 'group' }),
  ).rejects.toThrow('history-permission-denied');
  const unavailable = await fixture();
  await unavailable.enable();
  await unavailable.receive();
  await unavailable.idle();
  const id = unavailable.core.attention.list({ botSlug: 'ada' }).items[0]!.id;
  await expect(
    unavailable.core.externalMessaging.inbound.context('ada', id, 'test-read', { scope: 'group' }),
  ).rejects.toThrow('history-capability-unavailable');
});

it('cancels a blocked remote read on grant revocation and cannot persist its late result', async () => {
  let finish!: (
    value: Awaited<ReturnType<NonNullable<DshImOutboundService['historyChecked']>>>,
  ) => void;
  const history = vi.fn<NonNullable<DshImOutboundService['historyChecked']>>(
    async () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const fx = await fixture({ history });
  await fx.enable();
  await fx.receive();
  await fx.idle();
  const id = fx.core.attention.list({ botSlug: 'ada' }).items[0]!.id;
  const reading = fx.core.externalMessaging.inbound.context('ada', id, 'test-read', {
    scope: 'group',
  });
  await vi.waitFor(() => expect(history).toHaveBeenCalledTimes(1));
  const rejected = expect(reading).rejects.toThrow('history-cancelled');
  fx.core.externalMessaging.revoke('ada', fx.grant.id);
  await rejected;
  finish({
    version: 1,
    scope: 'group',
    events: [contextEvent('late', 'must not persist')],
    omitted: 0,
    hasMore: false,
    coverage: 'provider-visible-human-text',
  });
  await tick();
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    1,
  );
});

it('cancels a blocked identity preflight before any history request', async () => {
  const history = vi.fn<NonNullable<DshImOutboundService['historyChecked']>>();
  const fx = await fixture({ history });
  await fx.enable();
  await fx.receive();
  await fx.idle();
  const id = fx.core.attention.list({ botSlug: 'ada' }).items[0]!.id;
  fx.publicService.describeBot = vi.fn<DshImOutboundService['describeBot']>(
    async () => new Promise(() => undefined),
  );
  const controller = new AbortController();
  const reading = fx.core.externalMessaging.inbound.context(
    'ada',
    id,
    'test-read',
    { scope: 'group' },
    controller.signal,
  );
  const rejected = expect(reading).rejects.toThrow('history-cancelled');
  controller.abort();
  await rejected;
  expect(history).not.toHaveBeenCalled();
  expect(fx.core.externalMessaging.inbound.read('ada', id).contextReads).toBeUndefined();
});

it.each([false, true])(
  'settles only existing admissions actually returned by context (failed turn: %s)',
  async (failed) => {
    const returned = contextEvent('pending-returned', 'returned mention', true);
    const omitted = contextEvent('pending-omitted', 'omitted mention', true);
    const history = vi.fn<NonNullable<DshImOutboundService['historyChecked']>>(
      async (_account, _route, query) => ({
        version: 1,
        scope: query.scope,
        events: [returned],
        omitted: 0,
        hasMore: false,
        coverage: 'provider-visible-human-text',
      }),
    );
    let returnedId = '';
    let omittedId = '';
    const fx = await fixture({
      history,
      onRun: async (run) => {
        const anchor = fx.core.attention.list({ botSlug: 'ada' }).items[0]!.id;
        const source = fx.core.externalMessaging.inbound.read('ada', anchor);
        const database = attachOperationalModule(fx.core.operationalDatabase, 'test');
        database.transaction(
          (db) => {
            for (const [id, event] of [['test-omitted', omitted]] as const) {
              db.prepare(
                "INSERT INTO source_events (source_event_id, source_kind, bot_slug, body, created_at, payload_json) VALUES (?, 'bridge-message', 'ada', ?, ?, ?)",
              ).run(
                id,
                event.text,
                event.at,
                JSON.stringify({ author: { kind: 'bridged' }, external: { ...source, id, event } }),
              );
            }
          },
          ['source-event'],
        );
        const page = await run.externalMessaging!.context(anchor, { scope: 'thread' });
        returnedId = page.messages[0]!.sourceEventId;
        omittedId = 'test-omitted';
        database.transaction(
          (db) => {
            db.prepare(
              "INSERT INTO inbox_admissions (source_event_id, bot_slug, reason) VALUES (?, 'ada', 'group-mention')",
            ).run(returnedId);
            db.prepare(
              "INSERT INTO inbox_admissions (source_event_id, bot_slug, reason) VALUES (?, 'ada', 'group-mention')",
            ).run(omittedId);
          },
          ['bot-inbox'],
        );
        await run.externalMessaging!.context(anchor, { scope: 'thread' });
        if (failed) throw new Error('context turn failure');
      },
    });
    await fx.enable();
    await fx.receive();
    await fx.idle();
    const rows = fx.query(
      'SELECT source_event_id, attempt_state, observed_at FROM inbox_admissions',
    );
    expect(rows.find((row) => row.source_event_id === returnedId)).toMatchObject({
      attempt_state: failed ? 'needs-repair' : 'handled',
      observed_at: expect.any(String),
    });
    expect(rows.find((row) => row.source_event_id === omittedId)).toMatchObject({
      attempt_state: 'retryable',
      observed_at: null,
    });
  },
);

it('enriches display names without changing canonical identity and preserves harvest references and mention mappings', async () => {
  const named = event({
    actor: { kind: 'user', id: 'ou-human', name: 'Alex' },
    mentions: [{ id: 'ou-bot', key: '@_user_1', name: 'QA Bot' }],
  });
  const history = vi.fn<NonNullable<DshImOutboundService['historyChecked']>>(
    async (_account, _route, query) => ({
      version: 1,
      scope: query.scope,
      events: [named],
      omitted: 0,
      hasMore: false,
      coverage: 'provider-visible-human-text',
    }),
  );
  const fx = await fixture({
    history,
    onRun: async (run) => {
      const source = fx.core.attention
        .list({ botSlug: 'ada' })
        .items.find((item) => item.sourceKind === 'bridge-message')!;
      expect(run.inbox).toContain(`Message om-1 [Source Event ${source.id}]`);
      expect(run.inbox).toContain('"@ou-bot Please reply in this topic"');
      expect(run.inbox).toContain('{"role":"mentioned","id":"ou-bot"}');
      expect(run.inbox).not.toContain('@_user_1');
      const page = await run.externalMessaging!.context(source.id, { scope: 'thread' });
      expect(page.messages[0]).toMatchObject({
        sourceEventId: source.id,
        messageId: 'om-1',
        senderId: 'ou-human',
        senderName: 'Alex',
        mentions: [{ id: 'ou-bot', key: '@_user_1', name: 'QA Bot' }],
      });
    },
  });
  await fx.enable();
  await fx.receive();
  await fx.idle();
  const item = fx.core.attention.list({ botSlug: 'ada' }).items[0]!;
  expect(item.externalOrigin?.senderName).toBe('Alex');
  expect(fx.core.externalMessaging.inbound.read('ada', item.id).event.actor).toEqual(named.actor);
  await fx.receive(named);
  await fx.idle();
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    1,
  );
  expect(fx.query('SELECT * FROM inbox_admissions')).toHaveLength(1);
  expect(fx.runs).toHaveLength(1);
  history.mockResolvedValueOnce({
    version: 1,
    scope: 'thread',
    events: [event()],
    omitted: 0,
    hasMore: false,
    coverage: 'provider-visible-human-text',
  });
  await fx.core.externalMessaging.inbound.context('ada', item.id, 'again', { scope: 'thread' });
  expect(
    fx.core.externalMessaging.inbound.read('ada', item.id).contextMessages?.[0]?.senderName,
  ).toBe('Alex');
});

async function sharedTarget(fx: Awaited<ReturnType<typeof fixture>>) {
  expect(fx.core.registry.create({ slug: 'bea', displayName: 'Bea' }).ok).toBe(true);
  const methods = createBridgeMethods({ ...fx.core });
  const result = methods.channelCreate({ name: 'Shared Lark work', members: ['ada', 'bea'] });
  if (!result.ok) throw new Error(result.error.message);
  const channelId = result.value.channel.id;
  expect(
    await methods.messagingChannelTarget({ slug: 'ada', grantId: fx.grant.id, channelId }),
  ).toEqual({ ok: true, value: { updated: true } });
  return channelId;
}

it('places one canonical external Source Event in a shared Channel, wakes only the addressed identity and preserves its reply route', async () => {
  let channelId: string;
  let sourceId: string;
  const fx = await fixture({
    onRun: async (run) => {
      if (run.bot.slug === 'ada') {
        expect(run.inboundChannelId).toBe(channelId);
        const item = fx.core.attention
          .list({ botSlug: 'ada' })
          .items.find((item) => item.sourceKind === 'bridge-message')!;
        sourceId = item.id;
        expect(run.channels.read({ channelId })[0]?.message).toMatchObject({
          id: sourceId,
          author: { kind: 'bridged', source: 'Human sender' },
          body: event().text,
          bridgeOrigin: {
            messageId: 'om-1',
            sourceEventId: sourceId,
            senderId: 'ou-human',
            senderName: 'Human sender',
            threadId: 'omt-topic',
          },
        });
        expect(run.externalMessaging?.read(sourceId).localChannelId).toBe(channelId);
        await run.externalMessaging?.reply(sourceId, 'Shared work reply');
      } else {
        expect(run.bot.slug).toBe('bea');
        expect(run.channels.query({ channelId, text: 'Please reply' }).messages).toHaveLength(1);
        expect(run.channels.read({ channelId })[0]?.message.id).toBe(sourceId);
        expect(run.externalMessaging?.read(sourceId).event.actor.id).toBe('ou-human');
        await expect(run.externalMessaging?.reply(sourceId, 'Borrowed identity')).rejects.toThrow(
          'own-reply-grant-unavailable',
        );
      }
    },
  });
  channelId = await sharedTarget(fx);
  expect((await fx.core.externalMessaging.snapshot('ada')).channelTargets).toContainEqual({
    id: channelId,
    name: 'Shared Lark work',
  });
  await fx.enable();
  expect(
    await fx.receive(event({ actor: { kind: 'user', id: 'ou-human', name: 'Human sender' } })),
  ).toEqual({ accepted: true });
  expect(fx.core.channels.readMessages(channelId)).toHaveLength(1);
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    1,
  );
  expect(fx.query('SELECT * FROM channel_placements')).toHaveLength(1);
  expect(fx.core.attention.list({ botSlug: 'bea' }).items).toHaveLength(0);
  await fx.idle();
  expect(fx.runs.map((run) => run.bot.slug)).toEqual(['ada']);
  expect(fx.replies).toEqual([
    { botId: 'lark-app', route: event().reply, text: 'Shared work reply' },
  ]);
  const dm = fx.core.channels.getOrCreateDm('bea', 'Bea')!;
  await fx.core.channels.appendMessage(dm.id, {
    id: 'check',
    at: '2026-10-01T00:01:00Z',
    author: { kind: 'human' },
    body: 'Read the shared Channel',
  });
  fx.core.runtime.admitDmMessage({
    channelId: dm.id,
    messageId: 'check',
    body: 'Read the shared Channel',
  });
  await fx.idle();
  expect(fx.runs.map((run) => run.bot.slug)).toEqual(['ada', 'bea']);
  expect(
    fx.core.channels.readMessages(fx.core.channels.getOrCreateDm('ada', 'Ada')!.id),
  ).toHaveLength(0);
  expect(fx.replies).toHaveLength(1);
  await fx.receive();
  await fx.idle();
  await fx.restart();
  await fx.receive();
  await fx.idle();
  expect(fx.core.channels.readMessages(channelId)).toHaveLength(1);
  expect(fx.core.channels.readMessages(channelId)[0]?.bridgeOrigin).toMatchObject({
    senderName: 'Human sender',
    senderId: 'ou-human',
    sourceEventId: sourceId!,
  });
  expect(fx.runs.map((run) => run.bot.slug)).toEqual(['ada', 'bea']);
  expect(fx.replies).toHaveLength(1);
  expect(fx.query("SELECT * FROM inbox_admissions WHERE reason = 'group-mention'")).toHaveLength(1);
});

it('refuses non-group or nonmember targets without changing the grant, and supports returning to Inbox-only reception', async () => {
  const fx = await fixture();
  const methods = createBridgeMethods({ ...fx.core });
  const dm = fx.core.channels.getOrCreateDm('ada', 'Ada')!;
  const other = fx.core.channels.createGroup({ name: 'Other members', members: [] });
  for (const channelId of [dm.id, other.id, 'missing']) {
    expect(
      await methods.messagingChannelTarget({ slug: 'ada', grantId: fx.grant.id, channelId }),
    ).toMatchObject({ ok: false, error: { code: 'channel-unavailable' } });
  }
  expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]?.revision).toBe(
    fx.grant.revision,
  );
  await sharedTarget(fx);
  await methods.messagingChannelTarget({ slug: 'ada', grantId: fx.grant.id, channelId: null });
  await fx.enable();
  await fx.receive();
  await fx.idle();
  expect(fx.runs[0]?.inboundChannelId).toBeUndefined();
  expect(fx.query('SELECT * FROM channel_placements')).toHaveLength(0);
});

it('closes intake and old-source authority on Channel departure while retaining the shared fact', async () => {
  const fx = await fixture();
  const channelId = await sharedTarget(fx);
  await fx.enable();
  await fx.receive();
  await fx.idle();
  const id = fx.core.attention.list({ botSlug: 'ada' }).items[0]!.id;
  fx.core.channels.removeGroupMember(channelId, 'ada');
  expect(fx.core.externalMessaging.inbound.status(fx.grant.id)).toBe('unavailable');
  expect(() => fx.core.externalMessaging.inbound.read('ada', id)).toThrow('channel-unavailable');
  expect(fx.core.externalMessaging.inbound.available('ada', id)).toBe(false);
  await expect(fx.core.externalMessaging.reply('ada', id, 'Too late')).rejects.toThrow(
    'source-unavailable',
  );
  expect(
    await fx.receive(
      event({ eventId: 'ev-2', messageId: 'om-2', reply: { ...event().reply, messageId: 'om-2' } }),
    ),
  ).toEqual({ accepted: true });
  await fx.idle();
  expect(fx.replies).toHaveLength(0);
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    1,
  );
  expect(fx.core.channels.readMessages(channelId).some((message) => message.id === id)).toBe(true);
  await fx.restart();
  await fx.receive(
    event({ eventId: 'ev-3', messageId: 'om-3', reply: { ...event().reply, messageId: 'om-3' } }),
  );
  await fx.idle();
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    1,
  );
});

it('revoking a Channel bridge before the queued turn starts preserves its placement without waking or sending', async () => {
  const fx = await fixture();
  const channelId = await sharedTarget(fx);
  await fx.enable();
  await fx.receive();
  fx.core.externalMessaging.revoke('ada', fx.grant.id);
  await fx.idle();
  expect(fx.subscriptions).toBe(0);
  expect(fx.runs).toHaveLength(0);
  expect(fx.replies).toHaveLength(0);
  expect(fx.core.channels.readMessages(channelId)).toHaveLength(1);
});

function ordinaryEvent(id: string): MessagingInboundEvent {
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
const reception = { collection: 'all', wake: 'digest', count: 2, intervalSeconds: 60 } as const;

it('requires actual ordinary delivery, versions collection separately from wake, and preserves admitted facts when disabled', async () => {
  const fx = await fixture();
  await fx.enable();
  await expect(
    fx.core.externalMessaging.inbound.setPolicy('ada', fx.grant.id, reception, { kind: 'human' }),
  ).rejects.toThrow('ordinary-delivery-unverified');
  await fx.receive(ordinaryEvent('probe'));
  await fx.idle();
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    0,
  );
  expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]).toMatchObject({
    ordinaryDelivery: 'verified',
    groupPolicy: { revision: 0, collection: 'mentions' },
  });
  await fx.core.externalMessaging.inbound.setPolicy('ada', fx.grant.id, reception, {
    kind: 'human',
  });
  const first = ordinaryEvent('first');
  await fx.receive(first);
  await fx.idle();
  expect(fx.runs).toHaveLength(0);
  expect(
    fx.query(
      "SELECT reason, wake_count, wake_policy_revision FROM inbox_admissions WHERE reason = 'group-ordinary'",
    ),
  ).toEqual([{ reason: 'group-ordinary', wake_count: 2, wake_policy_revision: 1 }]);
  await fx.core.externalMessaging.inbound.setPolicy(
    'ada',
    fx.grant.id,
    { ...reception, collection: 'mentions' },
    { kind: 'bot', botSlug: 'ada' },
  );
  await fx.receive(ordinaryEvent('excluded'));
  await fx.idle();
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    1,
  );
  expect(fx.core.attention.list({ botSlug: 'ada' }).items).toHaveLength(1);
  expect(fx.core.externalMessaging.inbound.policy('ada', fx.grant.id)).toMatchObject({
    revision: 2,
    editor: { kind: 'bot', botSlug: 'ada' },
    collection: 'mentions',
  });
  await fx.core.externalMessaging.inbound.setPolicy('ada', fx.grant.id, reception, {
    kind: 'human',
  });
  await fx.receive(first);
  await fx.idle();
  expect(fx.runs).toHaveLength(0);
  expect(fx.query('SELECT wake_policy_revision FROM inbox_admissions')).toEqual([
    { wake_policy_revision: 1 },
  ]);
  expect(
    fx.query('SELECT * FROM messaging_group_policy_revisions WHERE revision > 0'),
  ).toHaveLength(3);
});

it('harvests an ordinary digest by count once, retaining individual source IDs and trusted origin', async () => {
  const fx = await fixture();
  await fx.enable();
  await fx.receive(ordinaryEvent('probe'));
  await fx.core.externalMessaging.inbound.setPolicy('ada', fx.grant.id, reception, {
    kind: 'human',
  });
  const first = ordinaryEvent('count-one');
  await fx.receive(first);
  await fx.idle();
  expect(fx.runs).toHaveLength(0);
  const second = ordinaryEvent('count-two');
  await fx.receive(second);
  await fx.idle();
  expect(fx.runs).toHaveLength(1);
  expect(fx.runs[0]?.inbox).toContain('count-one');
  expect(fx.runs[0]?.inbox).toContain('count-two');
  expect(fx.runs[0]?.inbox).toContain('ordinary message; no reply required');
  expect(fx.runs[0]?.inboundChannelId).toBeUndefined();
  expect(fx.replies).toHaveLength(0);
  await fx.receive(first);
  await fx.receive(second);
  await fx.idle();
  expect(fx.runs).toHaveLength(1);
  expect(
    fx.query("SELECT attempt_state FROM inbox_admissions WHERE reason = 'group-ordinary'"),
  ).toEqual([{ attempt_state: 'handled' }, { attempt_state: 'handled' }]);
});

it('recovers a time digest across restart without changing its recorded revision or replaying a handled source', async () => {
  const fx = await fixture();
  await fx.enable();
  await fx.receive(ordinaryEvent('probe'));
  await fx.core.externalMessaging.inbound.setPolicy(
    'ada',
    fx.grant.id,
    { ...reception, count: 10, intervalSeconds: 1 },
    { kind: 'human' },
  );
  const first = ordinaryEvent('time-one');
  await fx.receive(first);
  await fx.idle();
  expect(fx.runs).toHaveLength(0);
  await fx.restart();
  expect(fx.core.externalMessaging.inbound.policy('ada', fx.grant.id)).toMatchObject({
    revision: 1,
    count: 10,
  });
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await fx.idle();
  expect(fx.runs).toHaveLength(1);
  expect(fx.runs[0]?.inbox).toContain('time-one');
  await fx.receive(first);
  await fx.idle();
  expect(fx.runs).toHaveLength(1);
});

it('queues immediate ordinary traffic after the active turn without steering it', async () => {
  let finish!: () => void;
  const busy = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let started!: () => void;
  const start = new Promise<void>((resolve) => {
    started = resolve;
  });
  const steer = vi.fn(() => true);
  const fx = await fixture({
    steer,
    onRun: async () => {
      if (fx.runs.length === 1) {
        started();
        await busy;
      }
    },
  });
  await fx.enable();
  await fx.receive(ordinaryEvent('probe'));
  await fx.core.externalMessaging.inbound.setPolicy(
    'ada',
    fx.grant.id,
    { ...reception, wake: 'immediate' },
    { kind: 'human' },
  );
  await fx.receive(event());
  await start;
  expect(fx.runs).toHaveLength(1);
  await fx.receive(ordinaryEvent('while-busy'));
  await tick();
  await tick();
  expect(fx.runs).toHaveLength(1);
  expect(steer).not.toHaveBeenCalled();
  finish();
  await fx.idle();
  expect(fx.runs).toHaveLength(2);
  expect(fx.runs[1]?.inbox).toContain('while-busy');
});

it('keeps mentions-only wake passive until the same group mention and keeps silent admissions unread', async () => {
  const fx = await fixture();
  await fx.enable();
  await fx.receive(ordinaryEvent('probe'));
  await fx.core.externalMessaging.inbound.setPolicy(
    'ada',
    fx.grant.id,
    { ...reception, wake: 'silent' },
    { kind: 'human' },
  );
  await fx.receive(ordinaryEvent('silent'));
  await fx.idle();
  await fx.core.externalMessaging.inbound.setPolicy(
    'ada',
    fx.grant.id,
    { ...reception, wake: 'mentions' },
    { kind: 'human' },
  );
  await fx.receive(ordinaryEvent('passive'));
  await fx.idle();
  expect(fx.runs).toHaveLength(0);
  await fx.receive(event());
  await fx.idle();
  expect(fx.runs).toHaveLength(1);
  expect(fx.runs[0]?.inbox).toContain('passive');
  expect(fx.runs[0]?.inbox).not.toContain('Ordinary silent');
  expect(
    fx.core.attention
      .list({ botSlug: 'ada' })
      .items.find((item) => item.summary === 'Ordinary silent')?.state,
  ).toBe('pending');
});

it('does not let another Bot or a revoked grant configure group collection', async () => {
  const fx = await fixture();
  await fx.enable();
  await fx.receive(ordinaryEvent('probe'));
  await expect(
    fx.core.externalMessaging.inbound.setPolicy('ada', fx.grant.id, reception, {
      kind: 'bot',
      botSlug: 'other',
    }),
  ).rejects.toThrow('grant-unavailable');
  await expect(
    fx.core.externalMessaging.inbound.setPolicy('other', fx.grant.id, reception, { kind: 'human' }),
  ).rejects.toThrow('grant-unavailable');
  fx.core.externalMessaging.revoke('ada', fx.grant.id);
  await expect(
    fx.core.externalMessaging.inbound.setPolicy('ada', fx.grant.id, reception, { kind: 'human' }),
  ).rejects.toThrow('grant-unavailable');
});

it('coharvests mention-context ordinary items with an active mention steer and settles the same included batch', async () => {
  let finish!: () => void;
  let began!: () => void;
  const started = new Promise<void>((resolve) => {
    began = resolve;
  });
  const held = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const steer = vi.fn((_bot: string, _text: string) => true);
  const fx = await fixture({
    steer,
    onRun: async () => {
      began();
      await held;
    },
  });
  await fx.enable();
  await fx.receive(ordinaryEvent('probe'));
  await fx.core.externalMessaging.inbound.setPolicy(
    'ada',
    fx.grant.id,
    { ...reception, wake: 'mentions' },
    { kind: 'human' },
  );
  await fx.receive(event());
  await started;
  await fx.receive(ordinaryEvent('active-context'));
  await tick();
  expect(steer).not.toHaveBeenCalled();
  await fx.receive(
    event({
      eventId: 'ev-2',
      messageId: 'om-2',
      text: '@_user_1 second mention',
      reply: { ...event().reply, messageId: 'om-2' },
    }),
  );
  await tick();
  expect(steer).toHaveBeenCalledTimes(1);
  expect(steer.mock.calls[0]?.[1]).toContain('active-context');
  finish();
  await fx.idle();
  expect(fx.runs).toHaveLength(1);
  expect(
    fx.query("SELECT attempt_state FROM inbox_admissions WHERE reason = 'group-ordinary'"),
  ).toEqual([{ attempt_state: 'handled' }]);
});

function ordinaryThread(id: string, threadId = 'omt-topic'): MessagingInboundEvent {
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
function externalAnchor(fx: Awaited<ReturnType<typeof fixture>>): string {
  const item = fx.core.attention
    .list({ botSlug: 'ada' })
    .items.find((item) => item.sourceKind === 'bridge-message');
  if (!item) throw new Error('No external anchor');
  return item.id;
}
const botEditor = { kind: 'bot', botSlug: 'ada' } as const;

it('follows only an Inbox-anchored verified Thread, harvests ordinary replies and retains exact admission policy revisions', async () => {
  const fx = await fixture();
  await fx.enable();
  await fx.receive();
  await fx.idle();
  const anchor = externalAnchor(fx);
  expect(fx.core.externalMessaging.inbound.threads('ada', fx.grant.id)[0]).toMatchObject({
    mode: 'inherit',
    revision: 0,
    ordinaryDelivery: 'unverified',
  });
  await expect(
    fx.core.externalMessaging.inbound.setThread(
      'ada',
      anchor,
      { mode: 'follow', expectedRevision: 0, wake: null },
      botEditor,
    ),
  ).rejects.toThrow('thread-delivery-unverified');
  await fx.receive(ordinaryThread('delivery-probe'));
  await fx.idle();
  expect(fx.query("SELECT body FROM source_events WHERE body = 'Ordinary delivery-probe'")).toEqual(
    [],
  );
  await fx.core.externalMessaging.inbound.setThread(
    'ada',
    anchor,
    {
      mode: 'follow',
      expectedRevision: 0,
      wake: { wake: 'digest', count: 2, intervalSeconds: 60 },
    },
    botEditor,
  );
  const mismatch = ordinaryThread('mismatched-root');
  await expect(
    fx.receive({ ...mismatch, reply: { ...mismatch.reply, rootId: 'wrong-root' } }),
  ).rejects.toThrow('thread-route-mismatch');
  await fx.receive(ordinaryThread('wrong-topic', 'omt-other'));
  await fx.receive(ordinaryEvent('main-group'));
  await fx.receive(ordinaryThread('followed-one'));
  await fx.idle();
  expect(fx.runs).toHaveLength(1);
  expect(
    fx.query(
      "SELECT body FROM source_events WHERE body IN ('Ordinary main-group', 'Ordinary wrong-topic')",
    ),
  ).toEqual([]);
  expect(
    fx.query(
      "SELECT external_thread_policy_revision, wake_count, wake_mode FROM inbox_admissions WHERE reason = 'group-ordinary'",
    ),
  ).toEqual([{ external_thread_policy_revision: 1, wake_count: 2, wake_mode: 'digest' }]);
  await fx.receive(ordinaryThread('followed-two'));
  await fx.idle();
  expect(fx.runs).toHaveLength(2);
  expect(fx.runs[1]?.inbox).toContain('Ordinary followed-one');
  expect(fx.runs[1]?.inbox).toContain('omt-topic');
  await fx.core.externalMessaging.inbound.setThread(
    'ada',
    anchor,
    { mode: 'inherit', expectedRevision: 1, wake: null },
    botEditor,
  );
  await fx.receive(ordinaryThread('after-unfollow'));
  await fx.idle();
  expect(fx.query("SELECT body FROM source_events WHERE body = 'Ordinary after-unfollow'")).toEqual(
    [],
  );
  expect(
    fx.query(
      "SELECT external_thread_policy_revision FROM inbox_admissions WHERE reason = 'group-ordinary'",
    ),
  ).toEqual([{ external_thread_policy_revision: 1 }, { external_thread_policy_revision: 1 }]);
  await expect(
    fx.core.externalMessaging.inbound.setThread(
      'ada',
      anchor,
      { mode: 'follow', expectedRevision: 1, wake: null },
      botEditor,
    ),
  ).rejects.toThrow('thread-policy-conflict');
});

it('persists follow across restart, deduplicates redelivery and unfollows back to all-group reception', async () => {
  const fx = await fixture();
  await fx.enable();
  await fx.receive();
  await fx.idle();
  const anchor = externalAnchor(fx);
  await fx.receive(ordinaryThread('proof'));
  await fx.core.externalMessaging.inbound.setThread(
    'ada',
    anchor,
    { mode: 'follow', expectedRevision: 0, wake: null },
    botEditor,
  );
  await fx.restart();
  expect(fx.core.externalMessaging.inbound.threads('ada', fx.grant.id)[0]).toMatchObject({
    revision: 1,
    mode: 'follow',
    editor: botEditor,
    ordinaryDelivery: 'unverified',
  });
  const ordinary = ordinaryThread('after-restart');
  await fx.receive(ordinary);
  await fx.receive(ordinary);
  await fx.idle();
  expect(fx.query("SELECT * FROM inbox_admissions WHERE reason = 'group-ordinary'")).toHaveLength(
    1,
  );
  await fx.core.externalMessaging.inbound.setPolicy('ada', fx.grant.id, reception, {
    kind: 'human',
  });
  await fx.core.externalMessaging.inbound.setThread(
    'ada',
    anchor,
    { mode: 'inherit', expectedRevision: 1, wake: null },
    botEditor,
  );
  await fx.receive(ordinaryThread('inherits-all'));
  await fx.idle();
  expect(
    fx.query(
      "SELECT external_thread_policy_revision, wake_policy_revision, wake_count FROM inbox_admissions WHERE reason = 'group-ordinary' ORDER BY external_thread_policy_revision",
    ),
  ).toEqual([
    { external_thread_policy_revision: 1, wake_policy_revision: 0, wake_count: 5 },
    { external_thread_policy_revision: 2, wake_policy_revision: 1, wake_count: 2 },
  ]);
});

it('gives Human override precedence, rejects stale revisions and foreign/stale anchors, and preserves immutable history', async () => {
  const fx = await fixture();
  await fx.enable();
  await fx.receive();
  await fx.idle();
  const anchor = externalAnchor(fx);
  await fx.receive(ordinaryThread('proof'));
  await fx.core.externalMessaging.inbound.setThread(
    'ada',
    anchor,
    { mode: 'exclude', expectedRevision: 0, wake: null },
    { kind: 'human' },
  );
  await expect(
    fx.core.externalMessaging.inbound.setThread(
      'ada',
      anchor,
      { mode: 'follow', expectedRevision: 1, wake: null },
      botEditor,
    ),
  ).rejects.toThrow('human-thread-override');
  await fx.core.externalMessaging.inbound.setPolicy('ada', fx.grant.id, reception, {
    kind: 'human',
  });
  await fx.receive(ordinaryThread('human-excluded'));
  await fx.idle();
  expect(fx.query("SELECT body FROM source_events WHERE body = 'Ordinary human-excluded'")).toEqual(
    [],
  );
  await fx.core.externalMessaging.inbound.setThread(
    'ada',
    anchor,
    { mode: 'inherit', expectedRevision: 1, wake: null },
    { kind: 'human' },
  );
  await fx.core.externalMessaging.inbound.setThread(
    'ada',
    anchor,
    { mode: 'follow', expectedRevision: 2, wake: null },
    botEditor,
  );
  await expect(
    fx.core.externalMessaging.inbound.setThread(
      'eve',
      anchor,
      { mode: 'follow', expectedRevision: 3, wake: null },
      { kind: 'bot', botSlug: 'eve' },
    ),
  ).rejects.toThrow();
  expect(
    fx.query('SELECT revision FROM messaging_thread_policy_revisions ORDER BY revision'),
  ).toEqual([{ revision: 1 }, { revision: 2 }, { revision: 3 }]);
  await fx.core.externalMessaging.inbound.setEnabled('ada', fx.grant.id, false);
  await expect(
    fx.core.externalMessaging.inbound.setThread(
      'ada',
      anchor,
      { mode: 'inherit', expectedRevision: 3, wake: null },
      botEditor,
    ),
  ).rejects.toThrow('grant-unavailable');
  expect(fx.query('SELECT revision FROM messaging_thread_policy_revisions')).toHaveLength(3);
});

it('counts followed Thread digests independently and never lets another Thread reach its threshold', async () => {
  const fx = await fixture();
  await fx.enable();
  await fx.receive();
  await fx.idle();
  const anchorA = externalAnchor(fx);
  const mentionB = event({
    messageId: 'mention-b',
    eventId: 'ev-mention-b',
    text: 'Mention B',
    reply: {
      ...event().reply,
      messageId: 'mention-b',
      threadId: 'omt-other',
      rootId: 'root-omt-other',
    },
  });
  await fx.receive(mentionB);
  await fx.idle();
  const anchorB = fx.core.attention
    .list({ botSlug: 'ada' })
    .items.find((item) => item.summary === 'Mention B')!.id;
  await fx.receive(ordinaryThread('probe-a'));
  await fx.receive(ordinaryThread('probe-b', 'omt-other'));
  const input = {
    mode: 'follow',
    expectedRevision: 0,
    wake: { wake: 'digest', count: 2, intervalSeconds: 600 },
  } as const;
  await fx.core.externalMessaging.inbound.setThread('ada', anchorA, input, botEditor);
  await fx.core.externalMessaging.inbound.setThread('ada', anchorB, input, botEditor);
  const before = fx.runs.length;
  await fx.receive(ordinaryThread('a-one'));
  await fx.receive(ordinaryThread('b-one', 'omt-other'));
  await fx.idle();
  expect(fx.runs).toHaveLength(before);
  await fx.receive(ordinaryThread('a-two'));
  await fx.idle();
  expect(fx.runs).toHaveLength(before + 1);
  expect(fx.runs.at(-1)?.inbox).toContain('Ordinary a-one');
  expect(fx.runs.at(-1)?.inbox).toContain('Ordinary a-two');
  expect(fx.runs.at(-1)?.inbox).not.toContain('Ordinary b-one');
  expect(
    fx.query(
      "SELECT a.attempt_state FROM inbox_admissions a JOIN source_events s USING(source_event_id) WHERE s.body = 'Ordinary b-one'",
    ),
  ).toEqual([{ attempt_state: 'pending' }]);
});

it.each([
  ['Alex', 'Alex'],
  [undefined, 'ou-human'],
])('counts a bridged Channel Source Event once with actor name %s', async (name, label) => {
  const fx = await fixture();
  const channelId = await sharedTarget(fx);
  await fx.enable();
  const inbound = event({
    at: new Date().toISOString(),
    actor: { kind: 'user', id: 'ou-human', ...(name === undefined ? {} : { name }) },
  });
  await fx.receive(inbound);
  await fx.receive(inbound);
  await fx.idle();
  expect(createBridgeMethods({ ...fx.core }).channelActivityToday({})).toMatchObject({
    ok: true,
    value: {
      total: 1,
      channels: expect.arrayContaining([
        {
          channelId,
          name: 'Shared Lark work',
          type: 'group',
          total: 1,
          human: 0,
          bot: 0,
          other: 1,
          senders: [{ author: { kind: 'bridged', source: label }, displayName: label, count: 1 }],
        },
      ]),
    },
  });
});

function managedEvent(
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
async function addManagedBridge(fx: Awaited<ReturnType<typeof fixture>>, enabled = true) {
  const result = createBridgeMethods({ ...fx.core }).channelCreate({
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
async function bridgeRow(fx: Awaited<ReturnType<typeof fixture>>, channelId: string) {
  return (await fx.core.externalMessaging.channelBridges(channelId)).bridges[0]!;
}
it('Channel Bridge pause survives reconnect, retains accepted reply authority and resumes without replay or duplicate consumers', async () => {
  const fx = await fixture();
  const channelId = await addManagedBridge(fx);
  const first = managedEvent(fx);
  await fx.receive(first);
  await fx.idle();
  const sourceId = fx.core.channels.readMessages(channelId)[0]!.id;
  let row = await bridgeRow(fx, channelId);
  await fx.core.externalMessaging.inbound.channelBridge(channelId, {
    kind: 'update',
    grantId: row.grantId,
    expectedGrantRevision: row.grantRevision,
    expectedRevision: row.revision,
    name: 'Paused intake',
    enabled: false,
    collection: 'mentions',
  });
  expect(fx.subscriptions).toBe(1);
  expect((await bridgeRow(fx, channelId)).reception).toBe('off');
  await fx.receive(
    managedEvent(fx, {
      eventId: 'off',
      messageId: 'off',
      reply: { ...event().reply, messageId: 'off' },
    }),
  );
  await fx.core.externalMessaging.reply('ada', sourceId, 'Accepted before pause');
  expect(fx.replies).toHaveLength(1);
  await fx.restart();
  expect(fx.subscriptions).toBe(1);
  await fx.receive(
    managedEvent(fx, {
      eventId: 'off-restart',
      messageId: 'off-restart',
      reply: { ...event().reply, messageId: 'off-restart' },
    }),
  );
  expect(fx.core.channels.readMessages(channelId)).toHaveLength(1);
  expect(fx.query("SELECT * FROM source_events WHERE source_kind='bridge-message'")).toHaveLength(
    1,
  );
  row = await bridgeRow(fx, channelId);
  await fx.core.externalMessaging.inbound.channelBridge(channelId, {
    kind: 'update',
    grantId: row.grantId,
    expectedGrantRevision: row.grantRevision,
    expectedRevision: row.revision,
    name: row.name,
    enabled: true,
    collection: 'mentions',
  });
  await fx.receive(first);
  await fx.receive(
    managedEvent(fx, {
      eventId: 'new',
      messageId: 'new',
      reply: { ...event().reply, messageId: 'new' },
    }),
  );
  await fx.idle();
  expect(fx.subscriptions).toBe(1);
  expect(fx.core.channels.readMessages(channelId)).toHaveLength(2);
  expect(fx.runs).toHaveLength(2);
});
it('deleting a Channel Bridge retains history and Bot identity, removes Channel intake, leaves later mentions to the bound app default traffic and fences old source replies', async () => {
  const fx = await fixture();
  const channelId = await addManagedBridge(fx);
  await fx.receive(managedEvent(fx));
  await fx.idle();
  const sourceId = fx.core.channels.readMessages(channelId)[0]!.id;
  const row = await bridgeRow(fx, channelId);
  const oldCallback = fx.callback!;
  await fx.core.externalMessaging.inbound.channelBridge(channelId, {
    kind: 'delete',
    grantId: row.grantId,
    expectedGrantRevision: row.grantRevision,
    expectedRevision: row.revision,
  });
  expect(fx.subscriptions).toBe(0);
  expect(fx.core.externalMessaging.inbound.read('ada', sourceId).body).toBe(event().text);
  await expect(fx.core.externalMessaging.reply('ada', sourceId, 'Removed route')).rejects.toThrow(
    'source-unavailable',
  );
  await expect(oldCallback(event(), { signal: new AbortController().signal })).rejects.toThrow();
  const snapshot = await fx.core.externalMessaging.snapshot('ada');
  expect(snapshot.identities?.[0]).toMatchObject({ enabled: true, grantCount: 1 });
  expect(snapshot.grants[0]).not.toHaveProperty('receiveScope');
  expect(snapshot.grants[0]).not.toHaveProperty('channelBridge');
  expect(snapshot.grants[0]).not.toHaveProperty('receiveTargetChannelId');
  expect((await fx.core.externalMessaging.channelBridges(channelId)).sources).toHaveLength(1);
  await fx.restart();
  expect(fx.subscriptions).toBe(1);
  await expect(
    fx.receive(
      event({
        messageId: 'after-route-removal',
        reply: { ...event().reply, messageId: 'after-route-removal' },
      }),
    ),
  ).resolves.toEqual({ accepted: true });
  expect(
    attachOperationalModule(fx.core.operationalDatabase, 'messaging').read((db) =>
      db
        .prepare("SELECT count(*) AS n FROM source_events WHERE source_kind = 'bridge-message'")
        .get(),
    ),
  ).toMatchObject({ n: 2 });
  expect(fx.core.channels.readMessages(channelId)).toHaveLength(1);
  expect(
    fx.query(
      "SELECT a.reason FROM inbox_admissions a JOIN source_events e USING(source_event_id) WHERE json_extract(e.payload_json, '$.external.event.messageId') = 'after-route-removal'",
    ),
  ).toEqual([{ reason: 'group-mention' }]);
});
it.each(['pause', 'delete'] as const)(
  'refuses delayed messages sent during %s after reactivation and restart, while accepting fresh messages',
  async (mode) => {
    const fx = await fixture();
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-03T10:00:00.000Z'));
      const channelId = await addManagedBridge(fx);
      await fx.receive(managedEvent(fx));
      await fx.idle();
      let row = await bridgeRow(fx, channelId);
      vi.setSystemTime(new Date('2026-10-03T10:00:05.000Z'));
      const version = {
        grantId: row.grantId,
        expectedGrantRevision: row.grantRevision,
        expectedRevision: row.revision,
      };
      await fx.core.externalMessaging.inbound.channelBridge(
        channelId,
        mode === 'delete'
          ? { ...version, kind: 'delete' }
          : { ...version, kind: 'update', name: row.name, enabled: false, collection: 'mentions' },
      );
      const delayed = event({
        eventId: 'delayed',
        messageId: 'delayed',
        at: '2026-10-03T10:00:10.000Z',
        reply: { ...event().reply, messageId: 'delayed' },
      });
      vi.setSystemTime(new Date('2026-10-03T10:00:20.000Z'));
      if (mode === 'delete') {
        const grant = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!;
        await fx.core.externalMessaging.inbound.channelBridge(channelId, {
          kind: 'add',
          grantId: grant.id,
          expectedGrantRevision: grant.revision,
          name: row.name,
          enabled: true,
          collection: 'mentions',
        });
      } else {
        row = await bridgeRow(fx, channelId);
        await fx.core.externalMessaging.inbound.channelBridge(channelId, {
          kind: 'update',
          grantId: row.grantId,
          expectedGrantRevision: row.grantRevision,
          expectedRevision: row.revision,
          name: row.name,
          enabled: true,
          collection: 'mentions',
        });
      }
      await fx.restart();
      await fx.receive(delayed);
      await fx.idle();
      expect(fx.core.channels.readMessages(channelId)).toHaveLength(1);
      expect(
        fx.query("SELECT * FROM source_events WHERE source_kind='bridge-message'"),
      ).toHaveLength(1);
      expect(fx.subscriptions).toBe(1);
      await fx.receive(
        managedEvent(fx, {
          eventId: 'fresh',
          messageId: 'fresh',
          reply: { ...event().reply, messageId: 'fresh' },
        }),
      );
      await fx.idle();
      expect(fx.core.channels.readMessages(channelId)).toHaveLength(2);
      expect(
        fx.query("SELECT * FROM source_events WHERE source_kind='bridge-message'"),
      ).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  },
);
it('Bridge writes reject stale configuration and departed Humans, and expose explicit DM targets', async () => {
  const fx = await fixture();
  const channelId = await addManagedBridge(fx, false);
  const row = await bridgeRow(fx, channelId);
  const update = {
    kind: 'update' as const,
    grantId: row.grantId,
    expectedGrantRevision: row.grantRevision,
    expectedRevision: row.revision,
    name: row.name,
    enabled: false,
    collection: 'mentions' as const,
  };
  await fx.core.externalMessaging.inbound.channelBridge(channelId, update);
  await expect(fx.core.externalMessaging.inbound.channelBridge(channelId, update)).rejects.toThrow(
    'bridge-stale',
  );
  const dm = fx.core.channels.getOrCreateDm('ada', 'Ada')!;
  expect((await fx.core.externalMessaging.channelBridges(dm.id)).canTargetInbox).toBe(true);
  attachOperationalModule(fx.core.operationalDatabase, 'test').transaction((db) => {
    db.prepare(
      "UPDATE channel_human_members SET left_at = '2026-10-03T00:00:00Z' WHERE channel_id = ?",
    ).run(channelId);
  });
  await expect(fx.core.externalMessaging.channelBridges(channelId)).rejects.toThrow(
    'channel-unavailable',
  );
  await expect(
    fx.core.externalMessaging.inbound.channelBridge(channelId, {
      ...update,
      expectedRevision: row.revision + 1,
    }),
  ).rejects.toThrow('channel-unavailable');
  expect(
    (await fx.core.externalMessaging.snapshot('ada')).grants[0]?.bridgeRoutes?.[0]?.enabled,
  ).toBe(false);
});
it('all-message Bridge intake requires observed ordinary delivery and preserves per-Bot wake policy', async () => {
  const fx = await fixture();
  const channelId = await addManagedBridge(fx);
  let row = await bridgeRow(fx, channelId);
  const update = () => ({
    kind: 'update' as const,
    grantId: row.grantId,
    expectedGrantRevision: row.grantRevision,
    expectedRevision: row.revision,
    name: row.name,
    enabled: true,
    collection: 'all' as const,
  });
  await expect(
    fx.core.externalMessaging.inbound.channelBridge(channelId, update()),
  ).rejects.toThrow('ordinary-delivery-unverified');
  const ordinary = managedEvent(fx, {
    mentionedAccount: false,
    mentions: [],
    reply: { messageId: 'om-1', conversationId: 'oc-team', actorId: 'ou-human' },
  });
  await fx.receive(ordinary);
  expect(fx.core.channels.readMessages(channelId)).toHaveLength(0);
  await fx.core.externalMessaging.inbound.setPolicy(
    'ada',
    fx.grant.id,
    { collection: 'mentions', wake: 'digest', count: 2, intervalSeconds: 300 },
    { kind: 'human' },
  );
  await fx.core.externalMessaging.inbound.channelBridge(channelId, update());
  row = await bridgeRow(fx, channelId);
  expect(row.collection).toBe('all');
  expect(fx.core.externalMessaging.inbound.policy('ada', fx.grant.id)).toMatchObject({
    collection: 'mentions',
    wake: 'digest',
    count: 2,
    intervalSeconds: 300,
  });
  await fx.receive({
    ...ordinary,
    eventId: 'ordinary-new',
    messageId: 'ordinary-new',
    reply: { ...ordinary.reply, messageId: 'ordinary-new' },
  });
  expect(fx.core.channels.readMessages(channelId)).toHaveLength(1);
  await fx.idle();
  expect(fx.runs).toHaveLength(0);
});

async function collectSharedOrdinary(fx: Awaited<ReturnType<typeof fixture>>) {
  const channelId = await sharedTarget(fx);
  await fx.enable();
  await fx.receive(ordinaryEvent('shared-probe'));
  await fx.core.externalMessaging.inbound.setPolicy('ada', fx.grant.id, reception, {
    kind: 'human',
  });
  return channelId;
}

it('commits shared ordinary facts once and gives each member an independent effective policy before ACK', async () => {
  const fx = await fixture();
  const id = await collectSharedOrdinary(fx);
  fx.core.channels.setGroupWakePolicy(id, 'ada', { mode: 'digest', count: 2, intervalSeconds: 60 });
  fx.core.channels.setGroupWakePolicy(id, 'bea', { mode: 'digest', count: 3, intervalSeconds: 60 });
  const first = {
    ...ordinaryEvent('shared-one'),
    actor: { kind: 'user' as const, id: 'ou-human', name: 'Alex' },
  };
  await fx.receive(first);
  expect(fx.core.channels.queryMessages(id, { text: 'shared-one' }).messages).toHaveLength(1);
  expect(
    fx.query('SELECT bot_slug, wake_count, reason FROM inbox_admissions ORDER BY bot_slug'),
  ).toEqual([
    { bot_slug: 'ada', wake_count: 2, reason: 'group-ordinary' },
    { bot_slug: 'bea', wake_count: 3, reason: 'group-ordinary' },
  ]);
  await fx.idle();
  expect(fx.runs).toHaveLength(0);
  await fx.receive(ordinaryEvent('shared-two'));
  await fx.idle();
  expect(fx.runs.map((r) => r.bot.slug)).toEqual(['ada']);
  expect(fx.runs[0]?.message).toContain(
    'Alex (feishu, sender ou-human, external message shared-one)',
  );
  expect(fx.runs[0]?.message).toContain('[Source Event ');
  expect(fx.runs[0]?.inboundChannelId).toBe(id);
  await fx.receive(ordinaryEvent('shared-three'));
  await fx.idle();
  expect(fx.runs.map((r) => r.bot.slug)).toEqual(['ada', 'bea']);
  expect(fx.runs[1]?.message).toContain('shared-one');
  expect(fx.runs[1]?.message).toContain('shared-three');
  const sourceId = fx.core.channels.readMessages(id)[0]!.id;
  expect(() => fx.core.externalMessaging.inbound.read('bea', sourceId)).toThrow(
    'source-unavailable',
  );
  await fx.receive(first);
  await fx.idle();
  expect(fx.core.channels.readMessages(id)).toHaveLength(3);
  expect(fx.query('SELECT * FROM inbox_admissions')).toHaveLength(6);
  expect(fx.runs).toHaveLength(2);
  expect(fx.replies).toHaveLength(0);
});

it('uses each Bot default and effective channel override in the Human query and refuses nonmember channels', async () => {
  const fx = await fixture();
  const id = await sharedTarget(fx);
  fx.core.sourcePolicy.setGroupOrdinary('bea', 'silent', 5, 30, { kind: 'human' });
  const methods = createBridgeMethods({ ...fx.core });
  expect(methods.channelGroupWakePolicies({ channelId: id })).toMatchObject({
    ok: true,
    value: {
      members: [
        {
          botSlug: 'ada',
          inherited: true,
          policy: { mode: 'digest', count: 5, intervalSeconds: 30 },
        },
        { botSlug: 'bea', inherited: true, policy: { mode: 'silent' } },
      ],
    },
  });
  expect(
    methods.channelGroupWakeSet({
      channelId: id,
      botSlug: 'ada',
      mode: 'digest',
      count: 2,
      intervalSeconds: 60,
    }),
  ).toMatchObject({ ok: true });
  expect(methods.channelGroupWakePolicies({ channelId: id })).toMatchObject({
    ok: true,
    value: { members: [{ inherited: false, policy: { count: 2 } }, { inherited: true }] },
  });
  const privateGroup = fx.core.channels.getOrCreateDm('ada', 'Ada')!;
  expect(methods.channelGroupWakePolicies({ channelId: privateGroup.id })).toMatchObject({
    ok: false,
  });
  expect(
    methods.channelGroupWakeSet({
      channelId: privateGroup.id,
      botSlug: 'ada',
      mode: 'all',
      count: 1,
      intervalSeconds: 1,
    }),
  ).toMatchObject({ ok: false });
});

it('queues immediate ordinary traffic behind the active turn without steer and independently admits a timed member', async () => {
  let finish!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((r) => {
    entered = r;
  });
  const busy = new Promise<void>((r) => {
    finish = r;
  });
  const steer = vi.fn(() => true);
  const fx = await fixture({
    steer,
    onRun: async (run) => {
      if (run.bot.slug === 'ada' && fx.runs.filter((r) => r.bot.slug === 'ada').length === 1) {
        entered();
        await busy;
      }
    },
  });
  const id = await collectSharedOrdinary(fx);
  vi.useFakeTimers({ toFake: ['Date'] });
  const clock = Date.now();
  try {
    fx.core.channels.setGroupWakePolicy(id, 'ada', { mode: 'all', count: 1, intervalSeconds: 60 });
    fx.core.channels.setGroupWakePolicy(id, 'bea', {
      mode: 'digest',
      count: 100,
      intervalSeconds: 1,
    });
    await fx.receive(ordinaryEvent('busy-one'));
    await started;
    await fx.receive(ordinaryEvent('busy-two'));
    await tick();
    expect(fx.runs.map((r) => r.bot.slug)).toEqual(['ada']);
    expect(steer).not.toHaveBeenCalled();
    vi.setSystemTime(clock + 1100);
    await new Promise((r) => setTimeout(r, 1100));
    expect(fx.runs.map((r) => r.bot.slug)).toEqual(['ada', 'bea']);
    finish();
    await fx.idle();
    expect(fx.runs.map((r) => r.bot.slug)).toEqual(['ada', 'bea', 'ada']);
    expect(fx.runs[2]?.message).toContain('busy-two');
  } finally {
    finish();
    await fx.idle();
    vi.useRealTimers();
  }
});

it('retains pending ordinary facts across restart, policy revisions, silent collection and membership removal', async () => {
  const fx = await fixture();
  const id = await collectSharedOrdinary(fx);
  fx.core.channels.setGroupWakePolicy(id, 'ada', { mode: 'digest', count: 2, intervalSeconds: 60 });
  fx.core.channels.setGroupWakePolicy(id, 'bea', { mode: 'silent', count: 2, intervalSeconds: 60 });
  await fx.receive(ordinaryEvent('restart-one'));
  await fx.idle();
  await fx.restart();
  fx.core.channels.setGroupWakePolicy(id, 'ada', { mode: 'digest', count: 3, intervalSeconds: 60 });
  await fx.receive(ordinaryEvent('revision-two'));
  await fx.idle();
  expect(fx.runs).toHaveLength(0);
  expect(
    fx.query(
      "SELECT wake_policy_revision, wake_count FROM inbox_admissions WHERE bot_slug = 'ada' ORDER BY rowid",
    ),
  ).toEqual([
    { wake_policy_revision: 1, wake_count: 2 },
    { wake_policy_revision: 2, wake_count: 3 },
  ]);
  fx.core.channels.removeGroupMember(id, 'bea');
  await fx.receive(ordinaryEvent('after-departure'));
  expect(fx.query("SELECT * FROM inbox_admissions WHERE bot_slug = 'bea'")).toHaveLength(2);
  expect(fx.core.channels.readMessages(id).filter((m) => m.author.kind === 'bridged')).toHaveLength(
    3,
  );
});

it('catches up a busy shared Channel in bounded oldest-first harvests rather than one run per external event', async () => {
  let finish!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((r) => {
    entered = r;
  });
  const busy = new Promise<void>((r) => {
    finish = r;
  });
  const fx = await fixture({
    onRun: async (run) => {
      if (run.bot.slug === 'ada' && fx.runs.length === 1) {
        entered();
        await busy;
      }
    },
  });
  const id = await collectSharedOrdinary(fx);
  fx.core.channels.setGroupWakePolicy(id, 'ada', { mode: 'all', count: 1, intervalSeconds: 60 });
  fx.core.channels.setGroupWakePolicy(id, 'bea', { mode: 'silent', count: 1, intervalSeconds: 60 });
  await fx.receive(ordinaryEvent('catchup-000'));
  await started;
  for (let i = 1; i <= 105; ++i)
    await fx.receive(ordinaryEvent(`catchup-${String(i).padStart(3, '0')}`));
  expect(fx.core.channels.readMessages(id, { limit: 200 })).toHaveLength(106);
  finish();
  await fx.idle();
  expect(fx.runs.length).toBeGreaterThan(2);
  expect(fx.runs.length).toBeLessThan(10);
  expect(fx.runs[1]?.message).toContain('catchup-001');
  expect(fx.runs[1]?.message).toContain('further messages');
  expect(fx.runs.at(-1)?.message).toContain('catchup-105');
  expect(
    fx.query(
      "SELECT * FROM inbox_admissions WHERE bot_slug = 'ada' AND attempt_state != 'handled'",
    ),
  ).toHaveLength(0);
});

it('brings mentions-only shared ordinary context into the next addressed external turn without waking silent members', async () => {
  const fx = await fixture();
  const id = await collectSharedOrdinary(fx);
  fx.core.channels.setGroupWakePolicy(id, 'ada', {
    mode: 'mentions',
    count: 5,
    intervalSeconds: 30,
  });
  fx.core.channels.setGroupWakePolicy(id, 'bea', { mode: 'silent', count: 5, intervalSeconds: 30 });
  await fx.receive(ordinaryEvent('context-only'));
  await fx.idle();
  expect(fx.runs).toHaveLength(0);
  await fx.receive(
    event({
      eventId: 'ev-context-trigger',
      messageId: 'context-trigger',
      at: new Date().toISOString(),
      reply: { messageId: 'context-trigger', conversationId: 'oc-team', actorId: 'ou-human' },
    }),
  );
  await fx.idle();
  expect(fx.runs.map((r) => r.bot.slug)).toEqual(['ada']);
  expect(fx.runs[0]?.message).toContain('context-only');
  expect(
    fx.query("SELECT attempt_state FROM inbox_admissions WHERE bot_slug = 'ada' ORDER BY rowid"),
  ).toEqual([{ attempt_state: 'handled' }, { attempt_state: 'handled' }]);
  expect(fx.query("SELECT attempt_state FROM inbox_admissions WHERE bot_slug = 'bea'")).toEqual([
    { attempt_state: 'pending' },
  ]);
});

it('settles shared mention context for only the steered Bot and keeps other members pending', async () => {
  let finish!: () => void;
  let began!: () => void;
  const started = new Promise<void>((resolve) => {
    began = resolve;
  });
  const held = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const steer = vi.fn((_bot: string, _text: string) => true);
  const fx = await fixture({
    steer,
    onRun: async () => {
      began();
      await held;
    },
  });
  const id = await collectSharedOrdinary(fx);
  fx.core.channels.setGroupWakePolicy(id, 'ada', {
    mode: 'mentions',
    count: 5,
    intervalSeconds: 30,
  });
  fx.core.channels.setGroupWakePolicy(id, 'bea', { mode: 'silent', count: 5, intervalSeconds: 30 });
  try {
    await fx.receive();
    await started;
    await fx.receive(ordinaryEvent('shared-steer-context'));
    await tick();
    expect(steer).not.toHaveBeenCalled();
    await fx.receive(
      event({
        eventId: 'steer-shared',
        messageId: 'steer-shared',
        text: '@_user_1 next mention',
        reply: { ...event().reply, messageId: 'steer-shared' },
      }),
    );
    await tick();
    expect(steer).toHaveBeenCalledTimes(1);
    expect(steer.mock.calls[0]?.[1]).toContain('shared-steer-context');
  } finally {
    finish();
  }
  await fx.idle();
  expect(
    fx.query(
      "SELECT attempt_state, observed_at IS NOT NULL AS seen FROM inbox_admissions WHERE reason = 'group-ordinary' AND bot_slug = 'ada'",
    ),
  ).toEqual([{ attempt_state: 'handled', seen: 1 }]);
  expect(
    fx.query("SELECT attempt_state, observed_at FROM inbox_admissions WHERE bot_slug = 'bea'"),
  ).toEqual([{ attempt_state: 'pending', observed_at: null }]);
});

it('keeps receiving-Bot Thread thresholds separate while other members use their Channel rule', async () => {
  const fx = await fixture();
  const id = await sharedTarget(fx);
  fx.core.channels.setGroupWakePolicy(id, 'ada', { mode: 'silent', count: 5, intervalSeconds: 60 });
  fx.core.channels.setGroupWakePolicy(id, 'bea', { mode: 'digest', count: 3, intervalSeconds: 60 });
  await fx.enable();
  for (const threadId of ['omt-topic', 'omt-second']) {
    const route = ordinaryThread('route-' + threadId, threadId);
    await fx.receive({ ...route, mentionedAccount: true, mentions: event().mentions });
    await fx.idle();
    const anchor = fx.core.channels
      .readMessages(id)
      .find((m) => m.bridgeOrigin?.threadId === threadId)!.id;
    await fx.receive(ordinaryThread('probe-' + threadId, threadId));
    await fx.core.externalMessaging.inbound.setThread(
      'ada',
      anchor,
      {
        mode: 'follow',
        expectedRevision: 0,
        wake: { wake: 'digest', count: 2, intervalSeconds: 60 },
      },
      botEditor,
    );
  }
  await fx.receive(ordinaryThread('partition-first', 'omt-topic'));
  await fx.receive(ordinaryThread('partition-second', 'omt-second'));
  await fx.idle();
  expect(fx.runs).toHaveLength(2);
  await fx.receive(ordinaryThread('partition-third', 'omt-topic'));
  await fx.idle();
  expect(fx.runs.filter((r) => r.bot.slug === 'ada')).toHaveLength(3);
  expect(fx.runs.filter((r) => r.bot.slug === 'bea')).toHaveLength(1);
  expect(
    fx.query(
      "SELECT wake_count, external_thread_policy_revision FROM inbox_admissions WHERE reason = 'group-ordinary' AND bot_slug = 'bea'",
    ),
  ).toEqual(
    Array.from({ length: 3 }, () => ({ wake_count: 3, external_thread_policy_revision: null })),
  );
});

it('handles a local member reply after shared external harvest without granting ordinary bot traffic Memory authority', async () => {
  const fx = await fixture();
  const id = await collectSharedOrdinary(fx);
  fx.core.channels.setGroupWakePolicy(id, 'ada', { mode: 'all', count: 1, intervalSeconds: 60 });
  fx.core.channels.setGroupWakePolicy(id, 'bea', { mode: 'all', count: 1, intervalSeconds: 60 });
  await fx.receive(ordinaryEvent('external-start'));
  await fx.idle();
  await fx.runs
    .find((run) => run.bot.slug === 'ada')!
    .channels.send({ body: 'Local shared result' });
  await fx.idle();
  const local = fx.core.channels.readMessages(id).find((m) => m.body === 'Local shared result')!;
  expect(local).toBeDefined();
  expect(
    fx.query(
      `SELECT a.attempt_state, a.last_error FROM inbox_admissions a JOIN source_events e USING(source_event_id) WHERE e.message_id = '${local.id}' AND a.bot_slug = 'bea'`,
    ),
  ).toEqual([{ attempt_state: 'handled', last_error: null }]);
  const peerReplyTurn = fx.runs.find(
    (r) => r.bot.slug === 'bea' && r.message.includes('Local shared result'),
  );
  expect(peerReplyTurn).toBeDefined();
  expect(peerReplyTurn!.memory).toBeUndefined();
  expect(fx.core.channels.readMessages(id).some((m) => m.sessionFailure)).toBe(false);
});

async function inboxShareTarget(fx: Awaited<ReturnType<typeof fixture>>) {
  expect(fx.core.registry.create({ slug: 'bea', displayName: 'Bea' }).ok).toBe(true);
  const methods = createBridgeMethods({ ...fx.core });
  const result = methods.channelCreate({
    name: 'Explicit Inbox collaboration',
    members: ['ada', 'bea'],
  });
  if (!result.ok) throw new Error(result.error.message);
  const id = result.value.channel.id;
  fx.core.channels.setGroupWakePolicy(id, 'ada', { mode: 'silent', count: 1, intervalSeconds: 60 });
  fx.core.channels.setGroupWakePolicy(id, 'bea', { mode: 'all', count: 1, intervalSeconds: 60 });
  await fx.idle();
  return id;
}

it('shares an own-Inbox source through the owning Orchestrator, preserves one owner attention and lets an unbound helper discuss locally', async () => {
  let channelId = '';
  let sourceId = '';
  let shared = false;
  const fx = await fixture({
    onRun: async (run) => {
      if (run.bot.slug === 'ada' && run.inbox.includes('Share this Inbox fact')) {
        const item = fx.core.attention
          .list({ botSlug: 'ada' })
          .items.find((item) => item.summary.includes('Share this Inbox fact'))!;
        sourceId = item.id;
        expect(run.externalMessaging!.read(sourceId).localChannelId).toBeUndefined();
        const before = fx.query(
          `SELECT * FROM inbox_admissions WHERE source_event_id = '${sourceId}' AND bot_slug = 'ada'`,
        );
        expect(run.externalMessaging!.share(sourceId, channelId)).toMatchObject({
          sourceEventId: sourceId,
          channelId,
          messageId: sourceId,
          alreadyShared: false,
        });
        const after = fx.query(
          `SELECT * FROM inbox_admissions WHERE source_event_id = '${sourceId}' AND bot_slug = 'ada'`,
        );
        expect(after).toEqual([{ ...before[0], side_effect_started_at: expect.any(String) }]);
        expect(run.externalMessaging!.read(sourceId).localChannelId).toBeUndefined();
        expect(run.externalMessaging!.share(sourceId, channelId).alreadyShared).toBe(true);
        shared = true;
      }
      if (run.bot.slug === 'bea' && run.message.includes('Share this Inbox fact')) {
        expect(run.channels.read({ channelId })[0]?.message).toMatchObject({
          id: sourceId,
          body: 'Share this Inbox fact',
          author: { kind: 'bridged', source: 'Alex' },
          bridgeOrigin: {
            sourceEventId: sourceId,
            senderId: 'ou-human',
            messageId: 'om-1',
            mentions: [{ id: 'ou-bot', key: '@_user_1', name: 'QA Bot' }],
          },
        });
        expect(run.externalMessaging!.read(sourceId).event.actor.name).toBe('Alex');
        await expect(async () =>
          run.externalMessaging!.reply(sourceId, 'Borrowed identity'),
        ).rejects.toThrow('own-reply-grant-unavailable');
        await run.channels.send({ channelId, body: 'Helper local discussion' });
      }
    },
  });
  channelId = await inboxShareTarget(fx);
  await fx.enable();
  await fx.receive(
    event({
      text: 'Share this Inbox fact',
      mentions: [{ id: 'ou-bot', key: '@_user_1', name: 'QA Bot' }],
      actor: { kind: 'user', id: 'ou-human', name: 'Alex' },
      at: new Date().toISOString(),
    }),
  );
  await fx.idle();
  expect(
    fx.query(
      "SELECT last_error FROM inbox_admissions WHERE bot_slug = 'ada' AND reason = 'group-mention'",
    ),
  ).toEqual([{ last_error: null }]);
  expect(shared).toBe(true);
  expect(
    fx.query(
      `SELECT last_error FROM inbox_admissions WHERE source_event_id = '${sourceId}' AND bot_slug = 'bea'`,
    ),
  ).toEqual([{ last_error: null }]);
  expect(
    fx.query(`SELECT source_event_id FROM source_events WHERE source_kind = 'bridge-message'`),
  ).toEqual([{ source_event_id: sourceId }]);
  expect(
    fx.query(
      `SELECT bot_slug, reason, attempt_state FROM inbox_admissions WHERE source_event_id = '${sourceId}' ORDER BY bot_slug`,
    ),
  ).toEqual([
    { bot_slug: 'ada', reason: 'group-mention', attempt_state: 'handled' },
    { bot_slug: 'bea', reason: 'group-ordinary', attempt_state: 'handled' },
  ]);
  expect(fx.core.channels.readMessages('dm-ada').some((message) => message.id === sourceId)).toBe(
    false,
  );
  expect(
    fx.core.channels.readMessages(channelId).filter((message) => message.id === sourceId),
  ).toHaveLength(1);
  expect(fx.core.channels.readMessages(channelId).map((message) => message.body)).toContain(
    'Helper local discussion',
  );
  expect(fx.core.channels.readMessages(channelId).some((message) => message.sessionFailure)).toBe(
    false,
  );
  expect(
    fx.runs.filter((run) => run.bot.slug === 'ada' && run.inbox.includes('Share this Inbox fact')),
  ).toHaveLength(1);
  expect(fx.replies).toEqual([]);
  expect(fx.core.externalMessaging.history('ada')).toEqual([]);
  expect(fx.core.externalMessaging.history('bea')).toEqual([]);
  const granted = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!;
  expect(granted.receiveTargetChannelId).toBeUndefined();
  await fx.receive(
    event({
      reply: { ...event().reply, messageId: 'next-private' },
      messageId: 'next-private',
      eventId: 'ev-next-private',
      text: 'Later private Inbox traffic',
    }),
  );
  await fx.idle();
  expect(
    fx.core.channels
      .readMessages(channelId)
      .some((message) => message.body === 'Later private Inbox traffic'),
  ).toBe(false);
  await fx.restart();
  expect(fx.core.externalMessaging.inbound.share('ada', sourceId, channelId).alreadyShared).toBe(
    true,
  );
  expect(
    fx.core.channels.readMessages(channelId).find((message) => message.id === sourceId)
      ?.bridgeOrigin?.mentions,
  ).toEqual([{ id: 'ou-bot', key: '@_user_1', name: 'QA Bot' }]);
  expect(
    fx.core.channels.readMessages(channelId).filter((message) => message.id === sourceId),
  ).toHaveLength(1);
  expect(
    fx.query(`SELECT * FROM inbox_admissions WHERE source_event_id = '${sourceId}'`),
  ).toHaveLength(2);
});

it('rejects a foreign source, a DM, removed membership, unavailable receiving authority and cross-Channel reshare without partial placement', async () => {
  const fx = await fixture();
  const channelId = await inboxShareTarget(fx);
  await fx.enable();
  await fx.receive();
  await fx.idle();
  const sourceId = externalAnchor(fx);
  const share = (bot: string, source = sourceId, destination = channelId) =>
    fx.core.externalMessaging.inbound.share(bot, source, destination);
  expect(() => share('bea')).toThrow('source-unavailable');
  expect(() => share('ada', 'fabricated-source')).toThrow('source-unavailable');
  expect(() => share('ada', sourceId, 'dm-ada')).toThrow('channel-unavailable');
  fx.core.channels.removeGroupMember(channelId, 'ada');
  expect(() => share('ada')).toThrow('channel-unavailable');
  expect(
    fx.query(`SELECT * FROM channel_placements WHERE source_event_id = '${sourceId}'`),
  ).toEqual([]);
  expect(
    fx.query(`SELECT * FROM inbox_admissions WHERE source_event_id = '${sourceId}'`),
  ).toHaveLength(1);
});

it('preserves shared history on revocation and refuses not-yet-started sharing', async () => {
  const fx = await fixture();
  const channelId = await inboxShareTarget(fx);
  await fx.enable();
  await fx.receive();
  await fx.idle();
  const first = externalAnchor(fx);
  fx.core.externalMessaging.inbound.share('ada', first, channelId);
  await fx.receive(
    event({
      reply: { ...event().reply, messageId: 'unshared' },
      messageId: 'unshared',
      eventId: 'ev-unshared',
      text: 'Not shared',
    }),
  );
  await fx.idle();
  const second = fx.core.attention
    .list({ botSlug: 'ada' })
    .items.find((item) => item.summary === 'Not shared')!.id;
  fx.core.externalMessaging.revoke('ada', fx.grant.id);
  expect(() => fx.core.externalMessaging.inbound.share('ada', second, channelId)).toThrow(
    'source-unavailable',
  );
  expect(fx.query(`SELECT * FROM channel_placements WHERE source_event_id = '${second}'`)).toEqual(
    [],
  );
  expect(fx.core.channels.message(channelId, first)?.bridgeOrigin?.sourceEventId).toBe(first);
  expect(
    fx.query(`SELECT * FROM inbox_admissions WHERE source_event_id = '${second}'`),
  ).toHaveLength(1);
});

it('keeps a silent helper pending, does not admit later joiners on share retry, and refuses an already Channel-targeted source', async () => {
  const fx = await fixture();
  const id = await inboxShareTarget(fx);
  fx.core.channels.setGroupWakePolicy(id, 'bea', { mode: 'silent', count: 1, intervalSeconds: 60 });
  await fx.enable();
  await fx.receive();
  await fx.idle();
  const source = externalAnchor(fx);
  fx.core.externalMessaging.inbound.share('ada', source, id);
  await fx.idle();
  expect(
    fx.query(
      `SELECT attempt_state, wake_mode FROM inbox_admissions WHERE source_event_id = '${source}' AND bot_slug = 'bea'`,
    ),
  ).toEqual([{ attempt_state: 'pending', wake_mode: 'silent' }]);
  expect(fx.core.registry.create({ slug: 'cee', displayName: 'Cee' }).ok).toBe(true);
  fx.core.channels.inviteGroupBot({
    channelId: id,
    inviterHuman: true,
    targetBotSlug: 'cee',
    targetBotCreatedAt: fx.core.registry.get('cee')!.createdAt,
    targetDmChannelId: fx.core.channels.getOrCreateDm('cee', 'Cee')!.id,
  });
  expect(fx.core.externalMessaging.inbound.share('ada', source, id).alreadyShared).toBe(true);
  expect(
    fx.query(
      `SELECT bot_slug FROM inbox_admissions WHERE source_event_id = '${source}' ORDER BY bot_slug`,
    ),
  ).toEqual([{ bot_slug: 'ada' }, { bot_slug: 'bea' }]);
  const other = createBridgeMethods({ ...fx.core }).channelCreate({
    name: 'Other team',
    members: ['ada', 'bea'],
  });
  if (!other.ok) throw new Error(other.error.message);
  expect(() =>
    fx.core.externalMessaging.inbound.share('ada', source, other.value.channel.id),
  ).toThrow('source-conflict');
  await fx.core.externalMessaging.inbound.setChannelTarget('ada', fx.grant.id, id);
  await fx.receive(
    event({
      reply: { ...event().reply, messageId: 'channel-source' },
      messageId: 'channel-source',
      eventId: 'ev-channel-source',
      text: 'Already channel-targeted',
    }),
  );
  await fx.idle();
  const targeted = fx.core.attention
    .list({ botSlug: 'ada' })
    .items.find((item) => item.summary === 'Already channel-targeted')!.id;
  expect(() =>
    fx.core.externalMessaging.inbound.share('ada', targeted, other.value.channel.id),
  ).toThrow('source-conflict');
});

it('keeps an external-only report in Outbox, associates a real reply and enriches only its authenticated own echo', async () => {
  const fx = await fixture({ receipts: true });
  await fx.enable();
  const report = await fx.core.externalMessaging.post(
    'ada',
    fx.grant.id,
    'morning_report_639',
    'Morning report',
  );
  expect(report.state).toBe('provider-accepted');
  expect(report.receipt).toEqual({ version: 1, messageId: 'om-report', conversationId: 'oc-team' });
  expect(fx.query('SELECT * FROM source_events')).toHaveLength(0);
  expect(fx.query('SELECT * FROM channel_placements')).toHaveLength(0);
  expect(fx.query('SELECT * FROM inbox_admissions')).toHaveLength(0);
  await fx.echo('om-foreign');
  await fx.echo('om-report', 'Changed content');
  expect(fx.core.externalMessaging.history('ada')[0]?.echo).toBeUndefined();
  await fx.echo();
  await fx.echo();
  expect(fx.core.externalMessaging.history('ada')[0]?.echo?.eventId).toBe('echo-1');
  expect(fx.query('SELECT * FROM inbox_admissions')).toHaveLength(0);
  const reply = event({
    reply: {
      messageId: 'om-1',
      conversationId: 'oc-team',
      actorId: 'ou-human',
      rootId: 'om-report',
      parentId: 'om-report',
      threadId: 'omt-report',
    },
  });
  await fx.receive(reply);
  await fx.receive(reply);
  await fx.idle();
  const item = fx.core.attention
    .list({ botSlug: 'ada' })
    .items.find((item) => item.sourceKind === 'bridge-message');
  expect(item).toBeDefined();
  const source = fx.core.externalMessaging.inbound.read('ada', item!.id);
  expect(source.report?.intentId).toBe(report.id);
  expect(source.report?.text).toBe('Morning report');
  expect(source.event.actor.id).toBe('ou-human');
  expect(fx.runs[0]?.inbox).toContain('Morning report');
  expect(fx.query('SELECT * FROM channel_placements')).toHaveLength(0);
  expect(fx.query('SELECT * FROM inbox_admissions')).toHaveLength(1);
  const repeated = await fx.core.externalMessaging.post(
    'ada',
    fx.grant.id,
    'morning_report_639',
    'Morning report',
  );
  expect(repeated.id).toBe(report.id);
  expect(fx.publicService.sendChecked).toHaveBeenCalledTimes(1);
  expect(() => fx.core.externalMessaging.inspectIntent('other', report.id)).toThrow(
    'intent-unavailable',
  );
  await expect(
    fx.core.externalMessaging.post('other', fx.grant.id, 'other_report_639', 'Bad'),
  ).rejects.toThrow('grant-unavailable');
  fx.core.externalMessaging.revoke('ada', fx.grant.id);
  expect(fx.core.externalMessaging.inspectIntent('ada', report.id).text).toBe('Morning report');
  await expect(
    fx.core.externalMessaging.post('ada', fx.grant.id, 'revoked_report_639', 'Bad'),
  ).rejects.toThrow('grant-revoked');
  await fx.restart();
  expect(fx.core.externalMessaging.inspectIntent('ada', report.id).receipt?.messageId).toBe(
    'om-report',
  );
});

it('does not associate a fabricated report parent or another conversation with an own report', async () => {
  const fx = await fixture({ receipts: true });
  await fx.enable();
  await fx.core.externalMessaging.post(
    'ada',
    fx.grant.id,
    'morning_report_parent',
    'Morning report',
  );
  await fx.receive(event());
  await fx.idle();
  const item = fx.core.attention
    .list({ botSlug: 'ada' })
    .items.find((item) => item.sourceKind === 'bridge-message');
  expect(fx.core.externalMessaging.inbound.read('ada', item!.id).report).toBeUndefined();
  await fx.receive(
    event({
      messageId: 'foreign',
      conversation: { kind: 'group', id: 'oc-other' },
      reply: {
        messageId: 'foreign',
        conversationId: 'oc-other',
        actorId: 'ou-human',
        parentId: 'om-report',
      },
    }),
  );
  expect(fx.query('SELECT * FROM inbox_admissions')).toHaveLength(1);
});

it('refuses receipt-less providers before dispatch and preserves one unknown post without retry', async () => {
  const legacy = await fixture();
  await expect(
    legacy.core.externalMessaging.post('ada', legacy.grant.id, 'legacy_report_639', 'Report'),
  ).rejects.toThrow('capability-unavailable');
  expect(legacy.publicService.sendChecked).not.toHaveBeenCalled();
  const fx = await fixture({ receipts: true });
  fx.publicService.sendChecked = vi.fn(async () => ({ sent: true as const }));
  const report = await fx.core.externalMessaging.post(
    'ada',
    fx.grant.id,
    'unknown_report_639',
    'Report',
  );
  expect(report.state).toBe('unknown-outcome');
  expect(report.receipt).toBeUndefined();
  expect(
    (await fx.core.externalMessaging.post('ada', fx.grant.id, 'unknown_report_639', 'Report')).id,
  ).toBe(report.id);
  expect(fx.publicService.sendChecked).toHaveBeenCalledTimes(1);
});

it('resolves platform defaults for future admissions, keeps custom and Thread policy authority, and separates digest revisions', async () => {
  const fx = await fixture();
  await fx.enable();
  const messaging = fx.core.externalMessaging;
  const save = (collection: 'mentions' | 'all', count: number) => {
    const { revision, changedAt: _at, ...preferences } = messaging.defaults();
    return messaging.setDefaults({
      ...preferences,
      expectedRevision: revision,
      collection,
      count,
      intervalSeconds: 300,
    });
  };
  expect(messaging.inbound.policy('ada', fx.grant.id).inheritance).toBe('inherit');
  await fx.receive(ordinaryEvent('defaults-before'));
  expect(fx.query("SELECT * FROM source_events WHERE source_kind='bridge-message'")).toHaveLength(
    0,
  );
  await save('all', 5);
  await fx.receive(ordinaryEvent('defaults-old-threshold'));
  await fx.idle();
  expect(fx.runs).toHaveLength(0);
  await save('all', 1);
  await fx.receive(ordinaryEvent('defaults-new-threshold'));
  await fx.idle();
  const admissions = fx.query(
    "SELECT e.body, a.external_default_revision AS revision, a.wake_count AS count, a.observed_at AS observed FROM source_events e JOIN inbox_admissions a USING (source_event_id) WHERE e.source_kind='bridge-message' ORDER BY e.rowid",
  );
  expect(admissions).toMatchObject([
    { revision: 1, count: 5, observed: null },
    { revision: 2, count: 1 },
  ]);
  expect(fx.runs).toHaveLength(1);
  const prior = messaging.inbound.policy('ada', fx.grant.id);
  await messaging.inbound.setPolicy(
    'ada',
    fx.grant.id,
    {
      collection: 'mentions',
      wake: 'silent',
      count: 7,
      intervalSeconds: 300,
      inheritance: 'custom',
      expectedRevision: prior.revision,
    },
    { kind: 'human' },
  );
  await save('all', 2);
  expect(messaging.inbound.policy('ada', fx.grant.id)).toMatchObject({
    collection: 'mentions',
    wake: 'silent',
    count: 7,
    inheritance: 'custom',
  });
  await fx.receive(ordinaryEvent('defaults-custom-skipped'));
  expect(
    fx.query("SELECT * FROM source_events WHERE body LIKE '%defaults-custom-skipped%'"),
  ).toHaveLength(0);
  await messaging.inbound.setPolicy(
    'ada',
    fx.grant.id,
    {
      collection: 'mentions',
      wake: 'silent',
      count: 7,
      intervalSeconds: 300,
      inheritance: 'inherit',
      expectedRevision: messaging.inbound.policy('ada', fx.grant.id).revision,
    },
    { kind: 'human' },
  );
  expect(messaging.inbound.policy('ada', fx.grant.id)).toMatchObject({
    collection: 'all',
    wake: 'digest',
    count: 2,
    defaultRevision: 3,
    inheritance: 'inherit',
  });
  await fx.restart();
  expect(fx.core.externalMessaging.inbound.policy('ada', fx.grant.id)).toMatchObject({
    count: 2,
    defaultRevision: 3,
  });
});
it('inherited full collection does not pretend that ordinary delivery was qualified', async () => {
  const fx = await fixture();
  const channelId = await addManagedBridge(fx);
  const row = await bridgeRow(fx, channelId);
  await fx.core.externalMessaging.inbound.channelBridge(channelId, {
    kind: 'update',
    grantId: row.grantId,
    expectedGrantRevision: row.grantRevision,
    expectedRevision: row.revision,
    name: row.name,
    enabled: true,
    collection: 'mentions',
    collectionInheritance: 'inherit',
  });
  const { revision, changedAt: _at, ...preferences } = fx.core.externalMessaging.defaults();
  await fx.core.externalMessaging.setDefaults({
    ...preferences,
    expectedRevision: revision,
    collection: 'all',
    count: 1,
  });
  expect(await bridgeRow(fx, channelId)).toMatchObject({
    collection: 'all',
    collectionInheritance: 'inherit',
    ordinaryDelivery: 'unverified',
  });
  expect(fx.core.channels.readMessages(channelId)).toHaveLength(0);
  await fx.receive(managedEvent(fx, { mentionedAccount: false, mentions: [] }));
  expect(await bridgeRow(fx, channelId)).toMatchObject({ ordinaryDelivery: 'verified' });
  expect(fx.core.channels.readMessages(channelId)).toHaveLength(1);
});

it('rejects late pre-resume events after an inherited global identity pause', async () => {
  const f = await fixture();
  await f.enable();
  const save = (identityEnabled: boolean) => {
    const { revision, changedAt: _at, ...preferences } = f.core.externalMessaging.defaults();
    return f.core.externalMessaging.setDefaults({
      ...preferences,
      expectedRevision: revision,
      identityEnabled,
    });
  };
  const beforePause = new Date(Date.now() - 1000).toISOString();
  await save(false);
  await save(true);
  await f.receive(event({ eventId: 'old', at: beforePause }));
  expect(
    f.query("SELECT source_event_id FROM source_events WHERE source_kind = 'bridge-message'"),
  ).toHaveLength(0);
  await f.receive(event({ eventId: 'new', at: new Date(Date.now() + 1000).toISOString() }));
  expect(
    f.query("SELECT source_event_id FROM source_events WHERE source_kind = 'bridge-message'"),
  ).toHaveLength(1);
});

it('shares one exclusive account receiver across two authorized groups without merging equal message IDs', async () => {
  const fx = await fixture();
  fx.publicService.listTargets = async () => [
    { targetId: 'team', name: 'QA team', kind: 'group', route: { chatId: 'oc-team' } },
    { targetId: 'other', name: 'QA other', kind: 'group', route: { chatId: 'oc-other' } },
  ];
  const originalConsume = fx.publicService.consumeInbound!;
  fx.publicService.consumeInbound = async (id, input) => {
    if (fx.subscriptions > 0)
      throw Object.assign(new Error('exclusive receiver'), { code: 'consumer-conflict' });
    return originalConsume(id, input);
  };
  const targets = await fx.core.externalMessaging.targets('dsh-im/feishu', 'lark-app');
  const second = await fx.core.externalMessaging.authorize({
    botSlug: 'ada',
    providerId: 'dsh-im/feishu',
    accountRef: 'lark-app',
    targetRef: 'other',
    fingerprint,
    targetDigest: targets.find((target) => target.ref === 'other')!.digest,
  });
  await fx.enable();
  await fx.core.externalMessaging.inbound.setEnabled('ada', second.id, true);
  expect(fx.subscriptions).toBe(1);
  await fx.receive(event());
  await fx.receive(
    event({
      conversation: { kind: 'group', id: 'oc-other' },
      reply: { messageId: 'om-1', conversationId: 'oc-other', actorId: 'ou-human' },
    }),
  );
  const sources = fx.query(
    "SELECT source_event_id, body FROM source_events WHERE source_kind = 'bridge-message'",
  );
  expect(sources).toHaveLength(2);
  expect(fx.query('SELECT * FROM inbox_admissions')).toHaveLength(2);
  await fx.core.externalMessaging.inbound.setEnabled('ada', fx.grant.id, false);
  expect(fx.subscriptions).toBe(1);
  await fx.receive(
    event({
      messageId: 'om-2',
      conversation: { kind: 'group', id: 'oc-other' },
      reply: { messageId: 'om-2', conversationId: 'oc-other', actorId: 'ou-human' },
    }),
  );
  expect(
    fx.query("SELECT source_event_id FROM source_events WHERE source_kind = 'bridge-message'"),
  ).toHaveLength(3);
  fx.core.externalMessaging.revoke('ada', second.id);
  expect(fx.subscriptions).toBe(0);
});

async function addRoute(
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
it('ends only one local Channel route and purges its shared external source without provider replay refill', async () => {
  const fx = await fixture();
  const first = createRouteGroup(fx, 'Ended route');
  const second = createRouteGroup(fx, 'Retained route');
  await addRoute(fx, first);
  await addRoute(fx, second);
  const dm = fx.core.channels.getOrCreateDm('ada', 'Ada')!;
  await addRoute(fx, dm.id, 'inbox');
  const message = event({ at: new Date(Date.now() + 100).toISOString() });
  await fx.receive(message);
  await fx.idle();
  const methods = createBridgeMethods({ ...fx.core });
  expect(methods.channelGroupDelete({ channelId: first }).ok).toBe(true);
  expect(
    (await fx.core.externalMessaging.snapshot('ada')).grants[0]?.bridgeRoutes?.map(
      (route) => route.channelId,
    ),
  ).toEqual([second, null]);
  expect(fx.core.channels.readMessages(second)[0]?.body).toBe(message.text);
  const source = fx.core.contentPurge.sources(first).sources[0]!;
  expect(source.refusal).toBeUndefined();
  const preview = fx.core.contentPurge.preview(first, [source.sourceEventId]);
  expect(preview.placements).toHaveLength(2);
  expect(preview.admissions).toHaveLength(1);
  fx.core.contentPurge.confirm(first, preview.sourceEventIds, preview.token);
  expect(fx.core.channels.readMessages(second)[0]?.body).toBe('');
  expect(() => fx.core.externalMessaging.inbound.read('ada', source.sourceEventId)).toThrow(
    'content-purged',
  );
  const count = fx.runs.length;
  await fx.receive(message).catch(() => undefined);
  await fx.idle();
  expect(fx.runs).toHaveLength(count);
  expect(fx.query('SELECT body FROM source_events')).toEqual([{ body: '' }]);
  await fx.restart();
  expect(fx.core.contentPurge.sources(first).sources[0]?.body).toBe('');
});

it('keeps an already issued reply in flight and settles the actual receipt after purge without restoring text', async () => {
  const fx = await fixture();
  const channel = createRouteGroup(fx, 'Issued reply purge');
  await addRoute(fx, channel);
  await fx.receive(event({ at: new Date(Date.now() + 100).toISOString() }));
  await fx.idle();
  const sourceId = String(
    fx.query('SELECT source_event_id FROM source_events')[0]!.source_event_id,
  );
  let finish!: () => void;
  fx.setReply(
    () =>
      new Promise((resolve) => {
        finish = () => resolve({ sent: true });
      }),
  );
  const sending = fx.core.externalMessaging.reply('ada', sourceId, 'synthetic outgoing body');
  await expect.poll(() => fx.replies.length).toBe(1);
  expect(createBridgeMethods({ ...fx.core }).channelGroupDelete({ channelId: channel }).ok).toBe(
    true,
  );
  const preview = fx.core.contentPurge.preview(channel, [sourceId]);
  expect(preview.effects).toMatchObject([{ kind: 'outbox', state: 'in-flight' }]);
  fx.core.contentPurge.confirm(channel, preview.sourceEventIds, preview.token);
  expect(fx.core.externalMessaging.history('ada')[0]).toMatchObject({
    state: 'in-flight',
    text: '',
  });
  finish();
  expect(await sending).toMatchObject({ state: 'provider-accepted', text: '' });
  await expect(
    fx.core.externalMessaging.reply('ada', sourceId, 'stale new effect'),
  ).rejects.toThrow();
  expect(fx.replies).toHaveLength(1);
});

it('fences running Bot admissions and retained tool callbacks after accepted source purge', async () => {
  let resume!: () => void;
  let active: OrchestratorAgentRun | undefined;
  const paused = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const fx = await fixture({
    onRun: async (run) => {
      active = run;
      await paused;
    },
  });
  const channel = createRouteGroup(fx, 'Running admission purge');
  const other = createRouteGroup(fx, 'Still joined');
  await addRoute(fx, channel);
  await addRoute(fx, other);
  try {
    await fx.receive(event({ at: new Date(Date.now() + 100).toISOString() }));
    await expect.poll(() => active !== undefined).toBe(true);
    expect(createBridgeMethods({ ...fx.core }).channelGroupDelete({ channelId: channel }).ok).toBe(
      true,
    );
    const source = fx.core.contentPurge.sources(channel).sources[0]!;
    const preview = fx.core.contentPurge.preview(channel, [source.sourceEventId]);
    expect(preview.admissions).toMatchObject([{ state: 'running' }]);
    fx.core.contentPurge.confirm(channel, preview.sourceEventIds, preview.token);
    expect(() => active!.requireContent!()).toThrow();
    await expect(
      active!.channels.send({ channelId: other, body: 'stale outgoing body' }),
    ).rejects.toThrow();
    expect(
      fx.core.channels
        .readMessages(other)
        .every((message) => message.body !== 'stale outgoing body'),
    ).toBe(true);
  } finally {
    resume();
    await fx.idle();
  }
});
it('ends running Channel effects only after its last reception path ends while retaining history', async () => {
  let resume!: () => void;
  let active: OrchestratorAgentRun | undefined;
  const paused = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const fx = await fixture({
    onRun: async (run) => {
      active = run;
      await paused;
    },
  });
  const first = createRouteGroup(fx, 'First running route');
  const second = createRouteGroup(fx, 'Last running route');
  await addRoute(fx, first);
  await addRoute(fx, second);
  try {
    await fx.receive(event({ at: new Date(Date.now() + 100).toISOString() }));
    await expect.poll(() => active !== undefined).toBe(true);
    const methods = createBridgeMethods({ ...fx.core });
    expect(methods.channelGroupDelete({ channelId: first }).ok).toBe(true);
    expect(() => active!.requireContent!()).not.toThrow();
    expect(methods.channelGroupDelete({ channelId: second }).ok).toBe(true);
    expect(() => active!.requireContent!()).toThrow('Channel has ended');
    expect(fx.core.contentPurge.sources(first).sources[0]?.body).toBe(event().text);
    expect(fx.query('SELECT attempt_state FROM inbox_admissions')[0]?.attempt_state).toBe(
      'needs-repair',
    );
  } finally {
    resume();
    await fx.idle();
  }
});
function createRouteGroup(
  fx: Awaited<ReturnType<typeof fixture>>,
  name: string,
  members = ['ada'],
) {
  const result = createBridgeMethods({ ...fx.core }).channelCreate({ name, members });
  if (!result.ok) throw new Error(result.error.message);
  return result.value.channel.id;
}
it('routes one source to two Groups, an explicit DM and Inbox with one member admission, processing and original-group reply', async () => {
  const fx = await fixture({
    onRun: async (run) => {
      const source = fx.core.attention.list({ botSlug: 'ada' }).items[0]!;
      expect(run.externalMessaging!.read(source.id).receptionPaths).toHaveLength(4);
      await run.externalMessaging!.reply(source.id, 'One authorized reply');
    },
  });
  const first = createRouteGroup(fx, 'First');
  const second = createRouteGroup(fx, 'Second');
  const dm = fx.core.channels.getOrCreateDm('ada', 'Ada')!;
  await addRoute(fx, first);
  await addRoute(fx, second);
  await addRoute(fx, dm.id);
  await addRoute(fx, dm.id, 'inbox');
  const message = event({ at: new Date(Date.now() + 100).toISOString() });
  await fx.receive(message);
  await fx.idle();
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    1,
  );
  expect(fx.query('SELECT * FROM channel_placements')).toHaveLength(3);
  expect(fx.query('SELECT * FROM messaging_source_paths')).toHaveLength(4);
  expect(fx.query('SELECT * FROM inbox_admissions')).toHaveLength(1);
  expect(fx.core.attention.list({ botSlug: 'ada' }).items).toHaveLength(1);
  expect(fx.runs).toHaveLength(1);
  expect(fx.replies).toHaveLength(1);
  expect(fx.replies[0]?.route).toEqual(message.reply);
  for (const id of [first, second, dm.id])
    expect(fx.core.channels.readMessages(id)).toHaveLength(1);
  await fx.receive(message);
  await fx.idle();
  await fx.restart();
  await fx.receive(message);
  await fx.idle();
  expect(fx.query('SELECT * FROM channel_placements')).toHaveLength(3);
  expect(fx.runs).toHaveLength(1);
  expect(fx.replies).toHaveLength(1);
  expect(fx.subscriptions).toBe(1);
});
it.each(['channel', 'inbox'] as const)(
  'delivers a context-only cached source through a managed %s route exactly once',
  async (delivery) => {
    const cached = event({
      messageId: 'om-context-before-live',
      eventId: 'context-before-live',
      text: 'Mention cached before its live delivery',
      at: new Date(Date.now() + 60000).toISOString(),
      reply: { ...event().reply, messageId: 'om-context-before-live' },
    });
    const fx = await fixture({
      history: async (_account, _route, query) => ({
        version: 1,
        scope: query.scope,
        events: [cached],
        omitted: 0,
        hasMore: false,
        coverage: 'provider-visible-human-text',
      }),
    });
    const target =
      delivery === 'channel'
        ? createRouteGroup(fx, 'Context before live')
        : fx.core.channels.getOrCreateDm('ada', 'Ada')!.id;
    await addRoute(fx, target, delivery);
    await fx.receive(event({ at: new Date(Date.now() + 100).toISOString() }));
    await fx.idle();
    const anchor = fx.core.attention.list({ botSlug: 'ada' }).items[0]!.id;
    const page = await fx.core.externalMessaging.inbound.context('ada', anchor, 'test-read', {
      scope: 'group',
    });
    expect(page.messages.map((message) => message.text)).toContain(cached.text);
    expect(
      fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'"),
    ).toHaveLength(2);
    expect(fx.query('SELECT * FROM messaging_source_paths')).toHaveLength(1);
    expect(fx.query('SELECT * FROM inbox_admissions')).toHaveLength(1);
    expect(fx.runs).toHaveLength(1);

    await fx.receive(cached);
    await fx.idle();
    expect(fx.query('SELECT * FROM messaging_source_paths')).toHaveLength(2);
    expect(fx.query('SELECT * FROM inbox_admissions')).toHaveLength(2);
    expect(fx.query('SELECT * FROM channel_placements')).toHaveLength(
      delivery === 'channel' ? 2 : 0,
    );
    expect(fx.runs).toHaveLength(2);

    await fx.receive(cached);
    await fx.idle();
    await fx.restart();
    await fx.receive(cached);
    await fx.idle();
    expect(
      fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'"),
    ).toHaveLength(2);
    expect(fx.query('SELECT * FROM messaging_source_paths')).toHaveLength(2);
    expect(fx.query('SELECT * FROM inbox_admissions')).toHaveLength(2);
    expect(fx.query('SELECT * FROM channel_placements')).toHaveLength(
      delivery === 'channel' ? 2 : 0,
    );
    expect(fx.runs).toHaveLength(2);
  },
);
it('uses any eligible reception path without letting a silent first path suppress another member or consume its digest', async () => {
  const fx = await fixture({
    history: async (_account, _route, query) => ({
      version: 1,
      scope: query.scope,
      events: [contextEvent('om-private-history', 'Receiver-only provider history')],
      omitted: 0,
      hasMore: false,
      coverage: 'provider-visible-human-text',
    }),
  });
  expect(fx.core.registry.create({ slug: 'bea', displayName: 'Bea' }).ok).toBe(true);
  const first = createRouteGroup(fx, 'Silent path', ['ada', 'bea']);
  const second = createRouteGroup(fx, 'Immediate path', ['ada']);
  await addRoute(fx, first);
  await addRoute(fx, second);
  await fx.receive(event({ mentionedAccount: false, mentions: [], at: new Date().toISOString() }));
  for (const id of [first, second]) {
    const row = await bridgeRow(fx, id);
    await fx.core.externalMessaging.inbound.channelBridge(id, {
      kind: 'update',
      routeId: row.routeId,
      grantId: row.grantId,
      expectedGrantRevision: row.grantRevision,
      expectedRevision: row.revision,
      name: row.name,
      enabled: true,
      collection: 'all',
    });
  }
  fx.core.channels.setGroupWakePolicy(first, 'ada', {
    mode: 'silent',
    count: 2,
    intervalSeconds: 60,
  });
  fx.core.channels.setGroupWakePolicy(first, 'bea', {
    mode: 'digest',
    count: 2,
    intervalSeconds: 60,
  });
  fx.core.channels.setGroupWakePolicy(second, 'ada', {
    mode: 'all',
    count: 1,
    intervalSeconds: 60,
  });
  const one = event({
    messageId: 'multi-one',
    mentionedAccount: false,
    mentions: [],
    text: 'ordinary one',
    at: new Date(Date.now() + 100).toISOString(),
    reply: { ...event().reply, messageId: 'multi-one' },
  });
  await fx.receive(one);
  await fx.idle();
  expect(fx.runs.map((run) => run.bot.slug)).toEqual(['ada']);
  const sharedId = fx.query(
    "SELECT source_event_id FROM source_events WHERE body = 'ordinary one'",
  )[0]!.source_event_id as string;
  expect(
    fx.core.externalMessaging.inbound
      .read('bea', sharedId)
      .receptionPaths?.map((path) => path.channelId),
  ).toEqual([first]);
  expect(() => fx.core.externalMessaging.inbound.sourceSignal('bea', sharedId)).toThrow(
    'grant-unavailable',
  );
  await expect(
    fx.core.externalMessaging.inbound.context('bea', sharedId, 'secondary-context', {
      scope: 'group',
    }),
  ).rejects.toThrow('source-unavailable');
  await fx.core.externalMessaging.inbound.context('ada', sharedId, 'owner-context', {
    scope: 'group',
  });
  expect(fx.core.externalMessaging.inbound.read('ada', sharedId).contextMessages?.[0]?.text).toBe(
    'Receiver-only provider history',
  );
  const secondary = fx.core.externalMessaging.inbound.read('bea', sharedId);
  expect(secondary.contextMessages).toBeUndefined();
  expect(secondary.contextReads).toBeUndefined();
  expect(fx.query('SELECT bot_slug,attempt_state FROM inbox_admissions ORDER BY bot_slug')).toEqual(
    [
      { bot_slug: 'ada', attempt_state: 'handled' },
      { bot_slug: 'bea', attempt_state: 'pending' },
    ],
  );
  await fx.restart();
  await fx.receive({
    ...one,
    messageId: 'multi-two',
    text: 'ordinary two',
    reply: { ...one.reply, messageId: 'multi-two' },
  });
  await fx.idle();
  expect(fx.runs.filter((run) => run.bot.slug === 'ada')).toHaveLength(2);
  expect(fx.runs.filter((run) => run.bot.slug === 'bea')).toHaveLength(1);
  expect(fx.runs.find((run) => run.bot.slug === 'bea')?.inbox).toContain('ordinary one');
  expect(fx.runs.find((run) => run.bot.slug === 'bea')?.inbox).toContain('ordinary two');
  expect(fx.core.attention.list({ botSlug: 'bea' }).items).toHaveLength(2);
});
it('revokes one overlap independently and never backfills a newly added target on provider replay', async () => {
  const fx = await fixture();
  const first = createRouteGroup(fx, 'First path');
  const second = createRouteGroup(fx, 'Second path');
  await addRoute(fx, first);
  const message = event({ at: new Date(Date.now() + 100).toISOString() });
  await fx.receive(message);
  await fx.idle();
  await addRoute(fx, second);
  await fx.receive(message);
  await fx.idle();
  expect(fx.core.channels.readMessages(second)).toHaveLength(0);
  const row = await bridgeRow(fx, first);
  await fx.core.externalMessaging.inbound.channelBridge(first, {
    kind: 'delete',
    routeId: row.routeId,
    grantId: row.grantId,
    expectedGrantRevision: row.grantRevision,
    expectedRevision: row.revision,
  });
  expect(fx.subscriptions).toBe(1);
  await fx.receive({
    ...message,
    messageId: 'new-overlap',
    at: new Date(Date.now() + 100).toISOString(),
    reply: { ...message.reply, messageId: 'new-overlap' },
  });
  await fx.idle();
  expect(fx.core.channels.readMessages(first)).toHaveLength(1);
  expect(fx.core.channels.readMessages(second)).toHaveLength(1);
  expect(fx.runs).toHaveLength(2);
  expect((await fx.core.externalMessaging.channelBridges(first)).bridges).toHaveLength(0);
});
it('refuses implicit Bot-to-Bot DM targets and keeps Inbox-only sources out of the Human DM history', async () => {
  const fx = await fixture();
  expect(fx.core.registry.create({ slug: 'bea', displayName: 'Bea' }).ok).toBe(true);
  const botDm = fx.core.channels.getOrCreateBotDm('ada', 'bea', 'Peers')!;
  await expect(addRoute(fx, botDm.id)).rejects.toThrow('channel-unavailable');
  const dm = fx.core.channels.getOrCreateDm('ada', 'Ada')!;
  await addRoute(fx, dm.id, 'inbox');
  await fx.receive(event({ at: new Date(Date.now() + 100).toISOString() }));
  await fx.idle();
  expect(fx.core.channels.readMessages(dm.id)).toHaveLength(0);
  expect(fx.query('SELECT * FROM channel_placements')).toHaveLength(0);
  expect(fx.core.attention.list({ botSlug: 'ada' }).items).toHaveLength(1);
  expect(fx.runs).toHaveLength(1);
});

it('preserves inherited Provider methods when sharing an account consumer', async () => {
  const f = await fixture({ inheritedProvider: true });
  await f.enable();
  expect(f.subscriptions).toBe(1);
  await f.receive();
  await f.idle();
  expect(f.runs).toHaveLength(1);
  expect(f.query('SELECT source_event_id FROM source_events')).toHaveLength(1);
});

async function secondResponder() {
  const fx = await fixture({ secondIdentity: true, receipts: true });
  const channelId = await sharedTarget(fx);
  const target = (await fx.core.externalMessaging.targets('dsh-im/feishu', 'lark-bea'))[0]!;
  const grant = await fx.core.externalMessaging.authorize({
    botSlug: 'bea',
    providerId: 'dsh-im/feishu',
    accountRef: 'lark-bea',
    targetRef: target.ref,
    fingerprint: 'b'.repeat(64),
    targetDigest: target.digest,
  });
  await fx.enable();
  await fx.receive(event());
  await fx.idle();
  const sourceId = fx.core.channels.readMessages(channelId)[0]!.id;
  return {
    ...fx,
    get core() {
      return fx.core;
    },
    sourceId,
    channelId,
    responderGrant: grant,
  };
}

it('replies to one shared source under two independent own identities, preserves the canonical route, and deduplicates each responder across restart', async () => {
  const fx = await secondResponder();
  expect(fx.query("SELECT * FROM inbox_admissions WHERE bot_slug = 'bea'")).toHaveLength(0);
  const source = fx.core.externalMessaging.inbound.readShared('bea', fx.sourceId);
  expect(source).toMatchObject({ grantId: fx.grant.id, event: { actor: { id: 'ou-human' } } });
  expect(source.contextReads).toBeUndefined();
  const own = await fx.core.externalMessaging.reply('ada', fx.sourceId, 'A reply');
  const shared = await fx.core.externalMessaging.reply('bea', fx.sourceId, 'B reply');
  expect(own.state).toBe('provider-accepted');
  expect(shared).toMatchObject({
    botSlug: 'bea',
    grantId: fx.responderGrant.id,
    sourceEventId: fx.sourceId,
    state: 'provider-accepted',
    reply: {
      accountRef: 'lark-bea',
      accountName: 'Bea Lark identity',
      route: { ...event().reply, actorId: 'ou-human-scoped-to-bea' },
    },
    receipt: { messageId: 'lark-bea-reply', conversationId: 'oc-team' },
  });
  expect(fx.replies.map((reply) => reply.botId)).toEqual(['lark-app', 'lark-bea']);
  expect(fx.replies[1]!.route).toEqual({ ...event().reply, actorId: 'ou-human-scoped-to-bea' });
  expect(fx.core.externalMessaging.inbound.read('ada', fx.sourceId).event.reply).toEqual(
    event().reply,
  );
  expect(await fx.core.externalMessaging.reply('bea', fx.sourceId, 'B reply')).toMatchObject({
    id: shared.id,
  });
  await fx.restart();
  expect(await fx.core.externalMessaging.reply('bea', fx.sourceId, 'B reply')).toMatchObject({
    id: shared.id,
  });
  expect(fx.replies).toHaveLength(2);
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    1,
  );
  expect(fx.query("SELECT * FROM inbox_admissions WHERE bot_slug = 'bea'")).toHaveLength(0);
  await expect(
    fx.core.externalMessaging.reply('bea', fx.sourceId, 'Different retry'),
  ).rejects.toThrow('request-conflict');
});

it('acquires the responder connection without enabling reception, discards its inbound messages, and releases it when identity pauses', async () => {
  const fx = await secondResponder();
  type Consumer = Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1];
  let responder: Consumer | undefined;
  const consume = fx.publicService.consumeInbound!;
  fx.publicService.consumeInbound = async (account, input) => {
    if (account === 'lark-bea') responder = input;
    return consume(account, input);
  };
  const qualify = fx.publicService.qualifyReplyChecked!;
  fx.publicService.qualifyReplyChecked = async (account, route, options) => {
    if (!responder || responder.signal?.aborted)
      throw Object.assign(new Error('No owned consumer'), { code: 'capability-unavailable' });
    return qualify(account, route, options);
  };
  const reply = await fx.core.externalMessaging.reply('bea', fx.sourceId, 'Own connection reply');
  expect(reply.state).toBe('provider-accepted');
  expect(responder).toBeDefined();
  expect(fx.core.externalMessaging.inbound.status(fx.responderGrant.id)).toBe('off');
  const sourceCount = fx.query('SELECT * FROM source_events').length;
  await responder!.onEvent(
    event({
      botId: 'lark-bea',
      fingerprint: 'b'.repeat(64),
      messageId: 'om-not-collected',
      reply: { ...event().reply, messageId: 'om-not-collected' },
    }),
    { signal: responder!.signal! },
  );
  expect(fx.query('SELECT * FROM source_events')).toHaveLength(sourceCount);
  expect(fx.query("SELECT * FROM inbox_admissions WHERE bot_slug = 'bea'")).toHaveLength(0);
  await responder!.onEcho?.(
    {
      version: 1,
      botId: 'lark-bea',
      fingerprint: 'b'.repeat(64),
      eventId: 'echo-bea',
      messageId: 'lark-bea-reply',
      conversationId: 'oc-team',
      text: 'Own connection reply',
      at: '2026-10-04T00:00:00.000Z',
    },
    { signal: responder!.signal! },
  );
  expect(fx.core.externalMessaging.history('bea')[0]?.echo).toMatchObject({ eventId: 'echo-bea' });
  const identity = (await fx.core.externalMessaging.snapshot('bea')).identities![0]!;
  await fx.core.externalMessaging.identity('bea', {
    kind: 'update',
    id: identity.id,
    expectedRevision: identity.revision,
    name: identity.name,
    enabled: false,
  });
  expect(responder!.signal?.aborted).toBe(true);
  await expect(fx.core.externalMessaging.reply('bea', fx.sourceId, 'No fallback')).rejects.toThrow(
    'identity-paused',
  );
  expect(fx.replies).toHaveLength(1);
});

it('does not let an unavailable grant for a different group block the responder own-source reply', async () => {
  const fx = await secondResponder();
  const targets = await fx.publicService.listTargets('lark-bea');
  const otherTarget = {
    targetId: 'other-team',
    name: 'Other QA group',
    kind: 'group',
    route: { chatId: 'oc-other' },
  };
  vi.spyOn(fx.publicService, 'listTargets').mockResolvedValue([...targets, otherTarget]);
  const other = (await fx.core.externalMessaging.targets('dsh-im/feishu', 'lark-bea')).find(
    (target) => target.ref === 'other-team',
  )!;
  await fx.core.externalMessaging.authorize({
    botSlug: 'bea',
    providerId: 'dsh-im/feishu',
    accountRef: 'lark-bea',
    targetRef: other.ref,
    fingerprint: 'b'.repeat(64),
    targetDigest: other.digest,
  });
  vi.mocked(fx.publicService.listTargets).mockResolvedValue(targets);
  const reply = await fx.core.externalMessaging.reply('bea', fx.sourceId, 'Original group reply');
  expect(reply).toMatchObject({ state: 'provider-accepted', grantId: fx.responderGrant.id });
  expect(fx.replies).toEqual([
    {
      botId: 'lark-bea',
      text: 'Original group reply',
      route: { ...event().reply, actorId: 'ou-human-scoped-to-bea' },
    },
  ]);
});

it.each(['membership', 'authorization', 'identity'] as const)(
  'rechecks responder %s after preflight and refuses before the external side effect',
  async (change) => {
    const fx = await secondResponder();
    let checks = 0;
    fx.publicService.qualifyReplyChecked = async (_account, route) => {
      checks++;
      if (checks === 2) {
        if (change === 'membership') fx.core.channels.removeGroupMember(fx.channelId, 'bea');
        if (change === 'authorization')
          fx.core.externalMessaging.revoke('bea', fx.responderGrant.id);
        if (change === 'identity') {
          const identity = (await fx.core.externalMessaging.snapshot('bea')).identities![0]!;
          await fx.core.externalMessaging.identity('bea', {
            kind: 'update',
            id: identity.id,
            expectedRevision: identity.revision,
            name: identity.name,
            enabled: false,
          });
        }
      }
      return { ...route, actorId: 'ou-human-scoped-to-bea' };
    };
    const reply = await fx.core.externalMessaging.reply('bea', fx.sourceId, 'Refuse before send');
    expect(reply.state).toBe('failed');
    expect(fx.replies).toHaveLength(0);
    expect(
      await fx.core.externalMessaging.reply('ada', fx.sourceId, 'Independent A reply'),
    ).toMatchObject({ state: 'provider-accepted' });
  },
);

it.each(['reply-permission-denied', 'source-not-found', 'source-unavailable'] as const)(
  'preserves checked responder refusal %s without recording an accepted intent or trying A identity',
  async (code) => {
    const fx = await secondResponder();
    fx.publicService.qualifyReplyChecked = async () => {
      throw Object.assign(new Error('upstream private detail'), { code });
    };
    await expect(fx.core.externalMessaging.reply('bea', fx.sourceId, 'Never send')).rejects.toThrow(
      code,
    );
    expect(fx.replies).toHaveLength(0);
    expect(fx.core.externalMessaging.history('bea')).toHaveLength(0);
  },
);

it('refuses a changed qualified topic instead of falling back to the main group', async () => {
  const fx = await secondResponder();
  fx.publicService.qualifyReplyChecked = async (_account, route) => ({
    ...route,
    threadId: 'different-topic',
  });
  await expect(fx.core.externalMessaging.reply('bea', fx.sourceId, 'Never send')).rejects.toThrow(
    'stale-route',
  );
  expect(fx.replies).toHaveLength(0);
});

it('keeps an ambiguous responder send as one unknown outcome and never retries it', async () => {
  const fx = await secondResponder();
  let sends = 0;
  fx.publicService.replyChecked = async () => {
    sends++;
    throw new Error('transport interrupted after send');
  };
  const result = await fx.core.externalMessaging.reply('bea', fx.sourceId, 'Uncertain B reply');
  expect(result.state).toBe('unknown-outcome');
  expect(
    await fx.core.externalMessaging.reply('bea', fx.sourceId, 'Uncertain B reply'),
  ).toMatchObject({ id: result.id, state: 'unknown-outcome' });
  expect(sends).toBe(1);
});

it('fences removal after remote source validation, immediately before the SDK send', async () => {
  const fx = await secondResponder();
  let effects = 0;
  fx.publicService.replyChecked = async (_bot, _route, _text, options) => {
    fx.core.channels.removeGroupMember(fx.channelId, 'bea');
    if (options.beforeSend?.() !== true)
      throw Object.assign(new Error('stale-route'), { code: 'stale-route' });
    effects++;
    return { sent: true };
  };
  expect(
    await fx.core.externalMessaging.reply('bea', fx.sourceId, 'Withdrawn before effect'),
  ).toMatchObject({ state: 'failed', reason: 'stale-route' });
  expect(effects).toBe(0);
});

it('correlates a reply own echo with its owned Outbox receipt without another source or attention', async () => {
  const fx = await secondResponder();
  const intent = await fx.core.externalMessaging.reply('ada', fx.sourceId, 'A reply');
  const before = fx.query('SELECT * FROM inbox_admissions');
  await fx.echo('lark-app-reply', 'A reply');
  await fx.echo('lark-app-reply', 'A reply');
  expect(fx.core.externalMessaging.inspectIntent('ada', intent.id)).toMatchObject({
    echo: { eventId: 'echo-1' },
  });
  expect(fx.query('SELECT * FROM inbox_admissions')).toEqual(before);
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    1,
  );
  expect(fx.core.externalMessaging.history('bea')).toHaveLength(0);
});

it('refuses an account missing the final reply-fence capability before qualification or send', async () => {
  const fx = await secondResponder();
  const describe = fx.publicService.describeBot;
  fx.publicService.describeBot = async (id) => {
    const account = await describe(id);
    return {
      ...account,
      capabilities: account.capabilities.filter(
        (capability) => capability !== 'reply-fence-checked',
      ),
    };
  };
  await expect(
    fx.core.externalMessaging.reply('bea', fx.sourceId, 'Unavailable contract'),
  ).rejects.toThrow('capability-unavailable');
  expect(fx.publicService.qualifyReplyChecked).not.toHaveBeenCalled();
  expect(fx.replies).toHaveLength(0);
});

it('binds nearby minima to continuation and permits delayed reads for thirty minutes', async () => {
  const history = vi.fn<NonNullable<DshImOutboundService['historyChecked']>>(
    async (_account, _route, query) => ({
      version: 1,
      scope: query.scope,
      events: [contextEvent(query.cursor ? 'om-second' : 'om-first', 'context')],
      omitted: 0,
      hasMore: query.cursor === undefined,
      ...(query.cursor === undefined ? { nextCursor: 'provider-next' } : {}),
      coverage: 'provider-visible-human-text',
    }),
  );
  const fx = await fixture({ history });
  await fx.enable();
  await fx.receive();
  await fx.idle();
  const anchor = fx.core.attention.list({ botSlug: 'ada' }).items[0]!.id;
  const first = await fx.core.externalMessaging.inbound.context('ada', anchor, 'nearby-read', {
    scope: 'nearby',
    beforeCount: 10,
    afterCount: 5,
  });
  expect(history.mock.calls.at(-1)?.[2]).toMatchObject({
    scope: 'nearby',
    limit: 20,
    beforeCount: 10,
    afterCount: 5,
  });
  await expect(
    fx.core.externalMessaging.inbound.context('ada', anchor, 'nearby-read', {
      scope: 'nearby',
      beforeCount: 9,
      afterCount: 5,
      cursor: first.nextCursor!,
    }),
  ).rejects.toThrow('history-cursor-unavailable');
  const now = Date.now();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 10 * 60 * 1000);
  try {
    const second = await fx.core.externalMessaging.inbound.context('ada', anchor, 'nearby-read', {
      scope: 'nearby',
      cursor: first.nextCursor!,
    });
    expect(second.messages[0]?.messageId).toBe('om-second');
    const another = await fx.core.externalMessaging.inbound.context('ada', anchor, 'nearby-read', {
      scope: 'nearby',
    });
    clock.mockReturnValue(now + 41 * 60 * 1000);
    await expect(
      fx.core.externalMessaging.inbound.context('ada', anchor, 'nearby-read', {
        scope: 'nearby',
        cursor: another.nextCursor!,
      }),
    ).rejects.toThrow('history-cursor-unavailable');
  } finally {
    clock.mockRestore();
  }
  for (const query of [
    { scope: 'nearby' as const, beforeCount: -1 },
    { scope: 'nearby' as const, afterCount: 21 },
    { scope: 'thread' as const, beforeCount: 10 },
  ]) {
    await expect(
      fx.core.externalMessaging.inbound.context('ada', anchor, 'invalid-counts', query),
    ).rejects.toThrow('invalid-history-query');
  }
});

it('derives setup receipt from an admitted topic, own reply and authenticated echo; revocation removes completion', async () => {
  const fx = await fixture({ receipts: true, secondIdentity: true });
  await fx.enable();
  await fx.receive(event({ text: '[BH-LARK-SETUP] Reply LARK-SETUP-OK' }));
  await fx.idle();
  const sources = fx.query(
    "SELECT source_event_id FROM source_events WHERE source_kind = 'bridge-message'",
  ) as { source_event_id: string }[];
  const id = sources[0]!.source_event_id;
  expect((await fx.core.externalMessaging.snapshot('ada')).setup).toMatchObject({
    providerReady: true,
    receipts: [{ sourceEventId: id, echoObserved: false, threadId: 'omt-topic' }],
  });
  await fx.core.externalMessaging.reply('ada', id, 'LARK-SETUP-OK');
  expect((await fx.core.externalMessaging.snapshot('ada')).setup?.receipts[0]).toMatchObject({
    replyState: 'provider-accepted',
    echoObserved: false,
  });
  await fx.echo('lark-app-reply', 'Wrong text');
  expect((await fx.core.externalMessaging.snapshot('ada')).setup?.receipts[0]?.echoObserved).toBe(
    false,
  );
  await fx.echo('lark-app-reply', 'LARK-SETUP-OK');
  expect((await fx.core.externalMessaging.snapshot('ada')).setup?.receipts[0]?.echoObserved).toBe(
    true,
  );
  for (let index = 0; index < 31; index++)
    await fx.core.externalMessaging.send(
      'ada',
      fx.grant.id,
      `setup-later-${index}`,
      `later ${index}`,
    );
  const afterLaterSends = await fx.core.externalMessaging.snapshot('ada');
  expect(afterLaterSends.intents.some((intent) => intent.sourceEventId === id)).toBe(false);
  expect(afterLaterSends.setup?.receipts[0]).toMatchObject({
    replyState: 'provider-accepted',
    replyMessageId: 'lark-app-reply',
  });
  fx.setReady(false);
  expect((await fx.core.externalMessaging.snapshot('ada')).setup?.receipts).toEqual([]);
  fx.setReady(true);
  fx.core.externalMessaging.revoke('ada', fx.grant.id);
  expect((await fx.core.externalMessaging.snapshot('ada')).setup?.receipts).toEqual([]);
});

function watchMessagingViews(core: BotHarnessCore) {
  const reader = core.live
    .open(new Request('http://localhost/api/botharness/stream?scope=roster'))
    .body!.getReader();
  const frames: string[] = [];
  const draining = (async () => {
    for (;;) {
      const part = await reader.read();
      if (part.done) return;
      frames.push(new TextDecoder().decode(part.value));
    }
  })();
  return {
    notices: () => frames.filter((frame) => frame.includes('event: roster/changed')).length,
    async close() {
      await reader.cancel();
      await draining;
    },
  };
}

it('invalidates mounted messaging views after identity and Grant commits and after reception settles', async () => {
  const fx = await fixture();
  const views = watchMessagingViews(fx.core);
  const { notices } = views;
  try {
    const initial = notices();
    await fx.enable();
    await expect.poll(notices, { timeout: 500 }).toBeGreaterThan(initial);
    expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]?.reception).toBe(
      'receiving',
    );
    const identity = (await fx.core.externalMessaging.snapshot('ada')).identities![0]!;
    const beforePause = notices();
    await fx.core.externalMessaging.identity('ada', {
      kind: 'update',
      id: identity.id,
      expectedRevision: identity.revision,
      name: identity.name,
      enabled: false,
    });
    await expect.poll(notices, { timeout: 500 }).toBeGreaterThan(beforePause);
    expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]?.reception).toBe(
      'unavailable',
    );
    const paused = (await fx.core.externalMessaging.snapshot('ada')).identities![0]!;
    const beforeResume = notices();
    await fx.core.externalMessaging.identity('ada', {
      kind: 'update',
      id: paused.id,
      expectedRevision: paused.revision,
      name: paused.name,
      enabled: true,
    });
    await expect.poll(notices, { timeout: 500 }).toBeGreaterThan(beforeResume);
    expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]?.reception).toBe(
      'receiving',
    );
    const beforeRevoke = notices();
    fx.core.externalMessaging.revoke('ada', fx.grant.id);
    await expect.poll(notices, { timeout: 500 }).toBeGreaterThan(beforeRevoke);
    expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]).toMatchObject({
      availability: 'unavailable',
      reception: 'off',
    });
  } finally {
    await views.close();
  }
});

it('invalidates mounted messaging views when revoking a Grant without a reception lease', async () => {
  const fx = await fixture();
  const views = watchMessagingViews(fx.core);
  try {
    expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]?.reception).toBe('off');
    const before = views.notices();
    fx.core.externalMessaging.revoke('ada', fx.grant.id);
    await expect.poll(views.notices, { timeout: 500 }).toBeGreaterThan(before);
    expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]?.availability).toBe(
      'unavailable',
    );
  } finally {
    await views.close();
  }
});

it.each(['receiving', 'unavailable'] as const)(
  'invalidates connecting views when an asynchronous consumer settles to %s',
  async (reception) => {
    const fx = await fixture();
    let resolve!: (dispose: () => void) => void;
    let reject!: (error: Error) => void;
    const pending = new Promise<() => void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    fx.publicService.consumeInbound = async () => pending;
    const views = watchMessagingViews(fx.core);
    const enabling = fx.enable();
    try {
      await expect
        .poll(async () => (await fx.core.externalMessaging.snapshot('ada')).grants[0]?.reception)
        .toBe('connecting');
      await expect.poll(views.notices, { timeout: 500 }).toBeGreaterThan(0);
      await tick();
      const beforeSettlement = views.notices();
      if (reception === 'receiving') resolve(() => undefined);
      else reject(new Error('Consumer failed'));
      await enabling;
      await expect.poll(views.notices, { timeout: 500 }).toBeGreaterThan(beforeSettlement);
      expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]?.reception).toBe(
        reception,
      );
    } finally {
      resolve(() => undefined);
      await enabling;
      await views.close();
    }
  },
);

it('refuses an edited source on a continuation with source-conflict and preserves retained evidence', async () => {
  const older = contextEvent('om-older', 'original retained body', true);
  const history = vi.fn<NonNullable<DshImOutboundService['historyChecked']>>(
    async (_account, _route, query) => ({
      version: 1,
      scope: query.scope,
      events:
        query.cursor === undefined
          ? [contextEvent('om-newer', 'first page')]
          : [
              contextEvent('om-new-on-refused-page', 'must roll back'),
              { ...older, text: 'edited native body' },
            ],
      omitted: 0,
      hasMore: query.cursor === undefined,
      ...(query.cursor === undefined ? { nextCursor: 'page-2' } : {}),
      coverage: 'provider-visible-human-text',
    }),
  );
  const fx = await fixture({ history });
  await fx.enable();
  await fx.receive(older);
  await fx.idle();
  await fx.receive();
  await fx.idle();
  const anchor = fx.core.attention
    .list({ botSlug: 'ada' })
    .items.find((item) => item.summary === event().text)!.id;
  const first = await fx.core.externalMessaging.inbound.context('ada', anchor, 'read', {
    scope: 'group',
  });
  await expect(
    fx.core.externalMessaging.inbound.context('ada', anchor, 'read', {
      scope: 'group',
      cursor: first.nextCursor!,
    }),
  ).rejects.toThrow('source-conflict');
  expect(
    fx.query("SELECT body FROM source_events WHERE body = 'original retained body'"),
  ).toHaveLength(1);
  expect(fx.query("SELECT body FROM source_events WHERE body = 'must roll back'")).toHaveLength(0);
  expect(fx.query('SELECT * FROM inbox_admissions')).toHaveLength(2);
  expect(fx.core.externalMessaging.inbound.read('ada', anchor).contextReads?.at(-1)).toMatchObject({
    outcome: 'refused',
    reason: 'source-conflict',
  });
});
