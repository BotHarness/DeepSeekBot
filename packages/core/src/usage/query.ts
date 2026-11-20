import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { z } from 'zod';

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  });
export const usageFilterSchema = z
  .object({
    start: day,
    end: day,
    model: z.string().trim().min(1).max(256).optional(),
    provider: z.string().trim().min(1).max(256).optional(),
    purpose: z.enum(['orchestrator', 'assignment', 'subagent']).optional(),
  })
  .strict()
  .refine((filter) => {
    const days = (Date.parse(filter.end) - Date.parse(filter.start)) / 86_400_000;
    return days >= 0 && days < 182;
  });
export type UsageFilter = z.infer<typeof usageFilterSchema>;
export interface UsageQueryRow {
  day: string;
  purpose: string;
  model: string;
  provider: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  totalTokens: number | null;
}
export interface UsageQueryResult {
  filter: UsageFilter;
  rows: UsageQueryRow[];
  periodTotal: number | null;
  allTimeTotal: number | null;
  periodRecords: number;
  allTimeRecords: number;
  models: string[];
  providers: string[];
  facetsTruncated: boolean;
  truncated: boolean;
  freshness: 'ready' | 'reconciling' | 'degraded';
  readAt: string;
  reconciledAt: string | null;
  legacyBaseline: boolean;
}

export function queryUsage(
  connection: DatabaseSync,
  botSlug: string,
  filter: UsageFilter,
  freshness: Pick<UsageQueryResult, 'freshness' | 'readAt' | 'reconciledAt'>,
): UsageQueryResult {
  const conditions = ['bot_slug = ?'];
  const parameters: SQLInputValue[] = [botSlug];
  for (const key of ['provider', 'model', 'purpose'] as const) {
    if (filter[key] !== undefined) {
      conditions.push(`${key} = ?`);
      parameters.push(filter[key]);
    }
  }
  const allWhere = conditions.join(' AND ');
  const periodWhere = `${allWhere} AND day >= ? AND day <= ?`;
  const periodParameters = [...parameters, filter.start, filter.end];
  const total = (where: string, params: SQLInputValue[]) =>
    connection
      .prepare(
        `SELECT COUNT(DISTINCT json_array(day, purpose, provider, model)) AS records, CASE WHEN SUM(unknown_total) > 0 THEN NULL ELSE COALESCE(SUM(total_tokens), 0) END AS tokens FROM usage_daily WHERE ${where}`,
      )
      .get(...params) as { records: number; tokens: number | null };
  const period = total(periodWhere, periodParameters);
  const allTime = total(allWhere, parameters);
  const nullable = (column: string, unknown: string, alias: string) =>
    `CASE WHEN SUM(${unknown}) > 0 THEN NULL ELSE SUM(${column}) END AS ${alias}`;
  const rows = connection
    .prepare(`SELECT day, purpose, provider, model,
    ${nullable('input_tokens', 'unknown_input', 'inputTokens')},
    ${nullable('output_tokens', 'unknown_output', 'outputTokens')},
    ${nullable('cache_read_tokens', 'unknown_cache_read', 'cacheReadTokens')},
    ${nullable('cache_write_tokens', 'unknown_cache_write', 'cacheWriteTokens')},
    ${nullable('total_tokens', 'unknown_total', 'totalTokens')}
    FROM usage_daily WHERE ${periodWhere}
    GROUP BY day, purpose, provider, model ORDER BY day, purpose, provider, model LIMIT 2001`)
    .all(...periodParameters) as unknown as UsageQueryRow[];
  const facets = (column: 'model' | 'provider') =>
    connection
      .prepare(
        `SELECT DISTINCT ${column} AS value FROM usage_daily WHERE bot_slug = ? ORDER BY ${column} LIMIT 1001`,
      )
      .all(botSlug) as Array<{ value: string }>;
  const models = facets('model');
  const providers = facets('provider');
  const legacyBaseline =
    connection.prepare('SELECT 1 FROM usage_legacy_baselines WHERE bot_slug = ?').get(botSlug) !==
    undefined;
  return {
    filter,
    rows: rows.slice(0, 2000),
    periodTotal: period.tokens,
    allTimeTotal: allTime.tokens,
    periodRecords: period.records,
    allTimeRecords: allTime.records,
    models: models.slice(0, 1000).map((row) => row.value),
    providers: providers.slice(0, 1000).map((row) => row.value),
    facetsTruncated: models.length > 1000 || providers.length > 1000,
    truncated: rows.length > 2000,
    legacyBaseline,
    ...freshness,
  };
}
