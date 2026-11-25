import { afterEach, expect, it, vi } from 'vitest';
import {
  cacheSessionRows,
  changesSessionRow,
  createSessionListChanges,
} from '../src/features/sessions/session-list-changes.js';

afterEach(() => vi.useRealTimers());

it('pushes at most one Session list change per second, and only for events that change a row', () => {
  vi.useFakeTimers();
  const publish = vi.fn();
  const changes = createSessionListChanges(publish);

  changes.changed(changesSessionRow('assistant/message'));
  changes.changed(changesSessionRow('tool/call'));
  vi.advanceTimersByTime(2_000);
  expect(publish).not.toHaveBeenCalled();
  expect(changes.version).toBe(2);

  changes.changed(changesSessionRow('turn/start'));
  changes.changed(changesSessionRow('session/title'));
  changes.changed(changesSessionRow('turn/end'));
  vi.advanceTimersByTime(999);
  expect(publish).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(publish).toHaveBeenCalledTimes(1);

  changes.changed();
  changes.close();
  vi.advanceTimersByTime(2_000);
  expect(publish).toHaveBeenCalledTimes(1);
});

it('reuses the Host Session rows until a Session changes or they get old', async () => {
  let now = 0;
  const changes = { version: 0 };
  const read = vi.fn(async () => [`rows ${read.mock.calls.length}`]);
  const rows = cacheSessionRows(read, changes, { maxAgeMs: 15_000, now: () => now });

  expect(await rows()).toEqual(['rows 1']);
  expect(await rows()).toEqual(['rows 1']);
  changes.version = 1;
  expect(await rows()).toEqual(['rows 2']);
  now = 15_000;
  expect(await rows()).toEqual(['rows 3']);
  expect(read).toHaveBeenCalledTimes(3);
});

it('reads again after a failed read instead of caching the failure', async () => {
  const read = vi
    .fn<() => Promise<string[]>>()
    .mockRejectedValueOnce(new Error('DSH busy'))
    .mockResolvedValue(['rows']);
  const rows = cacheSessionRows(read, { version: 0 });
  await expect(rows()).rejects.toThrow('DSH busy');
  expect(await rows()).toEqual(['rows']);
});

it('keeps one journal entry per Session and lists the newest changes since a cursor', () => {
  const changes = createSessionListChanges(() => undefined, { epoch: 'run-1' });
  expect(changes.since({})).toEqual({ reset: true, cursor: { epoch: 'run-1', seq: 0 } });
  changes.changed(false, 'a');
  changes.changed(false, 'b');
  changes.changed(false, 'a');
  expect(changes.cursor).toEqual({ epoch: 'run-1', seq: 3 });
  expect(changes.since({ sinceSeq: 0, epoch: 'run-1' })).toEqual({
    sessionIds: ['a', 'b'],
    cursor: { epoch: 'run-1', seq: 3 },
  });
  expect(changes.since({ sinceSeq: 2, epoch: 'run-1' })).toEqual({
    sessionIds: ['a'],
    cursor: { epoch: 'run-1', seq: 3 },
  });
  expect(changes.since({ sinceSeq: 0, epoch: 'run-0' })).toMatchObject({ reset: true });
  changes.changedAll();
  expect(changes.since({ sinceSeq: 3, epoch: 'run-1' })).toMatchObject({ reset: true });
  changes.changed(false, 'c');
  expect(changes.since({ sinceSeq: 4, epoch: 'run-1' })).toMatchObject({ sessionIds: ['c'] });
  changes.close();
});
