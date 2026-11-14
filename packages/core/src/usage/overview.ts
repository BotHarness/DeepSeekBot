import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';

export const usageOverviewPeriodDays = { today: 1, week: 7, month: 28, quarter: 84 } as const;
export type UsageOverviewPeriod = keyof typeof usageOverviewPeriodDays;
export const usageOverviewPeriods = Object.keys(usageOverviewPeriodDays) as UsageOverviewPeriod[];
export function isUsageOverviewPeriod(value: unknown): value is UsageOverviewPeriod {
  return typeof value === 'string' && Object.hasOwn(usageOverviewPeriodDays, value);
}
export interface UsageOverviewBuckets {
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  totalTokens: number | null;
  partial: boolean;
}
export interface UsageOverviewResult {
  period: UsageOverviewPeriod;
  start: string;
  end: string;
  timezone: string;
  nextRefreshAt: string;
  totals: UsageOverviewBuckets;
  days: Array<UsageOverviewBuckets & { day: string }>;
  bots: Array<UsageOverviewBuckets & { slug: string }>;
  nextCursor?: string;
  freshness: 'ready' | 'reconciling' | 'degraded';
  readAt: string;
  reconciledAt: string | null;
  legacyBaseline: boolean;
}
function dayOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export const usageOverviewColumns = [
  ...[
    ['input_tokens', 'unknown_input', 'inputTokens'],
    ['output_tokens', 'unknown_output', 'outputTokens'],
    ['cache_read_tokens', 'unknown_cache_read', 'cacheReadTokens'],
    ['cache_write_tokens', 'unknown_cache_write', 'cacheWriteTokens'],
    [
      'CASE WHEN unknown_total > 0 THEN MAX(total_tokens, input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) ELSE total_tokens END',
      'unknown_total',
      'totalTokens',
    ],
  ].map(
    ([value, unknown, alias]) =>
      `CASE WHEN COALESCE(SUM(${value}), 0) = 0 AND SUM(${unknown}) > 0 THEN NULL ELSE COALESCE(SUM(${value}), 0) END AS ${alias}`,
  ),
  'COALESCE(SUM(unknown_total), 0) > 0 AS partial',
].join(', ');
type Row = Omit<UsageOverviewBuckets, 'partial'> & { partial: number };
function bucketsOf<T extends Row>(row: T): Omit<T, 'partial'> & { partial: boolean } {
  return { ...row, partial: row.partial > 0 };
}
const empty: UsageOverviewBuckets = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 0,
  partial: false,
};
export function queryOverviewUsage(
  db: DatabaseSync,
  period: UsageOverviewPeriod,
  after: string | undefined,
  now: Date,
  freshness: Pick<UsageOverviewResult, 'freshness' | 'reconciledAt'>,
  botSlugs?: readonly string[],
): UsageOverviewResult {
  const scope = botSlugs === undefined ? '' : ` AND bot_slug IN (SELECT value FROM json_each(?))`;
  const scopeArgs = botSlugs === undefined ? [] : [JSON.stringify(botSlugs)];
  const end = dayOf(now);
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  date.setDate(date.getDate() - (usageOverviewPeriodDays[period] - 1));
  const days: string[] = [];
  do {
    days.push(dayOf(date));
    date.setDate(date.getDate() + 1);
  } while (days.at(-1) !== end);
  const start = days[0]!;
  const totals = bucketsOf(
    db
      .prepare(
        `SELECT ${usageOverviewColumns} FROM usage_daily WHERE day >= ? AND day <= ?${scope}`,
      )
      .get(start, end, ...scopeArgs) as unknown as Row,
  );
  const daily = db
    .prepare(
      `SELECT day, ${usageOverviewColumns} FROM usage_daily WHERE day >= ? AND day <= ?${scope} GROUP BY day ORDER BY day`,
    )
    .all(start, end, ...scopeArgs)
    .map((row) => bucketsOf(row as unknown as Row & { day: string }));
  const bots = db
    .prepare(
      `SELECT bot_slug AS slug, ${usageOverviewColumns} FROM usage_daily WHERE day >= ? AND day <= ?${scope} AND bot_slug > ? GROUP BY bot_slug ORDER BY bot_slug LIMIT 21`,
    )
    .all(start, end, ...scopeArgs, after ?? '')
    .map((row) => bucketsOf(row as unknown as Row & { slug: string }));
  return {
    period,
    start,
    end,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    nextRefreshAt: date.toISOString(),
    totals,
    days: days.map((day) => daily.find((row) => row.day === day) ?? { ...empty, day }),
    bots: bots.slice(0, 20),
    ...(bots.length > 20 ? { nextCursor: bots[19]!.slug } : {}),
    legacyBaseline: db.prepare('SELECT 1 FROM usage_legacy_baselines LIMIT 1').get() !== undefined,
    readAt: now.toISOString(),
    ...freshness,
  };
}

