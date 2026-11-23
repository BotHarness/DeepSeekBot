import { createHash } from 'node:crypto';

export const READ_CURSOR_MAX_CHARS = 2048;
export const READ_PAGE_MAX_BYTES = 64 * 1024;

export type ReadContinuationCode =
  | 'changed-read-target'
  | 'stale-read-revision'
  | 'invalid-read-cursor';

export class ReadContinuationError extends Error {
  constructor(
    readonly code: ReadContinuationCode,
    message: string,
  ) {
    super(message);
    this.name = 'ReadContinuationError';
  }
}

type CursorFields = Record<string, string | number>;

function digest(kind: string, fields: CursorFields): string {
  const canonical = JSON.stringify(
    Object.keys(fields)
      .sort()
      .map((key) => [key, fields[key]]),
  );
  return createHash('sha256')
    .update(`botharness-read-cursor-v1\0${kind}\0${canonical}`)
    .digest('base64url')
    .slice(0, 22);
}

export function encodeReadCursor(kind: string, fields: CursorFields): string {
  return Buffer.from(
    JSON.stringify({ v: 1, k: kind, f: fields, d: digest(kind, fields) }),
    'utf8',
  ).toString('base64url');
}

export function decodeReadCursor(kind: string, cursor: unknown): Record<string, unknown> {
  const invalid = () =>
    new ReadContinuationError(
      'invalid-read-cursor',
      'The read cursor is malformed or was altered.',
    );
  if (
    typeof cursor !== 'string' ||
    cursor.length === 0 ||
    cursor.length > READ_CURSOR_MAX_CHARS ||
    !/^[A-Za-z0-9_-]+$/u.test(cursor)
  )
    throw invalid();
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalid();
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw invalid();
  const { v, k, f, d } = parsed as Record<string, unknown>;
  if (v !== 1 || k !== kind || typeof f !== 'object' || f === null || Array.isArray(f))
    throw invalid();
  const fields = f as Record<string, unknown>;
  if (
    Object.values(fields).some(
      (value) =>
        typeof value !== 'string' && !(typeof value === 'number' && Number.isSafeInteger(value)),
    ) ||
    d !== digest(kind, fields as CursorFields)
  )
    throw invalid();
  return fields;
}

export function boundedByBytes<T>(items: readonly T[], maxBytes = READ_PAGE_MAX_BYTES): T[] {
  const kept: T[] = [];
  let bytes = 0;
  for (const item of items) {
    const size = Buffer.byteLength(JSON.stringify(item) ?? '', 'utf8') + 1;
    if (kept.length > 0 && bytes + size > maxBytes) break;
    kept.push(item);
    bytes += size;
  }
  return kept;
}
