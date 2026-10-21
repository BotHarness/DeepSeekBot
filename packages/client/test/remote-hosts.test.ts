import { afterEach, assert, describe, expect, it, vi } from 'vitest';

import type { HostCarrier } from '../../../apps/mobile/src/host/carrier.js';
import { FakeHost } from '../../../apps/mobile/test/fake-host.js';
import { createHostActivityActions } from '../src/client/host-activity-actions.js';
import type { HumanAttentionItem } from '../src/client/store.js';
import { pairingLink } from '../../core/src/devices/http.js';
import {
  ALL_HOSTS,
  HOST_TAB_STORAGE_KEY,
  REMOTE_HOSTS_STORAGE_KEY,
  conversationKey,
  createRemoteHosts,
  type HostStorage,
} from '../src/client/remote-hosts.js';

function memoryStorage(initial: Record<string, string> = {}): HostStorage & {
  values: Map<string, string>;
} {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

function fakeCarrier() {
  const calls: { url: string; body?: unknown; headers?: Record<string, string> }[] = [];
  const carrier: HostCarrier = {
    async request(url, init) {
      calls.push({
        url,
        ...(typeof init.body === 'string' ? { body: JSON.parse(init.body) as unknown } : {}),
        ...(init.headers === undefined ? {} : { headers: init.headers }),
      });
      if (url.endsWith('/botharness-device/pair'))
        return {
          status: 200,
          text: async () =>
            JSON.stringify({
              deviceId: 'device-1',
              credential: 'device-1.secret',
              host: { id: 'host-b', name: 'Studio' },
            }),
        };
      if (url.endsWith('/botharness-device/unpair'))
        return { status: 200, text: async () => '{"revoked":true}' };
      return { status: 503, text: async () => '{}' };
    },
    openSocket(_url, events) {
      queueMicrotask(() => events.closed('offline'));
      return { send: () => {}, close: () => {} };
    },
  };
  return { carrier, calls };
}

const link = (hostId = 'host-b') =>
  pairingLink({
    v: 1,
    host: { id: hostId, name: 'Studio' },
    offer: 'offer-1',
    routes: ['http://127.0.0.1:47001'],
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

describe('remote hosts', () => {
  it('pairs another remote with this browser and remembers it in browser storage', async () => {
    const storage = memoryStorage();
    const { carrier, calls } = fakeCarrier();
    const sources = createRemoteHosts({ storage, carrier });
    expect(sources.getSnapshot()).toEqual({ hosts: [], avatars: new Map(), tab: ALL_HOSTS });

    const result = await sources.pair(link(), 'Browser on Laptop', 'host-a');

    expect(result).toMatchObject({ ok: true, host: { hostId: 'host-b', hostName: 'Studio' } });
    expect(calls[0]).toEqual({
      url: 'http://127.0.0.1:47001/botharness-device/pair',
      body: { offer: 'offer-1', name: 'Browser on Laptop' },
    });
    expect(sources.getSnapshot().tab).toBe('host-b');
    expect(sources.getSnapshot().hosts.map((remote) => remote.host.hostId)).toEqual(['host-b']);
    expect(JSON.parse(storage.values.get(REMOTE_HOSTS_STORAGE_KEY)!)).toEqual([
      {
        hostId: 'host-b',
        hostName: 'Studio',
        routes: ['http://127.0.0.1:47001'],
        deviceId: 'device-1',
        credential: 'device-1.secret',
      },
    ]);
    expect(storage.values.get(HOST_TAB_STORAGE_KEY)).toBe('host-b');

    const reloaded = createRemoteHosts({ storage, carrier });
    expect(reloaded.getSnapshot().tab).toBe('host-b');
    expect(reloaded.getSnapshot().hosts[0]?.host.credential).toBe('device-1.secret');
  });

  it('refuses this remote’s own link, a second pairing and a broken link', async () => {
    const { carrier, calls } = fakeCarrier();
    const sources = createRemoteHosts({ storage: memoryStorage(), carrier });
    expect(await sources.pair(link('host-a'), 'Browser', 'host-a')).toEqual({
      ok: false,
      code: 'this-host',
    });
    expect(await sources.pair('https://example.com', 'Browser', 'host-a')).toEqual({
      ok: false,
      code: 'link-invalid',
    });
    await sources.pair(link(), 'Browser', 'host-a');
    expect(await sources.pair(link(), 'Browser', 'host-a')).toEqual({
      ok: false,
      code: 'already-paired',
    });
    expect(calls.filter((call) => call.url.endsWith('/pair'))).toHaveLength(1);
  });

  it('keys conversations by remote so the same slug on two hosts never shares state', async () => {
    const { carrier } = fakeCarrier();
    const sources = createRemoteHosts({ storage: memoryStorage(), carrier });
    await sources.pair(link(), 'Browser', 'host-a');
    const here = { hostId: 'host-b', title: 'Ada', botSlug: 'ada' };
    expect(conversationKey(here)).not.toBe(conversationKey({ ...here, hostId: 'host-c' }));
    expect(conversationKey(here)).not.toBe(
      conversationKey({ hostId: 'host-b', title: 'Ada', channelId: 'ada' }),
    );
    expect(sources.conversation(here)).toBe(sources.conversation({ ...here }));
    expect(sources.conversation({ ...here, hostId: 'host-c' })).toBeUndefined();
    expect(sources.client('host-b')).toBe(sources.client('host-b'));
    expect(sources.client('host-b')).toBeDefined();
    expect(sources.client('local')).toBeUndefined();
    expect(sources.client('host-c')).toBeUndefined();
  });

  it('removes a remote, revokes this browser there and forgets its open chat', async () => {
    const storage = memoryStorage();
    const { carrier, calls } = fakeCarrier();
    const sources = createRemoteHosts({ storage, carrier });
    await sources.pair(link(), 'Browser', 'host-a');
    sources.open({ hostId: 'host-b', title: 'Ada', botSlug: 'ada' });
    expect(sources.getSnapshot().open?.hostId).toBe('host-b');

    await sources.remove('host-b');

    expect(sources.client('host-b')).toBeUndefined();
    expect(sources.getSnapshot()).toEqual({ hosts: [], avatars: new Map(), tab: ALL_HOSTS });
    expect(storage.values.has(REMOTE_HOSTS_STORAGE_KEY)).toBe(false);
    expect(calls.at(-1)).toEqual({
      url: 'http://127.0.0.1:47001/botharness-device/unpair',
      body: {},
      headers: { authorization: 'Device device-1.secret' },
    });
  });

  it('falls back to All when the remembered tab names a remote that is gone', () => {
    const { carrier } = fakeCarrier();
    const sources = createRemoteHosts({
      storage: memoryStorage({ [HOST_TAB_STORAGE_KEY]: 'host-z' }),
      carrier,
    });
    expect(sources.getSnapshot().tab).toBe(ALL_HOSTS);
    sources.select('local');
    expect(sources.getSnapshot().tab).toBe('local');
  });
});

const releases: Array<() => void> = [];
afterEach(() => {
  for (const release of releases.splice(0)) release();
  vi.unstubAllGlobals();
});

function liveHost() {
  const host = new FakeHost();
  host.methods.set('humanAttention', (args) =>
    args.notifications ? { items: [], notificationVersion: 1 } : { items: [], queryVersion: 1 },
  );
  host.methods.set('channelUnreadCounts', () => ({
    channels: [{ channelId: 'dm-ada', unreadCount: 2 }],
  }));
  host.methods.set('list', () => ({
    bots: [
      {
        slug: 'ada',
        displayName: 'Ada',
        aggregateState: 'idle',
        avatar: '/api/botharness/avatar/ada',
      },
    ],
  }));
  const saved = [
    {
      hostId: host.hostId,
      hostName: 'Studio',
      routes: ['http://127.0.0.1:47001'],
      deviceId: 'device-1',
      credential: host.credential,
    },
  ];
  const storage = memoryStorage({ [REMOTE_HOSTS_STORAGE_KEY]: JSON.stringify(saved) });
  return { host, storage, saved };
}

describe('Host Feed lifecycle', () => {
  it('marks the remote DM channel read through its own credential and refreshes its Inbox', async () => {
    const { host, storage } = liveHost();
    host.methods.set('channels', () => ({
      channels: [{ id: 'dm-ada', type: 'dm', botSlug: 'ada', name: 'Ada', members: ['ada'] }],
    }));
    host.methods.set('channelMarkRead', () => {
      host.methods.set('channelUnreadCounts', () => ({ channels: [] }));
      return { accepted: true };
    });
    const sources = createRemoteHosts({ carrier: host.carrier, storage });
    releases.push(sources.subscribe(() => {}));
    await vi.waitFor(() =>
      expect(sources.getSnapshot().hosts[0]?.inbox).toMatchObject({
        status: 'ready',
        unread: { 'dm-ada': 2 },
      }),
    );
    await sources.markRead({ hostId: host.hostId, title: 'Ada', botSlug: 'ada' }, 'message-2');
    expect(host.calls.filter(({ method }) => method === 'channelMarkRead')).toEqual([
      { method: 'channelMarkRead', args: { channelId: 'dm-ada', messageId: 'message-2' } },
    ]);
    const inbox = sources.getSnapshot().hosts[0]?.inbox;
    assert(inbox?.status === 'ready');
    expect(inbox.unread).toEqual({});
    await sources.markRead({ hostId: 'another-host', title: 'Ada', botSlug: 'ada' }, 'message-2');
    expect(host.calls.filter(({ method }) => method === 'channelMarkRead')).toHaveLength(1);
  });

  it('keeps canonical unread counts when the owning Host refuses a read update', async () => {
    const { host, storage } = liveHost();
    const sources = createRemoteHosts({ carrier: host.carrier, storage });
    releases.push(sources.subscribe(() => {}));
    await vi.waitFor(() => expect(sources.getSnapshot().hosts[0]?.inbox.status).toBe('ready'));
    host.failing.add('channelMarkRead');
    await expect(
      sources.markRead({ hostId: host.hostId, title: 'Group', channelId: 'group' }, 'message-2'),
    ).rejects.toThrow();
    expect(sources.getSnapshot().hosts[0]?.inbox).toMatchObject({ unread: { 'dm-ada': 2 } });
  });

  it('establishes an enable boundary through the shared paginated Inbox despite concurrent live frames and page failure', async () => {
    const show = vi.fn();
    vi.stubGlobal('window', {
      Notification: class {
        static permission = 'granted';
        onclick = null;
        close() {}
        constructor(title: string, options: unknown) {
          show(title, options);
        }
      },
    });
    const { host, storage } = liveHost();
    const sources = createRemoteHosts({ carrier: host.carrier, storage });
    releases.push(sources.subscribe(() => {}));
    await vi.waitFor(() => expect(sources.getSnapshot().hosts[0]?.inbox.status).toBe('ready'));
    await sources.notifications.set(host.hostId, { enabled: true, preferences: { reply: false } });
    const items = Array.from({ length: 35 }, (_, index) => ({
      id: `old-${index}`,
      kind: 'channel-mention',
      category: 'replies',
      botSlug: 'ada',
      createdAt: 'same-time',
      summary: `old-${index}`,
    }));
    let finish!: () => void;
    let gate: Promise<void> | undefined = new Promise((resolve) => {
      finish = resolve;
    });
    let tails = 0;
    let fail = false;
    host.methods.set('humanAttention', async (args) => {
      if (!args.notifications) return { queryVersion: 1, items: [] };
      if (!args.cursor)
        return { notificationVersion: 1, items: items.slice(0, 30), nextCursor: 'tail' };
      tails++;
      await gate;
      if (fail) throw new Error('page unavailable');
      return { notificationVersion: 1, items: items.slice(30) };
    });
    const live = () =>
      host.push('botharness/followActivity', { type: 'changed', snapshot: { bots: [] } });
    live();
    await vi.waitFor(() => expect(tails).toBe(1));
    const enabled = sources.notifications.set(host.hostId, { preferences: { reply: true } });
    live();
    expect(sources.notifications.choice(host.hostId).preferences.reply).toBe(false);
    finish();
    gate = undefined;
    await enabled;
    expect(tails).toBeGreaterThan(1);
    expect(show).not.toHaveBeenCalled();
    items.push(
      ...['group', 'dm'].map((id) => ({
        id,
        kind: 'channel-reply',
        category: 'replies',
        botSlug: 'ada',
        createdAt: 'same-time',
        summary: id,
      })),
    );
    live();
    await vi.waitFor(() => expect(show).toHaveBeenCalledTimes(2));
    await sources.notifications.set(host.hostId, { preferences: { reply: false } });
    fail = true;
    await expect(
      sources.notifications.set(host.hostId, { preferences: { reply: true } }),
    ).rejects.toThrow('notification-baseline-unavailable');
    expect(sources.notifications.choice(host.hostId).preferences.reply).toBe(false);
    fail = false;
    await sources.notifications.set(host.hostId, { preferences: { reply: true } });
    expect(show).toHaveBeenCalledTimes(2);
    items.push({
      id: 'later',
      kind: 'channel-reply',
      category: 'replies',
      botSlug: 'ada',
      createdAt: 'same-time',
      summary: 'later',
    });
    live();
    await vi.waitFor(() => expect(show).toHaveBeenCalledTimes(3));
  });

  it.each(['switch', 'remove', 'dispose'] as const)(
    'cancels pending activation on Host %s without applying a late scan',
    async (operation) => {
      vi.stubGlobal('window', {
        Notification: class {
          static permission = 'granted';
        },
      });
      const { host, storage } = liveHost();
      const sources = createRemoteHosts({ carrier: host.carrier, storage });
      const release = sources.subscribe(() => {});
      releases.push(release);
      await vi.waitFor(() => expect(sources.getSnapshot().hosts[0]?.inbox.status).toBe('ready'));
      let finish!: () => void;
      const gate = new Promise<void>((resolve) => {
        finish = resolve;
      });
      let entered = false;
      host.methods.set('humanAttention', async (args) => {
        if (!args.notifications) return { queryVersion: 1, items: [] };
        entered = true;
        await gate;
        return { notificationVersion: 1, items: [] };
      });
      const enabled = sources.notifications.set(host.hostId, { enabled: true });
      const refused = expect(enabled).rejects.toThrow('notification-activation-cancelled');
      await vi.waitFor(() => expect(entered).toBe(true));
      if (operation === 'switch') sources.select('local');
      else if (operation === 'remove') await sources.remove(host.hostId);
      else release();
      await refused;
      finish();
      await Promise.resolve();
      expect(sources.notifications.choice(host.hostId).enabled).toBe(false);
      expect(storage.values.has('botharness.remoteNotifications.v1')).toBe(false);
    },
  );

  it('retains legacy pairings when browser storage refuses the migration write', () => {
    const { host, saved } = liveHost();
    const storage = memoryStorage({
      'botharness.computers.v1': JSON.stringify(saved),
      'botharness.computers.tab.v1': host.hostId,
    });
    storage.setItem = () => {
      throw new Error('quota');
    };
    const sources = createRemoteHosts({ carrier: host.carrier, storage });
    expect(sources.getSnapshot().hosts[0]?.host).toEqual(saved[0]);
    expect(sources.getSnapshot().tab).toBe(host.hostId);
    expect(storage.values.has('botharness.computers.v1')).toBe(true);
  });

  it('migrates the existing pairing and selected tab once without resurrecting a removed Host', async () => {
    const { host, saved } = liveHost();
    const storage = memoryStorage({
      'botharness.computers.v1': JSON.stringify(saved),
      'botharness.computers.tab.v1': host.hostId,
    });
    const sources = createRemoteHosts({ carrier: host.carrier, storage });
    expect(sources.getSnapshot().tab).toBe(host.hostId);
    expect(sources.getSnapshot().hosts[0]?.host).toEqual(saved[0]);
    expect(storage.values.has('botharness.computers.v1')).toBe(false);
    expect(storage.values.has('botharness.computers.tab.v1')).toBe(false);
    await sources.remove(host.hostId);
    expect(createRemoteHosts({ carrier: host.carrier, storage }).getSnapshot().hosts).toEqual([]);
  });

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
    items: [
      {
        id: String(args.category) + (args.cursor ? '-next' : ''),
        category: args.category,
        kind: 'channel-unread',
        botSlug: 'ada',
        summary: 'remote',
        createdAt: '',
      },
    ],
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
  host.methods.set('toolApprovalDecide', () => ({}));
  host.methods.set('userQuestionAnswer', () => ({}));
  host.methods.set('channelGroupJoinDecide', (args) => ({
    channel: {
      joinRequests: [{ id: args.requestId, status: args.accept ? 'accepted' : 'declined' }],
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
  await actions.snoozeHumanInbox(item, '2099-01-01T00:00:00.000Z');
  await actions.dismissHumanInbox(item);
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
  await expect(actions.dismissHumanInbox(item)).rejects.toThrow();
  expect(refresh).toHaveBeenCalledTimes(5);
  await expect(actions.decideToolApproval('dm-tob', 'unowned-message', 'rejected')).rejects.toThrow(
    'Request was not accepted',
  );
  await sources.remove(host.hostId);
  await expect(actions.dismissHumanInbox(item)).rejects.toThrow('Host removed');
});

it.each(
  (['tool-approval', 'user-question'] as const).flatMap((kind) =>
    (['decided', 'expired'] as const).map((result) => ({ kind, result })),
  ),
)(
  'does not accept a remote $kind returning $result after the precheck',
  async ({ kind, result }) => {
    const { host, storage } = liveHost();
    const sources = createRemoteHosts({ carrier: host.carrier, storage });
    releases.push(sources.subscribe(() => {}));
    await vi.waitFor(() => expect(sources.getSnapshot().hosts[0]?.inbox.status).toBe('ready'));
    let pending = true;
    const item: HumanAttentionItem = {
      id: 'request',
      category: 'action',
      kind,
      botSlug: 'ada',
      channelId: 'dm-ada',
      messageId: 'request-message',
      summary: '',
      createdAt: '',
    };
    const refresh = vi.fn(async () => {});
    const actions = createHostActivityActions({
      client: () => sources.client(host.hostId)!,
      items: () => [item],
      refresh,
      open: async () => {},
      requestUnavailable: 'This request was not accepted',
    });
    const request = {
      id: item.messageId,
      toolApprovalRequest: { toolName: 'bash', role: 'orchestrator', cwd: '', input: '{}' },
      userQuestionRequest: {
        questions: [{ id: 'q', question: 'Choose', options: [{ label: 'Blue' }] }],
      },
    };
    host.methods.set('channelTimeline', () => ({
      page: {
        entries: [
          request,
          ...(!pending && result === 'decided'
            ? [
                {
                  id: 'other-device-decision',
                  toolApprovalDecision: { requestMessageId: item.messageId, outcome: 'rejected' },
                  userQuestionResolution: {
                    requestMessageId: item.messageId,
                    state: 'answered',
                    answers: [{ id: 'q', selected: ['Blue'] }],
                  },
                },
              ]
            : []),
        ],
      },
    }));
    host.methods.set('toolApprovalStatus', () => ({ status: pending ? 'pending' : 'expired' }));
    host.methods.set('userQuestionStatus', () => ({
      status: pending ? 'pending' : result === 'decided' ? 'answered' : 'expired',
    }));
    host.methods.set(kind === 'tool-approval' ? 'toolApprovalDecide' : 'userQuestionAnswer', () => {
      pending = false;
      throw new Error('Host refused after another device settled the request');
    });
    const status = () =>
      kind === 'tool-approval'
        ? actions.toolApprovalStatus(item.channelId!, item.messageId!)
        : actions.userQuestionStatus(item.channelId!, item.messageId!);
    expect(await status()).toBe('pending');
    const submit = () =>
      kind === 'tool-approval'
        ? actions.decideToolApproval(item.channelId!, item.messageId!, 'allowed-once')
        : actions.answerUserQuestion(item.channelId!, item.messageId!, [
            { id: 'q', selected: ['Blue'] },
          ]);
    await expect(submit()).rejects.toThrow('This request was not accepted');
    expect(refresh).toHaveBeenCalledOnce();
    expect(await status()).toBe(
      kind === 'user-question' && result === 'decided' ? 'answered' : 'expired',
    );
  },
);

it.each(
  (['tool-approval', 'user-question'] as const).flatMap((kind) =>
    (['submit', 'refresh'] as const).map((phase) => ({ kind, phase })),
  ),
)('preserves the $phase failure cause for remote $kind', async ({ kind, phase }) => {
  const { host, storage } = liveHost();
  const method = kind === 'tool-approval' ? 'toolApprovalDecide' : 'userQuestionAnswer';
  const cause = new TypeError('Network request failed');
  host.methods.set(method, () => ({ accepted: true }));
  const sources = createRemoteHosts({
    storage,
    carrier: {
      ...host.carrier,
      async request(url, init) {
        if (phase === 'submit' && url.endsWith('/' + method)) throw cause;
        return host.carrier.request(url, init);
      },
    },
  });
  releases.push(sources.subscribe(() => {}));
  await vi.waitFor(() => expect(sources.getSnapshot().hosts[0]?.inbox.status).toBe('ready'));
  const refresh = vi.fn(async () => {
    throw cause;
  });
  const actions = createHostActivityActions({
    client: () => sources.client(host.hostId)!,
    items: () => [
      {
        id: 'request',
        category: 'action',
        kind,
        botSlug: 'ada',
        channelId: 'dm-ada',
        messageId: 'request-message',
        summary: '',
        createdAt: '',
      },
    ],
    refresh,
    open: async () => {},
    requestUnavailable: '操作失败，请刷新后重试',
  });
  const submit = () =>
    kind === 'tool-approval'
      ? actions.decideToolApproval('dm-ada', 'request-message', 'allowed-once')
      : actions.answerUserQuestion('dm-ada', 'request-message', [{ id: 'q', selected: ['Blue'] }]);
  if (phase === 'submit') {
    await expect(submit()).rejects.toMatchObject({
      message: '操作失败，请刷新后重试',
      cause: { message: 'The Host could not be reached.' },
    });
    expect(refresh).not.toHaveBeenCalled();
  } else {
    await expect(submit()).rejects.toBe(cause);
    expect(refresh).toHaveBeenCalledOnce();
    expect(host.calls.filter((call) => call.method === method)).toHaveLength(1);
  }
});

it.each(['tool-approval', 'user-question'] as const)(
  'rejects a removed %s without reusing its cached mutation reference',
  async (kind) => {
    const { host, storage } = liveHost();
    host.methods.set('toolApprovalStatus', () => ({ status: 'pending' }));
    host.methods.set('userQuestionStatus', () => ({ status: 'pending' }));
    host.methods.set('channelTimeline', () => ({
      page: {
        entries: [
          {
            id: 'request-message',
            toolApprovalRequest: { toolName: 'bash', role: 'orchestrator', cwd: '', input: '{}' },
            userQuestionRequest: { questions: [{ id: 'q', question: 'Choose' }] },
          },
        ],
      },
    }));
    host.methods.set('toolApprovalDecide', () => ({ accepted: true }));
    host.methods.set('userQuestionAnswer', () => ({ accepted: true }));
    const sources = createRemoteHosts({ storage, carrier: host.carrier });
    releases.push(sources.subscribe(() => {}));
    await vi.waitFor(() => expect(sources.getSnapshot().hosts[0]?.inbox.status).toBe('ready'));
    let items: HumanAttentionItem[] = [
      {
        id: 'request',
        category: 'action',
        kind,
        botSlug: 'ada',
        channelId: 'dm-ada',
        messageId: 'request-message',
        summary: '',
        createdAt: '',
      },
    ];
    const refresh = vi.fn(async () => {});
    const actions = createHostActivityActions({
      client: () => sources.client(host.hostId)!,
      items: () => items,
      refresh,
      open: async () => {},
      requestUnavailable: '操作失败，请刷新后重试',
    });
    const status = () =>
      kind === 'tool-approval'
        ? actions.toolApprovalStatus('dm-ada', 'request-message')
        : actions.userQuestionStatus('dm-ada', 'request-message');
    expect(await status()).toBe('pending');
    items = [];
    const submit = () =>
      kind === 'tool-approval'
        ? actions.decideToolApproval('dm-ada', 'request-message', 'allowed-once')
        : actions.answerUserQuestion('dm-ada', 'request-message', [
            { id: 'q', selected: ['Blue'] },
          ]);
    await expect(submit()).rejects.toMatchObject({
      message: '操作失败，请刷新后重试',
      cause: { message: 'Activity request is unavailable' },
    });
    expect(refresh).not.toHaveBeenCalled();
    expect(
      host.calls.filter(
        ({ method }) => method === 'toolApprovalDecide' || method === 'userQuestionAnswer',
      ),
    ).toEqual([]);
    expect(await status()).toBe('pending');
  },
);

it.each(
  (
    [
      'toolApprovalStatus',
      'toolApprovalState',
      'toolApprovalExecutionState',
      'userQuestionStatus',
    ] as const
  ).flatMap((method) =>
    (['status', 'timeline'] as const).flatMap((read) =>
      (['http', 'non-json', 'network'] as const).map((failure) => ({ method, read, failure })),
    ),
  ),
)(
  'localizes $method $read $failure while retaining its cause',
  async ({ method, read, failure }) => {
    const { host, storage } = liveHost();
    const status = method === 'userQuestionStatus' ? 'userQuestionStatus' : 'toolApprovalStatus';
    const endpoint = read === 'timeline' ? 'channelTimeline' : status;
    host.methods.set(status, () => ({ status: 'pending' }));
    host.methods.set('channelTimeline', () => ({
      page: {
        entries: [
          {
            id: 'request-message',
            toolApprovalRequest: { toolName: 'bash', role: 'orchestrator', cwd: '', input: '{}' },
            userQuestionRequest: { questions: [{ id: 'q', question: 'Choose' }] },
          },
        ],
      },
    }));
    const sources = createRemoteHosts({
      storage,
      carrier: {
        ...host.carrier,
        async request(url, init) {
          if (url.endsWith('/' + endpoint)) {
            if (failure === 'network') throw new TypeError('Network request failed');
            return {
              status: failure === 'http' ? 502 : 200,
              text: async () => '<html>Bad gateway</html>',
            };
          }
          return host.carrier.request(url, init);
        },
      },
    });
    releases.push(sources.subscribe(() => {}));
    await vi.waitFor(() => expect(sources.getSnapshot().hosts[0]?.inbox.status).toBe('ready'));
    const refresh = vi.fn(async () => {});
    const actions = createHostActivityActions({
      client: () => sources.client(host.hostId)!,
      items: () => [
        {
          id: 'request',
          category: 'action',
          kind: method === 'userQuestionStatus' ? 'user-question' : 'tool-approval',
          botSlug: 'ada',
          channelId: 'dm-ada',
          messageId: 'request-message',
          summary: '',
          createdAt: '',
        },
      ],
      refresh,
      open: async () => {},
      requestUnavailable: '操作失败，请刷新后重试',
    });
    const readRequest = actions[method];
    assert(readRequest !== undefined);
    await expect(readRequest('dm-ada', 'request-message')).rejects.toMatchObject({
      message: '操作失败，请刷新后重试',
      cause: {
        message:
          failure === 'http'
            ? 'The Host answered 502.'
            : failure === 'non-json'
              ? 'The Host did not return a JSON response.'
              : 'The Host could not be reached.',
      },
    });
    expect(refresh).not.toHaveBeenCalled();
    expect(
      host.calls.filter(
        ({ method }) => method === 'toolApprovalDecide' || method === 'userQuestionAnswer',
      ),
    ).toEqual([]);
  },
);
