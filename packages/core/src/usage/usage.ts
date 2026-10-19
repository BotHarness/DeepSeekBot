import {
  queryOverviewUsage,
  type UsageOverviewPeriod,
  type UsageOverviewResult,
} from './overview.js';
import { createHmac } from 'node:crypto';
import { queryUsage, usageFilterSchema, type UsageFilter, type UsageQueryResult } from './query.js';
import type { DatabaseSync } from 'node:sqlite';

import {
  attachOperationalModule,
  type OperationalDatabaseModulePort,
  type OperationalDatabaseOwner,
} from '../database/owner.js';
import type { IdleCompactionRecord } from '../runtime/idle-compaction.js';
import type { SessionOwnership } from '../sessions/ownership.js';
import type { DshSessionEvent } from '../sessions/source.js';

export interface UsageDayRow {
  day: string;
  purpose: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens?: number | null;
  reportedTotalTokens?: number;
  unknownBuckets?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
}

export interface UsageRebuildReport {
  folded: number;

  failed: number;

  legacyBaselineBots?: number;
}

export interface DshUsageSessionLog {
  events: readonly DshSessionEvent[];
  inheritedEventCount: number;
}

export type DshUsageSessionLogReader = (
  sessionId: string,
) => Promise<DshUsageSessionLog | undefined>;

export interface SessionUsageSummary {
  totalTokens: number | null;
  status: 'ready' | 'unknown' | 'partial' | 'unavailable';
}

export interface UsageProjection {
  handleSessionEvent(sessionId: string, event: DshSessionEvent): void;

  primeSession(sessionId: string, events: readonly DshSessionEvent[]): void;

  rebuild(
    sessionIds: readonly string[],
    readLog: DshUsageSessionLogReader,
  ): Promise<UsageRebuildReport>;

  activity(botSlug: string, sinceIso: string): UsageDayRow[];

  query(botSlug: string, filter: UsageFilter): UsageQueryResult;

  sessionSummary(
    botSlug: string,
    sessionId: string,
    sinceIso: string,
    readLog: DshUsageSessionLogReader,
  ): Promise<SessionUsageSummary>;

  overview(period: UsageOverviewPeriod, after?: string): UsageOverviewResult;

  purgeBot(botSlug: string, removeFiles?: () => void): void;

  recordIdleCompaction(record: IdleCompactionRecord): void;

  idleCompactions(botSlug: string, sinceIso: string): IdleCompactionRecord[];
}

interface UsageDailyDbRow {
  day: string;
  purpose: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  unknown_input: number;
  unknown_output: number;
  unknown_cache_read: number;
  unknown_cache_write: number;
  total_tokens: number;
  unknown_total: number;
}

