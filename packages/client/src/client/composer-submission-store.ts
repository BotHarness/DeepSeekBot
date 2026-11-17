import type { ChannelAttachmentRef } from './store.js';
import { isChannelAttachmentRef } from '../../../core/src/attachments/ref.js';

export type SubmissionState = 'pending' | 'failed' | 'unknown' | 'sent' | 'restored';

export interface SubmissionToken {
  label: string;
  start: number;
  end: number;
}
export interface SubmissionAttempt {
  id: string;
  at: string;
  text: string;
  mentions: (SubmissionToken & { botSlug: string })[];
  channelRefs: (SubmissionToken & { channelId: string })[];
  replyTo?: string;
  quotes?: { messageId: string; text?: string }[];
  attachments?: ChannelAttachmentRef[];
  state: SubmissionState;
  error?: string;
}
export interface SubmissionSnapshot {
  attempts: readonly SubmissionAttempt[];
  error: 'unavailable' | 'corrupt' | 'quota' | undefined;
}

export const SUBMISSION_PREFIX = 'botharness.submissions.v1:';
export const SUBMISSION_HISTORY_LIMIT = 100;
export const SUBMISSION_HISTORY_BYTES = 262_144;
const MAX_RECORD_BYTES = 1_048_576;
const STALE_PENDING_MS = 30_000;

const settled = (state: SubmissionState): boolean => state === 'sent' || state === 'restored';

function parse(raw: string): SubmissionAttempt[] {
  if (raw.length > MAX_RECORD_BYTES) throw new Error();
  const source = JSON.parse(raw) as { version?: unknown; attempts?: unknown };
  if (source.version !== 1 || !Array.isArray(source.attempts)) throw new Error();
  return source.attempts.map((entry): SubmissionAttempt => {
    const item = entry as Record<string, unknown>;
    const text = item['text'];
    const state = item['state'];
    if (
      typeof item['id'] !== 'string' ||
      typeof item['at'] !== 'string' ||
      typeof text !== 'string' ||
      !['pending', 'failed', 'unknown', 'sent', 'restored'].includes(state as string) ||
      !Array.isArray(item['mentions']) ||
      !Array.isArray(item['channelRefs'])
    )
      throw new Error();
    const tokens = <Key extends string>(
      value: unknown[],
      marker: string,
      key: Key,
    ): (SubmissionToken & Record<Key, string>)[] =>
      value.map((raw) => {
        const token = raw as Record<string, unknown>;
        const start = token['start'];
        const end = token['end'];
        const label = token['label'];
        const target = token[key];
        if (
          typeof start !== 'number' ||
          typeof end !== 'number' ||
          typeof label !== 'string' ||
          typeof target !== 'string' ||
          text.slice(start, end) !== marker + label
        )
          throw new Error();
        return { label, start, end, [key]: target } as SubmissionToken & Record<Key, string>;
      });
    const attachments = item['attachments'];
    if (
      attachments !== undefined &&
      (!Array.isArray(attachments) || !attachments.every((ref) => isChannelAttachmentRef(ref)))
    )
      throw new Error();
    const quotes = item['quotes'];
    if (
      quotes !== undefined &&
      (!Array.isArray(quotes) ||
        !quotes.every((quote) => {
          const record = quote as Record<string, unknown> | null;
          return (
            typeof record === 'object' &&
            record !== null &&
            typeof record['messageId'] === 'string' &&
            (record['text'] === undefined || typeof record['text'] === 'string')
          );
        }))
    )
      throw new Error();
    return {
      id: item['id'],
      at: item['at'],
      text,
      mentions: tokens(item['mentions'], '@', 'botSlug'),
      channelRefs: tokens(item['channelRefs'], '#', 'channelId'),
      state: state as SubmissionState,
      ...(typeof item['replyTo'] === 'string' ? { replyTo: item['replyTo'] } : {}),
      ...(quotes === undefined ? {} : { quotes: quotes as { messageId: string; text?: string }[] }),
      ...(attachments === undefined ? {} : { attachments: attachments as ChannelAttachmentRef[] }),
      ...(typeof item['error'] === 'string' ? { error: item['error'] } : {}),
    };
  });
}

function trim(attempts: SubmissionAttempt[]): SubmissionAttempt[] {
  const encoder = new TextEncoder();
  let kept = 0;
  let bytes = 0;
  const keep = new Set<SubmissionAttempt>();
  for (let index = attempts.length - 1; index >= 0; index--) {
    const attempt = attempts[index]!;
    if (!settled(attempt.state)) {
      keep.add(attempt);
      continue;
    }
    const size = encoder.encode(JSON.stringify(attempt)).byteLength;
    if (kept >= SUBMISSION_HISTORY_LIMIT || bytes + size > SUBMISSION_HISTORY_BYTES) continue;
    kept += 1;
    bytes += size;
    keep.add(attempt);
  }
  return attempts.filter((attempt) => keep.has(attempt));
}

