import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { setImmediate as tick } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { attachOperationalModule } from '../src/database/owner.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { parseImCommand, type ImCommandServices } from '../src/messaging/im-commands.js';
import { event, fixture, cleanup } from './messaging-inbound-fixtures.js';

afterEach(cleanup);

it('passes malformed slash commands unchanged to the Bot through DM intake', async () => {
  const host: ImCommandServices = {
    botDisplayName: () => 'Ada',
    plan: vi.fn(async () => undefined),
    catalog: vi.fn(async () => []),
    applyModel: vi.fn(async () => {}),
    stopTurn: vi.fn(async () => undefined),
    startFreshOrchestrator: vi.fn(async (): Promise<'started'> => 'started'),
    turnRunning: () => false,
    compact: async () => ({ outcome: 'nothing', tokensBefore: null, tokensAfter: null }),
  };
  const fx = await fixture({ imCommands: () => host });
  const reply = vi.fn(async () => ({ sent: true as const }));
  fx.publicService.replyChecked = reply;
  const bound = (await fx.core.externalMessaging.snapshot('ada')).identities![0]!;
  await fx.core.externalMessaging.identity('ada', {
    kind: 'update',
    id: bound.id,
    expectedRevision: bound.revision,
    name: bound.name,
    enabled: true,
    newConversations: 'auto',
  });
  const dm = (text: string, messageId: string) =>
    event({
      text,
      eventId: messageId,
      messageId,
      at: new Date().toISOString(),
      conversation: { kind: 'dm', id: 'oc-private' },
      mentions: [],
      mentionedAccount: false,
      reply: { messageId, conversationId: 'oc-private', actorId: 'ou-human' },
    });
  expect(parseImCommand(' \n／status\r\n ')).toEqual({ name: 'status', chinese: false });
  await fx.receive(dm('/status', 'command-status'));
  await fx.idle();
  expect(reply).toHaveBeenCalledTimes(1);
  expect(fx.runs).toHaveLength(0);
  for (const [index, text] of [
    '/\nstop',
    '/ stop',
    '/model 2\nPlease explain',
    '/\nnew',
    '／ stop',
    '/model 2\rPlease explain',
  ].entries()) {
    expect(parseImCommand(text)).toBeUndefined();
    expect(await fx.receive(dm(text, `ordinary-${index}`))).toEqual({ accepted: true });
    await fx.idle();
    expect(fx.runs).toHaveLength(index + 1);
    expect(fx.runs[index]!.inbox).toContain(JSON.stringify(text));
  }
  expect(reply).toHaveBeenCalledTimes(1);
  expect(host.applyModel).not.toHaveBeenCalled();
  expect(host.stopTurn).not.toHaveBeenCalled();
  expect(host.startFreshOrchestrator).not.toHaveBeenCalled();
});

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
    state: 'open',
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

it('keeps receive lifecycle separate from proactive authorization and exposes it through the real RPC methods', async () => {
  const fx = await fixture();
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...fx.core });
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
  expect(fx.core.attention.list({ botSlug: 'ada' }).items[0]).toMatchObject({ state: 'open' });
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
  expect(steer).toHaveBeenCalledWith(
    'ada',
    expect.stringContaining('second mention'),
    expect.any(Function),
  );
  release?.();
  await fx.idle();
  expect(fx.runs).toHaveLength(1);
  expect(fx.core.attention.list({ botSlug: 'ada' }).items.map((item) => item.state)).toEqual([
    'open',
    'open',
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
    const dm = withDm
      ? fx.core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')
      : undefined;
    if (withDm) fx.core.team.bots.switches(OWNER_HUMAN_CONTEXT, 'ada', { proactiveDms: true });
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

it('changing the app post limit keeps its authenticated inbound subscription usable', async () => {
  const fx = await fixture();
  await fx.enable();
  const binding = (await fx.core.externalMessaging.snapshot('ada')).identities![0]!;
  await fx.core.externalMessaging.setPostLimit('ada', binding.id, binding.revision, 1);
  const result = await fx.receive(event({ eventId: 'quota-event' }));
  expect(result.accepted).toBe(true);
  await fx.idle();
  expect(fx.runs).toHaveLength(1);
});

it.each(['ordinary group text', '/model'])(
  'preserves admitted group text outside DM command scope: %s',
  async (text) => {
    const host: ImCommandServices = {
      botDisplayName: () => 'Ada',
      plan: async () => undefined,
      catalog: async () => [],
      applyModel: async () => {},
      stopTurn: async () => undefined,
      startFreshOrchestrator: async () => 'started',
      turnRunning: () => false,
      compact: async () => ({ outcome: 'nothing', tokensBefore: null, tokensAfter: null }),
    };
    const fx = await fixture({ imCommands: () => host });
    await fx.enable();
    await fx.receive(event({ text }));
    await fx.idle();
    expect(fx.runs).toHaveLength(1);
    expect(fx.runs[0]!.inbox).toContain(JSON.stringify(text));
  },
);
