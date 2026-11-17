import type { BridgeActions } from './actions.js';
import type { SessionProgress, SessionTranscript } from './bridge.js';

export interface SessionDetailSnapshot {
  transcript?: SessionTranscript;
  progress?: SessionProgress;
}

const LIMIT = 24;
const entries = new Map<string, SessionDetailSnapshot>();
const pending = new Set<string>();

function key(botSlug: string, sessionId: string): string {
  return `${botSlug}\u0000${sessionId}`;
}

export function cachedSessionDetail(
  botSlug: string,
  sessionId: string,
): SessionDetailSnapshot | undefined {
  return entries.get(key(botSlug, sessionId));
}

export function rememberSessionDetail(
  botSlug: string,
  sessionId: string,
  patch: SessionDetailSnapshot,
): void {
  const id = key(botSlug, sessionId);
  const next = { ...entries.get(id), ...patch };
  entries.delete(id);
  entries.set(id, next);
  while (entries.size > LIMIT) entries.delete(entries.keys().next().value!);
}

export function prefetchSessionDetail(
  actions: Pick<BridgeActions, 'sessionTranscript'>,
  botSlug: string,
  sessionId: string,
): void {
  const id = key(botSlug, sessionId);
  const read = actions.sessionTranscript;
  if (read === undefined || pending.has(id) || entries.get(id)?.transcript !== undefined) return;
  pending.add(id);
  void read(botSlug, sessionId)
    .then(
      (transcript) => rememberSessionDetail(botSlug, sessionId, { transcript }),
      () => {},
    )
    .finally(() => pending.delete(id));
}

export function clearSessionDetailCache(): void {
  entries.clear();
  pending.clear();
}
