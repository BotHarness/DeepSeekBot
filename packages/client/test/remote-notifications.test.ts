import { describe, expect, it, vi } from 'vitest';
import { createRemoteNotifications } from '../src/client/remote-notifications.js';
import type { RemoteHost } from '../src/client/remote-hosts.js';
import type { DesktopNotificationHandle } from '../src/client/desktop-notifications.js';
import type { HumanAttentionItem } from '../../../apps/mobile/src/host/wire.js';

const item = (id: string, kind = 'user-question', at = id): HumanAttentionItem => ({
  id,
  kind,
  category: 'action',
  botSlug: 'ada',
  createdAt: at,
  summary: 'Request preview',
});
function remote(id: string, items: HumanAttentionItem[]): RemoteHost {
  return {
    host: { hostId: id, hostName: id, deviceId: id, credential: id, routes: [] },
    snapshot: { connection: { status: 'connected', route: '' } },
    inbox: {
      status: 'ready',
      notificationItems: items,
      sections: { action: items, replies: [], unread: [], handled: [] },
    },
  };
}
function fixture() {
  let permission: 'default' | 'granted' | 'denied' = 'default';
  const handles: DesktopNotificationHandle[] = [];
  const show = vi.fn(() => {
    const handle = { onclick: null, close: vi.fn() };
    handles.push(handle);
    return handle;
  });
  const request = vi.fn(async (): Promise<'granted'> => (permission = 'granted'));
  const open = vi.fn();
  const storage = new Map<string, string>();
  const options = {
    storage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    },
    api: { permission: () => permission, requestPermission: request, show },
    open,
    privateBody: () => 'Private input needed',
    prepareEnable: async () => {},
  };
  return {
    notices: createRemoteNotifications(options),
    options,
    show,
    request,
    handles,
    open,
    permission: (next: typeof permission) => {
      permission = next;
    },
  };
}

