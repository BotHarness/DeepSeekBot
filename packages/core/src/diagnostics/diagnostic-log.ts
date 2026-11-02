import { Logger, type Context, type Message } from '@deepseek-ai/cordis';
import { join } from 'node:path';

import { writeZip } from '../bots/zip-archive.js';
import {
  openLogDatabase,
  type LogDatabase,
  type LogEntry,
  type LogEntryInput,
} from '../logs/log-db.js';
import { scrubHomePaths } from '../telemetry/exceptions.js';
import { createDiagnosticRedactor } from './redaction.js';

export const CLIENT_LOG_PATH = '/api/botharness/client-log';
export const DIAGNOSTIC_LOGS_PATH = '/api/botharness/diagnostic-logs';
export const DIAGNOSTIC_LOGS_EXPORT_PATH = DIAGNOSTIC_LOGS_PATH + '/export';

const DIAGNOSTIC_LOG_ROUTES = [
  [CLIENT_LOG_PATH, ['POST']],
  [DIAGNOSTIC_LOGS_PATH, ['GET']],
  [DIAGNOSTIC_LOGS_EXPORT_PATH, ['GET']],
] as const;

export const DIAGNOSTIC_LOG_FORMAT = 'deepseekbot-diagnostic-logs';
export const DIAGNOSTIC_LOG_VERSION = 1;

export const CLIENT_LOG_CATEGORIES = [
  'action',
  'navigation',
  'error',
  'perf',
  'invariant',
  'lifecycle',
  'network',
] as const;
export type ClientLogCategory = (typeof CLIENT_LOG_CATEGORIES)[number];
export const CLIENT_LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type ClientLogLevel = (typeof CLIENT_LOG_LEVELS)[number];

export const DIAGNOSTIC_LOG_LIMITS = {
  bodyBytes: 64 * 1024,
  entriesPerBatch: 200,
  clockSkewMs: 24 * 60 * 60 * 1000,
  fieldsPerEntry: 24,
  fieldText: 300,
  hostText: 1000,
  entriesPerMinute: 600,
  hostEntriesPerMinute: 300,
  listDefault: 300,
  listMax: 1000,
  exportDefaultHours: 24,
  exportMaxHours: 7 * 24,
  exportMaxRows: 50_000,
} as const;

const CODE = /^[a-z0-9][a-z0-9._-]{0,63}$/u;
const KEY = /^[A-Za-z][\w.-]{0,47}$/u;
const SESSION = /^[A-Za-z0-9-]{8,64}$/u;
const CLIENT_PLUGIN = 'client';
const HOST_PLUGIN = 'host';

export type DiagnosticFieldValue = string | number | boolean | null;

export interface ClientLogEntry {
  ts: number;
  category: ClientLogCategory;
  level: ClientLogLevel;
  code: string;
  fields?: Record<string, DiagnosticFieldValue>;
}

export interface ClientLogBatch {
  version: 1;
  session: string;
  dropped: number;
  entries: ClientLogEntry[];
}

export type DiagnosticLogErrorCode =
  | 'invalid-report'
  | 'report-too-large'
  | 'rate-limited'
  | 'persistence-unavailable'
  | 'invalid-input';

