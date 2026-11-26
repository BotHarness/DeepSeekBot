import { afterEach, expect, it, vi } from 'vitest';
import {
  changesSessionRow,
  createSessionListChanges,
} from '../src/features/sessions/session-list-changes.js';

afterEach(() => vi.useRealTimers());

it('pushes at most one Session list change per second, and only for events that change a row', () => {
  vi.useFakeTimers();
  const publish = vi.fn();
  const changes = createSessionListChanges(publish);

  changes.changed(changesSessionRow('assistant/message'), 's1');
  changes.changed(changesSessionRow('tool/call'), 's1');
  vi.advanceTimersByTime(2_000);
  expect(publish).not.toHaveBeenCalled();
  expect(changes.cursor.seq).toBe(2);

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
