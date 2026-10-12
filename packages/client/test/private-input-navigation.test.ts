import { describe, expect, it, vi } from 'vitest';

import { watchPrivateInputNavigation } from '../src/client/private-input-navigation.js';
import { createStore } from '../src/client/store.js';

describe('private input Chat navigation', () => {
  const locator = { channelId: 'dm-ada', messageId: 'private-card' };
  const channel = {
    id: 'dm-ada',
    type: 'dm' as const,
    botSlug: 'ada',
    name: 'Ada',
    createdAt: 'now',
    updatedAt: 'now',
    members: [],
  };

  it('waits for the target Chat after readiness and opens the card only once', () => {
    const store = createStore();
    const open = vi.fn();
    const dispose = watchPrivateInputNavigation(store, locator, open);
    store.setRoster([], []);
    expect(store.getSnapshot().status).toBe('ready');
    expect(open).not.toHaveBeenCalled();
    store.setRoster([], [{ ...channel, id: 'dm-other' }]);
    expect(open).not.toHaveBeenCalled();
    store.setRoster([], [channel]);
    expect(open).toHaveBeenCalledExactlyOnceWith('dm-ada', 'private-card');
    store.setRoster([], [channel]);
    expect(open).toHaveBeenCalledOnce();
    dispose();
  });

  it('opens an already loaded Chat and stops waiting when the Client effect is disposed', () => {
    const store = createStore();
    const open = vi.fn();
    const dispose = watchPrivateInputNavigation(store, locator, open);
    dispose();
    store.setRoster([], [channel]);
    expect(open).not.toHaveBeenCalled();
    watchPrivateInputNavigation(store, locator, open)();
    expect(open).toHaveBeenCalledExactlyOnceWith('dm-ada', 'private-card');
  });
});