export class DiagnosticLogError extends Error {
  constructor(
    readonly code: DiagnosticLogErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DiagnosticLogError';
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function cleanText(value: string, max: number): string {
  return scrubHomePaths(value.slice(0, max * 2)).slice(0, max);
}

function fieldsOf(value: unknown): Record<string, DiagnosticFieldValue> | undefined {
  const input = record(value);
  if (input === undefined) return;
  const fields: Record<string, DiagnosticFieldValue> = {};
  let count = 0;
  for (const [key, raw] of Object.entries(input)) {
    if (count >= DIAGNOSTIC_LOG_LIMITS.fieldsPerEntry) break;
    if (!KEY.test(key)) continue;
    if (typeof raw === 'string') fields[key] = cleanText(raw, DIAGNOSTIC_LOG_LIMITS.fieldText);
    else if (typeof raw === 'number' && Number.isFinite(raw))
      fields[key] = Math.round(raw * 1000) / 1000;
    else if (typeof raw === 'boolean' || raw === null) fields[key] = raw;
    else continue;
    count += 1;
  }
  return count === 0 ? undefined : fields;
}

export function parseClientLogBatch(
  value: unknown,
  now: () => number = Date.now,
): ClientLogBatch & { rejected: number } {
  const v = record(value);
  if (
    v === undefined ||
    v['version'] !== 1 ||
    typeof v['session'] !== 'string' ||
    !SESSION.test(v['session']) ||
    !Array.isArray(v['entries']) ||
    v['entries'].length === 0 ||
    v['entries'].length > DIAGNOSTIC_LOG_LIMITS.entriesPerBatch
  )
    throw new DiagnosticLogError('invalid-report', 'The diagnostic report is malformed.');
  const dropped =
    Number.isSafeInteger(v['dropped']) && (v['dropped'] as number) >= 0
      ? (v['dropped'] as number)
      : 0;
  const entries: ClientLogEntry[] = [];
  let rejected = 0;
  const latest = now() + DIAGNOSTIC_LOG_LIMITS.clockSkewMs;
  for (const raw of v['entries']) {
    const e = record(raw);
    if (
      e === undefined ||
      !Number.isSafeInteger(e['ts']) ||
      (e['ts'] as number) <= 0 ||
      (e['ts'] as number) > latest ||
      !CLIENT_LOG_CATEGORIES.includes(e['category'] as ClientLogCategory) ||
      !CLIENT_LOG_LEVELS.includes(e['level'] as ClientLogLevel) ||
      typeof e['code'] !== 'string' ||
      !CODE.test(e['code'])
    ) {
      rejected += 1;
      continue;
    }
    const fields = fieldsOf(e['fields']);
    entries.push({
      ts: e['ts'] as number,
      category: e['category'] as ClientLogCategory,
      level: e['level'] as ClientLogLevel,
      code: e['code'],
      ...(fields === undefined ? {} : { fields }),
    });
  }
  return { version: 1, session: v['session'], dropped, entries, rejected };
}

function clientRow(session: string, entry: ClientLogEntry): LogEntryInput {
  return {
    ts: entry.ts,
    plugin: CLIENT_PLUGIN,
    owner: 'profile-shared',
    kind: `client.${entry.category}`,
    detail: entry.code,
    traceId: session,
    payload: JSON.stringify({ level: entry.level, ...(entry.fields ?? {}) }),
  };
}

function minuteBudget(perMinute: number, now: () => number) {
  let window = 0;
  let used = 0;
  let refused = 0;
  return {
    take(count: number): number {
      const current = Math.floor(now() / 60_000);
      if (current !== window) {
        window = current;
        used = 0;
      }
      const granted = Math.max(0, Math.min(count, perMinute - used));
      used += granted;
      refused += count - granted;
      return granted;
    },
    drainRefused(): number {
      const value = refused;
      refused = 0;
      return value;
    },
  };
}

export function createDiagnosticLogWriter(
  database: Pick<LogDatabase, 'writeMany'>,
  options: { flushMs?: number; maxPending?: number; onError?: (error: unknown) => void } = {},
) {
  const flushMs = options.flushMs ?? 1000;
  const maxPending = options.maxPending ?? 2000;
  let pending: LogEntryInput[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let overflow = 0;
  const flush = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (pending.length === 0 && overflow === 0) return;
    const rows = pending;
    pending = [];
    if (overflow > 0) {
      rows.push({
        plugin: HOST_PLUGIN,
        owner: 'profile-shared',
        kind: 'host.diagnostics',
        detail: 'log-overflow',
        payload: JSON.stringify({ level: 'warn', dropped: overflow }),
      });
      overflow = 0;
    }
    try {
      database.writeMany(rows);
    } catch (error) {
      options.onError?.(error);
    }
  };
  return {
    write(rows: readonly LogEntryInput[]): void {
      for (const row of rows) {
        if (pending.length >= maxPending) overflow += 1;
        else pending.push(row);
      }
      timer ??= setTimeout(flush, flushMs);
      (timer as { unref?: () => void }).unref?.();
    },
    flush,
  };
}

export type DiagnosticLogWriter = ReturnType<typeof createDiagnosticLogWriter>;

export function hostLogExporter(
  write: (rows: LogEntryInput[]) => void,
  options: { now?: () => number; home?: string } = {},
) {
  const budget = minuteBudget(DIAGNOSTIC_LOG_LIMITS.hostEntriesPerMinute, options.now ?? Date.now);
  let busy = false;
  const exporter = {
    colors: false as const,
    maxLength: DIAGNOSTIC_LOG_LIMITS.hostText,
    levels: { default: 2 },
    export(message: Message): void {
      if (busy) return;
      if (message.type !== 'warn' && message.type !== 'error') return;
      if (budget.take(1) === 0) return;
      busy = true;
      try {
        let text: string;
        try {
          text = Logger.format(exporter, message);
        } catch {
          text = '[unformattable log message]';
        }
        write([
          {
            ts: message.ts,
            plugin: HOST_PLUGIN,
            owner: 'profile-shared',
            kind: `host.${message.type}`,
            detail: scrubHomePaths(text.slice(0, DIAGNOSTIC_LOG_LIMITS.hostText * 2), options.home)
              .replace(/\s+/gu, ' ')
              .slice(0, DIAGNOSTIC_LOG_LIMITS.hostText),
            payload: JSON.stringify({ level: message.type, logger: message.name }),
          },
        ]);
      } finally {
        busy = false;
      }
    },
  };
  return exporter;
}

export interface DiagnosticLogView {
  id: number;
  ts: number;
  source: 'client' | 'host' | string;
  category: string;
  level: string;
  code: string;
  session?: string;
  fields: Record<string, DiagnosticFieldValue>;
}

export function diagnosticLogView(entry: LogEntry): DiagnosticLogView {
  let payload: Record<string, unknown> = {};
  try {
    payload = record(entry.payload === undefined ? undefined : JSON.parse(entry.payload)) ?? {};
  } catch {}
  const { level, ...rest } = payload;
  const fields: Record<string, DiagnosticFieldValue> = {};
  for (const [key, value] of Object.entries(rest))
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    )
      fields[key] = value;
  const own = entry.plugin === CLIENT_PLUGIN || entry.plugin === HOST_PLUGIN;
  let code = entry.detail;
  if (!own) {
    try {
      const detail = record(JSON.parse(entry.detail));
      if (detail !== undefined) {
        for (const [key, value] of Object.entries(detail))
          if (
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean' ||
            value === null
          )
            fields[key] = value;
        code = entry.kind;
      }
    } catch {}
  }
  const dot = entry.kind.indexOf('.');
  const category = !own ? 'module' : dot < 0 ? entry.kind : entry.kind.slice(dot + 1);
  return {
    id: entry.id,
    ts: entry.ts,
    source: entry.plugin,
    category,
    level:
      typeof level === 'string'
        ? level
        : category === 'error' || category === 'warn'
          ? category
          : !own && /refused|failed|error|unavailable/u.test(`${entry.kind} ${entry.detail}`)
            ? 'warn'
            : 'info',
    code,
    ...(entry.traceId === undefined ? {} : { session: entry.traceId }),
    fields,
  };
}

const LEVEL_FILTERS: Record<string, readonly string[]> = {
  error: ['client.error', 'client.invariant', 'host.error', 'host.warn'],
  perf: ['client.perf'],
  action: ['client.action', 'client.navigation'],
};

export interface DiagnosticLogEnvironment {
  version: string;
  dshVersion?: string;
  platform: string;
  arch: string;
  node: string;
}

export interface DiagnosticLogHttpOptions {
  database(): LogDatabase | undefined;
  writer(): DiagnosticLogWriter | undefined;
  environment: DiagnosticLogEnvironment;
  homes: ReadonlyArray<{ path: string; label: string }>;
  now?: () => number;
  log?: (message: string) => void;
}

const HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };

