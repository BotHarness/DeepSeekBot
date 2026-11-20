import { setImmediate as tick } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { attachOperationalModule } from '../src/database/owner.js';
import { type DshImOutboundService } from '../src/messaging/dsh-im.js';
import {
  fingerprint,
  event,
  fixture,
  contextEvent,
  cleanup,
} from './messaging-inbound-fixtures.js';

afterEach(cleanup);

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
