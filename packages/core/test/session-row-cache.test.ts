import { expect, it, vi } from 'vitest';
import type { DshSessionListRow } from '../src/features/sessions/host-sessions.js';
import { createSessionListChanges } from '../src/features/sessions/session-list-changes.js';
import { incrementalSessionRows } from '../src/features/sessions/session-row-cache.js';

const row = (sessionId: string, extra: Partial<DshSessionListRow> = {}): DshSessionListRow => ({
  sessionId,
  running: false,
  lastPromptAt: null,
  updatedAt: 1,
  ...extra,
});

function setup(initial: DshSessionListRow[], options = {}) {
  const journal = createSessionListChanges(() => undefined, { epoch: 'run' });
  const store = new Map(initial.map((r) => [r.sessionId, r]));
  const all = vi.fn(async () => [...store.values()]);
  const one = vi.fn(async (previous: DshSessionListRow) => store.get(previous.sessionId) ?? null);
  const rows = incrementalSessionRows({ all, one }, journal, options);
  return { journal, store, all, one, rows };
}

const ids = (rows: readonly DshSessionListRow[]) => rows.map((r) => r.sessionId).sort();

it('reads the whole list once, then refreshes only the known Sessions the journal names', async () => {
  const { journal, store, all, one, rows } = setup([row('a'), row('b'), row('c')]);
  expect(ids(await rows())).toEqual(['a', 'b', 'c']);
  expect(all).toHaveBeenCalledTimes(1);

  store.set('b', row('b', { title: 'Renamed', running: true }));
  store.delete('c');
  journal.changed(false, 'b', 50);
  journal.changed(false, 'c', 70);
  const next = await rows();
  expect(all).toHaveBeenCalledTimes(1);
  expect(one.mock.calls.map(([previous]) => previous.sessionId).sort()).toEqual(['b', 'c']);
  expect(ids(next)).toEqual(['a', 'b']);
  expect(next.find((r) => r.sessionId === 'b')).toMatchObject({ title: 'Renamed', updatedAt: 50 });

  await rows();
  expect(one).toHaveBeenCalledTimes(2);
});

it('reads the whole list again for a new Session, but not for an ignored subagent', async () => {
  const journal = createSessionListChanges(() => undefined, { epoch: 'run' });
  const store = new Map([['a', row('a')]]);
  const all = vi.fn(async () => [...store.values()]);
  const one = vi.fn(async (previous: DshSessionListRow) => store.get(previous.sessionId) ?? null);
  const rows = incrementalSessionRows({ all, one, ignored: (id) => id === 'child' }, journal);
  await rows();
  journal.changed(false, 'child');
  await rows();
  expect(all).toHaveBeenCalledTimes(1);
  store.set('new', row('new'));
  journal.changed(false, 'new');
  expect(ids(await rows())).toEqual(['a', 'new']);
  expect(all).toHaveBeenCalledTimes(2);
  expect(one).not.toHaveBeenCalled();
});

it('keeps the newest activity time when a refresh carries an older one', async () => {
  const { journal, store, rows } = setup([row('a', { updatedAt: 90 })]);
  await rows();
  store.set('a', row('a', { updatedAt: 5 }));
  journal.changed(false, 'a');
  expect((await rows())[0]?.updatedAt).toBe(90);
});

it('falls back to a full read after a reset, too many changes, or when the rows are old', async () => {
  let now = 0;
  const { journal, all, rows } = setup([row('a')], { maxDirty: 2, now: () => now });
  await rows();
  journal.changedAll();
  await rows();
  expect(all).toHaveBeenCalledTimes(2);
  for (const id of ['x', 'y', 'z']) journal.changed(false, id);
  await rows();
  expect(all).toHaveBeenCalledTimes(3);
  now = 10 * 60 * 1000;
  await rows();
  expect(all).toHaveBeenCalledTimes(4);
});

it('reads everything again after a failed refresh', async () => {
  const { journal, one, all, rows } = setup([row('a')]);
  await rows();
  one.mockRejectedValueOnce(new Error('DSH busy'));
  journal.changed(false, 'a');
  await expect(rows()).rejects.toThrow('DSH busy');
  await rows();
  expect(all).toHaveBeenCalledTimes(2);
});
