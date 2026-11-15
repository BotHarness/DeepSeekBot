import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';

const tokenDay = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  cacheReadTokens: z.number().int().nonnegative().nullable(),
  cacheWriteTokens: z.number().int().nonnegative().nullable(),
  totalTokens: z.number().int().nonnegative().nullable(),
  reportedTotalTokens: z.number().int().nonnegative(),
  unknownTotalCount: z.number().int().nonnegative(),
});

export type UsageTelemetryDay = z.infer<typeof tokenDay>;

export interface UsageTelemetrySnapshot {
  days: UsageTelemetryDay[];
  isReconciled: boolean;
}

export function queryTokenUsageDays(db: DatabaseSync, now: Date): UsageTelemetryDay[] {
  const day = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const start = new Date(now);
  start.setDate(start.getDate() - 6);
  const bucket = (column: string, unknown: string, alias: string) =>
    `CASE WHEN SUM(${unknown}) > 0 THEN NULL ELSE SUM(${column}) END AS ${alias}`;
  const rows = z.array(tokenDay).parse(
    db
      .prepare(`SELECT day,
      ${bucket('input_tokens', 'unknown_input', 'inputTokens')},
      ${bucket('output_tokens', 'unknown_output', 'outputTokens')},
      ${bucket('cache_read_tokens', 'unknown_cache_read', 'cacheReadTokens')},
      ${bucket('cache_write_tokens', 'unknown_cache_write', 'cacheWriteTokens')},
      ${bucket('total_tokens', 'unknown_total', 'totalTokens')},
      SUM(CASE WHEN unknown_total > 0
        THEN MAX(total_tokens, input_tokens + output_tokens + cache_read_tokens + cache_write_tokens)
        ELSE total_tokens END) AS reportedTotalTokens,
      SUM(unknown_total) AS unknownTotalCount
      FROM usage_daily WHERE day >= ? AND day <= ? GROUP BY day ORDER BY day`)
      .all(day(start), day(now)),
  );
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(date.getDate() + index);
    const key = day(date);
    return (
      rows.find((row) => row.day === key) ?? {
        day: key,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 0,
        reportedTotalTokens: 0,
        unknownTotalCount: 0,
      }
    );
  });
}
