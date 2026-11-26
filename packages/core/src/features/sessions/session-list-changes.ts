import { randomUUID } from 'node:crypto';

export const SESSION_LIST_PUBLISH_MS = 1_000;

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
  let seq = 0;
  let allSeq = 0;
  const touched = new Map<string, number>();
  const touchedAt = new Map<string, number>();
  const firstTouchedAt = new Map<string, number>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const signal = (push: boolean) => {
    if (!push || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      publish();
    }, publishMs);
    timer.unref?.();
  };
  return {
    get cursor(): SessionListCursor {
      return { epoch, seq };
    },
    changed(push = true, sessionId?: string, at?: number) {
      if (sessionId !== undefined) {
        seq += 1;
        touched.delete(sessionId);
        touched.set(sessionId, seq);
        if (at !== undefined) {
          touchedAt.set(sessionId, Math.max(at, touchedAt.get(sessionId) ?? 0));
          if (!firstTouchedAt.has(sessionId)) firstTouchedAt.set(sessionId, at);
        }
      }
      signal(push);
    },
    touchedAt(sessionId: string): number | undefined {
      return touchedAt.get(sessionId);
    },
    firstTouchedAt(sessionId: string): number | undefined {
      return firstTouchedAt.get(sessionId);
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
