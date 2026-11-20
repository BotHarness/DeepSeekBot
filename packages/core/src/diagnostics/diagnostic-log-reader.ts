import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { writeZip } from '../bots/zip-archive.js';
import {
  LOG_DB_FILENAME,
  openLogDatabase,
  type LogDatabase,
  type LogEntry,
} from '../logs/log-db.js';
import {
  CLIENT_PLUGIN,
  DIAGNOSTIC_LOG_FORMAT,
  DIAGNOSTIC_LOG_LIMITS,
  DIAGNOSTIC_LOG_VERSION,
  DiagnosticLogError,
  HOST_PLUGIN,
  record,
  type DiagnosticFieldValue,
} from './diagnostic-log-contract.js';
import { readLogHealth, type LogHealthSnapshot } from './log-health.js';
import { createDiagnosticRedactor } from './redaction.js';

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

export function buildDiagnosticExport(
  database: Pick<LogDatabase, 'range'> | undefined,
  options: {
    hours: number;
    now: () => number;
    environment: DiagnosticLogEnvironment;
    homes: ReadonlyArray<{ path: string; label: string }>;
    exportedBy?: 'host' | 'cli-offline';
    health?: LogHealthSnapshot;
  },
): { archive: Buffer; manifest: Record<string, unknown>; until: number } {
  const until = options.now();
  const { rows, since, truncated, primary } = availableDiagnosticRows(
    database,
    options.hours,
    until,
  );
  const built = diagnosticLogArchive(rows, {
    since,
    until,
    environment: options.environment,
    homes: options.homes,
    truncated,
    exportedBy: options.exportedBy ?? 'host',
    primary,
    ...(options.health === undefined ? {} : { health: options.health }),
  });
  return { ...built, until };
}

export interface DiagnosticLogList {
  completeness?: Record<string, unknown>;
  version: number;
  since: number;
  filter: string;
  entries: DiagnosticLogView[];
}

export function listDiagnosticLogs(
  database: Pick<LogDatabase, 'query'> | undefined,
  options: {
    filter: string;
    since: number;
    limit: number;
    homes: ReadonlyArray<{ path: string; label: string }>;
    health?: LogHealthSnapshot;
  },
): DiagnosticLogList {
  const { filter, since } = options;
  if (filter !== 'all' && LEVEL_FILTERS[filter] === undefined)
    throw new DiagnosticLogError('invalid-input', 'filter must be all, error, perf or action.');
  if (!Number.isFinite(since) || !Number.isInteger(options.limit) || options.limit < 1)
    throw new DiagnosticLogError('invalid-input', 'since and limit must be numbers.');
  const limit = Math.min(options.limit, DIAGNOSTIC_LOG_LIMITS.listMax);
  const kinds = filter === 'all' ? undefined : LEVEL_FILTERS[filter];
  let rows: LogEntry[] = [];
  let primary: 'available' | 'unavailable' = 'unavailable';
  try {
    if (database !== undefined) {
      rows = database.query({
        since,
        limit: Math.min(limit + 1, DIAGNOSTIC_LOG_LIMITS.listMax),
        ...(kinds === undefined ? {} : { kinds }),
      });
      primary = 'available';
    }
  } catch {}
  const redactor = createDiagnosticRedactor({ homes: options.homes });
  const entries = rows.slice(0, limit).map((row) => redactor.value(diagnosticLogView(row)));
  return {
    version: DIAGNOSTIC_LOG_VERSION,
    since,
    filter,
    entries,
    completeness: diagnosticCompleteness(entries, {
      primary,
      truncated:
        rows.length > limit
          ? true
          : rows.length === limit && limit === DIAGNOSTIC_LOG_LIMITS.listMax
            ? null
            : false,
      ...(options.health === undefined ? {} : { health: options.health }),
    }),
  };
}

export function readDiagnosticLogOffline(options: {
  dshHome: string;
  filter: string;
  since: number;
  limit: number;
  homes: ReadonlyArray<{ path: string; label: string }>;
}): DiagnosticLogList {
  const dir = join(options.dshHome, 'botharness');
  let database: LogDatabase | undefined;
  try {
    if (existsSync(join(dir, LOG_DB_FILENAME))) database = openLogDatabase({ dir, readOnly: true });
  } catch {}
  try {
    return listDiagnosticLogs(database, { ...options, health: readLogHealth(dir) });
  } finally {
    database?.close();
  }
}

export function exportDiagnosticLogOffline(options: {
  dshHome: string;
  hours: number;
  environment: DiagnosticLogEnvironment;
  homes: ReadonlyArray<{ path: string; label: string }>;
  now?: () => number;
}): { archive: Buffer; manifest: Record<string, unknown> } {
  const dir = join(options.dshHome, 'botharness');
  let database: LogDatabase | undefined;
  try {
    if (existsSync(join(dir, LOG_DB_FILENAME))) database = openLogDatabase({ dir, readOnly: true });
  } catch {}
  try {
    return buildDiagnosticExport(database, {
      hours: options.hours,
      now: options.now ?? Date.now,
      environment: options.environment,
      homes: options.homes,
      exportedBy: 'cli-offline',
      health: readLogHealth(dir),
    });
  } finally {
    database?.close();
  }
}

