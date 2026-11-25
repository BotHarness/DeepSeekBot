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
