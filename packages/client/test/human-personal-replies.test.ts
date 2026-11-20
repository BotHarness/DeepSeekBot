import { describe, expect, it } from 'vitest';

import { createActions } from '../src/client/actions.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { createStore } from '../src/client/store.js';

describe('Human personal replies Client', () => {
  it('loads the same canonical reply in two windows and preserves Bot/Channel filters', async () => {
    const requests: Array<Record<string, unknown>> = [];
    const row = {
      id: 'reply:source-ada',
      category: 'replies',
      kind: 'channel-reply',
      createdAt: '2026-10-01T01:00:00Z',
      channelId: 'group-launch',
      channelName: 'Launch',
      botSlug: 'ada',
      summary: 'Ready for your approval.',
      messageId: 'reply-ada',
      sourceEventId: 'source-ada',
      isUnread: true,
    };
    const call: BridgeCall = async (_endpoint, payload) => {
      requests.push(payload);
      return { ok: true, value: { items: [row] } };
    };
    const windows = [createStore(), createStore()];
    for (const client of windows) {
      client.select({ kind: 'inbox' });
      client.setActivityList({ sort: 'oldest' });
      const actions = createActions(call, client);
      await actions.refreshActivityList('replies');
      expect(client.getSnapshot().activityList).toMatchObject({
        category: 'replies',
        status: 'ready',
        sort: 'newest',
        items: [row],
      });
      await actions.setActivityListFilters({
        botSlug: 'ada',
        channelId: 'group-launch',
        sort: 'newest',
      });
      expect(requests.at(-1)).toMatchObject({
        category: 'replies',
        botSlug: 'ada',
        channelId: 'group-launch',
        sort: 'newest',
      });
    }
    expect(windows[0]!.getSnapshot().activityList.items).toEqual(
      windows[1]!.getSnapshot().activityList.items,
    );
  });
});
