import { setImmediate as tick } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { attachOperationalModule } from '../src/database/owner.js';
import {
  event,
  fixture,
  ordinaryEvent,
  reception,
  managedEvent,
  addManagedBridge,
  bridgeRow,
  cleanup,
} from './messaging-inbound-fixtures.js';

afterEach(cleanup);

async function retainedFixture(
  rows: {
    id: string;
    at: string;
    reason: 'group-ordinary' | 'group-mention';
    mode: 'all' | 'digest' | 'mentions';
    state?: 'pending' | 'retryable' | 'handled';
    routed?: boolean;
  }[],
) {
  const fx = await fixture();
  await fx.enable();
  const grant = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!;
  attachOperationalModule(fx.core.operationalDatabase, 'test').transaction((db) => {
    for (const row of rows) {
      const { text: _text, ...incoming } = event({ messageId: row.id, at: row.at });
      db.prepare(`INSERT INTO source_events(source_event_id, source_kind, bot_slug, body, created_at, payload_json)
        VALUES (?, 'bridge-message', 'ada', ?, ?, ?)`).run(
        row.id,
        row.id,
        row.at,
        JSON.stringify({
          external: {
            id: row.id,
            at: row.at,
            platform: 'feishu',
            accountName: 'Retained account',
            conversationName: 'Retained group',
            event: incoming,
            grantId: grant.id,
            grantRevision: grant.revision,
          },
        }),
      );
      db.prepare(`INSERT INTO inbox_admissions(source_event_id, bot_slug, reason, wake_mode,
        wake_policy_revision, source_policy_revision, source_policy_wake_mode, wake_count, wake_interval_ms, attempt_state)
        VALUES (?, 'ada', ?, ?, 7, 3, 'digest', 3, 60000, ?)`).run(
        row.id,
        row.reason,
        row.mode,
        row.state ?? 'pending',
      );
      if (row.routed)
        db.prepare(`INSERT INTO messaging_source_paths
        (source_event_id, bot_slug, grant_id, route_id, channel_id, body) VALUES (?, 'ada', ?, ?, NULL, ?)`).run(
          row.id,
          grant.id,
          grant.id,
          JSON.stringify({
            routeId: grant.id,
            name: 'Retained Inbox route',
            grantId: grant.id,
            grantRevision: grant.revision,
            channelId: null,
            routeRevision: 1,
            reason: row.reason,
            mode: row.mode,
            count: 3,
            intervalMs: 60000,
            policyRevision: 7,
            sourceRevision: 3,
            defaultRevision: 0,
          }),
        );
    }
  });
  return fx;
}

it('historical readiness preserves two-stage selection and does not rewrite saved evidence', async () => {
  const fx = await retainedFixture([
    ...Array.from({ length: 21 }, (_, i) => ({
      id: `ordinary-${String(i).padStart(2, '0')}`,
      at: '2040-01-01T00:00:00.000Z',
      reason: 'group-ordinary' as const,
      mode: 'all' as const,
    })),
    ...Array.from({ length: 21 }, (_, i) => ({
      id: `mention-${String(i).padStart(2, '0')}`,
      at: '2040-01-01T00:01:00.000Z',
      reason: 'group-mention' as const,
      mode: 'all' as const,
    })),
    {
      id: 'routed',
      at: '2040-01-01T00:00:30.000Z',
      reason: 'group-ordinary',
      mode: 'all',
      routed: true,
    },
  ]);
  const before = fx.query('SELECT * FROM inbox_admissions ORDER BY source_event_id');
  const result = fx.core.externalMessaging.inbound.pendingExternal(
    'ada',
    new Date('2040-01-01T00:02:00Z'),
  );
  expect(result.ready.map((row) => row.source_event_id)).toEqual([
    'routed',
    'mention-00',
    'mention-01',
    'mention-02',
    'mention-03',
    'mention-04',
    'mention-05',
    'mention-06',
    'mention-07',
    'mention-08',
    'mention-09',
    'mention-10',
    'mention-11',
    'mention-12',
    'mention-13',
    'mention-14',
    'mention-15',
    'mention-16',
    'mention-17',
    'mention-18',
  ]);
  expect(fx.core.externalMessaging.inbound.read('ada', 'mention-20').reception).toBeUndefined();
  expect(fx.query('SELECT * FROM inbox_admissions ORDER BY source_event_id')).toEqual(before);
  expect(fx.query('SELECT * FROM messaging_source_paths')).toHaveLength(1);
});