function failure(error: unknown, log?: (message: string) => void): Response {
  const code = error instanceof DiagnosticLogError ? error.code : 'invalid-input';
  const status =
    code === 'report-too-large'
      ? 413
      : code === 'rate-limited'
        ? 429
        : code === 'persistence-unavailable'
          ? 503
          : 400;
  log?.(`diagnostic-logs phase=refused reason=${code}`);
  return Response.json(
    {
      error: {
        code,
        message: error instanceof DiagnosticLogError ? error.message : 'Invalid request.',
      },
    },
    { status, headers: HEADERS },
  );
}

function hoursOf(raw: string | null): number {
  if (raw === null || raw === '') return DIAGNOSTIC_LOG_LIMITS.exportDefaultHours;
  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours <= 0 || hours > DIAGNOSTIC_LOG_LIMITS.exportMaxHours)
    throw new DiagnosticLogError(
      'invalid-input',
      `hours must be between 0 and ${DIAGNOSTIC_LOG_LIMITS.exportMaxHours}.`,
    );
  return hours;
}

function timelineLine(view: DiagnosticLogView): string {
  const fields = Object.entries(view.fields)
    .map(([key, value]) => `${key}=${typeof value === 'string' ? JSON.stringify(value) : value}`)
    .join(' ');
  return [
    new Date(view.ts).toISOString(),
    view.level.toUpperCase().padEnd(5),
    `${view.source}.${view.category}`.padEnd(18),
    view.code,
    fields,
  ]
    .filter((part) => part !== '')
    .join('  ');
}

