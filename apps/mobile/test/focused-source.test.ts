import { describe, expect, it } from 'vitest';
import { focusedSource } from '../src/host/focused-source';

describe('focused snapshot source', () => {
  it('holds hidden data without notifications, catches up once and disposes subscriptions', () => {
    let value = 'cached';
    const live = new Set<() => void>();
    const source = {
      getSnapshot: () => value,
      subscribe: (listener: () => void) => {
        live.add(listener);
        return () => {
          live.delete(listener);
        };
      },
    };
    const focused = focusedSource(source);
    let updates = 0;
    const off = focused.subscribe(() => {
      updates++;
    });
    expect(live.size).toBe(0);
    focused.focus(true);
    expect(live.size).toBe(1);
    value = 'live';
    for (const listener of live) listener();
    expect(focused.getSnapshot()).toBe('live');
    expect(updates).toBe(1);
    focused.focus(false);
    value = 'background';
    expect(live.size).toBe(0);
    expect(focused.getSnapshot()).toBe('live');
    expect(updates).toBe(1);
    focused.focus(true);
    expect(focused.getSnapshot()).toBe('background');
    expect(updates).toBe(2);
    focused.focus(true);
    expect(updates).toBe(2);
    off();
    expect(live.size).toBe(0);
  });
});
