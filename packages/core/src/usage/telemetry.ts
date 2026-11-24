import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { telemetryModelRoute, type TelemetryProviderKind } from '../telemetry/model-route.js';

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

const tokenRouteDay = tokenDay.extend({ provider: z.string(), model: z.string() });

export interface UsageTelemetryModelDay extends UsageTelemetryDay {
  providerKind: TelemetryProviderKind;
  modelId: string;
}

export interface UsageTelemetrySnapshot {
  days: UsageTelemetryDay[];
  models: UsageTelemetryModelDay[];
  isReconciled: boolean;
}

const localDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function windowStart(now: Date): Date {
  const start = new Date(now);
  start.setDate(start.getDate() - 6);
  return start;
}

const bucket = (column: string, unknown: string, alias: string) =>
  `CASE WHEN SUM(${unknown}) > 0 THEN NULL ELSE SUM(${column}) END AS ${alias}`;

const TOKEN_COLUMNS = `
      ${bucket('input_tokens', 'unknown_input', 'inputTokens')},
      ${bucket('output_tokens', 'unknown_output', 'outputTokens')},
      ${bucket('cache_read_tokens', 'unknown_cache_read', 'cacheReadTokens')},
      ${bucket('cache_write_tokens', 'unknown_cache_write', 'cacheWriteTokens')},
      ${bucket('total_tokens', 'unknown_total', 'totalTokens')},
      SUM(CASE WHEN unknown_total > 0
        THEN MAX(total_tokens, input_tokens + output_tokens + cache_read_tokens + cache_write_tokens)
        ELSE total_tokens END) AS reportedTotalTokens,
      SUM(unknown_total) AS unknownTotalCount`;

const sumKnown = (a: number | null, b: number | null) => (a === null || b === null ? null : a + b);

export function queryModelUsageDays(db: DatabaseSync, now: Date): UsageTelemetryModelDay[] {
  const rows = z.array(tokenRouteDay).parse(
    db
      .prepare(`SELECT day, provider, model, ${TOKEN_COLUMNS}
      FROM usage_daily WHERE day >= ? AND day <= ? GROUP BY day, provider, model`)
      .all(localDay(windowStart(now)), localDay(now)),
  );
  const merged = new Map<string, UsageTelemetryModelDay>();
  for (const { provider, model, ...row } of rows) {
    const route = telemetryModelRoute(provider, model);
    const key = JSON.stringify([row.day, route.provider_kind, route.model_id]);
    const previous = merged.get(key);
    merged.set(
      key,
      previous === undefined
        ? { ...row, providerKind: route.provider_kind, modelId: route.model_id }
        : {
            ...previous,
            inputTokens: sumKnown(previous.inputTokens, row.inputTokens),
            outputTokens: sumKnown(previous.outputTokens, row.outputTokens),
            cacheReadTokens: sumKnown(previous.cacheReadTokens, row.cacheReadTokens),
            cacheWriteTokens: sumKnown(previous.cacheWriteTokens, row.cacheWriteTokens),
            totalTokens: sumKnown(previous.totalTokens, row.totalTokens),
            reportedTotalTokens: previous.reportedTotalTokens + row.reportedTotalTokens,
            unknownTotalCount: previous.unknownTotalCount + row.unknownTotalCount,
          },
    );
  }
  return [...merged.values()].sort(
    (a, b) =>
      a.day.localeCompare(b.day) ||
      a.providerKind.localeCompare(b.providerKind) ||
      a.modelId.localeCompare(b.modelId),
  );
}

export function queryTokenUsageDays(db: DatabaseSync, now: Date): UsageTelemetryDay[] {
  const start = windowStart(now);
  const rows = z.array(tokenDay).parse(
    db
      .prepare(`SELECT day, ${TOKEN_COLUMNS}
      FROM usage_daily WHERE day >= ? AND day <= ? GROUP BY day ORDER BY day`)
      .all(localDay(start), localDay(now)),
  );
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(date.getDate() + index);
    const key = localDay(date);
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
