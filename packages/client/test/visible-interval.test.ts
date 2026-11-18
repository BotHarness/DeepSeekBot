import { afterEach, describe, expect, it, vi } from 'vitest';
import { visibleInterval } from '../src/client/visible-interval.js';

function fakePage(initial: DocumentVisibilityState) {
  const listeners = new Set<() => void>();
  return {
    visibilityState: initial,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    set(state: DocumentVisibilityState) {
      this.visibilityState = state;
      for (const listener of listeners) listener();
    },
    listeners,
  };
}

describe('visibleInterval', () => {
  afterEach(() => vi.useRealTimers());

  it('stops ticking while the page is hidden and catches up once it is shown again', () => {
    vi.useFakeTimers();
    const page = fakePage('visible');
    const run = vi.fn();
    const stop = visibleInterval(run, 30_000, page as never);

    vi.advanceTimersByTime(60_000);
    expect(run).toHaveBeenCalledTimes(2);

    page.set('hidden');
    vi.advanceTimersByTime(10 * 60_000);
    expect(run).toHaveBeenCalledTimes(2);

    page.set('visible');
    expect(run).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(30_000);
    expect(run).toHaveBeenCalledTimes(4);

    stop();
    vi.advanceTimersByTime(60_000);
    expect(run).toHaveBeenCalledTimes(4);
    expect(page.listeners.size).toBe(0);
  });

  it('starts idle when mounted on a hidden page', () => {
    vi.useFakeTimers();
    const page = fakePage('hidden');
    const run = vi.fn();
    const stop = visibleInterval(run, 30_000, page as never);
    vi.advanceTimersByTime(120_000);
    expect(run).not.toHaveBeenCalled();
    stop();
  });
});
