import { HostAnswerInvalid, record, type HostCall } from './host-answer';
import type {
  OverviewMemory,
  OverviewUsage,
  UsageBuckets,
  UsagePeriod,
} from '@botharness/host-protocol/wire';

export type { OverviewMemory, OverviewUsage, UsagePeriod } from '@botharness/host-protocol/wire';

export interface UsageDay {
  day: string;
  end?: string;
  tokens: number | null;
  partial?: boolean;
}

export interface UsageWeek {
  total: number | null;
  partial: boolean;
  days: UsageDay[];
}

export type UsageSplitKey = 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens';

export const USAGE_SPLIT: readonly UsageSplitKey[] = [
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
];

const PERIOD_DAYS: Record<UsagePeriod, number> = {
  today: 1,
  week: 7,
  month: 28,
  quarter: 84,
};
const DAY = 86_400_000;

function validDay(input: unknown): input is string {
  return (
    typeof input === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/u.test(input) &&
    Number.isFinite(Date.parse(input)) &&
    new Date(input).toISOString().slice(0, 10) === input
  );
}

function instant(input: unknown): boolean {
  return typeof input === 'string' && Number.isFinite(Date.parse(input));
}

function count(input: unknown): input is number {
  return Number.isSafeInteger(input) && Number(input) >= 0;
}

function buckets(input: unknown): boolean {
  const row = record(input);
  return (
    row !== undefined &&
    ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'totalTokens'].every(
      (key) => row[key] === null || count(row[key]),
    ) &&
    (row['partial'] === undefined || typeof row['partial'] === 'boolean')
  );
}

function cursor(input: unknown): boolean {
  return input === undefined || (typeof input === 'string' && input.length > 0);
}

export function parseOverviewUsage(input: unknown, period: UsagePeriod): OverviewUsage {
  const value = record(input);
  if (
    value === undefined ||
    value['period'] !== period ||
    typeof value['timezone'] !== 'string' ||
    !instant(value['readAt']) ||
    !instant(value['nextRefreshAt']) ||
    !validDay(value['start']) ||
    !validDay(value['end']) ||
    Date.parse(value['end']) - Date.parse(value['start']) !== (PERIOD_DAYS[period] - 1) * DAY ||
    !buckets(value['totals']) ||
    !Array.isArray(value['days']) ||
    value['days'].length !== PERIOD_DAYS[period] ||
    !value['days'].every((row) => buckets(row) && typeof record(row)?.['day'] === 'string') ||
    !Array.isArray(value['bots']) ||
    value['bots'].length > 20 ||
    !value['bots'].every(
      (row) =>
        buckets(row) &&
        typeof record(row)?.['slug'] === 'string' &&
        typeof record(row)?.['displayName'] === 'string' &&
        typeof record(row)?.['current'] === 'boolean',
    ) ||
    !cursor(value['nextCursor']) ||
    !['ready', 'reconciling', 'degraded'].includes(String(value['freshness'])) ||
    typeof value['legacyBaseline'] !== 'boolean' ||
    (value['reconciledAt'] !== null && !instant(value['reconciledAt']))
  )
    throw new HostAnswerInvalid('overviewUsage returned an unreadable usage overview.');
  return value as unknown as OverviewUsage;
}

function memoryBot(input: unknown): boolean {
  const row = record(input);
  if (
    row === undefined ||
    typeof row['slug'] !== 'string' ||
    row['slug'].length === 0 ||
    typeof row['displayName'] !== 'string'
  )
    return false;
  if (row['state'] === 'unavailable')
    return row['total'] === undefined && row['counts'] === undefined && row['dirty'] === undefined;
  return (
    row['state'] === 'ready' &&
    count(row['total']) &&
    typeof row['dirty'] === 'boolean' &&
    Array.isArray(row['counts']) &&
    row['counts'].length === 7 &&
    row['counts'].every(count) &&
    row['counts'].reduce((sum: number, part: number) => sum + part, 0) === row['total']
  );
}

