import { describe, expect, it } from 'vitest';

import { createActions } from '../src/client/actions.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { createStore, type BotAttentionItem, type BotAttentionPage } from '../src/client/store.js';

function item(id: string, state: BotAttentionItem['state'] = 'pending'): BotAttentionItem {
  return {
    id,
    botSlug: 'ada',
    reason: 'group-mention',
    state,
    createdAt: '2026-09-26T00:00:00.000Z',
    sourceKind: 'human-message',
    sourceAvailable: false,
    authorKind: 'human',
    summary: id,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('Bot Inbox pagination refresh', () => {
  it('keeps loaded older items and their cursor while replacing refreshed item states', async () => {
    const clientStore = createStore();
    clientStore.select({ kind: 'bot', slug: 'ada' });
    const first = Array.from({ length: 50 }, (_, index) => item('id-' + index));
    const responses: BotAttentionPage[] = [
      { items: first, nextCursor: 'id-49' },
      { items: [item('id-50')], nextCursor: 'id-50' },
      { items: [item('id-new'), item('id-0', 'handled'), ...first.slice(1)], nextCursor: 'id-48' },
    ];
    const call: BridgeCall = async () => ({ ok: true, value: responses.shift() });
    const actions = createActions(call, clientStore);
    await actions.refreshBotInbox('ada');
    await actions.loadMoreBotInbox('ada');
    await actions.refreshBotInbox('ada');
    const inbox = clientStore.getSnapshot().botInbox;
    expect(inbox.items).toHaveLength(52);
    expect(inbox.items[0]?.id).toBe('id-new');
    expect(inbox.items[1]?.state).toBe('handled');
    expect(inbox.items.at(-1)?.id).toBe('id-50');
    expect(inbox.nextCursor).toBe('id-50');
  });

  it('ignores an older response after a newer refresh completes', async () => {
    const clientStore = createStore();
    clientStore.select({ kind: 'bot', slug: 'ada' });
    const older = deferred<BotAttentionPage>();
    const newer = deferred<BotAttentionPage>();
    const responses = [older, newer];
    const call: BridgeCall = async () => ({ ok: true, value: await responses.shift()!.promise });
    const actions = createActions(call, clientStore);
    const first = actions.refreshBotInbox('ada');
    const second = actions.refreshBotInbox('ada');
    newer.resolve({ items: [item('new', 'handled')] });
    await second;
    older.resolve({ items: [item('stale')] });
    await first;
    expect(clientStore.getSnapshot().botInbox.items.map((entry) => entry.id)).toEqual(['new']);
  });
});

it('treats an Inbox deep link as a distinct view of the same Bot', () => {
  const clientStore = createStore();
  clientStore.select({ kind: 'bot', slug: 'ada' });
  clientStore.setBotInbox({ status: 'ready', items: [item('from-group')] });
  clientStore.select({ kind: 'bot', slug: 'ada', inboxRequest: 1 });
  expect(clientStore.getSnapshot().selection).toEqual({
    kind: 'bot',
    slug: 'ada',
    inboxRequest: 1,
  });
  expect(clientStore.getSnapshot().botInbox.items.map((item) => item.id)).toEqual(['from-group']);
  clientStore.select({ kind: 'bot', slug: 'ada', inboxRequest: 2 });
  expect(clientStore.getSnapshot().selection).toEqual({
    kind: 'bot',
    slug: 'ada',
    inboxRequest: 2,
  });
  clientStore.select({ kind: 'bot', slug: 'ada' });
  expect(clientStore.getSnapshot().selection).toEqual({ kind: 'bot', slug: 'ada' });
});
