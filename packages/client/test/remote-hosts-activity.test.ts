import { liveHost, releases } from './remote-hosts-fixtures.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHostActivityActions } from '../src/client/host-activity-actions.js';
import type { HumanAttentionItem } from '../src/client/store.js';
import { ALL_HOSTS, createRemoteHosts } from '../src/client/remote-hosts.js';

afterEach(() => {
  for (const release of releases.splice(0)) release();
  vi.unstubAllGlobals();
});

describe('Host Feed lifecycle', () => {
  it('shares one activity Inbox, refreshes on live frames, stops with the last reader and restarts', async () => {
    const { host, storage } = liveHost();
    const sources = createRemoteHosts({ carrier: host.carrier, storage });
    expect(sources.getSnapshot().hosts[0]?.inbox).toEqual({ status: 'idle' });
    expect(host.requests).toEqual([]);
    const first = sources.subscribe(() => {});
    const second = sources.subscribe(() => {});
    releases.push(first, second);
    await vi.waitFor(() =>
      expect(sources.getSnapshot().hosts[0]?.inbox).toMatchObject({
        status: 'ready',
        unread: { 'dm-ada': 2 },
      }),
    );
    expect(
      host.calls.filter(({ method }) => method === 'humanAttention').map(({ args }) => args),
    ).toEqual([
      { category: 'action', limit: 100, sort: 'newest', queryVersion: 1 },
      { category: 'replies', limit: 30, sort: 'mentions-first', queryVersion: 1 },
      { category: 'unread', limit: 30, queryVersion: 1 },
      { notifications: true, limit: 100 },
    ]);
    first();
    host.methods.set('channelUnreadCounts', () => ({
      channels: [{ channelId: 'dm-ada', unreadCount: 4 }],
    }));
    host.push('botharness/followActivity', { type: 'changed', snapshot: { bots: [] } });
    await vi.waitFor(() =>
      expect(sources.getSnapshot().hosts[0]?.inbox).toMatchObject({ unread: { 'dm-ada': 4 } }),
    );
    second();
    expect(sources.getSnapshot().hosts[0]?.snapshot.connection.status).toBe('stopped');
    const reads = host.calls.length;
    host.push('botharness/followActivity', { type: 'changed', snapshot: { bots: [] } });
    await Promise.resolve();
    expect(host.calls).toHaveLength(reads);
    expect(sources.getSnapshot().hosts[0]?.inbox).toMatchObject({ unread: { 'dm-ada': 4 } });
    host.methods.set('channelUnreadCounts', () => ({ channels: [] }));
    releases.push(sources.subscribe(() => {}));
    await vi.waitFor(() =>
      expect(sources.getSnapshot().hosts[0]?.inbox).toMatchObject({ status: 'ready', unread: {} }),
    );
    await sources.remove(host.hostId);
    const removedReads = host.calls.length;
    host.push('botharness/followActivity', { type: 'changed', snapshot: { bots: [] } });
    await Promise.resolve();
    expect(sources.getSnapshot().hosts).toEqual([]);
    expect(host.calls).toHaveLength(removedReads);
  });

  it('loads avatars once with device headers, publishes immutable snapshots and releases on removal', async () => {
    const { host, storage } = liveHost();
    const loadImage = vi.fn(async () => 'blob:ada');
    const releaseImage = vi.fn();
    const sources = createRemoteHosts({ carrier: host.carrier, storage, loadImage, releaseImage });
    const before = sources.getSnapshot().avatars;
    releases.push(sources.subscribe(() => {}));
    const url = 'http://127.0.0.1:47001/botharness-device/api/botharness/avatar/ada';
    await vi.waitFor(() => expect(sources.getSnapshot().avatars.get(url)).toBe('blob:ada'));
    expect(before.size).toBe(0);
    expect(loadImage).toHaveBeenCalledExactlyOnceWith(url, {
      authorization: `Device ${host.credential}`,
    });
    sources.select(ALL_HOSTS);
    expect(loadImage).toHaveBeenCalledTimes(1);
    await sources.remove(host.hostId);
    expect(sources.getSnapshot().avatars.size).toBe(0);
    expect(releaseImage).toHaveBeenCalledExactlyOnceWith('blob:ada');
  });

  it('retries a failed avatar on the next update and releases it when the final reader leaves', async () => {
    const { host, storage } = liveHost();
    const loadImage = vi
      .fn<() => Promise<string | undefined>>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue('blob:retry');
    const releaseImage = vi.fn();
    const sources = createRemoteHosts({ carrier: host.carrier, storage, loadImage, releaseImage });
    const release = sources.subscribe(() => {});
    releases.push(release);
    await vi.waitFor(() => expect(sources.getSnapshot().hosts[0]?.inbox.status).toBe('ready'));
    sources.select(ALL_HOSTS);
    await vi.waitFor(() =>
      expect([...sources.getSnapshot().avatars.values()]).toEqual(['blob:retry']),
    );
    release();
    expect(sources.getSnapshot().avatars.size).toBe(0);
    expect(releaseImage).toHaveBeenCalledExactlyOnceWith('blob:retry');
  });

  it('discards and releases an avatar that finishes after its Host was removed', async () => {
    const { host, storage } = liveHost();
    let finish: (image: string) => void = () => {};
    const pending = new Promise<string>((resolve) => {
      finish = resolve;
    });
    const loadImage = vi.fn(() => pending);
    const releaseImage = vi.fn();
    const sources = createRemoteHosts({ carrier: host.carrier, storage, loadImage, releaseImage });
    releases.push(sources.subscribe(() => {}));
    await vi.waitFor(() => expect(loadImage).toHaveBeenCalledTimes(1));
    await sources.remove(host.hostId);
    finish('blob:late');
    await vi.waitFor(() => expect(releaseImage).toHaveBeenCalledWith('blob:late'));
    expect(sources.getSnapshot().avatars.size).toBe(0);
  });
});