export function parseOverviewMemory(input: unknown): OverviewMemory {
  const value = record(input);
  if (
    value === undefined ||
    !validDay(value['start']) ||
    !validDay(value['end']) ||
    !Array.isArray(value['days']) ||
    value['days'].length !== 7 ||
    !value['days'].every(
      (item, index) =>
        validDay(item) && Date.parse(item) === Date.parse(String(value['start'])) + index * DAY,
    ) ||
    value['days'][6] !== value['end'] ||
    typeof value['timezone'] !== 'string' ||
    !instant(value['readAt']) ||
    !instant(value['nextRefreshAt']) ||
    !Array.isArray(value['bots']) ||
    value['bots'].length > 10 ||
    !value['bots'].every(memoryBot) ||
    !cursor(value['nextCursor'])
  )
    throw new HostAnswerInvalid('overviewMemory returned an unreadable Memory overview.');
  return value as unknown as OverviewMemory;
}

export async function loadUsage(
  client: HostCall,
  period: UsagePeriod,
  after?: string,
): Promise<OverviewUsage> {
  return parseOverviewUsage(
    await client.call('overviewUsage', {
      period,
      ...(after === undefined ? {} : { after }),
    }),
    period,
  );
}

export async function loadMoreUsage(
  client: HostCall,
  current: OverviewUsage,
): Promise<OverviewUsage> {
  if (current.nextCursor === undefined) return current;
  const page = await loadUsage(client, current.period, current.nextCursor);
  if (page.start !== current.start || page.end !== current.end)
    return loadUsage(client, current.period);
  return { ...page, bots: appendBySlug(current.bots, page.bots) };
}

export async function loadMemoryActivity(
  client: HostCall,
  after?: string,
): Promise<OverviewMemory> {
  return parseOverviewMemory(
    await client.call('overviewMemory', after === undefined ? {} : { after }),
  );
}

export async function loadMoreMemoryActivity(
  client: HostCall,
  current: OverviewMemory,
): Promise<OverviewMemory> {
  if (current.nextCursor === undefined) return current;
  const page = await loadMemoryActivity(client, current.nextCursor);
  if (page.start !== current.start || page.end !== current.end) return loadMemoryActivity(client);
  return { ...page, bots: appendBySlug(current.bots, page.bots) };
}

function appendBySlug<T extends { slug: string }>(current: readonly T[], next: readonly T[]): T[] {
  const seen = new Set(current.map((row) => row.slug));
  return [...current, ...next.filter((row) => !seen.has(row.slug))];
}

export function usageWeek(usage: OverviewUsage): UsageWeek {
  return {
    total: usage.totals.totalTokens,
    partial: usage.totals.partial === true,
    days: usage.days.map((row) => ({
      day: row.day,
      tokens: row.totalTokens,
      ...(row.partial === true ? { partial: true } : {}),
    })),
  };
}

export function usageChartDays(usage: OverviewUsage): UsageDay[] {
  const days = usageWeek(usage).days;
  if (usage.period !== 'quarter') return days;
  const weeks: UsageDay[] = [];
  for (let offset = 0; offset < days.length; offset += 7) {
    const group = days.slice(offset, offset + 7);
    const first = group[0]!;
    const known = group.filter((day) => day.tokens !== null);
    weeks.push({
      day: first.day,
      end: group[group.length - 1]!.day,
      tokens: known.length === 0 ? null : known.reduce((sum, day) => sum + day.tokens!, 0),
      ...(known.length !== group.length || group.some((day) => day.partial === true)
        ? { partial: true }
        : {}),
    });
  }
  return weeks;
}

export function usageIsPartial(usage: OverviewUsage): boolean {
  const unknown = (row: UsageBuckets) =>
    row.partial === true || Object.values(row).some((value) => value === null);
  return unknown(usage.totals) || usage.days.some(unknown);
}

export function usageShare(tokens: number | null, total: number | null): number | undefined {
  if (tokens === null || total === null || total <= 0) return undefined;
  return Math.round((tokens / total) * 100);
}
