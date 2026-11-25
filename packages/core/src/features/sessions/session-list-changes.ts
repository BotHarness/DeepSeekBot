export const SESSION_LIST_PUBLISH_MS = 1_000;
export const SESSION_LIST_CACHE_MS = 15_000;

const ROW_EVENTS: ReadonlySet<string> = new Set([
  'turn/start',
  'turn/end',
  'user/message',
  'session/title',
  'approval/asked',
  'approval/decided',
]);

export function changesSessionRow(eventType: string): boolean {
  return ROW_EVENTS.has(eventType);
}

export function createSessionListChanges(
  publish: () => void,
  { publishMs = SESSION_LIST_PUBLISH_MS } = {},
) {
  let version = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    get version() {
      return version;
    },
    changed(push = true) {
      version += 1;
      if (!push || timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        publish();
      }, publishMs);
      timer.unref?.();
    },
    close() {
      clearTimeout(timer);
      timer = undefined;
    },
  };
}

export type SessionListChanges = ReturnType<typeof createSessionListChanges>;

export function cacheSessionRows<T>(
  read: () => Promise<T>,
  changes: Pick<SessionListChanges, 'version'>,
  { maxAgeMs = SESSION_LIST_CACHE_MS, now = Date.now } = {},
): () => Promise<T> {
  let cached: { version: number; at: number; rows: Promise<T> } | undefined;
  return () => {
    if (cached !== undefined && cached.version === changes.version && now() - cached.at < maxAgeMs)
      return cached.rows;
    const entry = { version: changes.version, at: now(), rows: read() };
    cached = entry;
    entry.rows.catch(() => {
      if (cached === entry) cached = undefined;
    });
    return entry.rows;
  };
}
