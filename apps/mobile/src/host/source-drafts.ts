export interface DraftStorage {
  read(): Promise<unknown>;
  write(value: Record<string, string>, required?: boolean): void;
}
export interface DraftPersistence {
  readonly loaded: boolean;
  readonly failed: boolean;
}
export function createSourceDrafts(storage: DraftStorage) {
  let values: Record<string, string> = {};
  let persistence: DraftPersistence = { loaded: false, failed: false };
  let loading: Promise<void> | undefined;
  const changed = new Set<string>();
  const listeners = new Set<() => void>();
  const publish = () => {
    for (const listener of listeners) listener();
  };
  const status = (loaded: boolean, failed: boolean) => {
    if (loaded !== persistence.loaded || failed !== persistence.failed)
      persistence = { loaded, failed };
  };
  const persist = () => {
    if (!persistence.loaded) return;
    try {
      storage.write(values, true);
      status(true, false);
    } catch {
      status(true, true);
    }
  };
  const hydrate = (): Promise<void> => {
    if (loading !== undefined) return loading;
    loading = storage
      .read()
      .then((raw) => {
        if (raw && typeof raw === 'object' && !Array.isArray(raw))
          for (const [key, value] of Object.entries(raw)) {
            if (!changed.has(key) && typeof value === 'string' && value.length <= 100000)
              values[key] = value;
          }
        status(true, false);
        persist();
      })
      .catch(() => status(false, true))
      .finally(() => {
        loading = undefined;
        publish();
      });
    return loading;
  };
  const ready = hydrate();
  return {
    ready,
    get: (key: string) => values[key] ?? '',
    getPersistence: () => persistence,
    async retrySave() {
      if (!persistence.loaded) await hydrate();
      else {
        persist();
        publish();
      }
      return persistence.loaded && !persistence.failed;
    },
    set(key: string, value: string) {
      changed.add(key);
      values = { ...values, [key]: value };
      persist();
      publish();
    },
    removeWhere(match: (key: string) => boolean) {
      let removed = false;
      for (const key of Object.keys(values))
        if (match(key)) {
          changed.add(key);
          delete values[key];
          removed = true;
        }
      if (removed) {
        persist();
        publish();
      }
    },
    async removePersistedWhere(match: (key: string) => boolean) {
      await ready;
      const raw = await storage.read();
      const next: Record<string, string> = {};
      if (raw && typeof raw === 'object' && !Array.isArray(raw))
        for (const [key, value] of Object.entries(raw))
          if (!changed.has(key) && typeof value === 'string') next[key] = value;
      Object.assign(next, values);
      const removed = Object.keys(next).filter(match);
      for (const key of removed) delete next[key];
      storage.write(next, true);
      status(true, false);
      values = next;
      for (const key of removed) changed.add(key);
      publish();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
export const hostDraftKey = (hostId: string, kind: string, id: string) =>
  JSON.stringify(['computer', hostId, kind, id]);
export const cloudDraftKey = (scope: string, organizationId: string, channelId: string) =>
  JSON.stringify(['cloud', scope, organizationId, channelId]);
