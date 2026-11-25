import { expect, it, vi } from 'vitest';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createSessionListChanges } from '../src/features/sessions/session-list-changes.js';
import { alice, bob, fixture } from './team-bot-visibility-fixtures.js';

const row = (sessionId: string, extra: Record<string, unknown> = {}) => ({
  sessionId,
  running: false,
  lastPromptAt: 10,
  updatedAt: 10,
  ...extra,
});

function setup() {
  const changes = createSessionListChanges(() => undefined, { epoch: 'e1' });
  let rows = [
    row('native', { title: 'Native work' }),
    row('alice', { title: 'Alice work' }),
    row('owner-only', { title: 'Owner bot work' }),
    row('child', { parentSessionId: 'native' }),
  ];
  const list = vi.fn(async () => rows);
  const f = fixture({
    nativeSessions: {
      list,
      read: vi.fn(),
      isRoot: vi.fn(),
      send: vi.fn(),
      listChanges: (request) => changes.since(request),
      markChanged: (id) => changes.changed(true, id),
    },
  });
  for (const [id, botSlug] of [
    ['alice', 'alice-bot'],
    ['owner-only', 'owner-bot'],
    ['alice-gone', 'alice-bot'],
    ['owner-gone', 'owner-bot'],
  ] as const)
    f.ownership.claim({ sessionId: id, botSlug, rootRole: 'orchestrator', at: '2026-11-26' });
  return { f, changes, list, setRows: (next: typeof rows) => (rows = next) };
}

async function memberEpoch(bridge: {
  sessionListChanges(payload: unknown): Promise<{ ok: boolean; value?: unknown }>;
}): Promise<string> {
  const first = await bridge.sessionListChanges({});
  const cursor = (first.value as { cursor?: { epoch?: unknown } } | undefined)?.cursor;
  if (typeof cursor?.epoch !== 'string') throw new Error('no member cursor');
  expect(cursor.epoch.startsWith('e1.')).toBe(true);
  return cursor.epoch;
}

it('hands out a cursor first, then only the rows that changed since it', async () => {
  const { f, changes } = setup();
  const owner = f.bridge(OWNER_HUMAN_CONTEXT);

  const first = await owner.sessionListChanges({});
  expect(first).toEqual({ ok: true, value: { reset: true, cursor: { epoch: 'e1', seq: 0 } } });

  changes.changed(true, 'alice');
  changes.changed(false, 'native');
  changes.changed(true, 'alice');
  const next = await owner.sessionListChanges({ sinceSeq: 0, epoch: 'e1' });
  expect(next).toMatchObject({
    ok: true,
    value: { removed: [], cursor: { epoch: 'e1', seq: 3 } },
  });
  expect(
    next.ok && next.value.reset !== true && next.value.sessions.map((r) => r.sessionId),
  ).toEqual(['alice', 'native']);

  const none = await owner.sessionListChanges({ sinceSeq: 3, epoch: 'e1' });
  expect(none.ok && none.value.reset !== true && none.value.sessions).toEqual([]);
});

it('resets after a Host restart, a future cursor or a change that touched every row', async () => {
  const { f, changes } = setup();
  const owner = f.bridge(OWNER_HUMAN_CONTEXT);
  changes.changed(true, 'alice');
  for (const request of [
    { sinceSeq: 0, epoch: 'older-host-run' },
    { sinceSeq: 0 },
    { sinceSeq: 9, epoch: 'e1' },
  ])
    expect(await owner.sessionListChanges(request)).toMatchObject({
      ok: true,
      value: { reset: true },
    });
  changes.changedAll();
  expect(await owner.sessionListChanges({ sinceSeq: 1, epoch: 'e1' })).toMatchObject({
    ok: true,
    value: { reset: true, cursor: { seq: 2 } },
  });
});

it('reports removals only for Sessions the caller could know about, and never subagent children', async () => {
  const { f, changes, setRows } = setup();
  setRows([
    row('native'),
    row('alice'),
    row('owner-only'),
    row('child', { parentSessionId: 'native' }),
  ]);
  for (const id of ['child', 'alice-gone', 'owner-gone', 'never-seen']) changes.changed(true, id);

  const owner = await f
    .bridge(OWNER_HUMAN_CONTEXT)
    .sessionListChanges({ sinceSeq: 0, epoch: 'e1' });
  expect(owner.ok && owner.value.reset !== true && owner.value.removed.sort()).toEqual([
    'alice-gone',
    'never-seen',
    'owner-gone',
  ]);

  const member = await f
    .bridge(alice)
    .sessionListChanges({ sinceSeq: 0, epoch: await memberEpoch(f.bridge(alice)) });
  expect(member).toMatchObject({ ok: true, value: { sessions: [], removed: ['alice-gone'] } });
});