export class ComposerSubmissionStore {
  private readonly memory = new Map<string, SubmissionAttempt[]>();
  private readonly errors = new Map<string, SubmissionSnapshot['error']>();
  private readonly snapshots = new Map<string, SubmissionSnapshot>();
  private readonly inFlight = new Set<string>();
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | undefined,
    private readonly now: () => number = Date.now,
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private load(scope: string): SubmissionAttempt[] {
    const held = this.memory.get(scope) ?? [];
    let stored: SubmissionAttempt[] = [];
    let error: SubmissionSnapshot['error'];
    try {
      if (this.storage === undefined) error = 'unavailable';
      else {
        const raw = this.storage.getItem(SUBMISSION_PREFIX + scope);
        if (raw !== null) stored = parse(raw);
      }
    } catch {
      error = 'corrupt';
    }
    const byId = new Map(stored.map((attempt) => [attempt.id, attempt]));
    for (const attempt of held) byId.set(attempt.id, attempt);
    if (error !== undefined) this.errors.set(scope, error);
    else if (this.errors.get(scope) !== 'quota') this.errors.delete(scope);
    return [...byId.values()].sort((left, right) => left.at.localeCompare(right.at));
  }

  private commit(scope: string, attempts: SubmissionAttempt[]): boolean {
    const next = trim(attempts);
    let error: SubmissionSnapshot['error'];
    if (this.errors.get(scope) === 'corrupt') error = 'corrupt';
    else if (this.storage === undefined) error = 'unavailable';
    else {
      try {
        const raw = JSON.stringify({ version: 1, attempts: next });
        if (new TextEncoder().encode(raw).byteLength > MAX_RECORD_BYTES) throw new Error();
        this.storage.setItem(SUBMISSION_PREFIX + scope, raw);
      } catch {
        error = 'quota';
      }
    }
    if (error === undefined) {
      this.errors.delete(scope);
      this.memory.delete(scope);
    } else {
      this.errors.set(scope, error);
      this.memory.set(scope, next);
    }
    this.snapshots.delete(scope);
    for (const listener of this.listeners) listener();
    return error === undefined;
  }

  sync(scope: string): void {
    this.snapshots.delete(scope);
    for (const listener of this.listeners) listener();
  }

  read(scope: string): SubmissionSnapshot {
    const cached = this.snapshots.get(scope);
    if (cached !== undefined) return cached;
    const attempts = this.load(scope).map((attempt) =>
      attempt.state === 'pending' && !this.inFlight.has(attempt.id)
        ? { ...attempt, state: 'unknown' as const }
        : attempt,
    );
    const snapshot = { attempts, error: this.errors.get(scope) };
    this.snapshots.set(scope, snapshot);
    return snapshot;
  }

  reconcilable(scope: string): SubmissionAttempt[] {
    const now = this.now();
    return this.load(scope).filter(
      (attempt) =>
        attempt.state === 'unknown' ||
        (attempt.state === 'pending' &&
          !this.inFlight.has(attempt.id) &&
          now - Date.parse(attempt.at) >= STALE_PENDING_MS),
    );
  }

  record(scope: string, attempt: Omit<SubmissionAttempt, 'state'>): boolean {
    this.inFlight.add(attempt.id);
    const attempts = this.load(scope).filter((existing) => existing.id !== attempt.id);
    return this.commit(scope, [...attempts, { ...attempt, state: 'pending' }]);
  }

  settle(scope: string, id: string, state: SubmissionState, error?: string): boolean {
    this.inFlight.delete(id);
    const attempts = this.load(scope);
    if (!attempts.some((attempt) => attempt.id === id)) return true;
    return this.commit(
      scope,
      attempts.map((attempt) => {
        if (attempt.id !== id) return attempt;
        const { error: _previous, ...rest } = attempt;
        return { ...rest, state, ...(error === undefined ? {} : { error }) };
      }),
    );
  }

  discard(scope: string, id: string): void {
    this.inFlight.delete(id);
    const attempts = this.load(scope);
    if (attempts.some((attempt) => attempt.id === id))
      this.commit(
        scope,
        attempts.filter((attempt) => attempt.id !== id),
      );
  }
}

export function recallEntries(attempts: readonly SubmissionAttempt[]): SubmissionAttempt[] {
  const entries: SubmissionAttempt[] = [];
  for (let index = attempts.length - 1; index >= 0; index--) {
    const attempt = attempts[index]!;
    if (attempt.text === '' || entries.at(-1)?.text === attempt.text) continue;
    entries.push(attempt);
  }
  return entries;
}

export interface RecallCursor {
  index: number;
  text: string;
}
export type RecallStep =
  | { kind: 'ignore' }
  | { kind: 'stay' }
  | { kind: 'restore' }
  | { kind: 'show'; cursor: RecallCursor; entry: SubmissionAttempt };

export function stepRecall(
  cursor: RecallCursor | undefined,
  direction: 'older' | 'newer',
  draft: string,
  entries: readonly SubmissionAttempt[],
): RecallStep {
  const active = cursor !== undefined && cursor.text === draft ? cursor : undefined;
  if (active === undefined && (direction !== 'older' || draft !== '' || entries.length === 0))
    return { kind: 'ignore' };
  const index = (active?.index ?? -1) + (direction === 'older' ? 1 : -1);
  if (index < 0) return { kind: 'restore' };
  const entry = entries[index];
  return entry === undefined
    ? { kind: 'stay' }
    : { kind: 'show', cursor: { index, text: entry.text }, entry };
}