it('reuses the shared activity Inbox for reads, pagination and refresh', async () => {
  const { host, storage } = liveHost();
  host.methods.set('humanAttention', (args) => ({
    queryVersion: 1,
    items:
      args.category === 'unread'
        ? [
            {
              id: String(args.category) + (args.cursor ? '-next' : ''),
              category: 'unread',
              kind: 'channel-unread',
              unreadCount: 1,
              messageId: args.cursor ? 'new' : 'old',
              botSlug: 'ada',
              summary: 'remote',
              createdAt: '2026-11-20T00:00:00Z',
              channelId: 'dm-ada',
              channelName: 'Ada',
            },
          ]
        : [],
    ...(args.cursor ? {} : { nextCursor: 'remote-cursor' }),
  }));
  const sources = createRemoteHosts({ carrier: host.carrier, storage });
  releases.push(sources.subscribe(() => {}));
  await vi.waitFor(() => expect(sources.getSnapshot().hosts[0]?.inbox.status).toBe('ready'));
  const observation = sources.activity(host.hostId)!;
  expect(sources.activity(host.hostId)).toBe(observation);
  expect(observation.getSnapshot()).toBe(sources.getSnapshot().hosts[0]?.inbox);
  const reads = host.calls.length;
  const off = observation.subscribe(() => {});
  expect(host.calls).toHaveLength(reads);
  await observation.getInbox()!.loadMore!('unread');
  expect(observation.getSnapshot()).toMatchObject({
    sections: { unread: [{ id: 'unread' }, { id: 'unread-next' }] },
  });
  off();
  await sources.remove(host.hostId);
  expect(sources.activity(host.hostId)).toBeUndefined();
});

it('queries remote search and history on its own Host client and disposes the filtered Inbox', async () => {
  const { host, storage } = liveHost();
  const sources = createRemoteHosts({ carrier: host.carrier, storage });
  releases.push(sources.subscribe(() => {}));
  await vi.waitFor(() => expect(sources.getSnapshot().hosts[0]?.inbox.status).toBe('ready'));
  const query = {
    activity: true,
    section: 'handled' as const,
    search: 'Remote-only',
    sort: 'oldest' as const,
  };
  const observation = sources.activity(host.hostId, query)!;
  expect(sources.activity(host.hostId, query)).toBe(observation);
  const off = observation.subscribe(() => {});
  await vi.waitFor(() => expect(observation.getSnapshot().status).toBe('ready'));
  expect(host.calls).toContainEqual({
    method: 'humanAttention',
    args: {
      category: 'handled',
      limit: 30,
      queryVersion: 1,
      search: 'Remote-only',
      sort: 'oldest',
    },
  });
  off();
  expect(observation.getInbox()).toBeUndefined();
});

