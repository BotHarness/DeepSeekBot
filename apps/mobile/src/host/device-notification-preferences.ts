import type { SavedHost } from './hosts';
import { PUSH_KINDS, type HostPush, type PushPreferences } from './push';

export const DEFAULT_NOTIFICATION_PREFERENCES: PushPreferences = {
  approval: true,
  question: true,
  'private-input': true,
  reply: true,
};

export interface DevicePreferenceSnapshot {
  preferences: PushPreferences | undefined;
  syncing: boolean;
  failed: readonly string[];
}

export function parseNotificationPreferences(value: unknown): PushPreferences | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (!PUSH_KINDS.every((kind) => typeof record[kind] === 'boolean')) return undefined;
  return Object.fromEntries(PUSH_KINDS.map((kind) => [kind, record[kind]])) as PushPreferences;
}

export function createDeviceNotificationPreferences(options: {
  storage: { read(): Promise<unknown>; write(preferences: PushPreferences): void };
  push: Pick<HostPush, 'settings' | 'setPreferences'>;
}) {
  let snapshot: DevicePreferenceSnapshot = { preferences: undefined, syncing: false, failed: [] };
  let hosts: readonly SavedHost[] = [];
  let foreground = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryDelay = 1000;
  let localPending = 0;
  const copies = new Map<string, { credential: string; promise: Promise<PushPreferences> }>();
  const retired = new WeakSet<Promise<PushPreferences>>();
  const pairings = new Map<string, { credential: string }>();
  const failed = new Map<string, string>();
  const accepted = new Map<string, string>();
  const pairingKey = (host: SavedHost) => JSON.stringify([host.hostId, host.credential]);
  const clearRetry = () => {
    clearTimeout(retryTimer);
    retryTimer = undefined;
  };
  const scheduleRetry = () => {
    if (!foreground || snapshot.failed.length === 0) {
      clearRetry();
      retryDelay = 1000;
      return;
    }
    if (
      snapshot.failed.every((id) => {
        const entry = copies.get(id);
        return entry !== undefined && !retired.has(entry.promise);
      })
    ) {
      clearRetry();
      return;
    }
    if (retryTimer !== undefined) return;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      retryDelay = Math.min(retryDelay * 2, 30_000);
      void (foreground ? sync() : Promise.resolve()).catch(() => undefined);
    }, retryDelay);
  };
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<DevicePreferenceSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  };
  const refresh = () => {
    publish({
      syncing:
        localPending > 0 || [...copies.values()].some((entry) => !retired.has(entry.promise)),
      failed: hosts
        .filter((host) => failed.get(host.hostId) === host.credential)
        .map((host) => host.hostId),
    });
    scheduleRetry();
  };
  const ready = options.storage.read().then((value) => {
    const preferences = parseNotificationPreferences(value);
    if (value !== undefined && value !== null && preferences === undefined)
      throw new Error('notification-preferences-invalid');
    publish({ preferences });
  });
  void ready.catch(() => undefined);
  let queue: Promise<void> = ready;
  const enqueue = (run: () => void | Promise<void>): Promise<void> => {
    localPending++;
    refresh();
    const next = queue
      .catch(() => undefined)
      .then(() => ready)
      .then(run)
      .finally(() => {
        localPending--;
        refresh();
      });
    queue = next;
    return next;
  };
  const save = (preferences: PushPreferences) => {
    options.storage.write(preferences);
    publish({ preferences });
  };
  const seed = async () => {
    if (snapshot.preferences !== undefined) return;
    const seeds = await Promise.all(
      hosts.map((host) => options.push.settings(host).catch(() => undefined)),
    );
    const existing =
      seeds.find((entry) => entry?.registered) ?? seeds.find((entry) => entry !== undefined);
    if (existing !== undefined) save(existing.preferences);
  };
  const current = (host: SavedHost) => pairings.get(host.hostId)?.credential === host.credential;
  const copy = (host: SavedHost): Promise<PushPreferences> => {
    if (!current(host)) return Promise.reject(new Error('notification-preferences-unavailable'));
    const existing = copies.get(host.hostId);
    if (existing?.credential === host.credential && !retired.has(existing.promise))
      return existing.promise;
    const active = () =>
      current(host) && !retired.has(promise) && copies.get(host.hostId)?.promise === promise;
    const promise = (existing?.promise.catch(() => undefined) ?? Promise.resolve())
      .then(async () => {
        while (true) {
          const preferences = snapshot.preferences;
          if (preferences === undefined || !active())
            throw new Error('notification-preferences-unavailable');
          const key = pairingKey(host);
          const value = JSON.stringify(preferences);
          if (accepted.get(key) !== value) {
            accepted.delete(key);
            await options.push.setPreferences(host, preferences);
            if (active()) accepted.set(key, value);
          }
          if (!active()) throw new Error('notification-preferences-unavailable');
          if (preferences === snapshot.preferences) return preferences;
        }
      })
      .then(
        (preferences) => {
          if (!active()) throw new Error('notification-preferences-unavailable');
          failed.delete(host.hostId);
          return preferences;
        },
        (error: unknown) => {
          if (!active()) throw new Error('notification-preferences-unavailable');
          failed.set(host.hostId, host.credential);
          throw error;
        },
      )
      .finally(() => {
        if (copies.get(host.hostId)?.promise === promise) copies.delete(host.hostId);
        refresh();
      });
    copies.set(host.hostId, { credential: host.credential, promise });
    refresh();
    return promise;
  };
  const sync = () =>
    enqueue(seed).then(async () => {
      await Promise.all(hosts.map((host) => copy(host).catch(() => undefined)));
    });
  const adopt = (next: readonly SavedHost[]) => {
    hosts = next;
    const currentKeys = new Set(hosts.map(pairingKey));
    for (const key of accepted.keys()) if (!currentKeys.has(key)) accepted.delete(key);
    for (const [id, pairing] of pairings) {
      if (!hosts.some((host) => host.hostId === id && host.credential === pairing.credential))
        pairings.delete(id);
    }
    for (const host of hosts) {
      if (!pairings.has(host.hostId)) pairings.set(host.hostId, { credential: host.credential });
    }
    for (const [id, entry] of copies) {
      if (!hosts.some((host) => host.hostId === id && host.credential === entry.credential))
        retired.add(entry.promise);
    }
    for (const [id, credential] of failed) {
      if (!hosts.some((host) => host.hostId === id && host.credential === credential))
        failed.delete(id);
    }
    refresh();
  };
  const withPrepared = async <T>(host: SavedHost, send: () => T | Promise<T>): Promise<T> => {
    const pairing = pairings.get(host.hostId);
    const valid = () =>
      pairing !== undefined &&
      pairing.credential === host.credential &&
      pairings.get(host.hostId) === pairing;
    await enqueue(() => undefined);
    while (true) {
      if (!valid()) throw new Error('notification-preferences-unavailable');
      const written = await copy(host);
      await enqueue(() => undefined);
      if (!valid()) throw new Error('notification-preferences-unavailable');
      if (written === snapshot.preferences) return send();
    }
  };
  return {
    ready,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    sync(next: readonly SavedHost[]) {
      adopt(next);
      return sync();
    },
    retry() {
      return sync();
    },
    setForeground(active: boolean) {
      foreground = active;
      scheduleRetry();
    },
    prepare(host: SavedHost) {
      return withPrepared(host, () => undefined);
    },
    withPrepared,
    set(patch: Partial<PushPreferences>) {
      return enqueue(() => {
        save({ ...(snapshot.preferences ?? DEFAULT_NOTIFICATION_PREFERENCES), ...patch });
      }).then(sync);
    },
  };
}
