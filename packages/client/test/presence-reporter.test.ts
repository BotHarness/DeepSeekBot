import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mountPresenceReporter,
  PRESENCE_AWAY_MS,
  PRESENCE_IDLE_MS,
  presenceActive,
} from '../src/client/presence-reporter.js';

afterEach(() => {
  vi.useRealTimers();
});

function page() {
  const target = new EventTarget();
  const doc = Object.assign(target, {
    visibilityState: 'visible' as DocumentVisibilityState,
  });
  const win = new EventTarget();
  return { doc, win };
}

describe('desktop presence reporter', () => {
  it('is active while visible with recent input, with a grace after hiding', () => {
    expect(presenceActive(0, { attentive: true, lastInput: 0, lastAttentive: 0 })).toBe(true);
    expect(
      presenceActive(PRESENCE_AWAY_MS - 1, {
        attentive: false,
        lastInput: 0,
        lastAttentive: 0,
      }),
    ).toBe(true);
    expect(
      presenceActive(PRESENCE_AWAY_MS, {
        attentive: false,
        lastInput: 0,
        lastAttentive: 0,
      }),
    ).toBe(false);
    expect(
      presenceActive(PRESENCE_IDLE_MS, {
        attentive: true,
        lastInput: 0,
        lastAttentive: 0,
      }),
    ).toBe(false);
  });

  it('reports active, renews, goes idle a minute after hiding and again on return', async () => {
    vi.useFakeTimers();
    const { doc, win } = page();
    const send = vi.fn(async (_active: boolean) => {});
    const stop = mountPresenceReporter({
      document: doc as unknown as Document,
      window: win as unknown as Window,
      send,
    });
    expect(send.mock.calls).toEqual([[true]]);
    vi.advanceTimersByTime(30_000);
    expect(send.mock.calls).toEqual([[true], [true]]);
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(PRESENCE_AWAY_MS + 5_000);
    expect(send.mock.calls.at(-1)).toEqual([false]);
    const idleCalls = send.mock.calls.length;
    vi.advanceTimersByTime(120_000);
    expect(send.mock.calls.length).toBe(idleCalls);
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(send.mock.calls.at(-1)).toEqual([true]);
    stop();
    expect(send.mock.calls.at(-1)).toEqual([false]);
  });

  it('goes idle after ten minutes without input and back on the next input', () => {
    vi.useFakeTimers();
    const { doc, win } = page();
    const send = vi.fn(async (_active: boolean) => {});
    const stop = mountPresenceReporter({
      document: doc as unknown as Document,
      window: win as unknown as Window,
      send,
    });
    vi.advanceTimersByTime(PRESENCE_IDLE_MS + 5_000);
    expect(send.mock.calls.at(-1)).toEqual([false]);
    win.dispatchEvent(new Event('keydown'));
    expect(send.mock.calls.at(-1)).toEqual([true]);
    stop();
  });
});
