import { liveHost, releases } from './remote-hosts-fixtures.js';
import { afterEach, assert, describe, expect, it, vi } from 'vitest';
import type { HumanAttentionItem as HostAttentionItem } from '@botharness/host-protocol/wire';
import { connectionOperationIndexSchema } from '../../core/src/devices/connection-operation.js';
import { manageConnections } from '../src/client/connection-management.js';
import { en, zh } from '../src/client/locale.js';
import { REMOTE_NOTIFICATION_KEY } from '../src/client/remote-notifications.js';
import { REMOTE_HOSTS_STORAGE_KEY, createRemoteHosts } from '../src/client/remote-hosts.js';

afterEach(() => {
  for (const release of releases.splice(0)) release();
  vi.unstubAllGlobals();
});

describe('Host Feed lifecycle', () => {
  it.each([false, true])(
    'keeps a loaded Feed and conversation when an indexed current/old execution record is missing (%s)',
    async (previousGrant) => {
      const { host, storage, saved } = liveHost();
      host
        .channel('dm-ada')
        .append({ id: 'loaded-before-history-failure', body: 'Loaded conversation survives' });
      host.deviceSnapshot = {
        host: { id: host.hostId, name: 'Studio' },
        devices: [],
        lan: { state: 'listening' },
      };
      const lock = async <T>(_name: string, run: () => Promise<T>) => run();
      const seed = createRemoteHosts({
        carrier: host.carrier,
        storage,
        connectionOperationLock: lock,
      });
      const key = `botharness.remoteHosts.operation.v1:${JSON.stringify([host.hostId, 'previous-test-pin', 'device-1'])}`;
      storage.setItem(
        'botharness.remoteHosts.operations.v1',
        JSON.stringify([{ hostId: host.hostId, key }]),
      );
      storage.setItem(
        key,
        JSON.stringify({
          generation: crypto.randomUUID(),
          hostKey: 'previous-test-pin',
          deviceId: 'device-1',
          operation: { action: 'stop-route', kind: 'lan' },
        }),
      );
      seed.close();
      if (previousGrant)
        storage.setItem(
          REMOTE_HOSTS_STORAGE_KEY,
          JSON.stringify([{ ...saved[0], deviceId: 'new-device' }]),
        );
      const sources = createRemoteHosts({
        carrier: host.carrier,
        storage,
        connectionOperationLock: lock,
      });
      const release = sources.subscribe(() => {});
      releases.push(release);
      await vi.waitFor(() => expect(sources.getSnapshot().hosts[0]?.inbox.status).toBe('ready'));
      const target = { hostId: host.hostId, title: 'Ada', botSlug: 'ada' };
      sources.open(target);
      const conversation = sources.conversation(target)!;
      conversation.start();
      try {
        await vi.waitFor(() =>
          expect(
            conversation
              .getSnapshot()
              .messages.some((message) => message.id === 'loaded-before-history-failure'),
          ).toBe(true),
        );
        const feed = sources.getSnapshot().hosts[0]!.inbox;
        const messages = conversation.getSnapshot().messages;
        const index = connectionOperationIndexSchema.parse(
          JSON.parse(storage.getItem('botharness.remoteHosts.operations.v1')!),
        );
        assert(index[0]);
        expect(index[0].key).toBe(key);
        const record = storage.getItem(key)!;
        storage.removeItem(key);
        const client = sources.client(host.hostId)!;
        const api = vi.spyOn(client, 'api');
        const command = () =>
          manageConnections(
            sources,
            { action: 'stop-route', hostId: host.hostId, kind: 'lan', confirm: true },
            { expiresAt: Date.now() + 30_000, signal: new AbortController().signal },
          );
        await expect(command()).rejects.toThrow('connection-operation-storage-unavailable');
        expect(api).not.toHaveBeenCalled();
        expect(sources.getSnapshot().hosts[0]?.inbox).toBe(feed);
        expect(conversation.getSnapshot().messages).toBe(messages);
        expect(sources.conversation(target)).toBe(conversation);
        expect(sources.getSnapshot().open).toEqual(target);
        expect(storage.getItem('botharness.remoteHosts.operations.v1')).not.toBeNull();
        const reloaded = createRemoteHosts({
          carrier: host.carrier,
          storage,
          connectionOperationLock: lock,
        });
        expect(reloaded.getSnapshot().hosts[0]?.host.connectionOperationUnavailable).toBe(true);
        storage.setItem(key, record);
        await expect(command()).rejects.toThrow('connection-management-unconfirmed');
        expect(conversation.getSnapshot().messages).toBe(messages);
      } finally {
        conversation.stop();
      }
    },
  );
  it.each(['removeItem', 'setItem'] as const)(
    'finishes permanent removal and reports notification persistence refusal from %s',
    async (operation) => {
      const close = vi.fn();
      const show = vi.fn();
      const diagnostic = vi.fn();
      vi.stubGlobal('window', {
        dispatchEvent: diagnostic,
        Notification: class {
          static permission = 'granted';
          onclick = null;
          close = close;
          constructor() {
            show();
          }
        },
      });
      const { host, storage } = liveHost();
      const sources = createRemoteHosts({ carrier: host.carrier, storage });
      releases.push(sources.subscribe(() => {}));
      await vi.waitFor(() => expect(sources.getSnapshot().hosts[0]?.inbox.status).toBe('ready'));
      await sources.notifications.set(host.hostId, {
        enabled: true,
        preferences: { approval: false },
      });
      if (operation === 'setItem')
        await sources.notifications.set('other', { preferences: { reply: false } });
      const other = sources.notifications.choice('other');
      const client = sources.client(host.hostId)!;
      const received: HostAttentionItem = {
        id: 'received',
        kind: 'user-question',
        category: 'action',
        botSlug: 'ada',
        createdAt: '2026-01-01',
        summary: 'Question',
        channelId: 'dm-ada',
        channelName: 'Ada',
        messageId: 'request',
        sourceEventId: 'source',
      };
      host.methods.set('humanAttention', (args) =>
        args.notifications
          ? { notificationVersion: 1, items: [received] }
          : { queryVersion: 1, items: [] },
      );
      host.push('botharness/followActivity', { type: 'changed', snapshot: { bots: [] } });
      await vi.waitFor(() => expect(show).toHaveBeenCalledOnce());
      let finish!: () => void;
      const gate = new Promise<void>((resolve) => {
        finish = resolve;
      });
      let entered = false;
      host.methods.set('humanAttention', async (args) => {
        if (!args.notifications) return { queryVersion: 1, items: [] };
        entered = true;
        await gate;
        return { notificationVersion: 1, items: [received] };
      });
      const enabling = sources.notifications.set(host.hostId, { preferences: { approval: true } });
      const cancelled = expect(enabling).rejects.toThrow('notification-activation-cancelled');
      await vi.waitFor(() => expect(entered).toBe(true));
      const stored = storage.getItem(REMOTE_NOTIFICATION_KEY);
      const original = storage[operation];
      if (operation === 'removeItem') {
        const remove = storage.removeItem;
        storage.removeItem = (key) => {
          if (key === REMOTE_NOTIFICATION_KEY) throw new Error('private storage detail');
          remove(key);
        };
      } else {
        const set = storage.setItem;
        storage.setItem = (key, value) => {
          if (key === REMOTE_NOTIFICATION_KEY) throw new Error('private storage detail');
          set(key, value);
        };
      }
      try {
        await expect(sources.remove(host.hostId)).resolves.toBeUndefined();
        await cancelled;
        expect(host.requests).toContain('POST http://127.0.0.1:47001/botharness-device/unpair');
        expect(client.getSnapshot().connection.status).toBe('stopped');
        expect(sources.client(host.hostId)).toBeUndefined();
        expect(sources.getSnapshot().hosts).toEqual([]);
        expect(JSON.parse(storage.getItem(REMOTE_HOSTS_STORAGE_KEY) ?? '[]')).toEqual([
          expect.objectContaining({
            kind: 'automatic-enrollment-suppressed',
            hostId: host.hostId,
            publicKey: null,
          }),
        ]);
        expect(sources.notifications.getSnapshot().hosts).not.toHaveProperty(host.hostId);
        expect(sources.notifications.choice('other')).toEqual(other);
        expect(close).toHaveBeenCalledOnce();
        expect(diagnostic).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({
            type: 'botharness:notification-diagnostic',
            detail: 'remote-notification-forget-persistence-failed',
          }),
        );
        finish();
        await Promise.resolve();
        await Promise.resolve();
        expect(sources.notifications.getSnapshot().hosts).not.toHaveProperty(host.hostId);
        expect(show).toHaveBeenCalledOnce();
        expect(storage.getItem(REMOTE_NOTIFICATION_KEY)).toBe(stored);
      } finally {
        finish();
        Object.assign(storage, { [operation]: original });
        await cancelled;
      }
    },
  );

  it.each(['Activity', 'notification page'] as const)(
    'preserves a completed notification baseline when %s alone fails on a connected Host',
    async (failure) => {
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
      const old: HostAttentionItem = {
        id: 'old',
        kind: 'user-question',
        category: 'action',
        botSlug: 'ada',
        createdAt: '2026-10-22T12:00:00.000Z',
        summary: 'Old question',
        channelId: 'dm-ada',
        channelName: 'Ada',
        messageId: 'request',
        sourceEventId: 'source',
      };
      const items = [old];
      let fail = false;
      host.methods.set('humanAttention', (args) => {
        if (args.notifications) {
          if (args.cursor) {
            if (fail && failure === 'notification page')
              throw new Error('notification-page-unavailable');
            return { notificationVersion: 1, items: items.slice(1) };
          }
          return { notificationVersion: 1, items: items.slice(0, 1), nextCursor: 'tail' };
        }
        if (fail && failure === 'Activity' && args.category === 'action')
          throw new Error('activity-unavailable');
        return { queryVersion: 1, items: [] };
      });
      const sources = createRemoteHosts({ carrier: host.carrier, storage });
      releases.push(sources.subscribe(() => {}));
      await vi.waitFor(() => expect(sources.getSnapshot().hosts[0]?.inbox.status).toBe('ready'));
      await sources.notifications.set(host.hostId, { enabled: true });
      const refresh = async () => {
        const before = sources.getSnapshot().hosts[0]?.inbox;
        host.push('botharness/followActivity', { type: 'changed', snapshot: { bots: [] } });
        await vi.waitFor(() => {
          const remote = sources.getSnapshot().hosts[0];
          expect(remote?.inbox).not.toBe(before);
          expect(remote?.snapshot.connection.status).toBe('connected');
          expect(remote?.host.credential).toBe(host.credential);
        });
      };
      fail = true;
      await refresh();
      expect(sources.getSnapshot().hosts[0]?.inbox).toMatchObject({
        status: 'ready',
        ...(failure === 'Activity'
          ? { stale: expect.any(String) }
          : { notificationItems: undefined }),
      });
      items.push({ ...old, id: 'new', createdAt: '2026-01-01T00:00:00.000Z' });
      await refresh();
      expect(show).not.toHaveBeenCalled();
      fail = false;
      await refresh();
      expect(show).toHaveBeenCalledExactlyOnceWith('Studio · Ada', {
        body: 'Old question',
        tag: `botharness-remote:${host.hostId}:new`,
      });
      await refresh();
      expect(show).toHaveBeenCalledTimes(1);
      await sources.notifications.set(host.hostId, { enabled: false });
      const saved = storage.getItem('botharness.remoteNotifications.v1');
      fail = true;
      await expect(sources.notifications.set(host.hostId, { enabled: true })).rejects.toThrow(
        'notification-baseline-unavailable',
      );
      expect(sources.notifications.choice(host.hostId).enabled).toBe(false);
      expect(storage.getItem('botharness.remoteNotifications.v1')).toBe(saved);
      items.push({ ...old, id: 'while-disabled' });
      fail = false;
      await sources.notifications.set(host.hostId, { enabled: true });
      await refresh();
      expect(show).toHaveBeenCalledTimes(1);
      items.push({ ...old, id: 'after-enable', createdAt: '2025-01-01T00:00:00.000Z' });
      await refresh();
      expect(show).toHaveBeenCalledTimes(2);
      expect(show.mock.calls[1]?.[1]).toMatchObject({
        tag: `botharness-remote:${host.hostId}:after-enable`,
      });
    },
  );
  it('keeps notification identities across reconnect and active resubscription, but releases them on final disposal', async () => {
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
    let items: HostAttentionItem[] = [];
    host.methods.set('humanAttention', (args) =>
      args.notifications ? { notificationVersion: 1, items } : { queryVersion: 1, items: [] },
    );
    const sources = createRemoteHosts({ carrier: host.carrier, storage });
    const primary = sources.subscribe(() => {});
    releases.push(primary);
    await vi.waitFor(() => expect(sources.getSnapshot().hosts[0]?.inbox.status).toBe('ready'));
    await sources.notifications.set(host.hostId, { enabled: true });
    const received: HostAttentionItem = {
      id: 'received',
      kind: 'user-question',
      category: 'action',
      botSlug: 'ada',
      createdAt: '2026-01-01',
      summary: 'Question',
      channelId: 'dm-ada',
      channelName: 'Ada',
      messageId: 'request',
      sourceEventId: 'source',
    };
    const refresh = async (next: typeof items) => {
      const before = sources.getSnapshot().hosts[0]?.inbox;
      items = next;
      host.push('botharness/followActivity', { type: 'changed', snapshot: { bots: [] } });
      await vi.waitFor(() => {
        const after = sources.getSnapshot().hosts[0]?.inbox;
        expect(after).not.toBe(before);
        expect(after).toMatchObject({ status: 'ready', notificationItems: next });
      });
    };
    await refresh([received]);
    expect(show).toHaveBeenCalledTimes(1);
    await refresh([]);
    const secondary = sources.subscribe(() => {});
    primary();
    const resubscribed = sources.subscribe(() => {});
    releases.push(resubscribed);
    secondary();
    await refresh([]);
    await refresh([received]);
    expect(show).toHaveBeenCalledTimes(1);
    await refresh([]);
    host.kill();
    host.restart();
    await vi.waitFor(
      () => {
        expect(sources.getSnapshot().hosts[0]?.snapshot.connection.status).toBe('connected');
        expect(sources.getSnapshot().hosts[0]?.inbox).toMatchObject({
          status: 'ready',
          notificationItems: [],
        });
      },
      { timeout: 3000 },
    );
    await refresh([received]);
    expect(show).toHaveBeenCalledTimes(1);
    await refresh([]);
    resubscribed();
    releases.push(sources.subscribe(() => {}));
    await vi.waitFor(() => {
      expect(sources.getSnapshot().hosts[0]?.snapshot.connection.status).toBe('connected');
      expect(sources.getSnapshot().hosts[0]?.inbox).toMatchObject({
        status: 'ready',
        notificationItems: [],
      });
    });
    await refresh([received]);
    expect(show).toHaveBeenCalledTimes(2);
  });
  it('records a conversation opened from a remote notification', async () => {
    const shown: { onclick: ((event: { preventDefault(): void }) => void) | null }[] = [];
    vi.stubGlobal('window', {
      focus() {},
      Notification: class {
        static permission = 'granted';
        onclick = null;
        close() {}
        constructor() {
          shown.push(this);
        }
      },
    });
    const { host, storage } = liveHost();
    let items: HostAttentionItem[] = [];
    host.methods.set('humanAttention', (args) =>
      args.notifications ? { notificationVersion: 1, items } : { queryVersion: 1, items: [] },
    );
    const record = vi.fn();
    const sources = createRemoteHosts({ carrier: host.carrier, storage, record });
    releases.push(sources.subscribe(() => {}));
    await vi.waitFor(() => expect(sources.getSnapshot().hosts[0]?.inbox.status).toBe('ready'));
    await sources.notifications.set(host.hostId, { enabled: true });
    items = [
      {
        id: 'received',
        kind: 'user-question',
        category: 'action',
        botSlug: 'ada',
        createdAt: '2026-01-01',
        summary: 'Question',
        channelId: 'dm-ada',
        channelName: 'Ada',
        messageId: 'request',
        sourceEventId: 'source',
      },
    ];
    host.push('botharness/followActivity', { type: 'changed', snapshot: { bots: [] } });
    await vi.waitFor(() => expect(shown).toHaveLength(1));
    shown[0]!.onclick?.({ preventDefault() {} });
    expect(sources.getSnapshot().open?.hostId).toBe(host.hostId);
    expect(record).toHaveBeenCalledWith('remote_host:conversation_open');
  });

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

  it('uses the bound translator for private notification bodies after the locale changes', async () => {
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
    vi.stubGlobal('document', { documentElement: { lang: 'en' } });
    let dictionary = en;
    const translate = (key: 'remoteHosts.notifications.privateBody') => dictionary[key];
    const { host, storage } = liveHost();
    const sources = createRemoteHosts({ carrier: host.carrier, storage, translate });
    releases.push(sources.subscribe(() => {}));
    await vi.waitFor(() => expect(sources.getSnapshot().hosts[0]?.inbox.status).toBe('ready'));
    await sources.notifications.set(host.hostId, { enabled: true });
    dictionary = zh;
    host.methods.set('humanAttention', (args) =>
      args.notifications
        ? {
            notificationVersion: 1,
            items: [
              {
                id: 'private',
                kind: 'private-input',
                botSlug: 'ada',
                createdAt: 'now',
                summary: 'must not appear',
                category: 'action',
                channelId: 'dm-ada',
                channelName: 'Ada',
                messageId: 'private-request',
                sourceEventId: 'private-source',
              },
            ],
          }
        : { queryVersion: 1, items: [] },
    );
    host.push('botharness/followActivity', { type: 'changed', snapshot: { bots: [] } });
    await vi.waitFor(() => expect(show).toHaveBeenCalledTimes(1));
    expect(show.mock.calls[0]?.[1]).toMatchObject({
      body: zh['remoteHosts.notifications.privateBody'],
    });
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
      createdAt: '2026-10-22T12:00:00.000Z',
      summary: `old-${index}`,
      channelId: 'group',
      channelName: 'Group',
      messageId: `m-${index}`,
      sourceEventId: `e-${index}`,
      isUnread: true,
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
        createdAt: '2026-10-22T12:00:00.000Z',
        summary: id,
        channelId: id === 'dm' ? 'dm-ada' : 'group',
        channelName: 'Ada',
        messageId: id,
        sourceEventId: 'source-' + id,
        isUnread: true,
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
      createdAt: '2026-10-22T12:00:00.000Z',
      summary: 'later',
      channelId: 'dm-ada',
      channelName: 'Ada',
      messageId: 'later',
      sourceEventId: 'source-later',
      isUnread: true,
    });
    live();
    await vi.waitFor(() => expect(show).toHaveBeenCalledTimes(3));
    items.push(
      ...[
        'tool-approval',
        'user-question',
        'private-input',
        'channel-mention',
        'channel-reply',
        'channel-reply',
      ].map((kind, index) => ({
        id: `late-attention-${index}`,
        kind,
        category: index < 3 ? 'action' : 'replies',
        botSlug: 'ada',
        createdAt: `2026-01-0${6 - index}T00:00:00.000Z`,
        summary: `late-attention-${index}`,
        channelId: 'dm-ada',
        channelName: 'Ada',
        messageId: `late-message-${index}`,
        sourceEventId: `late-source-${index}`,
        isUnread: true,
      })),
    );
    live();
    await vi.waitFor(() => expect(show).toHaveBeenCalledTimes(9));
    for (let index = 0; index < 6; index++)
      expect(
        show.mock.calls.filter(
          ([, options]) =>
            options.tag === `botharness-remote:${host.hostId}:late-attention-${index}`,
        ),
      ).toHaveLength(1);
    await sources.notifications.set(host.hostId, { enabled: false });
    await sources.notifications.set(host.hostId, { enabled: true });
    expect(show).toHaveBeenCalledTimes(9);
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
});
