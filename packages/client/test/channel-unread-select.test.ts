import { describe, expect, it } from 'vitest';

import { createStore } from '../src/client/store.js';

describe('Channel unread counts across selection', () => {
  it('keeps every Channel unread badge when another Channel opens', () => {
    const clientStore = createStore();
    clientStore.select({ kind: 'channel', channelId: 'a' });
    clientStore.setActivityList({ channelUnread: { b: 57, c: 12 }, unreadCount: 3 });

    clientStore.select({ kind: 'channel', channelId: 'c' });
    expect(clientStore.getSnapshot().activityList.channelUnread).toEqual({ b: 57, c: 12 });

    clientStore.select({ kind: 'inbox' });
    expect(clientStore.getSnapshot().activityList.channelUnread).toEqual({ b: 57, c: 12 });
    expect(clientStore.getSnapshot().activityList.items).toEqual([]);
  });
});
