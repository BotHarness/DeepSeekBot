export interface DraftStorage {
  read(): Promise<unknown>;
  write(value: Record<string, string>, required?: boolean): void;
}
export function createSourceDrafts(storage: DraftStorage) {
  let values: Record<string, string> = {};
  const changed = new Set<string>();
  const listeners = new Set<() => void>();
  const publish = () => {
    for (const listener of listeners) listener();
  };
  const ready = storage
    .read()
    .then((raw) => {
      if (raw && typeof raw === 'object' && !Array.isArray(raw))
        for (const [key, value] of Object.entries(raw)) {
          if (!changed.has(key) && typeof value === 'string' && value.length <= 100000)
            values[key] = value;
        }
      storage.write(values);
      publish();
    })
    .catch(() => undefined);
  return {
    ready,
    get: (key: string) => values[key] ?? '',
    set(key: string, value: string) {
      changed.add(key);
      values = { ...values, [key]: value };
      storage.write(values);
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
        storage.write(values);
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
