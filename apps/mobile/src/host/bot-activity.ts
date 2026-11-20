import {
  parseProfileActivity as parseActivity,
  readProfileActivity,
} from '@botharness/host-client/profile-activity';
import type { WireProfileActivity } from '@botharness/host-protocol/wire';
import type { HostClient } from '@botharness/host-client/client';
import { shiftDay, trailingDays, weekStart } from './usage-days';
import type {
  ProfileActivity,
  ProfileActivityDay,
  ProfileActivityTokensDay,
  ProfileModelUsageRow,
} from '@botharness/host-protocol/wire';

export const ACTIVITY_WINDOWS = [1, 4, 26] as const;
export type ActivityWindow = (typeof ACTIVITY_WINDOWS)[number];

const WEEKLY_AFTER_DAYS = 31;

function activityView(activity: WireProfileActivity): ProfileActivity {
  const {
    slug: _slug,
    since: _since,
    tokenTotals: _total,
    idleCompactions: _idleCompactions,
    ...days
  } = activity;
  return {
    ...days,
    modelUsageRows: days.modelUsageRows ?? [],
    modelUsageStatus: days.modelUsageStatus ?? 'unavailable',
  };
}

export function parseProfileActivity(value: unknown): ProfileActivity {
  return activityView(parseActivity(value));
}

export async function loadProfileActivity(
  client: HostClient,
  channelId: string,
  window: { weeks: number; before?: string },
): Promise<ProfileActivity> {
  return activityView(await readProfileActivity(client, { channelId, ...window }));
}

export type TokenTotal =
  | { status: 'ready' | 'partial'; total: number }
  | { status: 'unknown' | 'unavailable'; total: null };

export function tokenTotal(
  activity: Pick<ProfileActivity, 'modelUsageStatus'>,
  rows: readonly ProfileModelUsageRow[],
): TokenTotal {
  if (activity.modelUsageStatus !== 'ready') return { status: 'unavailable', total: null };
  if (rows.length > 0 && rows.every((row) => row.totalTokens === null))
    return { status: 'unknown', total: null };
  const partial = rows.some((row) => row.partial === true || row.totalTokens === null);
  const total = rows.reduce((sum, row) => sum + (row.totalTokens ?? 0), 0);
  if (total === 0 && rows.some((row) => row.totalTokens === null))
    return { status: 'unknown', total: null };
  return { status: partial ? 'partial' : 'ready', total };
}

function lastDay(activity: ProfileActivity): string {
  return activity.before === undefined ? activity.today : shiftDay(activity.before, -1);
}

function sumByDay(entries: readonly ProfileActivityDay[]): Map<string, number> {
  const sums = new Map<string, number>();
  for (const entry of entries) sums.set(entry.day, (sums.get(entry.day) ?? 0) + entry.count);
  return sums;
}

export interface WeekGlance {
  days: string[];
  tokens: number[];
  activity: number[];
  total: TokenTotal;
  quiet: boolean;
}

export function weekGlance(activity: ProfileActivity): WeekGlance {
  const days = trailingDays(lastDay(activity), 7);
  const inWeek = new Set(days);
  const rows = activity.modelUsageRows.filter((row) => inWeek.has(row.day));
  const tokens = sumByDay(rows.map((row) => ({ day: row.day, count: row.totalTokens ?? 0 })));
  const events = sumByDay(activity.events);
  const commits = sumByDay(activity.memoryCommits);
  const glance = {
    days,
    tokens: days.map((day) => tokens.get(day) ?? 0),
    activity: days.map((day) => (events.get(day) ?? 0) + (commits.get(day) ?? 0)),
    total: tokenTotal(activity, rows),
  };
  return {
    ...glance,
    quiet: rows.length === 0 && glance.activity.every((value) => value === 0),
  };
}

export interface TokenSplit {
  cached: number;
  uncached: number;
  output: number;
}

export interface UsageBucket {
  key: string;
  first: string;
  last: string;
  split: TokenSplit;
  events: number;
}

export interface ModelUsage {
  key: string;
  provider: string;
  model: string;
  input: number | null;
  output: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  total: number | null;
}

