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
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<DevicePreferenceSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  };
  const ready = options.storage.read().then((value) => {
    const preferences = parseNotificationPreferences(value);
    if (value !== undefined && value !== null && preferences === undefined)
      throw new Error('notification-preferences-invalid');
    publish({ preferences });
  });
  void ready.catch(() => undefined);
  let queue: Promise<void> = ready;
  const enqueue = (run: () => Promise<void>): Promise<void> => {
    const next = queue
      .catch(() => undefined)
      .then(() => ready)
      .then(run);
    queue = next;
    return next;
  };
  const save = (preferences: PushPreferences) => {
    options.storage.write(preferences);
    publish({ preferences });
  };
  const sync = async () => {
    publish({ syncing: true });
    try {
      if (snapshot.preferences === undefined) {
        const seeds = await Promise.all(
          hosts.map((host) => options.push.settings(host).catch(() => undefined)),
        );
        const seed =
          seeds.find((entry) => entry?.registered) ?? seeds.find((entry) => entry !== undefined);
        if (seed !== undefined) save(seed.preferences);
      }
      const preferences = snapshot.preferences;
      const results = await Promise.all(
        hosts.map(async (host) => {
          if (preferences === undefined) return host.hostId;
          try {
            await options.push.setPreferences(host, preferences);
            return undefined;
          } catch {
            return host.hostId;
          }
        }),
      );
      publish({ failed: results.filter((id): id is string => id !== undefined) });
    } finally {
      publish({ syncing: false });
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
      hosts = next;
      return enqueue(sync);
    },
    retry() {
      return enqueue(sync);
    },
    prepare(host: SavedHost) {
      return enqueue(async () => {
        const preferences = snapshot.preferences;
        if (
          preferences === undefined ||
          !hosts.some(
            (entry) => entry.hostId === host.hostId && entry.credential === host.credential,
          )
        )
          throw new Error('notification-preferences-unavailable');
        await options.push.setPreferences(host, preferences);
      });
    },
    set(patch: Partial<PushPreferences>) {
      return enqueue(async () => {
        save({ ...(snapshot.preferences ?? DEFAULT_NOTIFICATION_PREFERENCES), ...patch });
        await sync();
      });
    },
  };
}
