import { describe, expect, it, vi } from 'vitest';

import { createBotInbox, inboxOrder } from '../src/host/bot-inbox';
import type { BotInboxItem } from '../src/host/wire';

const item = (id: string, sourceMessageId?: string): BotInboxItem => ({
  id,
  botSlug: 'ada',
  reason: 'group-mention',
  state: 'handled',
  createdAt: '2026-10-26T00:00:00.000Z',
  sourceKind: 'human-message',
  ...(sourceMessageId === undefined ? {} : { sourceMessageId }),
  summary: 'Summary ' + id,
});

describe('Bot Inbox pages', () => {
  it('loads more history and keeps the rows already shown', async () => {
    const call = vi.fn(async (_method: string, args?: Record<string, unknown>) =>
      args?.['cursor'] === undefined
        ? { items: [item('a'), item('b')], nextCursor: 'page-2' }
        : { items: [item('b'), item('c')] },
    );
    const inbox = createBotInbox({ call } as never, 'ada');
    await inbox.load();
    expect(call).toHaveBeenLastCalledWith('botAttention', {
      slug: 'ada',
      limit: 30,
    });
    expect(inbox.getSnapshot()).toMatchObject({
      status: 'ready',
      nextCursor: 'page-2',
    });
    await inbox.load('page-2');
    expect(call).toHaveBeenLastCalledWith('botAttention', {
      slug: 'ada',
      limit: 30,
      cursor: 'page-2',
    });
    const snapshot = inbox.getSnapshot();
    expect(snapshot.items.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
    expect(snapshot).toEqual({ status: 'ready', items: snapshot.items });
  });

  it('retries the page that failed without dropping loaded rows', async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce({ items: [item('a')], nextCursor: 'page-2' })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ items: [item('b')] });
    const inbox = createBotInbox({ call } as never, 'ada');
    await inbox.load();
    await inbox.load('page-2');
    const failed = inbox.getSnapshot();
    expect(failed).toMatchObject({
      status: 'failed',
      error: 'offline',
      cursor: 'page-2',
    });
    expect(failed.items.map((entry) => entry.id)).toEqual(['a']);
    await inbox.load(failed.status === 'failed' ? failed.cursor : undefined);
    expect(inbox.getSnapshot().items.map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('ignores a page that arrives after the screen closed', async () => {
    let resolve: (value: unknown) => void = () => {};
    const call = vi.fn(() => new Promise((done) => (resolve = done)));
    const inbox = createBotInbox({ call } as never, 'ada');
    const listener = vi.fn();
    inbox.subscribe(listener);
    const loading = inbox.load();
    listener.mockClear();
    inbox.close();
    resolve({ items: [item('a')] });
    await loading;
    expect(listener).not.toHaveBeenCalled();
    expect(inbox.getSnapshot().items).toEqual([]);
  });

  it('puts the Inbox item for this message first', () => {
    expect(
      inboxOrder([item('a', 'm0'), item('b', 'm1'), item('c')], 'm1').map((entry) => entry.id),
    ).toEqual(['b', 'a', 'c']);
  });
});