export function usageLocalDay(timeMs: number): string {
  const date = new Date(timeMs);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function purposeOf(owner: { rootRole: string; provenance: string }): string {
  return owner.provenance === 'subagent' ? 'subagent' : owner.rootRole;
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function reportedBuckets(event: DshSessionEvent): {
  uncachedInputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  totalTokens?: number;
} {
  const data = recordOf(event.data);
  const stream = Array.isArray(data?.['stream']) ? data['stream'] : [];
  const last = stream.findLast(
    (entry) => recordOf(recordOf(entry)?.['chunk'])?.['type'] === 'usage',
  );
  const sample = recordOf(data?.['usage'] ?? recordOf(recordOf(last)?.['chunk'])?.['usage']);
  const count = (key: string): number | undefined => {
    const value = sample?.[key];
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
      ? value
      : undefined;
  };
  const buckets: Partial<
    Record<
      | 'uncachedInputTokens'
      | 'outputTokens'
      | 'cacheReadTokens'
      | 'cacheWriteTokens'
      | 'totalTokens',
      number
    >
  > = {};
  for (const [key, source] of [
    ['uncachedInputTokens', 'inputTokens'],
    ['outputTokens', 'outputTokens'],
    ['cacheReadTokens', 'cacheReadTokens'],
    ['cacheWriteTokens', 'cacheWriteTokens'],
    ['totalTokens', 'totalTokens'],
  ] as const) {
    const value = count(source);
    if (value !== undefined) buckets[key] = value;
  }
  const known = [
    buckets.uncachedInputTokens,
    buckets.outputTokens,
    buckets.cacheReadTokens,
    buckets.cacheWriteTokens,
  ];
  const sum = known.reduce<number>((total, value) => total + (value ?? 0), 0);
  if (
    buckets.totalTokens !== undefined &&
    (buckets.totalTokens < sum ||
      (known.every((value) => value !== undefined) && buckets.totalTokens !== sum))
  )
    delete buckets.totalTokens;
  if (
    sample?.['totalTokens'] === undefined &&
    known.every((value) => value !== undefined) &&
    Number.isSafeInteger(sum)
  )
    buckets.totalTokens = sum;
  const missing = (
    ['uncachedInputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'] as const
  ).filter((key) => buckets[key] === undefined);
  if (buckets.totalTokens !== undefined && missing.length > 0) {
    const rest = buckets.totalTokens - sum;
    if (missing.length === 1) buckets[missing[0]!] = rest;
    else if (rest === 0) for (const key of missing) buckets[key] = 0;
  }
  return buckets;
}

interface UsageRoute {
  provider: string;
  model: string;
}

function routeOf(value: unknown): UsageRoute | undefined {
  const record = recordOf(value);
  return typeof record?.['provider'] === 'string' &&
    record['provider'].length > 0 &&
    typeof record['model'] === 'string' &&
    record['model'].length > 0
    ? { provider: record['provider'], model: record['model'] }
    : undefined;
}

function requestRoute(event: DshSessionEvent): UsageRoute | undefined {
  if (event.type === 'request/context') return routeOf(event.data);
  if (event.type === 'request/header')
    return routeOf(recordOf(recordOf(event.data)?.['header'])?.['config']);
  return undefined;
}

export function createUsageProjection(options: {
  ownership: SessionOwnership;
  database: OperationalDatabaseOwner;
  now?: () => Date;
  botCreatedAt?: (botSlug: string) => string | undefined;
}): UsageProjection {
  const database: OperationalDatabaseModulePort = attachOperationalModule(
    options.database,
    'usage',
  );
  const { ownership } = options;
  const routes = new Map<string, Map<number, UsageRoute>>();
  const fingerprintKey = database.read((connection) =>
    connection.prepare('SELECT fingerprint_key FROM usage_receipt_state WHERE singleton = 1').get(),
  ) as { fingerprint_key: string };
  const legacyBaselines = database.read((connection) =>
    connection.prepare('SELECT bot_slug, through_ms FROM usage_legacy_baselines').all(),
  ) as Array<{ bot_slug: string; through_ms: number }>;
  const baselineByBot = new Map(legacyBaselines.map((row) => [row.bot_slug, row.through_ms]));
  let rebuilding = false;
  let reconciliationFailed = false;
  let reconciledAt: string | null = null;
  const queuedEvents: Array<{ sessionId: string; event: DshSessionEvent; route?: UsageRoute }> = [];

  const upsert = (
    connection: DatabaseSync,
    botSlug: string,
    day: string,
    purpose: string,
    provider: string,
    model: string,
    usage: {
      uncachedInputTokens?: number;
      outputTokens?: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
      totalTokens?: number;
    },
  ): void => {
    connection
      .prepare(
        `INSERT INTO usage_daily
           (bot_slug, day, provider, model, purpose,
            input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
            unknown_input, unknown_output, unknown_cache_read, unknown_cache_write, total_tokens, unknown_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (bot_slug, day, provider, model, purpose) DO UPDATE SET
           input_tokens = input_tokens + excluded.input_tokens,
           output_tokens = output_tokens + excluded.output_tokens,
           cache_read_tokens = cache_read_tokens + excluded.cache_read_tokens,
           cache_write_tokens = cache_write_tokens + excluded.cache_write_tokens,
           unknown_input = unknown_input + excluded.unknown_input,
           unknown_output = unknown_output + excluded.unknown_output,
           unknown_cache_read = unknown_cache_read + excluded.unknown_cache_read,
           unknown_cache_write = unknown_cache_write + excluded.unknown_cache_write,
           total_tokens = total_tokens + excluded.total_tokens,
           unknown_total = unknown_total + excluded.unknown_total`,
      )
      .run(
        botSlug,
        day,
        provider,
        model,
        purpose,
        usage.uncachedInputTokens ?? 0,
        usage.outputTokens ?? 0,
        usage.cacheReadTokens ?? 0,
        usage.cacheWriteTokens ?? 0,
        usage.uncachedInputTokens === undefined ? 1 : 0,
        usage.outputTokens === undefined ? 1 : 0,
        usage.cacheReadTokens === undefined ? 1 : 0,
        usage.cacheWriteTokens === undefined ? 1 : 0,
        usage.totalTokens ?? 0,
        usage.totalTokens === undefined ? 1 : 0,
      );
  };

  const foldEvent = (
    sessionId: string,
    event: DshSessionEvent,
    route: UsageRoute | undefined,
    connection: DatabaseSync,
  ): boolean => {
    if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') return false;
    if (event.surfaceOp !== undefined && event.surfaceOp !== 'append') return false;
    if (event.seq === undefined || !Number.isSafeInteger(event.seq) || event.seq < 0) return false;
    const owner = ownership.resolve(sessionId);
    if (owner === undefined) return false;
    let root = owner;
    const lineage = new Set<string>();
    while (root.parentSessionId !== undefined) {
      if (lineage.has(root.sessionId)) return false;
      lineage.add(root.sessionId);
      const parent = ownership.resolve(root.parentSessionId);
      if (parent === undefined || parent.botSlug !== owner.botSlug) return false;
      root = parent;
    }
    const rootFingerprint = createHmac('sha256', fingerprintKey.fingerprint_key)
      .update(JSON.stringify([root.sessionId]))
      .digest('hex');
    if (
      connection
        .prepare('SELECT 1 FROM usage_retired_roots WHERE fingerprint = ?')
        .get(rootFingerprint) !== undefined
    )
      return false;
    if (options.botCreatedAt !== undefined) {
      const createdAt = options.botCreatedAt(owner.botSlug);
      if (createdAt === undefined || Date.parse(root.createdAt) < Date.parse(createdAt))
        return false;
    }
    const fingerprint = createHmac('sha256', fingerprintKey.fingerprint_key)
      .update(JSON.stringify([sessionId, event.seq]))
      .digest('hex');
    const receipt = connection
      .prepare('INSERT OR IGNORE INTO usage_receipts (fingerprint, bot_slug) VALUES (?, ?)')
      .run(fingerprint, owner.botSlug);
    if (receipt.changes === 0) return false;
    const baseline = baselineByBot.get(owner.botSlug);
    if (baseline !== undefined && event.time <= baseline) return false;
    const source = routeOf(recordOf(recordOf(event.data)?.['message'])?.['source']);
    const actual = source ?? route ?? { provider: 'unknown', model: 'unknown' };
    upsert(
      connection,
      owner.botSlug,
      usageLocalDay(event.time),
      purposeOf(owner),
      actual.provider,
      actual.model,
      reportedBuckets(event),
    );
    return true;
  };

  const observe = (sessionId: string, event: DshSessionEvent): UsageRoute | undefined => {
    if (event.seq === undefined || !Number.isSafeInteger(event.seq) || event.seq < 0)
      return undefined;
    const route = requestRoute(event);
    let history = routes.get(sessionId);
    if (route !== undefined) {
      if (history === undefined) {
        history = new Map();
        routes.set(sessionId, history);
      }
      history.set(event.seq, route);
    }
    let latest = -1;
    let resolved: UsageRoute | undefined;
    for (const [seq, candidate] of history ?? []) {
      if (seq <= event.seq && seq > latest) {
        latest = seq;
        resolved = candidate;
      }
    }
    return resolved;
  };

  const writeLive = (
    sessionId: string,
    event: DshSessionEvent,
    route: UsageRoute | undefined,
  ): void => {
    database.transaction((connection) => foldEvent(sessionId, event, route, connection), ['usage']);
  };

  return {
    async sessionSummary(botSlug, sessionId, sinceIso, readLog) {
      const root = ownership.resolve(sessionId);
      const available = (): boolean => {
        if (root === undefined || root.botSlug !== botSlug || root.parentSessionId !== undefined)
          return false;
        if (!ownership.contentAvailable(sessionId)) return false;
        const current = ownership.resolve(sessionId);
        if (current?.botSlug !== botSlug || current.createdAt !== root.createdAt) return false;
        const createdAt = options.botCreatedAt?.(botSlug);
        if (
          options.botCreatedAt !== undefined &&
          (createdAt === undefined || Date.parse(root.createdAt) < Date.parse(createdAt))
        )
          return false;
        const fingerprint = createHmac('sha256', fingerprintKey.fingerprint_key)
          .update(JSON.stringify([sessionId]))
          .digest('hex');
        return database.read(
          (connection) =>
            connection
              .prepare('SELECT 1 FROM usage_retired_roots WHERE fingerprint = ?')
              .get(fingerprint) === undefined,
        );
      };
      if (!available()) return { totalTokens: null, status: 'unavailable' };
      const descendants = ownership.descendantsOf(sessionId);
      const sessions = [root!, ...descendants.slice(0, 20)];
      let incomplete = descendants.length > 20;
      let unknown = false;
      let known = false;
      let totalTokens = 0;
      const sinceDay = usageLocalDay(Date.parse(sinceIso));
      const today = usageLocalDay((options.now?.() ?? new Date()).getTime());
      for (const session of sessions) {
        if (session.botSlug !== botSlug || !ownership.contentAvailable(session.sessionId)) {
          incomplete = true;
          continue;
        }
        let log: DshUsageSessionLog | undefined;
        try {
          log = await readLog(session.sessionId);
        } catch {
          incomplete = true;
        }
        if (log === undefined) {
          incomplete = true;
          continue;
        }
        if (
          !Number.isSafeInteger(log.inheritedEventCount) ||
          log.inheritedEventCount < 0 ||
          log.inheritedEventCount > log.events.length ||
          !ownership.contentAvailable(session.sessionId) ||
          ownership.resolve(session.sessionId)?.botSlug !== botSlug
        ) {
          incomplete = true;
          continue;
        }
        const seen = new Set<number>();
        for (const event of log.events.slice(log.inheritedEventCount)) {
          if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') continue;
          if (event.surfaceOp !== undefined && event.surfaceOp !== 'append') continue;
          if (
            event.seq === undefined ||
            !Number.isSafeInteger(event.seq) ||
            event.seq < 0 ||
            seen.has(event.seq)
          )
            continue;
          seen.add(event.seq);
          if (!Number.isFinite(event.time)) continue;
          const day = usageLocalDay(event.time);
          if (day < sinceDay || day > today) continue;
          const baseline = baselineByBot.get(botSlug);
          if (baseline !== undefined && event.time <= baseline) {
            incomplete = true;
            continue;
          }
          const total = reportedBuckets(event).totalTokens;
          if (total === undefined) unknown = true;
          else {
            known = true;
            totalTokens += total;
          }
        }
      }
      if (!available()) return { totalTokens: null, status: 'unavailable' };
      if (!Number.isSafeInteger(totalTokens)) return { totalTokens: null, status: 'unknown' };
      if ((unknown || incomplete) && !known)
        return { totalTokens: null, status: incomplete ? 'unavailable' : 'unknown' };
      return { totalTokens, status: unknown || incomplete ? 'partial' : 'ready' };
    },
    primeSession(sessionId, events) {
      for (const event of events) observe(sessionId, event);
    },
    handleSessionEvent(sessionId, event) {
      const route = observe(sessionId, event);
      if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') return;
      if (rebuilding) {
        queuedEvents.push({ sessionId, event, ...(route === undefined ? {} : { route }) });
        return;
      }
      writeLive(sessionId, event, route);
    },
    async rebuild(sessionIds, readLog) {
      if (rebuilding) throw new Error('Usage reconciliation already running');
      rebuilding = true;
      reconciliationFailed = true;
      let folded = 0;
      let failed = 0;
      try {
        const logs = new Map<string, DshUsageSessionLog>();
        for (const sessionId of sessionIds) {
          if (ownership.resolve(sessionId) === undefined) continue;
          try {
            const log = await readLog(sessionId);
            if (log === undefined) failed += 1;
            else logs.set(sessionId, log);
          } catch {
            failed += 1;
          }
        }
        database.transaction(
          (connection) => {
            for (const [sessionId, log] of logs) {
              let route: UsageRoute | undefined;
              for (let index = 0; index < log.events.length; index += 1) {
                const event = log.events[index]!;
                route = requestRoute(event) ?? route;
                if (index < log.inheritedEventCount) continue;
                if (foldEvent(sessionId, event, route, connection)) folded += 1;
              }
            }
            for (const queued of queuedEvents)
              if (foldEvent(queued.sessionId, queued.event, queued.route, connection)) folded += 1;
          },
          ['usage'],
        );
      } finally {
        rebuilding = false;
        const pending = queuedEvents.splice(0);
        for (const queued of pending) writeLive(queued.sessionId, queued.event, queued.route);
      }
      reconciliationFailed = failed > 0;
      reconciledAt = (options.now?.() ?? new Date()).toISOString();
      return {
        folded,
        failed,
        ...(baselineByBot.size > 0 ? { legacyBaselineBots: baselineByBot.size } : {}),
      };
    },
    query(botSlug, filter) {
      const parsed = usageFilterSchema.parse(filter);
      if (parsed.end > usageLocalDay((options.now?.() ?? new Date()).getTime()))
        throw new RangeError('Usage range cannot include future days');
      return database.read((connection) =>
        queryUsage(connection, botSlug, parsed, {
          freshness: rebuilding ? 'reconciling' : reconciliationFailed ? 'degraded' : 'ready',
          readAt: (options.now?.() ?? new Date()).toISOString(),
          reconciledAt,
        }),
      );
    },
    overview(period, after) {
      return database.read((connection) =>
        queryOverviewUsage(connection, period, after, options.now?.() ?? new Date(), {
          freshness: rebuilding ? 'reconciling' : reconciliationFailed ? 'degraded' : 'ready',
          reconciledAt,
        }),
      );
    },
    purgeBot(botSlug, removeFiles) {
      database.transaction(
        (connection) => {
          const retire = connection.prepare(
            'INSERT OR IGNORE INTO usage_retired_roots (fingerprint) VALUES (?)',
          );
          for (const owner of ownership.list().filter((record) => record.botSlug === botSlug)) {
            retire.run(
              createHmac('sha256', fingerprintKey.fingerprint_key)
                .update(JSON.stringify([owner.sessionId]))
                .digest('hex'),
            );
          }
          connection.prepare('DELETE FROM usage_daily WHERE bot_slug = ?').run(botSlug);
          connection.prepare('DELETE FROM usage_receipts WHERE bot_slug = ?').run(botSlug);
          connection.prepare('DELETE FROM usage_legacy_baselines WHERE bot_slug = ?').run(botSlug);
          connection.prepare('DELETE FROM usage_idle_compactions WHERE bot_slug = ?').run(botSlug);
          removeFiles?.();
        },
        ['usage'],
      );
      baselineByBot.delete(botSlug);
    },
    recordIdleCompaction(record) {
      database.transaction(
        (connection) => {
          connection
            .prepare(
              `INSERT INTO usage_idle_compactions
                 (bot_slug, at, provider, model, idle_gap_ms, cache_lifetime_ms, cache_lifetime_source,
                  tokens_before, tokens_after, outcome, error, input_tokens, cache_read_tokens, output_tokens)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              record.botSlug,
              record.at,
              record.provider,
              record.model,
              Math.round(record.idleGapMs),
              Math.round(record.cacheLifetimeMs),
              record.cacheLifetimeSource,
              record.tokensBefore,
              record.tokensAfter,
              record.outcome,
              record.error ?? null,
              record.inputTokens,
              record.cacheReadTokens,
              record.outputTokens,
            );
        },
        ['usage'],
      );
    },
    idleCompactions(botSlug, sinceIso) {
      const rows = database.read((connection) =>
        connection
          .prepare(
            `SELECT bot_slug, at, provider, model, idle_gap_ms, cache_lifetime_ms, cache_lifetime_source,
                    tokens_before, tokens_after, outcome, error, input_tokens, cache_read_tokens, output_tokens
               FROM usage_idle_compactions
              WHERE bot_slug = ? AND at >= ?
              ORDER BY at`,
          )
          .all(botSlug, sinceIso),
      ) as Array<Record<string, unknown>>;
      return rows.map((row) => ({
        botSlug: row['bot_slug'] as string,
        at: row['at'] as string,
        provider: row['provider'] as string,
        model: row['model'] as string,
        idleGapMs: row['idle_gap_ms'] as number,
        cacheLifetimeMs: row['cache_lifetime_ms'] as number,
        cacheLifetimeSource: row[
          'cache_lifetime_source'
        ] as IdleCompactionRecord['cacheLifetimeSource'],
        tokensBefore: row['tokens_before'] as number,
        tokensAfter: (row['tokens_after'] as number | null) ?? null,
        outcome: row['outcome'] as IdleCompactionRecord['outcome'],
        ...(typeof row['error'] === 'string' ? { error: row['error'] } : {}),
        inputTokens: (row['input_tokens'] as number | null) ?? null,
        cacheReadTokens: (row['cache_read_tokens'] as number | null) ?? null,
        outputTokens: (row['output_tokens'] as number | null) ?? null,
      }));
    },
    activity(botSlug, sinceIso) {
      const sinceDay = usageLocalDay(Date.parse(sinceIso));
      const rows = database.read((connection) =>
        connection
          .prepare(
            `SELECT day, purpose, provider, model, input_tokens, output_tokens,
                    cache_read_tokens, cache_write_tokens,
                    unknown_input, unknown_output, unknown_cache_read, unknown_cache_write, total_tokens, unknown_total
               FROM usage_daily
              WHERE bot_slug = ? AND day >= ?
              ORDER BY day`,
          )
          .all(botSlug, sinceDay),
      ) as unknown as UsageDailyDbRow[];
      return rows.map((row) => ({
        day: row.day,
        purpose: row.purpose,
        provider: row.provider,
        model: row.model,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        cacheReadTokens: row.cache_read_tokens,
        cacheWriteTokens: row.cache_write_tokens,
        totalTokens: row.unknown_total > 0 ? null : row.total_tokens,
        ...(row.unknown_total > 0
          ? {
              reportedTotalTokens: Math.max(
                row.total_tokens,
                row.input_tokens +
                  row.output_tokens +
                  row.cache_read_tokens +
                  row.cache_write_tokens,
              ),
            }
          : {}),
        ...([
          row.unknown_input,
          row.unknown_output,
          row.unknown_cache_read,
          row.unknown_cache_write,
        ].some((count) => count > 0)
          ? {
              unknownBuckets: {
                inputTokens: row.unknown_input,
                outputTokens: row.unknown_output,
                cacheReadTokens: row.unknown_cache_read,
                cacheWriteTokens: row.unknown_cache_write,
              },
            }
          : {}),
      }));
    },
  };
}