describe('Remote Host browser alerts', () => {
  it.each(['idle', 'loading', 'error', 'stale', 'partial'] as const)(
    'does not establish or erase a notification baseline from a connected %s read',
    async (status) => {
      const f = fixture();
      await f.notices.set('a', { enabled: true });
      const old = item('old', 'channel-mention', '2026-10-22');
      const fresh = item('new', 'user-question', '2026-01-01');
      const failed = () => {
        const host = remote('a', [fresh]);
        if (status === 'idle' || status === 'loading') host.inbox = { status };
        else if (status === 'error') host.inbox = { status, error: 'read-unavailable' };
        else if (host.inbox.status === 'ready') {
          if (status === 'stale') host.inbox.stale = 'read-unavailable';
          else host.inbox.notificationItems = undefined;
        }
        return host;
      };
      f.notices.update([failed()]);
      f.notices.update([remote('a', [old])]);
      expect(f.show).not.toHaveBeenCalled();
      f.notices.update([failed()]);
      f.notices.update([remote('a', [old, fresh])]);
      f.notices.update([remote('a', [old, fresh])]);
      expect(f.show).toHaveBeenCalledExactlyOnceWith('a · ada', {
        body: 'Request preview',
        tag: 'botharness-remote:a:new',
      });
    },
  );
  it('rechecks the relay deadline at commit even when its timer has not run', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.permission('granted');
    const expiresAt = Date.now() + 8000;
    const notices = createRemoteNotifications({
      ...f.options,
      prepareEnable: async () => {
        vi.setSystemTime(expiresAt);
      },
    });
    const before = notices.choice('a');
    const saved = f.options.storage.getItem('botharness.remoteNotifications.v1');
    try {
      await expect(
        notices.control(
          {
            hostId: 'a',
            patch: { enabled: true, preferences: before.preferences },
          },
          JSON.stringify(before),
          { expiresAt, signal: new AbortController().signal },
        ),
      ).rejects.toThrow('appearance-request-stale');
      expect(notices.choice('a')).toEqual(before);
      expect(f.options.storage.getItem('botharness.remoteNotifications.v1')).toBe(saved);
    } finally {
      vi.useRealTimers();
    }
  });
  it('waits for a complete reconnect baseline across read failures without losing seen identities', async () => {
    const f = fixture();
    await f.notices.set('a', { enabled: true });
    const old = item('old', 'user-question', '2026-10-22');
    f.notices.update([remote('a', [old])]);
    const disconnected = remote('a', [old]);
    disconnected.snapshot = { connection: { status: 'stopped', route: '' } };
    f.notices.update([disconnected]);
    const failed = remote('a', [item('offline')]);
    if (failed.inbox.status === 'ready') failed.inbox.stale = 'read-unavailable';
    f.notices.update([failed]);
    const partial = remote('a', []);
    if (partial.inbox.status === 'ready') partial.inbox.notificationItems = undefined;
    f.notices.update([partial]);
    f.notices.update([remote('a', [item('offline')])]);
    expect(f.show).not.toHaveBeenCalled();
    f.notices.update([remote('a', [old, item('offline'), item('new', 'user-question', '2025')])]);
    expect(f.show).toHaveBeenCalledExactlyOnceWith('a · ada', {
      body: 'Request preview',
      tag: 'botharness-remote:a:new',
    });
  });

  it('refuses a timed-out enable without changing the persisted choice and allows a fresh retry', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.permission('granted');
    let finish!: () => void;
    const prepareEnable = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const notices = createRemoteNotifications({ ...f.options, prepareEnable });
    try {
      const enabling = notices.set('a', { enabled: true });
      const refused = expect(enabling).rejects.toThrow('notification-baseline-timeout');
      await vi.advanceTimersByTimeAsync(10_000);
      await refused;
      finish();
      expect(notices.choice('a').enabled).toBe(false);
      prepareEnable.mockResolvedValue(undefined);
      await notices.set('a', { enabled: true });
      notices.update([remote('a', [])]);
      notices.update([remote('a', [item('new')])]);
      expect(f.show).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels activation when permission is revoked, and never applies a late completion after disable', async () => {
    const f = fixture();
    f.permission('granted');
    let finish!: () => void;
    const prepareEnable = () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      });
    const notices = createRemoteNotifications({ ...f.options, prepareEnable });
    notices.update([remote('a', [])]);
    const enabling = notices.set('a', { enabled: true });
    const refused = expect(enabling).rejects.toThrow('notification-activation-cancelled');
    f.permission('denied');
    notices.update([remote('a', [])]);
    await refused;
    finish();
    expect(notices.choice('a').enabled).toBe(false);
    f.permission('granted');
    const again = notices.set('a', { enabled: true });
    const disabled = expect(again).rejects.toThrow('notification-activation-cancelled');
    await notices.set('a', { enabled: false });
    finish();
    await disabled;
    expect(notices.choice('a').enabled).toBe(false);
  });

  it('does not replay a pending 35-mention scan when enabling replies, then alerts new group and DM replies', async () => {
    const f = fixture();
    let finish!: () => void;
    const prepareEnable = vi.fn(async () => {});
    const notices = createRemoteNotifications({ ...f.options, prepareEnable });
    f.permission('granted');
    await notices.set('a', { enabled: true, preferences: { reply: false } });
    notices.update([remote('a', [])]);
    prepareEnable.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const enabling = notices.set('a', { preferences: { reply: true } });
    const old = Array.from({ length: 35 }, (_, index) =>
      item(`old-${index}`, 'channel-mention', 'same-time'),
    );
    notices.update([remote('a', old)]);
    expect(f.show).not.toHaveBeenCalled();
    finish();
    await enabling;
    const fresh = [
      item('group', 'channel-reply', 'same-time'),
      item('dm', 'channel-reply', 'same-time'),
    ];
    notices.update([remote('a', [...old, ...fresh])]);
    expect(f.show).toHaveBeenCalledTimes(2);
    notices.update([remote('a', [...old, ...fresh])]);
    expect(f.show).toHaveBeenCalledTimes(2);
  });
  it('retains dedupe and the complete baseline when a later notification page fails', async () => {
    const f = fixture();
    await f.notices.set('a', { enabled: true });
    f.notices.update([remote('a', [item('old', 'channel-reply', 'same-time')])]);
    const incomplete = remote('a', []);
    if (incomplete.inbox.status === 'ready') incomplete.inbox.notificationItems = undefined;
    f.notices.update([incomplete]);
    f.notices.update([
      remote('a', [
        item('old', 'channel-reply', 'same-time'),
        item('new', 'channel-reply', 'same-time'),
      ]),
    ]);
    expect(f.show).toHaveBeenCalledTimes(1);
    f.notices.update([
      remote('a', [
        item('old', 'channel-reply', 'same-time'),
        item('new', 'channel-reply', 'same-time'),
      ]),
    ]);
    expect(f.show).toHaveBeenCalledTimes(1);
  });
  it('reports bounded redacted show failures without replaying the failed item', async () => {
    const f = fixture();
    const diagnostic = vi.fn();
    const notices = createRemoteNotifications({ ...f.options, diagnostic });
    await notices.set('a', { enabled: true });
    notices.update([remote('a', [])]);
    f.show.mockImplementation(() => {
      throw new Error('private payload and credentials');
    });
    notices.update([remote('a', [item('1')])]);
    notices.update([remote('a', [item('1'), item('2')])]);
    notices.update([remote('a', [item('1'), item('2')])]);
    expect(diagnostic).toHaveBeenCalledExactlyOnceWith('remote-notification-show-failed');
    expect(f.show).toHaveBeenCalledTimes(2);
  });
  it('covers all Host-decided kinds including DM beyond the Activity window without replay', async () => {
    const f = fixture();
    await f.notices.set('a', { enabled: true });
    const old = Array.from({ length: 35 }, (_, index) =>
      item(`old-${index}`, 'channel-mention', '2026-01-01'),
    );
    f.notices.update([remote('a', old)]);
    const fresh = [
      'tool-approval',
      'user-question',
      'private-input',
      'channel-mention',
      'channel-reply',
      'channel-reply',
    ].map((kind, index) => item(`new-${index}`, kind, '2026-01-02'));
    const next = remote('a', [...old, ...fresh]);
    if (next.inbox.status === 'ready')
      next.inbox.sections = { action: [], replies: old.slice(0, 30), unread: [], handled: [] };
    f.notices.update([next]);
    f.notices.update([remote('a', [...old, ...fresh])]);
    expect(f.show).toHaveBeenCalledTimes(6);
  });
  it('CLI uses the same choice with revision checks and never prompts for permission', async () => {
    const f = fixture();
    const request = { expiresAt: Date.now() + 8000, signal: new AbortController().signal };
    const before = await f.notices.control({ hostId: 'a' }, undefined, request);
    const patch = { enabled: true, preferences: before.preferences };
    await expect(
      f.notices.control({ hostId: 'a', patch }, before.revision, request),
    ).rejects.toThrow('notification-permission-required');
    expect(f.request).not.toHaveBeenCalled();
    f.permission('granted');
    const after = await f.notices.control({ hostId: 'a', patch }, before.revision, request);
    expect(after.enabled).toBe(true);
    await expect(
      f.notices.control({ hostId: 'a', patch }, before.revision, request),
    ).rejects.toThrow('notification-revision-stale');
  });
  it('requests permission only on enable, skips initial snapshots, dedupes and scopes identical IDs', async () => {
    const f = fixture();
    f.notices.update([remote('a', [item('1')]), remote('b', [item('1')])]);
    expect(f.request).not.toHaveBeenCalled();
    await f.notices.set('a', { enabled: true });
    await f.notices.set('b', { enabled: true });
    f.notices.update([remote('a', [item('1'), item('2')]), remote('b', [item('1'), item('2')])]);
    expect(f.show).toHaveBeenCalledTimes(2);
    f.notices.update([remote('a', [item('1'), item('2')]), remote('b', [item('1'), item('2')])]);
    expect(f.show).toHaveBeenCalledTimes(2);
    f.handles[1]!.onclick!(new Event('click'));
    expect(f.open).toHaveBeenCalledWith(expect.objectContaining({ hostId: 'b' }));
    expect(createRemoteNotifications(f.options).choice('a').enabled).toBe(true);
  });
  it('honors kinds, never leaks private input and never replays suppressed items', async () => {
    const f = fixture();
    await f.notices.set('a', { enabled: true, preferences: { question: false } });
    f.notices.update([remote('a', [])]);
    f.notices.update([remote('a', [item('1'), item('2', 'private-input')])]);
    expect(f.show).toHaveBeenCalledExactlyOnceWith('a · ada', {
      body: 'Private input needed',
      tag: 'botharness-remote:a:2',
    });
    await f.notices.set('a', { preferences: { question: true } });
    f.notices.update([remote('a', [item('1'), item('2', 'private-input')])]);
    expect(f.show).toHaveBeenCalledTimes(1);
  });
  it('retains identities beyond 2000 after they leave attention, without suppressing new older IDs', async () => {
    const f = fixture();
    await f.notices.set('a', { enabled: true });
    const old = Array.from({ length: 2001 }, (_, index) =>
      item(`old-${index}`, 'channel-mention', '2026-10-22'),
    );
    f.notices.update([remote('a', old)]);
    f.notices.update([remote('a', [...old])]);
    expect(f.show).not.toHaveBeenCalled();
    f.notices.update([remote('a', [])]);
    f.notices.update([remote('a', old)]);
    expect(f.show).not.toHaveBeenCalled();
    const fresh = item('new-earlier', 'user-question', '2026-01-01');
    f.notices.update([remote('a', [...old, fresh])]);
    expect(f.show).toHaveBeenCalledExactlyOnceWith('a · ada', {
      body: 'Request preview',
      tag: 'botharness-remote:a:new-earlier',
    });
    f.notices.update([remote('a', [])]);
    f.notices.update([remote('a', [...old, fresh])]);
    expect(f.show).toHaveBeenCalledTimes(1);
  });
  it('suppresses reconnect backlogs and seen identities that reenter, closes on disposal', async () => {
    const f = fixture();
    await f.notices.set('a', { enabled: true });
    f.notices.update([remote('a', [item('1'), item('2')])]);
    const first = remote('a', [item('2')]);
    f.notices.update([first]);
    f.notices.update([{ ...first, snapshot: { connection: { status: 'stopped', route: '' } } }]);
    f.notices.update([first]);
    f.notices.update([remote('a', [item('2'), item('3')])]);
    expect(f.show).not.toHaveBeenCalled();
    f.notices.update([remote('a', [item('1'), item('2'), item('3'), item('4')])]);
    expect(f.show).toHaveBeenCalledTimes(1);
    f.notices.stop();
    expect(f.handles[0]!.close).toHaveBeenCalled();
    expect(f.handles[0]!.onclick).toBeNull();
  });
  it.each(['remove', 'credential', 'stop'] as const)(
    'releases old identities on %s and establishes a silent complete baseline for the new owner',
    async (operation) => {
      const f = fixture();
      await f.notices.set('a', { enabled: true });
      f.notices.update([remote('a', [])]);
      f.notices.update([remote('a', [item('previous')])]);
      expect(f.show).toHaveBeenCalledTimes(1);
      if (operation === 'remove') f.notices.update([]);
      if (operation === 'stop') f.notices.stop();
      const next = (items: HumanAttentionItem[]) => {
        const host = remote('a', items);
        if (operation === 'credential') host.host.credential = 'replacement';
        return host;
      };
      f.notices.update([next([item('baseline')])]);
      expect(f.show).toHaveBeenCalledTimes(1);
      expect(f.handles[0]!.close).toHaveBeenCalled();
      f.notices.update([next([item('baseline'), item('previous')])]);
      f.notices.update([next([item('baseline'), item('previous')])]);
      expect(f.show).toHaveBeenCalledTimes(2);
    },
  );
  it('keeps denied permission off and handles a late permission result after disabling', async () => {
    const f = fixture();
    f.permission('denied');
    await f.notices.set('a', { enabled: true });
    expect(f.notices.choice('a').enabled).toBe(false);
    f.permission('default');
    let resolve!: () => void;
    f.request.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = () => done('granted');
        }),
    );
    const enable = f.notices.set('a', { enabled: true });
    const refused = expect(enable).rejects.toThrow('notification-activation-cancelled');
    await f.notices.set('a', { enabled: false });
    resolve();
    await refused;
    expect(f.notices.choice('a').enabled).toBe(false);
  });
});