it("gives a member the changed rows of their own Bot only, never the Owner's or native ones", async () => {
  const { f, changes } = setup();
  for (const id of ['native', 'alice', 'owner-only']) changes.changed(true, id);
  const member = await f
    .bridge(alice)
    .sessionListChanges({ sinceSeq: 0, epoch: await memberEpoch(f.bridge(alice)) });
  expect(
    member.ok && member.value.reset !== true && member.value.sessions.map((r) => r.sessionId),
  ).toEqual(['alice']);
  expect(member.ok && member.value.reset !== true && member.value.removed).toEqual([]);
});

it('refuses a malformed cursor and reports itself unavailable without a change journal', async () => {
  const { f } = setup();
  const owner = f.bridge(OWNER_HUMAN_CONTEXT);
  for (const payload of [{ sinceSeq: -1 }, { sinceSeq: 1.5 }, { sinceSeq: 0, epoch: 3 }])
    expect(await owner.sessionListChanges(payload)).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
  const bare = fixture({
    nativeSessions: { list: vi.fn(async () => []), read: vi.fn(), isRoot: vi.fn(), send: vi.fn() },
  });
  expect(await bare.bridge(OWNER_HUMAN_CONTEXT).sessionListChanges({})).toMatchObject({
    ok: false,
    error: { code: 'unavailable' },
  });
});

it('resets a member whose Bot Sessions turned private to them, before any later Session change', async () => {
  const { f, changes } = setup();
  const member = f.bridge(alice);
  const start = await member.sessionListChanges({});
  if (!start.ok) throw new Error('no cursor');
  changes.changed(true, 'alice');
  const seen = await member.sessionListChanges({
    sinceSeq: start.value.cursor.seq,
    epoch: start.value.cursor.epoch,
  });
  expect(
    seen.ok && seen.value.reset !== true && seen.value.sessions.map((r) => r.sessionId),
  ).toEqual(['alice']);
  if (!seen.ok) throw new Error('no delta');
  f.channels.getOrCreateDm(bob, 'alice-bot', 'alice-bot');
  const cursor = { sinceSeq: seen.value.cursor.seq, epoch: seen.value.cursor.epoch };
  expect(await member.sessionListChanges(cursor)).toMatchObject({
    ok: true,
    value: { reset: true },
  });
  changes.changed(true, 'alice');
  expect(await member.sessionListChanges(cursor)).toMatchObject({
    ok: true,
    value: { reset: true },
  });
});

it('resets a member who lost or gained a Bot, and keeps the cursor while access is unchanged', async () => {
  const { f, changes } = setup();
  const member = f.bridge(alice);
  const start = await member.sessionListChanges({});
  if (!start.ok) throw new Error('no cursor');
  const cursor = { sinceSeq: start.value.cursor.seq, epoch: start.value.cursor.epoch };
  changes.changed(true, 'alice');
  expect(await member.sessionListChanges(cursor)).toMatchObject({
    ok: true,
    value: { sessions: [{ sessionId: 'alice' }] },
  });
  const owner = (slug: string, humanId: string) =>
    f.db.transaction((db) =>
      db
        .prepare(
          `UPDATE persona_bots SET owner_human_id = ?, body = json_set(body, '$.ownerHumanId', ?) WHERE slug = ?`,
        )
        .run(humanId, humanId, slug),
    );
  owner('alice-bot', 'bob');
  expect(await member.sessionListChanges(cursor)).toMatchObject({
    ok: true,
    value: { reset: true },
  });
  const after = await member.sessionListChanges({});
  if (!after.ok) throw new Error('no cursor');
  const next = { sinceSeq: after.value.cursor.seq, epoch: after.value.cursor.epoch };
  owner('bob-bot', 'alice');
  expect(await member.sessionListChanges(next)).toMatchObject({ ok: true, value: { reset: true } });
});

it('resets when the member access changes while their changed rows are read', async () => {
  const { f, changes, list } = setup();
  const member = f.bridge(alice);
  const start = await member.sessionListChanges({});
  if (!start.ok) throw new Error('no cursor');
  changes.changed(true, 'alice');
  const rows = await list();
  list.mockImplementationOnce(async () => {
    f.channels.getOrCreateDm(bob, 'alice-bot', 'alice-bot');
    return rows;
  });
  expect(
    await member.sessionListChanges({
      sinceSeq: start.value.cursor.seq,
      epoch: start.value.cursor.epoch,
    }),
  ).toMatchObject({ ok: true, value: { reset: true } });
});
