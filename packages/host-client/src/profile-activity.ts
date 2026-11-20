import type { WireProfileActivity } from '@botharness/host-protocol/wire';
import { answer, count, optional, record, text, type HostCall } from './host-answer';

const dayKey = /^\d{4}-\d{2}-\d{2}$/u;
const buckets = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'] as const;

function isDay(value: unknown): boolean {
  return text(value) && dayKey.test(value) && Number.isFinite(Date.parse(value));
}

function isTokenBuckets(value: unknown): boolean {
  const row = record(value);
  return row !== undefined && buckets.every((key) => count(row[key]));
}

function isDayCount(value: unknown): boolean {
  const row = record(value);
  return row !== undefined && isDay(row['day']) && count(row['count']);
}

function isUsageRow(value: unknown): boolean {
  const row = record(value);
  return (
    row !== undefined &&
    isDay(row['day']) &&
    ['purpose', 'provider', 'model'].every((key) => text(row[key])) &&
    [...buckets, 'totalTokens'].every((key) => row[key] === null || count(row[key])) &&
    optional(row['partial'], (partial) => typeof partial === 'boolean')
  );
}

const sources: ReadonlySet<unknown> = new Set([
  'setting',
  'catalog',
  'observed',
  'default',
  'unknown',
]);

function isIdleCompaction(value: unknown): boolean {
  const row = record(value);
  const outcome = row?.['outcome'];
  return (
    row !== undefined &&
    ['botSlug', 'at', 'provider', 'model'].every((key) => text(row[key])) &&
    ['idleGapMs', 'cacheLifetimeMs', 'tokensBefore'].every((key) => count(row[key])) &&
    ['tokensAfter', 'inputTokens', 'cacheReadTokens', 'outputTokens'].every(
      (key) => row[key] === null || count(row[key]),
    ) &&
    sources.has(row['cacheLifetimeSource']) &&
    (outcome === 'compacted' || outcome === 'nothing' || outcome === 'failed') &&
    optional(row['error'], text)
  );
}

function isProfileActivity(value: unknown): value is WireProfileActivity {
  const row = record(value);
  return (
    text(row?.['slug']) &&
    text(row['since']) &&
    Number.isFinite(Date.parse(row['since'])) &&
    isDay(row['today']) &&
    count(row['weeks']) &&
    row['weeks'] > 0 &&
    optional(row['createdDay'], isDay) &&
    optional(row['before'], isDay) &&
    Array.isArray(row['memoryCommits']) &&
    row['memoryCommits'].every(isDayCount) &&
    Array.isArray(row['events']) &&
    row['events'].every((entry: unknown) => isDayCount(entry) && text(record(entry)?.['reason'])) &&
    Array.isArray(row['tokens']) &&
    row['tokens'].every(
      (entry: unknown) => isDay(record(entry)?.['day']) && isTokenBuckets(entry),
    ) &&
    isTokenBuckets(row['tokenTotals']) &&
    optional(row['modelUsageRows'], (rows) => Array.isArray(rows) && rows.every(isUsageRow)) &&
    optional(
      row['idleCompactions'],
      (rows) => Array.isArray(rows) && rows.every(isIdleCompaction),
    ) &&
    optional(row['modelUsageStatus'], (status) => status === 'ready' || status === 'unavailable')
  );
}

export function parseProfileActivity(value: unknown): WireProfileActivity {
  return answer(value, isProfileActivity, 'profileActivity');
}

export async function readProfileActivity(
  host: HostCall,
  args: { channelId: string; weeks?: number; before?: string },
): Promise<WireProfileActivity> {
  return parseProfileActivity(await host.call('profileActivity', args));
}
