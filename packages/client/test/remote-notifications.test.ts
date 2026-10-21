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
    inbox: { status: 'ready', sections: { action: items, replies: [], unread: [], handled: [] } },
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
  it('CLI uses the same choice with revision checks and never prompts for permission', async () => {
    const f = fixture();
    const before = await f.notices.control({ hostId: 'a' }, undefined);
    const patch = { enabled: true, preferences: before.preferences };
    await expect(f.notices.control({ hostId: 'a', patch }, before.revision)).rejects.toThrow(
      'notification-permission-required',
    );
    expect(f.request).not.toHaveBeenCalled();
    f.permission('granted');
    const after = await f.notices.control({ hostId: 'a', patch }, before.revision);
    expect(after.enabled).toBe(true);
    await expect(f.notices.control({ hostId: 'a', patch }, before.revision)).rejects.toThrow(
      'notification-revision-stale',
    );
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
  it('suppresses reconnect backlogs and old pagination, closes on refusal and disposal', async () => {
    const f = fixture();
    await f.notices.set('a', { enabled: true });
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
    await f.notices.set('a', { enabled: false });
    resolve();
    await enable;
    expect(f.notices.choice('a').enabled).toBe(false);
  });
});
