import { afterEach, describe, expect, it } from 'vitest';

import { deleteHostStore, hostStore, installHostStoreOpener } from '../src/host/host-store';
import type { LocalStore } from '../src/host/local-store';

afterEach(() => installHostStoreOpener(undefined));

function opener(remove: () => Promise<void>) {
  const events: string[] = [];
  const store = { close: async () => void events.push('close') } as unknown as LocalStore;
  installHostStoreOpener({
    open: async (hostId) => {
      events.push(`open ${hostId}`);
      return store;
    },
    remove: async (hostId) => {
      events.push(`remove ${hostId}`);
      await remove();
      events.push(`removed ${hostId}`);
    },
  });
  return events;
}

describe('host store deletion', () => {
  it('reopens a Host only after its file is deleted', async () => {
    let finish!: () => void;
    const events = opener(() => new Promise<void>((resolve) => (finish = resolve)));
    await hostStore('h1');
    const deleting = deleteHostStore('h1');
    const reopening = hostStore('h1');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(events).toEqual(['open h1', 'close', 'remove h1']);
    finish();
    await deleting;
    await reopening;
    expect(events).toEqual(['open h1', 'close', 'remove h1', 'removed h1', 'open h1']);
  });

  it('opens the Host again after a failed delete', async () => {
    const events = opener(() => Promise.reject(new Error('locked')));
    await expect(deleteHostStore('h1')).rejects.toThrow('locked');
    await hostStore('h1');
    expect(events).toEqual(['remove h1', 'open h1']);
  });
});
