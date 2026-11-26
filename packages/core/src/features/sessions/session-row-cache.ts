import type { DshSessionListRow } from './host-sessions.js';
import type { SessionListChanges, SessionListCursor } from './session-list-changes.js';

export const SESSION_ROWS_MAX_AGE_MS = 10 * 60 * 1000;
export const SESSION_ROWS_MAX_DIRTY = 200;
export const SESSION_ROWS_CONCURRENCY = 8;

export type SessionRowReader = {
  all(): Promise<readonly DshSessionListRow[]>;
  one(previous: DshSessionListRow): Promise<DshSessionListRow | null>;
  ignored?(sessionId: string): boolean;
};

export function incrementalSessionRows(
  reader: SessionRowReader,
  journal: Pick<SessionListChanges, 'since' | 'cursor' | 'touchedAt'>,
  {
    maxAgeMs = SESSION_ROWS_MAX_AGE_MS,
    maxDirty = SESSION_ROWS_MAX_DIRTY,
    concurrency = SESSION_ROWS_CONCURRENCY,
    now = Date.now,
  } = {},
): () => Promise<readonly DshSessionListRow[]> {
  let rows: Map<string, DshSessionListRow> | undefined;
  let cursor: SessionListCursor | undefined;
  let loadedAt = 0;
  let queue: Promise<unknown> = Promise.resolve();

  const stamp = (row: DshSessionListRow, previous: DshSessionListRow | undefined) => {
    const updatedAt = Math.max(
      row.updatedAt,
      previous?.updatedAt ?? 0,
      journal.touchedAt(row.sessionId) ?? 0,
    );
    return updatedAt === row.updatedAt ? row : { ...row, updatedAt };
  };

  async function full(): Promise<readonly DshSessionListRow[]> {
    const start = journal.cursor;
    const read = await reader.all();
    rows = new Map(read.map((row) => [row.sessionId, row]));
    cursor = start;
    loadedAt = now();
    return read;
  }

  async function refresh(): Promise<readonly DshSessionListRow[]> {
    if (rows === undefined || cursor === undefined || now() - loadedAt >= maxAgeMs) return full();
    const changes = journal.since({ sinceSeq: cursor.seq, epoch: cursor.epoch });
    if (changes.reset === true || changes.sessionIds.length > maxDirty) return full();
    const current = rows;
    const ids = changes.sessionIds.filter((id) => reader.ignored?.(id) !== true);
    if (ids.some((id) => !current.has(id))) return full();
    for (let start = 0; start < ids.length; start += concurrency) {
      const batch = ids.slice(start, start + concurrency);
      const read = await Promise.all(
        batch.map((id) => {
          const previous = current.get(id);
          return previous === undefined ? Promise.resolve(undefined) : reader.one(previous);
        }),
      );
      batch.forEach((id, index) => {
        const row = read[index];
        if (row === null) current.delete(id);
        else if (row !== undefined) current.set(id, stamp(row, current.get(id)));
      });
    }
    cursor = changes.cursor;
    return [...current.values()];
  }

  return () => {
    const next = queue.then(refresh, refresh);
    queue = next.catch(() => {
      rows = undefined;
    });
    return next;
  };
}
