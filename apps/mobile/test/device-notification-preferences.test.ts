import { describe, expect, it, vi } from 'vitest';
import {
  createDeviceNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from '../src/host/device-notification-preferences';
import type { SavedHost } from '../src/host/hosts';
import type { PushPreferences } from '../src/host/push';

const host = (id: string, credential = id): SavedHost => ({
  hostId: id,
  hostName: id,
  deviceId: credential,
  credential,
  routes: [`https://${id}.ts.net`],
});

function fixture(saved?: PushPreferences) {
  let disk = saved;
  const copies = new Map<string, PushPreferences>();
  const offline = new Set<string>();
  const settings = vi.fn(async (entry: SavedHost) => {
    if (offline.has(entry.hostId)) throw new Error('offline');
    return {
      registered: true,
      enabled: true,
      quietChannelIds: [],
      preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, approval: false },
    };
  });
  const options = {
    storage: {
      read: async () => disk,
      write: (value: PushPreferences) => {
        disk = value;
      },
    },
    push: {
      settings,
      setPreferences: vi.fn(async (entry: SavedHost, preferences: Partial<PushPreferences>) => {
        if (offline.has(entry.hostId)) throw new Error('offline');
        const copy = { ...DEFAULT_NOTIFICATION_PREFERENCES, ...preferences };
        copies.set(entry.credential, copy);
        return { registered: false, enabled: true, quietChannelIds: [], preferences: copy };
      }),
    },
  };
  return {
    prefs: createDeviceNotificationPreferences(options),
    options,
    copies,
    offline,
    disk: () => disk,
  };
}

describe('phone-owned notification preferences', () => {
  it('seeds once from existing switches and copies every change to every pairing', async () => {
    const f = fixture();
    await f.prefs.sync([host('a'), host('b')]);
    expect(f.disk()?.approval).toBe(false);
    await f.prefs.set({ question: false });
    expect(f.copies.get('a')).toEqual(f.copies.get('b'));
    expect(f.copies.get('b')?.question).toBe(false);
    const reloaded = createDeviceNotificationPreferences(f.options);
    await reloaded.sync([host('a', 'repaired'), host('c')]);
    expect(f.copies.get('repaired')?.question).toBe(false);
    expect(f.copies.get('c')?.approval).toBe(false);
    expect(f.options.push.settings).toHaveBeenCalledTimes(2);
  });
  it('keeps offline choices, reports the failed Host and retries without reseeding', async () => {
    const f = fixture(DEFAULT_NOTIFICATION_PREFERENCES);
    f.offline.add('b');
    await f.prefs.sync([host('a'), host('b')]);
    await f.prefs.set({ reply: false });
    expect(f.disk()?.reply).toBe(false);
    expect(f.prefs.getSnapshot().failed).toEqual(['b']);
    f.offline.clear();
    await f.prefs.retry();
    expect(f.copies.get('b')?.reply).toBe(false);
    expect(f.options.push.settings).not.toHaveBeenCalled();
  });
  it('serializes rapid patches and refuses to overwrite unreadable device storage', async () => {
    const f = fixture();
    await f.prefs.sync([host('a')]);
    await Promise.all([f.prefs.set({ question: false }), f.prefs.set({ reply: false })]);
    expect(f.copies.get('a')).toMatchObject({ question: false, reply: false });
    const broken = createDeviceNotificationPreferences({
      ...f.options,
      storage: { read: async () => ({ broken: true }), write: vi.fn() },
    });
    await expect(broken.set({ approval: true })).rejects.toThrow(
      'notification-preferences-invalid',
    );
  });
  it('does not establish defaults while all legacy Hosts are unreachable', async () => {
    const f = fixture();
    f.offline.add('a');
    await f.prefs.sync([host('a')]);
    expect(f.disk()).toBeUndefined();
    f.offline.clear();
    await f.prefs.retry();
    expect(f.disk()?.approval).toBe(false);
  });
});
