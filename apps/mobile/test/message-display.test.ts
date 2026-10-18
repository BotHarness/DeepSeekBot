import { describe, expect, it, vi } from 'vitest';

import { createMessageDisplayPreferences } from '../src/host/message-display';

describe('device-local message display', () => {
  it('hydrates the saved mode and persists a later change across restarts', async () => {
    let stored: unknown = 'complete';
    const storage = {
      read: async () => stored,
      write: (mode: string) => {
        stored = mode;
      },
    };
    const preferences = createMessageDisplayPreferences(storage);
    expect(preferences.getSnapshot().loaded).toBe(false);
    await preferences.ready;
    expect(preferences.getSnapshot()).toEqual({
      mode: 'complete',
      loaded: true,
      storageError: false,
    });
    preferences.setMode('streaming');
    const restarted = createMessageDisplayPreferences(storage);
    await restarted.ready;
    expect(restarted.getSnapshot().mode).toBe('streaming');
  });

  it('preserves a choice made before hydration and reports a failed save for retry', async () => {
    let resolve: (value: unknown) => void = () => {};
    const write = vi.fn().mockImplementationOnce(() => {
      throw new Error('full');
    });
    const preferences = createMessageDisplayPreferences({
      read: () =>
        new Promise((done) => {
          resolve = done;
        }),
      write,
    });
    const changed = vi.fn();
    const stop = preferences.subscribe(changed);
    preferences.setMode('streaming');
    resolve('complete');
    await preferences.ready;
    expect(preferences.getSnapshot()).toEqual({
      mode: 'streaming',
      loaded: true,
      storageError: true,
    });
    preferences.setMode('streaming');
    expect(preferences.getSnapshot().storageError).toBe(false);
    expect(write).toHaveBeenCalledTimes(2);
    stop();
  });

  it('falls back safely for invalid or unreadable storage', async () => {
    for (const read of [
      async () => 'future',
      async () => {
        throw new Error('unreadable');
      },
    ]) {
      const preferences = createMessageDisplayPreferences({ read, write() {} });
      await preferences.ready;
      expect(preferences.getSnapshot().mode).toBe('streaming');
      expect(preferences.getSnapshot().loaded).toBe(true);
    }
  });
});