export function diagnosticLogArchive(
  rows: readonly LogEntry[],
  options: {
    since: number;
    until: number;
    environment: DiagnosticLogEnvironment;
    homes: ReadonlyArray<{ path: string; label: string }>;
    truncated: boolean;
  },
): { archive: Buffer; manifest: Record<string, unknown> } {
  const redactor = createDiagnosticRedactor({ homes: options.homes });
  const views = rows.map((row) => redactor.value(diagnosticLogView(row)));
  const counts: Record<string, number> = {};
  const sessions = new Set<string>();
  for (const view of views) {
    const key = `${view.source}.${view.category}`;
    counts[key] = (counts[key] ?? 0) + 1;
    if (view.source === CLIENT_PLUGIN && view.session !== undefined) sessions.add(view.session);
  }
  const manifest = {
    format: DIAGNOSTIC_LOG_FORMAT,
    version: DIAGNOSTIC_LOG_VERSION,
    exportedAt: new Date(options.until).toISOString(),
    range: {
      start: new Date(options.since).toISOString(),
      end: new Date(options.until).toISOString(),
    },
    environment: options.environment,
    entries: views.length,
    truncated: options.truncated,
    clientSessions: sessions.size,
    counts,
    redaction: { level: redactor.level, hits: redactor.report() },
  };
  const encoder = new TextEncoder();
  const archive = writeZip([
    { path: 'manifest.json', data: encoder.encode(JSON.stringify(manifest, null, 2) + '\n') },
    {
      path: 'logs.jsonl',
      data: encoder.encode(views.map((view) => JSON.stringify(view)).join('\n') + '\n'),
    },
    {
      path: 'timeline.txt',
      data: encoder.encode(views.map(timelineLine).join('\n') + '\n'),
    },
  ]);
  return { archive, manifest };
}