export interface UsageByMemberResult {
  period: UsageOverviewPeriod;
  start: string;
  end: string;
  timezone: string;
  legacy: boolean;
  members: Array<{
    humanId: string;
    displayName: string;
    deleted?: true;
    totals: UsageOverviewBuckets;
    bots: Array<{ slug: string; displayName: string; totals: UsageOverviewBuckets }>;
  }>;
}
const bucketRow = z.object({
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  cacheReadTokens: z.number().nullable(),
  cacheWriteTokens: z.number().nullable(),
  totalTokens: z.number().nullable(),
  partial: z.coerce.boolean(),
});
export function queryUsageByMember(
  db: DatabaseSync,
  period: UsageOverviewPeriod,
  now: Date,
  ownerId: string,
  botName: (slug: string) => string,
): UsageByMemberResult {
  const end = dayOf(now);
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  date.setDate(date.getDate() - usageOverviewPeriodDays[period] + 1);
  const start = dayOf(date);
  const source = `(SELECT *, COALESCE(NULLIF(human_id, ''), ?) AS member_id FROM usage_daily WHERE day >= ? AND day <= ?)`;
  const members = z
    .array(bucketRow.extend({ humanId: z.string() }))
    .parse(
      db
        .prepare(
          `SELECT member_id AS humanId, ${usageOverviewColumns} FROM ${source} GROUP BY member_id ORDER BY member_id`,
        )
        .all(ownerId, start, end),
    );
  const bots = z
    .array(bucketRow.extend({ humanId: z.string(), slug: z.string() }))
    .parse(
      db
        .prepare(
          `SELECT member_id AS humanId, bot_slug AS slug, ${usageOverviewColumns} FROM ${source} GROUP BY member_id, bot_slug ORDER BY member_id, bot_slug`,
        )
        .all(ownerId, start, end),
    );
  const names = new Map(
    z
      .array(z.object({ humanId: z.string(), displayName: z.string() }))
      .parse(
        db.prepare('SELECT human_id AS humanId, display_name AS displayName FROM humans').all(),
      )
      .map((row) => [row.humanId, row.displayName]),
  );
  const memberBots = new Map<string, UsageByMemberResult['members'][number]['bots']>();
  for (const { humanId, slug, ...totals } of bots) {
    let group = memberBots.get(humanId);
    if (!group) {
      group = [];
      memberBots.set(humanId, group);
    }
    group.push({ slug, displayName: botName(slug), totals });
  }
  return {
    period,
    start,
    end,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    legacy:
      db
        .prepare('SELECT 1 FROM usage_daily WHERE day >= ? AND day <= ? AND legacy = 1 LIMIT 1')
        .get(start, end) !== undefined,
    members: members.map(({ humanId, ...totals }) => ({
      humanId,
      displayName: names.get(humanId) ?? humanId,
      ...(names.has(humanId) ? {} : { deleted: true as const }),
      totals,
      bots: memberBots.get(humanId) ?? [],
    })),
  };
}
