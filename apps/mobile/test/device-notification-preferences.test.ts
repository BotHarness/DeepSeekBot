import { describe, expect, it, vi } from 'vitest';
import {
  createDeviceNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from '../src/host/device-notification-preferences';
import type { SavedHost } from '../src/host/hosts';
import type { HostPush, PushPreferences } from '../src/host/push';
import { createPushSession } from '../src/host/push-session';

const flush = async () => {
  for (let turn = 0; turn < 50; turn++) await Promise.resolve();
};

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

function registrationFixture(f: ReturnType<typeof fixture>) {
  const register = vi.fn<HostPush['register']>(async () => ({
    registered: true,
    enabled: true,
    quietChannelIds: [],
    preferences: DEFAULT_NOTIFICATION_PREFERENCES,
  }));
  const token = vi.fn(async () => 'synthetic-token');
  const session = createPushSession({
    notifications: {
      permission: async () => 'granted',
      request: async () => 'granted',
      token,
      onTokenChanged: () => () => {},
      setBadge: async () => {},
      presented: async () => [],
      dismiss: async () => {},
    },
    hostPush: {
      ...f.options.push,
      register: (entry, registration) =>
        f.prefs.withPrepared(entry, () => register(entry, registration)),
      test: async () => {},
      unregister: async () => {},
      setEnabled: f.options.push.settings,
      setQuiet: f.options.push.settings,
    },
    beforeRegister: () => f.prefs.ready,
    platform: 'android',
    locale: 'en',
  });
  return { session, register, token };
}

describe('phone-owned notification preferences', () => {
  it.each([0, 1, 2, 3])(
    'checks the latest copy at registration dispatch after completion turn %s',
    async (offset) => {
      const f = fixture(DEFAULT_NOTIFICATION_PREFERENCES);
      let release!: () => void;
      const slow = new Promise<void>((resolve) => {
        release = resolve;
      });
      let writes = 0;
      let server = true;
      f.options.push.setPreferences.mockImplementation(async (_entry, preferences) => {
        if (++writes === 1) await slow;
        server = preferences.reply!;
        return {
          registered: false,
          enabled: true,
          quietChannelIds: [],
          preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, ...preferences },
        };
      });
      const copying = f.prefs.sync([host('a')]);
      await flush();
      let observed: { local: boolean; server: boolean } | undefined;
      const registering = f.prefs.withPrepared(host('a'), () => {
        observed = { local: f.disk()!.reply, server };
      });
      await flush();
      release();
      for (let step = 0; step < offset; step++) await Promise.resolve();
      const changing = f.prefs.set({ reply: false });
      await Promise.all([copying, registering, changing]);
      expect(observed?.local).toBe(observed?.server);
      expect(server).toBe(false);
    },
  );

  it.each([2, 3, 4, 5, 6, 7, 8])(
    'refuses dispatch after removal at completion turn %s',
    async (offset) => {
      const f = fixture(DEFAULT_NOTIFICATION_PREFERENCES);
      let release!: () => void;
      const slow = new Promise<void>((resolve) => {
        release = resolve;
      });
      f.options.push.setPreferences.mockImplementationOnce(async (_entry, preferences) => {
        await slow;
        return {
          registered: false,
          enabled: true,
          quietChannelIds: [],
          preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, ...preferences },
        };
      });
      const copying = f.prefs.sync([host('a')]);
      await flush();
      let removed = false;
      let sentAfterRemoval = false;
      const registering = f.prefs
        .withPrepared(host('a'), () => {
          sentAfterRemoval = removed;
        })
        .catch(() => {});
      await flush();
      release();
      for (let step = 0; step < offset; step++) await Promise.resolve();
      removed = true;
      const removing = f.prefs.sync([]);
      await Promise.all([copying, registering, removing]);
      expect(sentAfterRemoval).toBe(false);
    },
  );

  it('registers a healthy Host while another Host is still copying preferences', async () => {
    const f = fixture(DEFAULT_NOTIFICATION_PREFERENCES);
    let release!: () => void;
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = f.options.push.setPreferences.getMockImplementation()!;
    f.options.push.setPreferences.mockImplementation(async (entry, preferences) => {
      if (entry.hostId === 'b') await slow;
      return original(entry, preferences);
    });
    const hosts = [host('a'), host('b')];
    const copying = f.prefs.sync(hosts);
    const { register, token, session } = registrationFixture(f);
    const registering = session.sync(hosts);
    try {
      await flush();
      expect(token).toHaveBeenCalledOnce();
      expect(register).toHaveBeenCalledWith(host('a'), expect.anything());
      expect(register).not.toHaveBeenCalledWith(host('b'), expect.anything());
      expect(session.getSnapshot().status).toBe('checking');
      expect(f.prefs.getSnapshot().syncing).toBe(true);
    } finally {
      release();
      await Promise.all([copying, registering]);
    }
    expect(session.getSnapshot()).toEqual({ status: 'on', failed: [] });
  });

  it.each(['change', 'remove'])(
    'guards the real push-session dispatch after late %s',
    async (action) => {
      const f = fixture(DEFAULT_NOTIFICATION_PREFERENCES);
      let release!: () => void;
      const slow = new Promise<void>((resolve) => {
        release = resolve;
      });
      const original = f.options.push.setPreferences.getMockImplementation()!;
      f.options.push.setPreferences.mockImplementationOnce(async (entry, preferences) => {
        await slow;
        return original(entry, preferences);
      });
      const copying = f.prefs.sync([host('a')]);
      await flush();
      const { session, register } = registrationFixture(f);
      register.mockImplementation(async () => {
        expect(f.copies.get('a')).toEqual(f.disk());
        return { registered: true, enabled: true, quietChannelIds: [], preferences: f.disk()! };
      });
      const registering = session.sync([host('a')]);
      await flush();
      release();
      await Promise.resolve();
      await Promise.resolve();
      const changing = action === 'change' ? f.prefs.set({ reply: false }) : f.prefs.sync([]);
      await Promise.all([copying, registering, changing]);
      expect(register).toHaveBeenCalledTimes(action === 'change' ? 1 : 0);
      expect(session.getSnapshot()).toEqual({
        status: 'on',
        failed: action === 'change' ? [] : ['a'],
      });
    },
  );

  it('refuses registration without a legacy seed and does not seed again for every Host', async () => {
    const f = fixture();
    f.offline.add('a');
    f.offline.add('b');
    const hosts = [host('a'), host('b')];
    const copying = f.prefs.sync(hosts);
    const { session, register } = registrationFixture(f);
    await Promise.all([copying, session.sync(hosts)]);
    expect(register).not.toHaveBeenCalled();
    expect(f.options.push.settings).toHaveBeenCalledTimes(2);
    expect(f.disk()).toBeUndefined();
    expect(session.getSnapshot()).toEqual({ status: 'on', failed: ['a', 'b'] });
  });

  it('persists new choices during a slow write and prepares only after the latest copy', async () => {
    const f = fixture(DEFAULT_NOTIFICATION_PREFERENCES);
    let release!: () => void;
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = f.options.push.setPreferences.getMockImplementation()!;
    f.options.push.setPreferences.mockImplementationOnce(async (entry, preferences) => {
      await slow;
      return original(entry, preferences);
    });
    const copying = f.prefs.sync([host('a')]);
    await flush();
    const changing = Promise.all([f.prefs.set({ reply: false }), f.prefs.set({ question: false })]);
    let prepared = false;
    const preparing = f.prefs.prepare(host('a')).then(() => {
      prepared = true;
    });
    try {
      await flush();
      expect(f.disk()?.reply).toBe(false);
      expect(f.disk()?.question).toBe(false);
      expect(prepared).toBe(false);
    } finally {
      release();
      await Promise.all([copying, changing, preparing]);
    }
    expect(f.copies.get('a')).toMatchObject({ reply: false, question: false });
    expect(f.options.push.setPreferences).toHaveBeenCalledTimes(2);
  });

  it('rejects an old preparation after re-pairing and preserves the new failure', async () => {
    const f = fixture(DEFAULT_NOTIFICATION_PREFERENCES);
    let release!: () => void;
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = f.options.push.setPreferences.getMockImplementation()!;
    f.options.push.setPreferences.mockImplementation(async (entry, preferences) => {
      if (entry.credential === 'old') await slow;
      else throw new Error('new-pairing-offline');
      return original(entry, preferences);
    });
    const copying = f.prefs.sync([host('a', 'old')]);
    const preparing = f.prefs.prepare(host('a', 'old'));
    await flush();
    const replacement = f.prefs.sync([host('a', 'new')]);
    await flush();
    expect(f.options.push.setPreferences).toHaveBeenCalledOnce();
    const refused = expect(preparing).rejects.toThrow('notification-preferences-unavailable');
    release();
    await Promise.all([copying, refused, replacement]);
    expect(f.prefs.getSnapshot()).toMatchObject({ failed: ['a'], syncing: false });
    await expect(f.prefs.prepare(host('a', 'old'))).rejects.toThrow(
      'notification-preferences-unavailable',
    );
  });

  it('does not register a removed pairing when its pending copy finishes', async () => {
    const f = fixture(DEFAULT_NOTIFICATION_PREFERENCES);
    let release!: () => void;
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = f.options.push.setPreferences.getMockImplementation()!;
    f.options.push.setPreferences.mockImplementation(async (entry, preferences) => {
      await slow;
      return original(entry, preferences);
    });
    const copying = f.prefs.sync([host('a')]);
    const register = vi.fn();
    const preparing = f.prefs.prepare(host('a')).then(register);
    await flush();
    await f.prefs.sync([]);
    const refused = expect(preparing).rejects.toThrow('notification-preferences-unavailable');
    release();
    await Promise.all([copying, refused]);
    expect(register).not.toHaveBeenCalled();
    expect(f.prefs.getSnapshot()).toMatchObject({ failed: [], syncing: false });
  });

  it('ignores an old copy after removal and re-adoption of the same credential', async () => {
    const f = fixture(DEFAULT_NOTIFICATION_PREFERENCES);
    let release!: () => void;
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = f.options.push.setPreferences.getMockImplementation()!;
    f.options.push.setPreferences.mockImplementationOnce(async (entry, preferences) => {
      await slow;
      return original(entry, preferences);
    });
    const copying = f.prefs.sync([host('a')]);
    const preparing = f.prefs.prepare(host('a'));
    await flush();
    await f.prefs.sync([]);
    f.offline.add('a');
    const replacement = f.prefs.sync([host('a')]);
    await flush();
    expect(f.options.push.setPreferences).toHaveBeenCalledOnce();
    const refused = expect(preparing).rejects.toThrow('notification-preferences-unavailable');
    release();
    await Promise.all([copying, refused, replacement]);
    expect(f.prefs.getSnapshot().failed).toEqual(['a']);
  });

  it('never publishes or copies an unpersisted choice and recovers on the next save', async () => {
    const f = fixture(DEFAULT_NOTIFICATION_PREFERENCES);
    await f.prefs.sync([host('a')]);
    const write = f.options.storage.write;
    f.options.storage.write = () => {
      throw new Error('disk-full');
    };
    await expect(f.prefs.set({ reply: false })).rejects.toThrow('disk-full');
    expect(f.prefs.getSnapshot().preferences?.reply).toBe(true);
    expect(f.copies.get('a')?.reply).toBe(true);
    f.options.storage.write = write;
    await f.prefs.set({ reply: false });
    expect(f.disk()?.reply).toBe(false);
    expect(f.copies.get('a')?.reply).toBe(false);
  });

  it('preserves registered legacy seed precedence before a queued explicit choice', async () => {
    const f = fixture();
    let release!: () => void;
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.options.push.settings.mockImplementation(async (entry) => {
      await slow;
      return {
        registered: entry.hostId === 'b',
        enabled: true,
        quietChannelIds: [],
        preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, approval: entry.hostId !== 'b' },
      };
    });
    const copying = f.prefs.sync([host('a'), host('b')]);
    await flush();
    const changing = f.prefs.set({ reply: false });
    await flush();
    expect(f.disk()).toBeUndefined();
    release();
    await Promise.all([copying, changing]);
    expect(f.disk()).toMatchObject({ approval: false, reply: false });
    expect(f.copies.get('a')).toEqual(f.disk());
    expect(f.copies.get('b')).toEqual(f.disk());
  });

  it('coalesces overlapping copies while a Host waits and retains failure until retry succeeds', async () => {
    const f = fixture(DEFAULT_NOTIFICATION_PREFERENCES);
    let reject!: (error: Error) => void;
    const slow = new Promise<never>((_, fail) => {
      reject = fail;
    });
    f.options.push.setPreferences.mockImplementationOnce(() => slow);
    const first = f.prefs.sync([host('a')]);
    await flush();
    const retry = f.prefs.retry();
    const changing = f.prefs.set({ reply: false });
    await flush();
    expect(f.options.push.setPreferences).toHaveBeenCalledOnce();
    reject(new Error('offline'));
    await Promise.all([first, retry, changing]);
    expect(f.prefs.getSnapshot()).toMatchObject({ failed: ['a'], syncing: false });
    expect(f.disk()?.reply).toBe(false);
    await f.prefs.retry();
    expect(f.copies.get('a')?.reply).toBe(false);
    expect(f.prefs.getSnapshot()).toMatchObject({ failed: [], syncing: false });
  });

  it('drops removed Hosts from retry and resets backoff after success', async () => {
    vi.useFakeTimers();
    const f = fixture(DEFAULT_NOTIFICATION_PREFERENCES);
    try {
      f.prefs.setForeground(true);
      f.offline.add('b');
      await f.prefs.sync([host('a'), host('b')]);
      await vi.advanceTimersByTimeAsync(1000);
      await f.prefs.sync([host('a')]);
      const calls = f.options.push.setPreferences.mock.calls.length;
      await vi.advanceTimersByTimeAsync(60_000);
      expect(f.options.push.setPreferences).toHaveBeenCalledTimes(calls);
      expect(vi.getTimerCount()).toBe(0);
      await f.prefs.sync([host('a'), host('b')]);
      f.offline.clear();
      await vi.advanceTimersByTimeAsync(1000);
      expect(f.prefs.getSnapshot().failed).toEqual([]);
    } finally {
      f.prefs.setForeground(false);
      vi.useRealTimers();
    }
  });
  it('does not enqueue repeated retries while the failed Host already has a pending copy', async () => {
    vi.useFakeTimers();
    const f = fixture(DEFAULT_NOTIFICATION_PREFERENCES);
    let release!: () => void;
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = f.options.push.setPreferences.getMockImplementation()!;
    try {
      f.prefs.setForeground(true);
      f.offline.add('b');
      await f.prefs.sync([host('a'), host('b')]);
      f.offline.clear();
      f.options.push.setPreferences.mockImplementation(async (entry, preferences) => {
        if (entry.hostId === 'b') await slow;
        return original(entry, preferences);
      });
      await vi.advanceTimersByTimeAsync(1000);
      const calls = f.options.push.setPreferences.mock.calls.length;
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(60000);
      expect(f.options.push.setPreferences).toHaveBeenCalledTimes(calls);
      release();
      await flush();
      expect(f.prefs.getSnapshot()).toMatchObject({ failed: [], syncing: false });
    } finally {
      release();
      f.prefs.setForeground(false);
      vi.useRealTimers();
    }
  });
  it('retries a noncurrent Host while A stays connected and pauses in the background', async () => {
    vi.useFakeTimers();
    const f = fixture(DEFAULT_NOTIFICATION_PREFERENCES);
    try {
      f.prefs.setForeground(true);
      f.offline.add('b');
      await f.prefs.sync([host('a'), host('b')]);
      await f.prefs.set({ reply: false });
      await vi.advanceTimersByTimeAsync(1000);
      expect(f.prefs.getSnapshot().failed).toEqual(['b']);
      f.prefs.setForeground(false);
      const calls = f.options.push.setPreferences.mock.calls.length;
      f.offline.clear();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(f.options.push.setPreferences).toHaveBeenCalledTimes(calls);
      f.prefs.setForeground(true);
      await vi.advanceTimersByTimeAsync(1000);
      expect(f.copies.get('b')?.reply).toBe(false);
      expect(f.prefs.getSnapshot().failed).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      f.prefs.setForeground(false);
      vi.useRealTimers();
    }
  });
  it('sends each pairing a copy once and retries only the Host that missed it', async () => {
    vi.useFakeTimers();
    const f = fixture(DEFAULT_NOTIFICATION_PREFERENCES);
    const sentTo = () => f.options.push.setPreferences.mock.calls.map(([entry]) => entry.hostId);
    try {
      f.prefs.setForeground(true);
      f.offline.add('b');
      await f.prefs.sync([host('a'), host('b')]);
      expect(sentTo()).toEqual(['a', 'b']);
      await f.prefs.retry();
      await f.prefs.sync([host('a'), host('b')]);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(sentTo().filter((id) => id === 'a')).toEqual(['a']);
      f.offline.clear();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(f.prefs.getSnapshot().failed).toEqual([]);
      const settled = sentTo().length;
      await f.prefs.retry();
      expect(sentTo()).toHaveLength(settled);
      await f.prefs.set({ reply: false });
      expect(sentTo().slice(settled).sort()).toEqual(['a', 'b']);
      expect(f.copies.get('a')?.reply).toBe(false);
      await f.prefs.sync([host('a', 'repaired'), host('b')]);
      expect(sentTo().at(-1)).toBe('a');
      expect(f.copies.get('repaired')?.reply).toBe(false);
      await f.prefs.prepare(host('a', 'repaired'));
      expect(sentTo().at(-1)).toBe('a');
    } finally {
      f.prefs.setForeground(false);
      vi.useRealTimers();
    }
  });
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
  it('copies the latest choice before token registration and refuses replaced credentials', async () => {
    const f = fixture(DEFAULT_NOTIFICATION_PREFERENCES);
    await f.prefs.sync([host('a')]);
    await Promise.all([f.prefs.set({ reply: false }), f.prefs.prepare(host('a'))]);
    expect(f.options.push.setPreferences).toHaveBeenLastCalledWith(
      host('a'),
      expect.objectContaining({ reply: false }),
    );
    await f.prefs.sync([host('a', 'new')]);
    await expect(f.prefs.prepare(host('a'))).rejects.toThrow(
      'notification-preferences-unavailable',
    );
  });
});