export function createDiagnosticLogHttp(options: DiagnosticLogHttpOptions) {
  const now = options.now ?? Date.now;
  const budget = minuteBudget(DIAGNOSTIC_LOG_LIMITS.entriesPerMinute, now);
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      if (url.pathname === CLIENT_LOG_PATH) {
        if (request.method !== 'POST') return new Response(null, { status: 405, headers: HEADERS });
        const writer = options.writer();
        if (writer === undefined)
          throw new DiagnosticLogError('persistence-unavailable', 'Diagnostic log is unavailable.');
        const body = await request.text();
        if (body.length > DIAGNOSTIC_LOG_LIMITS.bodyBytes)
          throw new DiagnosticLogError('report-too-large', 'The diagnostic report is too large.');
        let value: unknown;
        try {
          value = JSON.parse(body);
        } catch {
          throw new DiagnosticLogError('invalid-report', 'The diagnostic report is malformed.');
        }
        const batch = parseClientLogBatch(value, now);
        const granted = budget.take(batch.entries.length);
        const rows = batch.entries
          .slice(0, granted)
          .map((entry) => clientRow(batch.session, entry));
        const lost = batch.dropped + batch.rejected + budget.drainRefused();
        if (lost > 0)
          rows.push(
            clientRow(batch.session, {
              ts: now(),
              category: 'lifecycle',
              level: 'warn',
              code: 'log-dropped',
              fields: {
                clientDropped: batch.dropped,
                rejected: batch.rejected,
                rateLimited: batch.entries.length - granted,
              },
            }),
          );
        writer.write(rows);
        return Response.json({ ok: true, accepted: granted }, { headers: HEADERS });
      }
      if (request.method !== 'GET') return new Response(null, { status: 405, headers: HEADERS });
      const database = options.database();
      if (database === undefined)
        throw new DiagnosticLogError('persistence-unavailable', 'Diagnostic log is unavailable.');
      options.writer()?.flush();
      if (url.pathname === DIAGNOSTIC_LOGS_PATH) {
        const filter = url.searchParams.get('filter') ?? 'all';
        if (filter !== 'all' && LEVEL_FILTERS[filter] === undefined)
          throw new DiagnosticLogError(
            'invalid-input',
            'filter must be all, error, perf or action.',
          );
        const sinceRaw = url.searchParams.get('since');
        const since = sinceRaw === null ? now() - 24 * 3_600_000 : Number(sinceRaw);
        const limitRaw = Number(url.searchParams.get('limit') ?? DIAGNOSTIC_LOG_LIMITS.listDefault);
        if (!Number.isFinite(since) || !Number.isInteger(limitRaw) || limitRaw < 1)
          throw new DiagnosticLogError('invalid-input', 'since and limit must be numbers.');
        const limit = Math.min(limitRaw, DIAGNOSTIC_LOG_LIMITS.listMax);
        const kinds = filter === 'all' ? undefined : LEVEL_FILTERS[filter];
        const rows = database.query({ since, limit, ...(kinds === undefined ? {} : { kinds }) });
        const redactor = createDiagnosticRedactor({ homes: options.homes });
        return Response.json(
          {
            version: DIAGNOSTIC_LOG_VERSION,
            since,
            filter,
            entries: rows.map((row) => redactor.value(diagnosticLogView(row))),
          },
          { headers: HEADERS },
        );
      }
      if (url.pathname !== DIAGNOSTIC_LOGS_EXPORT_PATH)
        return new Response(null, { status: 404, headers: HEADERS });
      const hours = hoursOf(url.searchParams.get('hours'));
      const until = now();
      const since = until - hours * 3_600_000;
      const rows = database
        .range(since, DIAGNOSTIC_LOG_LIMITS.exportMaxRows + 1)
        .filter((row) => row.ts <= until);
      const truncated = rows.length > DIAGNOSTIC_LOG_LIMITS.exportMaxRows;
      const { archive, manifest } = diagnosticLogArchive(truncated ? rows.slice(1) : rows, {
        since,
        until,
        environment: options.environment,
        homes: options.homes,
        truncated,
      });
      const stamp = new Date(until).toISOString().replace(/[:.]/gu, '-').slice(0, 19);
      options.log?.(
        `diagnostic-logs initiator=human phase=exported hours=${hours} entries=${String(manifest['entries'])} bytes=${archive.length}`,
      );
      return new Response(new Uint8Array(archive), {
        headers: {
          ...HEADERS,
          'content-type': 'application/zip',
          'content-length': String(archive.length),
          'content-disposition': `attachment; filename="deepseekbot-logs-${stamp}.zip"`,
          'x-diagnostic-log-entries': String(manifest['entries']),
        },
      });
    } catch (error) {
      return failure(error, options.log);
    }
  };
}

export function mountDiagnosticLog(
  ctx: Context,
  options: {
    dshHome: string;
    homes: ReadonlyArray<{ path: string; label: string }>;
    environment: () => DiagnosticLogEnvironment;
  },
): void {
  let database: LogDatabase | undefined;
  let writer: DiagnosticLogWriter | undefined;
  ctx.effect(() => {
    try {
      database = openLogDatabase({ dir: join(options.dshHome, 'botharness') });
    } catch {
      database = undefined;
      ctx.logger.warn('diagnostic-logs phase=persistence-unavailable');
      return () => {};
    }
    let failed = false;
    writer = createDiagnosticLogWriter(database, {
      onError: () => {
        if (failed) return;
        failed = true;
        console.warn('botharness: diagnostic-logs phase=write-failed');
      },
    });
    const home = options.homes.find((entry) => entry.label === '~')?.path;
    const offExporter = (
      ctx.logger as unknown as { exporter(exporter: unknown): () => void }
    ).exporter(hostLogExporter((rows) => writer?.write(rows), home === undefined ? {} : { home }));
    return () => {
      offExporter();
      writer?.flush();
      writer = undefined;
      database?.close();
      database = undefined;
    };
  }, 'botharness: always-on diagnostic log');
  ctx.inject(['connection'], (child) => {
    const connection = (
      child as unknown as {
        connection: {
          fetch: {
            register(route: {
              path: string;
              methods: readonly ('GET' | 'POST')[];
              requestBody: 'buffered';
              fetch(request: Request): Promise<Response>;
            }): () => Promise<void>;
          };
        };
      }
    ).connection;
    const http = createDiagnosticLogHttp({
      database: () => database,
      writer: () => writer,
      environment: options.environment(),
      homes: options.homes,
      log: (message) => child.logger.info(message),
    });
    for (const [path, methods] of DIAGNOSTIC_LOG_ROUTES)
      child.effect(
        () => connection.fetch.register({ path, methods, requestBody: 'buffered', fetch: http }),
        'botharness: diagnostic log ' + path,
      );
  });
}