export interface ReasonCount {
  reason: string;
  count: number;
}

export interface ActivityDetail {
  first: string;
  last: string;
  weekly: boolean;
  buckets: UsageBucket[];
  split: TokenSplit;
  total: TokenTotal;
  models: ModelUsage[];
  events: number;
  reasons: ReasonCount[];
  commits: number;
  commitDays: Map<string, number>;
}

function addNullable(left: number | null, right: number | null): number | null {
  return left === null || right === null ? null : left + right;
}

export function activityDetail(activity: ProfileActivity): ActivityDetail {
  const last = lastDay(activity);
  const days = trailingDays(last, activity.weeks * 7);
  const first = days[0] ?? last;
  const within = (day: string) => day >= first && day <= last;
  const weekly = days.length > WEEKLY_AFTER_DAYS;
  const bucketOf = (day: string) => (weekly ? weekStart(day) : day);
  const buckets = new Map<string, UsageBucket>();
  for (const day of days) {
    const key = bucketOf(day);
    const bucket = buckets.get(key);
    if (bucket === undefined)
      buckets.set(key, {
        key,
        first: day,
        last: day,
        split: { cached: 0, uncached: 0, output: 0 },
        events: 0,
      });
    else bucket.last = day;
  }
  const split: TokenSplit = { cached: 0, uncached: 0, output: 0 };
  for (const entry of activity.tokens) {
    if (!within(entry.day)) continue;
    const bucket = buckets.get(bucketOf(entry.day));
    for (const target of bucket === undefined ? [split] : [split, bucket.split]) {
      target.cached += entry.cacheReadTokens;
      target.uncached += entry.inputTokens + entry.cacheWriteTokens;
      target.output += entry.outputTokens;
    }
  }
  const reasons = new Map<string, number>();
  let events = 0;
  for (const entry of activity.events) {
    if (!within(entry.day)) continue;
    events += entry.count;
    reasons.set(entry.reason, (reasons.get(entry.reason) ?? 0) + entry.count);
    const bucket = buckets.get(bucketOf(entry.day));
    if (bucket !== undefined) bucket.events += entry.count;
  }
  const rows = activity.modelUsageRows.filter((row) => within(row.day));
  const models = new Map<string, ModelUsage>();
  for (const row of rows) {
    const key = `${row.provider}/${row.model}`;
    const current = models.get(key);
    models.set(
      key,
      current === undefined
        ? {
            key,
            provider: row.provider,
            model: row.model,
            input: row.inputTokens,
            output: row.outputTokens,
            cacheRead: row.cacheReadTokens,
            cacheWrite: row.cacheWriteTokens,
            total: row.totalTokens,
          }
        : {
            ...current,
            input: addNullable(current.input, row.inputTokens),
            output: addNullable(current.output, row.outputTokens),
            cacheRead: addNullable(current.cacheRead, row.cacheReadTokens),
            cacheWrite: addNullable(current.cacheWrite, row.cacheWriteTokens),
            total: addNullable(current.total, row.totalTokens),
          },
    );
  }
  const commitDays = sumByDay(activity.memoryCommits.filter((entry) => within(entry.day)));
  return {
    first,
    last,
    weekly,
    buckets: [...buckets.values()],
    split,
    total: tokenTotal(activity, rows),
    models: [...models.values()].sort((left, right) => (right.total ?? 0) - (left.total ?? 0)),
    events,
    reasons: [...reasons]
      .map(([reason, value]) => ({ reason, count: value }))
      .sort((left, right) => right.count - left.count),
    commits: [...commitDays.values()].reduce((sum, value) => sum + value, 0),
    commitDays,
  };
}

export function olderWindow(activity: ProfileActivity): string {
  return shiftDay(lastDay(activity), 1 - activity.weeks * 7);
}

export function newerWindow(activity: ProfileActivity): string | undefined {
  if (activity.before === undefined) return undefined;
  const next = shiftDay(activity.before, activity.weeks * 7);
  return next > activity.today ? undefined : next;
}
