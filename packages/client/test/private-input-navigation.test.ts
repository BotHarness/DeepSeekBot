import { describe, expect, it, vi } from 'vitest';

import {
  watchFullClientLanding,
  watchPrivateInputNavigation,
} from '../src/client/private-input-navigation.js';
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

describe('full-client landing from the phone app', () => {
  const ada = { slug: 'ada', displayName: 'Ada', roles: [] } as never;

  it('lands on Bot mode once the roster is ready and opens the DM only for a known Bot', () => {
    const store = createStore();
    const land = vi.fn();
    watchFullClientLanding(store, { kind: 'dm', slug: 'ada' }, land);
    expect(land).not.toHaveBeenCalled();
    store.setRoster([ada], []);
    expect(land).toHaveBeenCalledExactlyOnceWith('ada');
    store.setRoster([ada], []);
    expect(land).toHaveBeenCalledOnce();

    const missing = vi.fn();
    watchFullClientLanding(store, { kind: 'dm', slug: 'grace' }, missing);
    expect(missing).toHaveBeenCalledExactlyOnceWith(undefined);
    const home = vi.fn();
    watchFullClientLanding(store, { kind: 'home' }, home);
    expect(home).toHaveBeenCalledExactlyOnceWith(undefined);
  });
});
