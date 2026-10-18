import { createHash } from 'node:crypto';
import type { PersonaBotRecord } from './persona-bot.js';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}

export function botProfileFingerprint(record: PersonaBotRecord): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(record)))
    .digest('hex');
}