export interface DiagnosticLogArchiveOptions {
  health?: LogHealthSnapshot;
  primary?: 'available' | 'unavailable';
  since: number;
  until: number;
  environment: DiagnosticLogEnvironment;
  homes: ReadonlyArray<{ path: string; label: string }>;
  truncated: boolean;
  exportedBy?: 'host' | 'cli-offline';
}

export function diagnosticLogArchive(
  rows: readonly LogEntry[],
  options: DiagnosticLogArchiveOptions,
): { archive: Buffer; manifest: Record<string, unknown> } {
  const { files, manifest } = diagnosticLogFiles(rows, options);
  return { archive: writeZip(files), manifest };
}

export function diagnosticLogFiles(
  rows: readonly LogEntry[],
  options: DiagnosticLogArchiveOptions,
): { files: Array<{ path: string; data: Uint8Array }>; manifest: Record<string, unknown> } {
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
    exportedBy: options.exportedBy ?? 'host',
    range: {
      start: new Date(options.since).toISOString(),
      end: new Date(options.until).toISOString(),
    },
    environment: options.environment,
    entries: views.length,
    truncated: options.truncated,
    completeness: diagnosticCompleteness(views, options),
    clientSessions: sessions.size,
    counts,
    redaction: { level: redactor.level, hits: redactor.report() },
  };
  const encoder = new TextEncoder();
  const files = [
    { path: 'manifest.json', data: encoder.encode(JSON.stringify(manifest, null, 2) + '\n') },
    {
      path: 'logs.jsonl',
      data: encoder.encode(views.map((view) => JSON.stringify(view)).join('\n') + '\n'),
    },
    {
      path: 'timeline.txt',
      data: encoder.encode(views.map(timelineLine).join('\n') + '\n'),
    },
  ];
  return { files, manifest };
}

export function diagnosticLogRows(
  database: Pick<LogDatabase, 'range'>,
  hours: number,
  until: number,
): { rows: LogEntry[]; since: number; truncated: boolean } {
  const since = until - hours * 3_600_000;
  const rows = database
    .range(since, DIAGNOSTIC_LOG_LIMITS.exportMaxRows + 1)
    .filter((row) => row.ts <= until);
  const truncated = rows.length > DIAGNOSTIC_LOG_LIMITS.exportMaxRows;
  return { rows: truncated ? rows.slice(1) : rows, since, truncated };
}

export function availableDiagnosticRows(
  database: Pick<LogDatabase, 'range'> | undefined,
  hours: number,
  until: number,
) {
  try {
    if (database !== undefined)
      return { ...diagnosticLogRows(database, hours, until), primary: 'available' as const };
  } catch {}
  return {
    rows: [],
    since: until - hours * 3_600_000,
    truncated: false,
    primary: 'unavailable' as const,
  };
}

export function diagnosticCompleteness(
  views: readonly DiagnosticLogView[],
  options: {
    health?: LogHealthSnapshot;
    primary?: 'available' | 'unavailable';
    truncated?: boolean | null;
  },
): Record<string, unknown> {
  const lossFacts = views
    .filter((view) => view.code === 'log-dropped' || view.code === 'log-overflow')
    .map(({ id, ts, code }) => ({ id, ts, code }));
  return {
    status:
      options.primary === 'unavailable' ||
      options.truncated ||
      lossFacts.length > 0 ||
      (options.health?.lostEvents ?? 0) > 0 ||
      (options.health?.failureObservations ?? 0) > 0 ||
      options.health?.transitions.some((event) => event.phase.endsWith('failed'))
        ? 'partial'
        : 'unknown',
    primary: options.primary ?? 'available',
    coverage: 'unknown',
    omissions: {
      exportTruncated: options.truncated === undefined ? false : options.truncated,
      lossFacts,
    },
    health: options.health ?? { evidence: 'unavailable', coverage: 'unknown' },
    note: 'Retained evidence only; absence of recorded loss does not establish complete coverage. Health counters are lower bounds across the retained observation history.',
  };
}

export function diagnosticExportSummary(manifest: Record<string, unknown>) {
  const completeness = record(manifest['completeness']);
  const omissions = record(completeness?.['omissions']);
  const count = omissions?.['lossFactCount'];
  return {
    status: completeness?.['status'] === 'partial' ? 'partial' : 'unknown',
    primary:
      completeness?.['primary'] === 'available'
        ? 'available'
        : completeness?.['primary'] === 'unavailable'
          ? 'unavailable'
          : 'unknown',
    coverage: 'unknown',
    omissions: {
      exportTruncated:
        typeof omissions?.['exportTruncated'] === 'boolean' ? omissions['exportTruncated'] : null,
      lossFactCount: Array.isArray(omissions?.['lossFacts'])
        ? omissions['lossFacts'].length
        : typeof count === 'number' && Number.isSafeInteger(count) && count >= 0
          ? count
          : null,
    },
    health: record(completeness?.['health']) ?? { evidence: 'unavailable', coverage: 'unknown' },
  };
}
