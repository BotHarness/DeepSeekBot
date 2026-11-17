import type { BridgeActions } from './actions.js';
import type { SessionProgress, SessionTranscript } from './bridge.js';

export interface SessionDetailSnapshot {
  transcript?: SessionTranscript;
  progress?: SessionProgress | undefined;
}

export interface SessionDetailKey {
  botSlug: string;
  sessionId: string;
}

const LIMIT = 24;
const entries = new Map<string, SessionDetailSnapshot>();
const writes = new Map<string, number>();
const pending = new Set<string>();

function key({ botSlug, sessionId }: SessionDetailKey): string {
  return `${botSlug}\u0000${sessionId}`;
}

export function cachedSessionDetail(at: SessionDetailKey): SessionDetailSnapshot | undefined {
  return entries.get(key(at));
}

export function rememberSessionDetail(at: SessionDetailKey, patch: SessionDetailSnapshot): void {
  const id = key(at);
  const next = { ...entries.get(id), ...patch };
  entries.delete(id);
  entries.set(id, next);
  writes.set(id, (writes.get(id) ?? 0) + 1);
  while (entries.size > LIMIT) {
    const oldest = entries.keys().next().value!;
    entries.delete(oldest);
    writes.delete(oldest);
  }
}

export function prefetchSessionDetail(
  actions: Pick<BridgeActions, 'sessionTranscript'>,
  at: SessionDetailKey,
): void {
  const id = key(at);
  const read = actions.sessionTranscript;
  if (read === undefined || pending.has(id) || entries.get(id)?.transcript !== undefined) return;
  pending.add(id);
  const version = writes.get(id);
  void read(at.botSlug, at.sessionId)
    .then(
      (transcript) => {
        if (writes.get(id) === version) rememberSessionDetail(at, { transcript });
      },
      () => {},
    )
    .finally(() => pending.delete(id));
}

export function clearSessionDetailCache(): void {
  entries.clear();
  writes.clear();
  pending.clear();
}
