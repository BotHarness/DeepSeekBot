import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHeldScroll } from '../src/host/held-scroll';

describe('held remote scrolling', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('keeps scrolling at a held edge without more move events and stops on release', async () => {
    const send = vi.fn(async () => true);
    const held = createHeldScroll();
    held.configure(true, send);
    held.start();
    held.move({ x: 0, y: 1 });
    await vi.advanceTimersByTimeAsync(500);
    expect(send).toHaveBeenCalledTimes(5);
    expect(send).toHaveBeenLastCalledWith('vertical', 2);
    held.stop();
    await vi.advanceTimersByTimeAsync(500);
    expect(send).toHaveBeenCalledTimes(5);
  });

  it('changes direction and becomes idle at neutral', async () => {
    const send = vi.fn(async () => true);
    const held = createHeldScroll();
    held.configure(true, send);
    held.start();
    held.move({ x: -0.3, y: 0 });
    await vi.advanceTimersByTimeAsync(100);
    expect(send).toHaveBeenLastCalledWith('horizontal', -1);
    held.move({ x: 0, y: -1 });
    await vi.advanceTimersByTimeAsync(100);
    expect(send).toHaveBeenLastCalledWith('vertical', -2);
    held.move({ x: 0.1, y: 0.1 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('never overlaps slow requests or queues a burst while holding', async () => {
    let acknowledge: (value: boolean) => void = () => {};
    const send = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          acknowledge = resolve;
        }),
    );
    const held = createHeldScroll();
    held.configure(true, send);
    held.start();
    held.move({ x: 0, y: 1 });
    await vi.advanceTimersByTimeAsync(2000);
    expect(send).toHaveBeenCalledTimes(1);
    acknowledge(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(send).toHaveBeenCalledTimes(2);
    held.stop();
    acknowledge(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('does not send the second diagonal axis after control loss during an acknowledgement', async () => {
    let acknowledge: (value: boolean) => void = () => {};
    const send = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          acknowledge = resolve;
        }),
    );
    const held = createHeldScroll();
    held.configure(true, send);
    held.start();
    held.move({ x: 1, y: 1 });
    await vi.advanceTimersByTimeAsync(100);
    held.configure(false, send);
    acknowledge(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(1);
    held.configure(true, send);
    held.move({ x: 1, y: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each(['refused', 'rejected'])('stops on %s input until a new gesture', async (failure) => {
    const send = vi.fn(async () => {
      if (failure === 'rejected') throw new Error('disconnected');
      return false;
    });
    const held = createHeldScroll();
    held.configure(true, send);
    held.start();
    held.move({ x: 0, y: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    held.move({ x: 0, y: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(1);
    held.start();
    held.move({ x: 0, y: 1 });
    await vi.advanceTimersByTimeAsync(100);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('does not let a stale failed acknowledgement cancel a new gesture', async () => {
    let acknowledge: (value: boolean) => void = () => {};
    const send = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          acknowledge = resolve;
        }),
    );
    const held = createHeldScroll();
    held.configure(true, send);
    held.start();
    held.move({ x: 0, y: 1 });
    await vi.advanceTimersByTimeAsync(100);
    held.stop();
    held.start();
    held.move({ x: -1, y: 0 });
    acknowledge(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(send).toHaveBeenLastCalledWith('horizontal', -2);
    held.stop();
    acknowledge(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
