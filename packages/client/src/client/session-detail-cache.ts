import type { BridgeActions } from './actions.js';
import type { SessionProgress, SessionTranscript } from './bridge.js';

export interface SessionDetailSnapshot {
  transcript?: SessionTranscript;
  progress?: SessionProgress | undefined;
}

export interface SessionDetailKey {
  host: object;
  botSlug: string;
  sessionId: string;
}

const LIMIT = 24;
const hosts = new WeakMap<object, number>();
const entries = new Map<string, SessionDetailSnapshot>();
const transcriptWrites = new Map<string, number>();
const pending = new Map<string, symbol>();
let nextHost = 0;
let generation = 0;

function key({ host, botSlug, sessionId }: SessionDetailKey): string {
  let id = hosts.get(host);
  if (id === undefined) {
    id = nextHost++;
    hosts.set(host, id);
  }
  return `${id}\u0000${botSlug}\u0000${sessionId}`;
}

function touch(id: string, value: SessionDetailSnapshot): void {
  entries.delete(id);
  entries.set(id, value);
}

export function cachedSessionDetail(at: SessionDetailKey): SessionDetailSnapshot | undefined {
  const id = key(at);
  const value = entries.get(id);
  if (value !== undefined) touch(id, value);
  return value;
}

export function rememberSessionDetail(at: SessionDetailKey, patch: SessionDetailSnapshot): void {
  const id = key(at);
  touch(id, { ...entries.get(id), ...patch });
  if (patch.transcript !== undefined) transcriptWrites.set(id, (transcriptWrites.get(id) ?? 0) + 1);
  while (entries.size > LIMIT) {
    const oldest = entries.keys().next().value!;
    entries.delete(oldest);
    if (!pending.has(oldest)) transcriptWrites.delete(oldest);
  }
}

export function prefetchSessionDetail(
  actions: Pick<BridgeActions, 'sessionTranscript'>,
  at: SessionDetailKey,
): void {
  const id = key(at);
  const read = actions.sessionTranscript;
  if (read === undefined || pending.has(id) || entries.get(id)?.transcript !== undefined) return;
  const token = Symbol(id);
  const started = generation;
  const version = transcriptWrites.get(id);
  pending.set(id, token);
  void read(at.botSlug, at.sessionId)
    .then(
      (transcript) => {
        if (generation === started && transcriptWrites.get(id) === version)
          rememberSessionDetail(at, { transcript });
      },
      () => {},
    )
    .finally(() => {
      if (pending.get(id) !== token) return;
      pending.delete(id);
      if (!entries.has(id)) transcriptWrites.delete(id);
    });
}

export function clearSessionDetailCache(): void {
  generation += 1;
  entries.clear();
  transcriptWrites.clear();
  pending.clear();
}
