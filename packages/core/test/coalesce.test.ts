import { afterEach, expect, it, vi } from 'vitest';

import { coalesce } from '../src/runtime/coalesce.js';

afterEach(() => vi.useRealTimers());

it('runs once after a burst, never later than the longest wait, and flushes on demand', async () => {
  vi.useFakeTimers();
  const run = vi.fn();
  const work = coalesce(run, { delayMs: 100, maxWaitMs: 300 });
  for (let i = 0; i < 5; i++) {
    work.schedule();
    await vi.advanceTimersByTimeAsync(50);
  }
  expect(run).toHaveBeenCalledTimes(0);
  await vi.advanceTimersByTimeAsync(100);
  expect(run).toHaveBeenCalledTimes(1);

  for (let i = 0; i < 10; i++) {
    work.schedule();
    await vi.advanceTimersByTimeAsync(60);
  }
  expect(run.mock.calls.length).toBeGreaterThanOrEqual(2);

  const before = run.mock.calls.length;
  work.schedule();
  work.flush();
  expect(run).toHaveBeenCalledTimes(before + 1);
  work.flush();
  expect(run).toHaveBeenCalledTimes(before + 1);
  work.schedule();
  work.cancel();
  await vi.advanceTimersByTimeAsync(1_000);
  expect(run).toHaveBeenCalledTimes(before + 1);
});