it('historical digest queries retain retry timer differences, context piggyback and revocation fences', async () => {
  const fx = await retainedFixture([
    { id: 'z-oldest', at: '2040-01-01T00:00:00.000Z', reason: 'group-ordinary', mode: 'digest' },
    {
      id: 'a-later',
      at: '2040-01-01T00:00:01.000Z',
      reason: 'group-ordinary',
      mode: 'digest',
      state: 'retryable',
    },
    {
      id: 'handled',
      at: '2040-01-01T00:00:02.000Z',
      reason: 'group-ordinary',
      mode: 'digest',
      state: 'handled',
    },
    { id: 'mention', at: '2040-01-01T00:00:03.000Z', reason: 'group-mention', mode: 'all' },
  ]);
  const inbound = fx.core.externalMessaging.inbound;
  const now = new Date('2040-01-01T00:00:10Z');
  expect(inbound.pendingExternal('ada', now).ready.map((row) => row.source_event_id)).toEqual([
    'mention',
  ]);
  expect(inbound.pendingExternal('ada', now).digests).toEqual([
    {
      first_at: '2040-01-01T00:00:00.000Z',
      wake_count: 3,
      wake_interval_ms: 60000,
      pending_count: 1,
      anchor: 'z-oldest',
    },
  ]);
  expect(inbound.pendingExternal('ada', now, true).ready.map((row) => row.source_event_id)).toEqual(
    ['z-oldest', 'a-later', 'mention'],
  );
  expect(
    inbound
      .pendingExternal('ada', new Date('2040-01-01T00:01:01Z'))
      .ready.map((row) => row.source_event_id),
  ).toEqual(['z-oldest', 'a-later', 'mention']);
  expect(inbound.read('ada', 'handled').body).toBe('handled');
  expect(inbound.available('ada', 'z-oldest')).toBe(true);
  fx.core.externalMessaging.revoke('ada', fx.grant.id);
  expect(inbound.pendingExternal('ada', now)).toEqual({ ready: [], digests: [] });
  expect(inbound.available('ada', 'z-oldest')).toBe(false);
  expect(inbound.read('ada', 'z-oldest').body).toBe('z-oldest');
  await fx.idle();
  expect(fx.runs).toHaveLength(0);
});

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

it('Messaging reports grant-backed digest readiness by captured count and time', async () => {
  const fx = await fixture();
  await fx.enable();
  await fx.receive(ordinaryEvent('probe'));
  await fx.core.externalMessaging.inbound.setPolicy('ada', fx.grant.id, reception, {
    kind: 'human',
  });
  const first = ordinaryEvent('query-one');
  await fx.receive(first);
  await fx.idle();
  const inbound = fx.core.externalMessaging.inbound;
  const waiting = inbound.pendingExternal('ada', new Date(first.at));
  expect(waiting.ready).toEqual([]);
  expect(waiting.digests).toEqual([
    {
      first_at: first.at,
      wake_count: 2,
      wake_interval_ms: 60000,
      pending_count: 1,
      anchor: expect.any(String),
    },
  ]);
  const due = inbound.pendingExternal('ada', new Date(Date.parse(first.at) + 60001));
  expect(due.ready.map((row) => row.body)).toEqual(['Ordinary query-one']);
  expect(inbound.read('ada', due.ready[0]!.source_event_id).reception).toEqual({
    kind: 'grant',
    grantId: fx.grant.id,
    grantRevision: expect.any(Number),
  });
  expect(inbound.read('ada', due.ready[0]!.source_event_id).receptionPaths).toBeUndefined();
  expect(fx.runs).toHaveLength(0);
  await fx.receive(ordinaryEvent('query-two'));
  await fx.idle();
  expect(fx.runs).toHaveLength(1);
  expect(fx.runs[0]?.inbox).toContain('query-one');
  expect(fx.runs[0]?.inbox).toContain('query-two');
  expect(inbound.pendingExternal('ada', new Date()).ready).toEqual([]);
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
