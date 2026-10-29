import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHeldScrollMotion } from '../src/host/held-scroll-motion';
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
it('refreshes a held velocity without move events, then explicitly stops on release', async () => {
  const send = vi.fn(async () => true),
    held = createHeldScrollMotion();
  held.configure(true, send);
  held.start();
  held.move({ x: 0, y: -1 });
  await vi.advanceTimersByTimeAsync(400);
  expect(send).toHaveBeenCalledTimes(6);
  expect(send).toHaveBeenLastCalledWith({ x: 0, y: -1 });
  held.stop();
  expect(send).toHaveBeenLastCalledWith({ x: 0, y: 0 });
  await vi.advanceTimersByTimeAsync(1000);
  expect(send).toHaveBeenCalledTimes(7);
});
it('does not accumulate updates behind a slow request, and a late ack cannot restart released scrolling', async () => {
  let resolve: (value: boolean) => void = () => {};
  const send = vi.fn(
    () =>
      new Promise<boolean>((r) => {
        resolve = r;
      }),
  );
  const held = createHeldScrollMotion();
  held.configure(true, send);
  held.start();
  held.move({ x: 1, y: 0 });
  await vi.advanceTimersByTimeAsync(1000);
  expect(send).toHaveBeenCalledTimes(1);
  const first = resolve;
  held.stop();
  expect(send).toHaveBeenLastCalledWith({ x: 0, y: 0 });
  first(true);
  resolve(true);
  await vi.advanceTimersByTimeAsync(1000);
  expect(send).toHaveBeenCalledTimes(2);
});
it('stops before replacing the sender on background/unmount, and ignores stale motion', async () => {
  const send = vi.fn(async () => true),
    held = createHeldScrollMotion();
  held.configure(true, send);
  held.start();
  held.move({ x: 1, y: 1 });
  await vi.advanceTimersByTimeAsync(1);
  held.configure(false, async () => false);
  expect(send).toHaveBeenLastCalledWith({ x: 0, y: 0 });
  held.move({ x: 1, y: 1 });
  await vi.advanceTimersByTimeAsync(1000);
  expect(send).toHaveBeenCalledTimes(2);
});
