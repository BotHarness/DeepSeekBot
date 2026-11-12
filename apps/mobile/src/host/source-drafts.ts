export interface DraftStorage {
  read(): Promise<unknown>;
  write(value: Record<string, string>, required?: boolean): void;
}
export interface DraftPersistence {
  readonly loaded: boolean;
  readonly failed: boolean;
}
const SENT_ECHO_MS = 1500;
export function createSourceDrafts(
  storage: DraftStorage,
  { now = Date.now }: { now?: () => number } = {},
) {
  let values: Record<string, string> = {};
  const sent = new Map<string, { text: string; at: number }>();
  const unsent = (key: string, value: string) => {
    const taken = sent.get(key);
    if (taken === undefined) return value;
    if (value !== '' && value.startsWith(taken.text) && now() - taken.at <= SENT_ECHO_MS)
      return value.slice(taken.text.length);
    sent.delete(key);
    return value;
  };
  let persistence: DraftPersistence = { loaded: false, failed: false };
  let loading: Promise<void> | undefined;
  let revision = 0;
  let deferredRemovals: Array<(key: string) => boolean> = [];
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
      revision++;
      deferredRemovals = [];
      status(true, false);
    } catch {
      status(true, true);
    }
  };
  const hydrate = (): Promise<void> => {
    if (loading !== undefined) return loading;
    const readRevision = revision;
    loading = storage
      .read()
      .then((raw) => {
        if (readRevision !== revision) return;
        if (raw && typeof raw === 'object' && !Array.isArray(raw))
          for (const [key, value] of Object.entries(raw)) {
            if (!changed.has(key) && typeof value === 'string' && value.length <= 100000) {
              if (deferredRemovals.some((match) => match(key))) changed.add(key);
              else values[key] = value;
            }
          }
        status(true, false);
        persist();
      })
      .catch(() => {
        if (readRevision === revision) status(false, true);
      })
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
      values = { ...values, [key]: unsent(key, value) };
      persist();
      publish();
    },
    take(key: string, text = values[key] ?? '') {
      changed.add(key);
      values = { ...values, [key]: '' };
      if (text === '') sent.delete(key);
      else sent.set(key, { text, at: now() });
      persist();
      publish();
      return text;
    },
    removeWhere(match: (key: string) => boolean) {
      if (!persistence.loaded) deferredRemovals.push(match);
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
      const readRevision = revision;
      const raw = await storage.read();
      const next: Record<string, string> = {};
      const removedBeforeLoad: string[] = [];
      if (readRevision === revision && raw && typeof raw === 'object' && !Array.isArray(raw))
        for (const [key, value] of Object.entries(raw))
          if (!changed.has(key) && typeof value === 'string') {
            if (deferredRemovals.some((remove) => remove(key))) removedBeforeLoad.push(key);
            else next[key] = value;
          }
      Object.assign(next, values);
      const removed = Object.keys(next).filter(match);
      for (const key of removed) delete next[key];
      storage.write(next, true);
      revision++;
      deferredRemovals = [];
      status(true, false);
      values = next;
      for (const key of [...removed, ...removedBeforeLoad]) changed.add(key);
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
