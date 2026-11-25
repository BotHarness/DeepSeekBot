import { randomUUID } from 'node:crypto';

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

export type SessionListCursor = { epoch: string; seq: number };

export type SessionListChangeSet =
  | { reset: true; cursor: SessionListCursor }
  | { reset?: never; sessionIds: string[]; cursor: SessionListCursor };

export function createSessionListChanges(
  publish: () => void,
  {
    publishMs = SESSION_LIST_PUBLISH_MS,
    epoch = randomUUID() as string,
  }: { publishMs?: number; epoch?: string } = {},
) {
  let version = 0;
  let seq = 0;
  let allSeq = 0;
  const touched = new Map<string, number>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const signal = (push: boolean) => {
    version += 1;
    if (!push || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      publish();
    }, publishMs);
    timer.unref?.();
  };
  return {
    get version() {
      return version;
    },
    get cursor(): SessionListCursor {
      return { epoch, seq };
    },
    changed(push = true, sessionId?: string) {
      if (sessionId !== undefined) {
        seq += 1;
        touched.delete(sessionId);
        touched.set(sessionId, seq);
      }
      signal(push);
    },
    changedAll() {
      seq += 1;
      allSeq = seq;
      touched.clear();
      signal(true);
    },
    since(request: { sinceSeq?: number; epoch?: string }): SessionListChangeSet {
      const cursor = { epoch, seq };
      const { sinceSeq } = request;
      if (
        sinceSeq === undefined ||
        request.epoch !== epoch ||
        sinceSeq > seq ||
        sinceSeq < 0 ||
        allSeq > sinceSeq
      )
        return { reset: true, cursor };
      const sessionIds: string[] = [];
      for (const [id, at] of [...touched].reverse()) {
        if (at <= sinceSeq) break;
        sessionIds.push(id);
      }
      return { sessionIds, cursor };
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