it('routes decisions, questions, joins, snooze and clear to the owning Host and refuses removed Hosts', async () => {
  const { host, storage } = liveHost();
  const sources = createRemoteHosts({ carrier: host.carrier, storage });
  releases.push(sources.subscribe(() => {}));
  await vi.waitFor(() => expect(sources.getSnapshot().hosts[0]?.inbox.status).toBe('ready'));
  const item: HumanAttentionItem = {
    id: 'approval:shared',
    category: 'action',
    kind: 'tool-approval',
    botSlug: 'tob',
    channelId: 'dm-tob',
    messageId: 'same-message',
    summary: 'Remote request',
    createdAt: '',
    sourceEventId: 'same-event',
  };
  const refresh = vi.fn(async () => {});
  const actions = createHostActivityActions({
    requestUnavailable: 'Request was not accepted',
    client: () => {
      const client = sources.client(host.hostId);
      if (client === undefined) throw new Error('Host removed');
      return client;
    },
    items: () => [item],
    refresh,
    open: async () => {},
  });
  host.methods.set('toolApprovalDecide', () => ({ accepted: true }));
  host.methods.set('userQuestionAnswer', () => ({ accepted: true }));
  host.methods.set('channelGroupJoinDecide', (args) => ({
    channel: {
      id: args.channelId,
      type: 'group',
      name: 'Same Group',
      members: [],
      joinRequests: [
        {
          id: args.requestId,
          requesterBotSlug: 'ada',
          status: args.accept ? 'accepted' : 'declined',
        },
      ],
    },
  }));
  host.methods.set('humanAttentionSnooze', () => ({ accepted: true }));
  host.methods.set('humanAttentionDismiss', () => ({ accepted: true }));
  host.calls.length = 0;
  await actions.decideToolApproval('dm-tob', 'same-message', 'allowed-once');
  await actions.answerUserQuestion('dm-tob', 'same-message', [
    { id: 'q', selected: ['Yes'], custom: '' },
  ]);
  await actions.decideGroupJoin('same-group', 'same-request', true);
  await actions.snoozeActivityList(item, '2099-01-01T00:00:00.000Z');
  await actions.dismissActivityList(item);
  expect(host.calls).toEqual([
    {
      method: 'toolApprovalDecide',
      args: { channelId: 'dm-tob', messageId: 'same-message', outcome: 'allowed-once' },
    },
    {
      method: 'userQuestionAnswer',
      args: {
        channelId: 'dm-tob',
        messageId: 'same-message',
        answer: { answers: [{ id: 'q', selected: ['Yes'], custom: '' }] },
      },
    },
    {
      method: 'channelGroupJoinDecide',
      args: { channelId: 'same-group', requestId: 'same-request', accept: true },
    },
    {
      method: 'humanAttentionSnooze',
      args: { itemId: item.id, sourceKey: 'same-event', until: '2099-01-01T00:00:00.000Z' },
    },
    { method: 'humanAttentionDismiss', args: { itemId: item.id, sourceKey: 'same-event' } },
  ]);
  expect(refresh).toHaveBeenCalledTimes(5);
  host.methods.set('humanAttentionDismiss', () => ({ accepted: false }));
  await expect(actions.dismissActivityList(item)).rejects.toThrow();
  expect(refresh).toHaveBeenCalledTimes(5);
  await expect(actions.decideToolApproval('dm-tob', 'unowned-message', 'rejected')).rejects.toThrow(
    'Request was not accepted',
  );
  await sources.remove(host.hostId);
  await expect(actions.dismissActivityList(item)).rejects.toThrow('Host removed');
});
