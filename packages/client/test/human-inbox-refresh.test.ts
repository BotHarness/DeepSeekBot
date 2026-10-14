import { describe, expect, it } from 'vitest';

import { createActions } from '../src/client/actions.js';
import type { BridgeCall } from '../src/client/bridge.js';
import {
  createStore,
  type HumanAttentionItem,
  type HumanAttentionPage,
} from '../src/client/store.js';

function item(id: string): HumanAttentionItem {
  return {
    id,
    category: 'action',
    kind: 'group-join-request',
    createdAt: '2026-09-26T00:00:00.000Z',
    channelId: 'group-team',
    channelName: 'Team',
    botSlug: 'ada',
    summary: id,
    requestId: id,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('Human Inbox pagination refresh', () => {
  it('rebuilds loaded older actions after another window resolves one', async () => {
    const clientStore = createStore();
    clientStore.select({ kind: 'inbox' });
    const first = Array.from({ length: 50 }, (_, index) => item('head-' + index));
    const responses: HumanAttentionPage[] = [
      { items: first, nextCursor: 'head' },
      { items: [item('resolved-elsewhere'), item('still-live')], nextCursor: 'tail' },
      { items: first, nextCursor: 'new-head' },
      { items: [item('still-live')] },
    ];
    const call: BridgeCall = async () => ({ ok: true, value: responses.shift() });
    const actions = createActions(call, clientStore);
    await actions.refreshHumanInbox();
    await actions.loadMoreHumanInbox();
    await actions.refreshHumanInbox();
    expect(clientStore.getSnapshot().humanInbox.items.map((row) => row.id)).not.toContain(
      'resolved-elsewhere',
    );
    expect(clientStore.getSnapshot().humanInbox.items.at(-1)?.id).toBe('still-live');
    expect(clientStore.getSnapshot().humanInbox.nextCursor).toBeUndefined();
  });

  it('rejects an unread summary without a committed anchor or positive count', async () => {
    const clientStore = createStore();
    clientStore.select({ kind: 'inbox' });
    const call: BridgeCall = async () => ({
      ok: true,
      value: {
        items: [
          {
            id: 'unread:group-team',
            category: 'unread',
            kind: 'channel-unread',
            createdAt: '2026-09-26T00:00:00.000Z',
            channelId: 'group-team',
            channelName: 'Team',
            botSlug: 'ada',
            summary: 'Update',
            unreadCount: 0,
          },
        ],
      },
    });
    await createActions(call, clientStore).refreshHumanInbox('unread');
    expect(clientStore.getSnapshot().humanInbox.status).toBe('error');
    expect(clientStore.getSnapshot().humanInbox.items).toEqual([]);
  });
  it('uses the Host status for the entry badge and refreshes it after a concrete read', async () => {
    const clientStore = createStore();
    const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
    let unreadCount = 3;
    const call: BridgeCall = async (endpoint, payload) => {
      calls.push({ endpoint, payload });
      if (endpoint === 'humanAttentionStatus')
        return { ok: true, value: { unreadCount, hasAction: true } };
      if (endpoint === 'channelUnreadCounts')
        return {
          ok: true,
          value: { channels: unreadCount > 1 ? [{ channelId: 'group-team', unreadCount: 2 }] : [] },
        };
      if (endpoint === 'channelMarkRead') {
        unreadCount = 1;
        return { ok: true, value: { position: { messageId: 'second' } } };
      }
      throw new Error('Unexpected bridge call');
    };
    const actions = createActions(call, clientStore);
    await actions.refreshHumanInboxStatus();
    expect(clientStore.getSnapshot().humanInbox).toMatchObject({ unreadCount: 3, hasAction: true });
    expect(clientStore.getSnapshot().humanInbox.channelUnread).toEqual({ 'group-team': 2 });
    await actions.markRead('group-team', 'second');
    expect(calls.map((entry) => entry.endpoint)).toEqual([
      'humanAttentionStatus',
      'channelUnreadCounts',
      'channelMarkRead',
      'humanAttentionStatus',
      'channelUnreadCounts',
    ]);
    expect(calls[2]?.payload).toEqual({ channelId: 'group-team', messageId: 'second' });
    expect(clientStore.getSnapshot().humanInbox.unreadCount).toBe(1);
    expect(clientStore.getSnapshot().humanInbox.channelUnread).toEqual({});
  });
  it('keeps loaded older items and their cursor across a background refresh', async () => {
    const clientStore = createStore();
    clientStore.select({ kind: 'inbox' });
    const first = Array.from({ length: 50 }, (_, index) => item('id-' + index));
    const responses: HumanAttentionPage[] = [
      { items: first, nextCursor: 'cursor-1' },
      { items: [item('id-50')], nextCursor: 'cursor-2' },
      { items: [item('new'), ...first.slice(0, 49)], nextCursor: 'cursor-new' },
      { items: [first[49]!, item('id-50')], nextCursor: 'cursor-2' },
    ];
    const call: BridgeCall = async () => ({ ok: true, value: responses.shift() });
    const actions = createActions(call, clientStore);
    await actions.refreshHumanInbox();
    await actions.loadMoreHumanInbox();
    await actions.refreshHumanInbox();
    const inbox = clientStore.getSnapshot().humanInbox;
    expect(inbox.status).toBe('ready');
    expect(inbox.items).toHaveLength(52);
    expect(inbox.items[0]?.id).toBe('new');
    expect(inbox.items.at(-1)?.id).toBe('id-50');
    expect(inbox.nextCursor).toBe('cursor-2');
  });

  it('does not restore an ignored report from a loaded older page on refresh', async () => {
    const clientStore = createStore();
    clientStore.select({ kind: 'inbox' });
    const report = (id: string): HumanAttentionItem => ({
      id: `report:${id}`,
      category: 'info',
      kind: 'assignment-report',
      createdAt: '2026-09-26T00:00:00.000Z',
      botSlug: 'ada',
      summary: id,
      sourceEventId: id,
      assignmentSessionId: `assignment:${id}`,
    });
    const first = Array.from({ length: 50 }, (_, index) => report('head-' + index));
    const responses: HumanAttentionPage[] = [
      { items: first, nextCursor: 'cursor-1' },
      { items: [report('old-ignored'), report('old-kept')], nextCursor: 'cursor-2' },
      { items: first, nextCursor: 'cursor-new' },
      { items: [report('old-kept')], nextCursor: 'cursor-2' },
    ];
    const call: BridgeCall = async (endpoint) =>
      endpoint === 'humanAttentionIgnore'
        ? { ok: true, value: { accepted: true } }
        : { ok: true, value: responses.shift() };
    const actions = createActions(call, clientStore);
    await actions.refreshHumanInbox('info');
    await actions.loadMoreHumanInbox();
    await actions.ignoreHumanReport('old-ignored');
    await actions.refreshHumanInbox();
    const inbox = clientStore.getSnapshot().humanInbox;
    expect(inbox.status).toBe('ready');
    expect(inbox.items.map((entry) => entry.sourceEventId)).not.toContain('old-ignored');
    expect(inbox.items.map((entry) => entry.sourceEventId)).toContain('old-kept');
    expect(inbox.nextCursor).toBe('cursor-2');
  });

  it('keeps an in-flight load-more result when a background refresh completes first', async () => {
    const clientStore = createStore();
    clientStore.select({ kind: 'inbox' });
    const first = Array.from({ length: 50 }, (_, index) => item('id-' + index));
    const older = deferred<HumanAttentionPage>();
    const responses = [
      Promise.resolve({ items: first, nextCursor: 'cursor-1' }),
      older.promise,
      Promise.resolve({ items: [item('new'), ...first.slice(0, 49)], nextCursor: 'cursor-new' }),
      Promise.resolve({ items: [item('new'), ...first.slice(0, 49)], nextCursor: 'cursor-new' }),
      Promise.resolve({ items: [first[49]!, item('id-50')], nextCursor: 'cursor-2' }),
    ];
    const call: BridgeCall = async () => ({ ok: true, value: await responses.shift()! });
    const actions = createActions(call, clientStore);
    await actions.refreshHumanInbox();
    const loadMore = actions.loadMoreHumanInbox();
    await actions.refreshHumanInbox();
    older.resolve({ items: [item('id-50')], nextCursor: 'cursor-2' });
    await loadMore;
    const inbox = clientStore.getSnapshot().humanInbox;
    expect(inbox.items.map((entry) => entry.id)).toContain('id-50');
    expect(inbox.nextCursor).toBe('cursor-2');
  });

  it('bounds automatic reconciliation to three canonical pages and keeps a current load-more cursor', async () => {
    const clientStore = createStore();
    clientStore.select({ kind: 'inbox' });
    clientStore.setHumanInbox({
      status: 'ready',
      items: Array.from({ length: 240 }, (_, i) => item('old-' + i)),
      nextCursor: 'old-cursor',
    });
    const requests: Record<string, unknown>[] = [];
    const call: BridgeCall = async (_endpoint, payload) => {
      requests.push(payload);
      const n = requests.length;
      return {
        ok: true,
        value: {
          items: Array.from({ length: 50 }, (_, i) => item('new-' + ((n - 1) * 50 + i))),
          nextCursor: 'fresh-' + n,
        },
      };
    };
    const actions = createActions(call, clientStore);
    await actions.refreshHumanInbox();
    expect(requests).toHaveLength(3);
    expect(clientStore.getSnapshot().humanInbox.items).toHaveLength(150);
    expect(clientStore.getSnapshot().humanInbox.nextCursor).toBe('fresh-3');
    await actions.loadMoreHumanInbox();
    expect(requests.at(-1)?.['cursor']).toBe('fresh-3');
    expect(clientStore.getSnapshot().humanInbox.items).toHaveLength(200);
  });

  it.each(['poll-first', 'page-first', 'poll-finishes-first'] as const)(
    'keeps the deep page when background polling races with load-more (%s)',
    async (order) => {
      const clientStore = createStore();
      clientStore.select({ kind: 'inbox' });
      const first = Array.from({ length: 150 }, (_, i) => item('old-' + i));
      clientStore.setHumanInbox({ status: 'ready', items: first, nextCursor: 'older' });
      const refresh = deferred<HumanAttentionPage>(),
        older = deferred<HumanAttentionPage>();
      const calls: Record<string, unknown>[] = [];
      const call: BridgeCall = async (_endpoint, payload) => {
        calls.push(payload);
        return {
          ok: true,
          value: await (payload['cursor'] === undefined ? refresh.promise : older.promise),
        };
      };
      const actions = createActions(call, clientStore);
      const poll = order !== 'page-first' ? actions.refreshHumanInbox(undefined, true) : undefined;
      const more = actions.loadMoreHumanInbox();
      const laterPoll =
        order === 'page-first' ? actions.refreshHumanInbox(undefined, true) : undefined;
      if (order === 'poll-finishes-first') {
        refresh.resolve({ items: first.slice(0, 50), nextCursor: 'head' });
        await poll;
      }
      older.resolve({ items: [item('deep')], nextCursor: 'deep-cursor' });
      await more;
      refresh.resolve({ items: first.slice(0, 50), nextCursor: 'head' });
      await poll;
      await laterPoll;
      expect(clientStore.getSnapshot().humanInbox.items).toHaveLength(151);
      expect(clientStore.getSnapshot().humanInbox.items.at(-1)?.id).toBe('deep');
      expect(clientStore.getSnapshot().humanInbox.nextCursor).toBe('deep-cursor');
      expect(calls.filter((call) => call['cursor'] === undefined)).toHaveLength(
        order === 'page-first' ? 0 : 1,
      );
    },
  );

  it('passes Bot, Channel, and sort filters to the Host and clears a Channel filter on tab change', async () => {
    const clientStore = createStore();
    clientStore.select({ kind: 'inbox' });
    const requests: Record<string, unknown>[] = [];
    const call: BridgeCall = async (endpoint, payload) => {
      if (endpoint === 'humanAttention') requests.push(payload);
      return { ok: true, value: { items: [] } };
    };
    const actions = createActions(call, clientStore);
    await actions.setHumanInboxFilters({
      botSlug: 'ada',
      channelId: 'group-team',
      sort: 'oldest',
    });
    expect(requests.at(-1)).toMatchObject({
      category: 'action',
      botSlug: 'ada',
      channelId: 'group-team',
      sort: 'oldest',
    });
    await actions.refreshHumanInbox('info');
    expect(requests.at(-1)).toMatchObject({
      category: 'info',
      botSlug: 'ada',
      sort: 'newest',
    });
    expect(requests.at(-1)?.['channelId']).toBeUndefined();
    expect(clientStore.getSnapshot().humanInbox.channelId).toBeUndefined();
  });

  it('discards a stale response after filters change', async () => {
    const clientStore = createStore();
    clientStore.select({ kind: 'inbox' });
    const stale = deferred<HumanAttentionPage>();
    const responses = [stale.promise, Promise.resolve({ items: [] })];
    const call: BridgeCall = async () => ({ ok: true, value: await responses.shift()! });
    const actions = createActions(call, clientStore);
    const first = actions.refreshHumanInbox();
    await actions.setHumanInboxFilters({
      botSlug: 'ada',
      channelId: undefined,
      sort: 'oldest',
    });
    stale.resolve({ items: [item('stale')] });
    await first;
    expect(clientStore.getSnapshot().humanInbox.items).toEqual([]);
    expect(clientStore.getSnapshot().humanInbox.sort).toBe('oldest');
  });

  it('discards an old category response after switching category', async () => {
    const clientStore = createStore();
    clientStore.select({ kind: 'inbox' });
    const old = deferred<HumanAttentionPage>();
    const responses = [old.promise, Promise.resolve({ items: [], nextCursor: undefined })];
    const call: BridgeCall = async () => ({ ok: true, value: await responses.shift()! });
    const actions = createActions(call, clientStore);
    const before = actions.refreshHumanInbox();
    await actions.refreshHumanInbox('info');
    old.resolve({ items: [item('stale')] });
    await before;
    expect(clientStore.getSnapshot().humanInbox.category).toBe('info');
    expect(clientStore.getSnapshot().humanInbox.items).toEqual([]);
  });
});
