import { expect, it, vi } from 'vitest';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createSessionListChanges } from '../src/features/sessions/session-list-changes.js';
import { alice, fixture } from './team-bot-visibility-fixtures.js';

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
  const f = fixture({
    nativeSessions: {
      list: vi.fn(async () => rows),
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
  return { f, changes, setRows: (next: typeof rows) => (rows = next) };
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

  const member = await f.bridge(alice).sessionListChanges({ sinceSeq: 0, epoch: 'e1' });
  expect(member).toMatchObject({ ok: true, value: { sessions: [], removed: ['alice-gone'] } });
});

it("gives a member the changed rows of their own Bot only, never the Owner's or native ones", async () => {
  const { f, changes } = setup();
  for (const id of ['native', 'alice', 'owner-only']) changes.changed(true, id);
  const member = await f.bridge(alice).sessionListChanges({ sinceSeq: 0, epoch: 'e1' });
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
