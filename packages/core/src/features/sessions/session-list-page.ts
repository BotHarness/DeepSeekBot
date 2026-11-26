import { HOST_SESSION_PAGE_MAX } from '@botharness/host-protocol/host-sessions';

export type SessionPageKey = { clock: number; updatedAt: number; sessionId: string };

export function compareSessionKeys(a: SessionPageKey, b: SessionPageKey): number {
  return b.clock - a.clock || b.updatedAt - a.updatedAt || a.sessionId.localeCompare(b.sessionId);
}

export function encodeSessionCursor(key: SessionPageKey): string {
  return JSON.stringify([key.clock, key.updatedAt, key.sessionId]);
}

export function decodeSessionCursor(value: unknown): SessionPageKey | undefined | 'invalid' {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > 512) return 'invalid';
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      Array.isArray(parsed) &&
      parsed.length === 3 &&
      Number.isFinite(parsed[0]) &&
      Number.isFinite(parsed[1]) &&
      typeof parsed[2] === 'string'
    )
      return { clock: parsed[0], updatedAt: parsed[1], sessionId: parsed[2] };
  } catch {
    return 'invalid';
  }
  return 'invalid';
}

export function sessionPageLimit(value: unknown): number | undefined | 'invalid' {
  if (value === undefined) return undefined;
  return Number.isInteger(value) &&
    (value as number) >= 1 &&
    (value as number) <= HOST_SESSION_PAGE_MAX
    ? (value as number)
    : 'invalid';
}

export function sessionPage<T>(
  sorted: readonly T[],
  key: (row: T) => SessionPageKey,
  after: SessionPageKey | undefined,
  limit: number | undefined,
): { rows: T[]; nextCursor?: string } {
  const start =
    after === undefined ? 0 : sorted.findIndex((row) => compareSessionKeys(key(row), after) > 0);
  const rest = start === -1 ? [] : sorted.slice(start);
  if (limit === undefined || rest.length <= limit) return { rows: [...rest] };
  const rows = rest.slice(0, limit);
  return { rows, nextCursor: encodeSessionCursor(key(rows[rows.length - 1]!)) };
}
