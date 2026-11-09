import { existsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

import {
  DIAGNOSTIC_LOG_LIMITS,
  exportDiagnosticLogOffline,
  readDiagnosticLogOffline,
  type DiagnosticLogEnvironment,
  type DiagnosticLogList,
} from '../diagnostics/diagnostic-log.js';
import { resolveDshHome } from '../im/config-store.js';
import { LogDatabaseUnreadableError } from '../logs/log-db.js';
import { installedRelease } from '../release/service.js';
import { installedDshVersion } from '../telemetry/service.js';
import type { BotCreateCliIo } from './bot-create-cli.js';
import type { connectLiveHost } from './cli-live.js';
import { CliLiveError } from './cli-live-error.js';

export const DIAGNOSTIC_LOG_COMMANDS = [
  {
    command: 'diagnostic-logs',
    description:
      'read the local diagnostic log (Client actions, errors, performance, Host warnings); --kind all|error|perf|action; reads logs.db directly with --offline or when the Host is unavailable',
  },
  {
    command: 'diagnostic-logs-export',
    description:
      'export the local diagnostic log as a redacted ZIP; --out required, --hours 1-168; reads logs.db directly with --offline or when the Host is unavailable',
  },
  {
    command: 'diagnostic-log-record',
    description: 'append Client diagnostic entries from a JSON batch on stdin (agent QA)',
  },
] as const;

const FILTERS = new Set(['all', 'error', 'perf', 'action']);
const OFFLINE_FALLBACK = new Set([
  'host-unreachable',
  'host-unauthorized',
  'host-refused',
  'host-protocol-error',
  'not-found',
]);

export function diagnosticHome(values: { home?: string }, io: BotCreateCliIo): string {
  return values.home?.trim() || io.env['DSH_HOME']?.trim() || resolveDshHome(io.env);
}

export function diagnosticHomes(dshHome: string) {
  return [
    { path: dshHome, label: '$DSH_HOME' },
    { path: homedir(), label: '~' },
  ];
}

export function diagnosticEnvironment(): DiagnosticLogEnvironment {
  const dshVersion = installedDshVersion();
  return {
    version: installedRelease(import.meta.url).version(),
    ...(dshVersion === undefined ? {} : { dshVersion }),
    platform: process.platform,
    arch: process.arch,
    node: process.version,
  };
}

export function isOfflineFallback(error: unknown): error is CliLiveError {
  return error instanceof CliLiveError && OFFLINE_FALLBACK.has(error.code);
}

export function hostConfigured(values: { host?: string }, io: BotCreateCliIo): boolean {
  return Boolean(values.host || io.env['DEEPSEEKBOT_HOST']);
}

export function readLogsOffline(
  query: { filter: string; since: number; limit: number },
  values: { home?: string },
  io: BotCreateCliIo,
): DiagnosticLogList {
  const dshHome = diagnosticHome(values, io);
  let list: DiagnosticLogList | undefined;
  try {
    list = readDiagnosticLogOffline({ dshHome, ...query, homes: diagnosticHomes(dshHome) });
  } catch (error) {
    if (error instanceof LogDatabaseUnreadableError)
      throw new CliLiveError(
        'log-unreadable',
        `The diagnostic log could not be read (${error.message}); it was left unchanged.`,
      );
    throw error;
  }
  if (list === undefined)
    throw new CliLiveError(
      'not-found',
      'No diagnostic log was found under DSH_HOME; pass --home with the DSH home folder.',
    );
  return list;
}

function exportOffline(
  out: string,
  hours: number,
  values: { home?: string },
  io: BotCreateCliIo,
  fallback: string | undefined,
) {
  const dshHome = diagnosticHome(values, io);
  let exported: ReturnType<typeof exportDiagnosticLogOffline>;
  try {
    exported = exportDiagnosticLogOffline({
      dshHome,
      hours,
      homes: diagnosticHomes(dshHome),
      environment: diagnosticEnvironment(),
    });
  } catch (error) {
    if (error instanceof LogDatabaseUnreadableError)
      throw new CliLiveError(
        'log-unreadable',
        `The diagnostic log could not be read (${error.message}); it was left unchanged.`,
      );
    throw error;
  }
  if (exported === undefined)
    throw new CliLiveError(
      'not-found',
      'No diagnostic log was found under DSH_HOME; pass --home with the DSH home folder.',
    );
  writeFileSync(out, exported.archive, { flag: 'wx', mode: 0o600 });
  return {
    saved: true,
    path: out,
    bytes: exported.archive.byteLength,
    entries: Number(exported.manifest['entries'] ?? 0),
    source: 'offline',
    ...(fallback === undefined ? {} : { fallback }),
  };
}

function diagnosticLogQuery(values: { kind?: string; since?: string; limit?: string }) {
  const filter = values.kind?.trim() || 'all';
  if (!FILTERS.has(filter))
    throw new CliLiveError('usage', '--kind must be all, error, perf or action.');
  let since = Date.now() - 24 * 3_600_000;
  let limit: number = DIAGNOSTIC_LOG_LIMITS.listDefault;
  if (values.since !== undefined) {
    since = Number(values.since);
    if (!Number.isSafeInteger(since) || since < 0)
      throw new CliLiveError('usage', '--since must be epoch milliseconds.');
  }
  if (values.limit !== undefined) {
    limit = Number(values.limit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
      throw new CliLiveError('usage', '--limit must be 1–1000.');
  }
  return { filter, since, limit };
}

export const TOB_DIAGNOSTIC_COMMAND_USAGE: Readonly<Record<string, string>> = {
  doctor: 'deepseekbot doctor',
  'diagnostic-logs':
    'deepseekbot diagnostic-logs [--kind all|error|perf|action] [--since <epoch ms>] [--limit 1-1000]',
};

export function parseAgentDiagnostics(
  command: string,
  rest: string[],
  values: Record<string, unknown>,
): { command: string; args: Record<string, unknown>; write: boolean } | undefined {
  if (!Object.hasOwn(TOB_DIAGNOSTIC_COMMAND_USAGE, command)) return undefined;
  const allowed = new Set([
    'compact',
    'help',
    'timeout',
    ...(command === 'diagnostic-logs' ? ['kind', 'since', 'limit'] : []),
  ]);
  if (Object.entries(values).some(([key, value]) => value !== undefined && !allowed.has(key)))
    throw new CliLiveError(
      'agent-scope-denied',
      'This option is not available for the scoped CLI operation.',
    );
  if (rest.length) throw new CliLiveError('usage', `${command} takes no positional arguments.`);
  if (command === 'doctor') return { command, args: {}, write: false };
  return {
    command,
    args: diagnosticLogQuery(values as { kind?: string; since?: string; limit?: string }),
    write: false,
  };
}

export async function runDiagnosticLogCommand(
  command: string,
  values: {
    out?: string;
    since?: string;
    limit?: string;
    kind?: string;
    hours?: string;
    offline?: boolean;
    home?: string;
    host?: string;
  },
  io: BotCreateCliIo,
  connect: () => Promise<Awaited<ReturnType<typeof connectLiveHost>>>,
): Promise<unknown> {
  if (command === 'diagnostic-logs') {
    const { filter: kind, since, limit } = diagnosticLogQuery(values);
    const query = new URLSearchParams({ filter: kind });
    if (values.since !== undefined) query.set('since', String(since));
    if (values.limit !== undefined) query.set('limit', String(limit));
    const offline = (fallback?: string) => ({
      ...readLogsOffline({ filter: kind, since, limit }, values, io),
      source: 'offline',
      ...(fallback === undefined ? {} : { fallback }),
    });
    if (values.offline === true) return offline();
    if (!hostConfigured(values, io)) return offline('host-not-configured');
    let bytes: Uint8Array;
    try {
      const host = await connect();
      ({ bytes } = await host.http(`/api/botharness/diagnostic-logs?${query}`));
    } catch (error) {
      if (isOfflineFallback(error)) return offline(error.code);
      throw error;
    }
    return { ...JSON.parse(Buffer.from(bytes).toString('utf8')), source: 'host' };
  }
  if (command === 'diagnostic-logs-export') {
    if (!values.out) throw new CliLiveError('usage', 'Pass --out for the log ZIP.');
    if (existsSync(values.out))
      throw new CliLiveError('usage', 'The --out file already exists; choose a new path.');
    const query = new URLSearchParams();
    let hours: number = DIAGNOSTIC_LOG_LIMITS.exportDefaultHours;
    if (values.hours !== undefined) {
      hours = Number(values.hours);
      if (!Number.isFinite(hours) || hours <= 0 || hours > 168)
        throw new CliLiveError('usage', '--hours must be between 0 and 168.');
      query.set('hours', String(hours));
    }
    if (values.offline === true) return exportOffline(values.out, hours, values, io, undefined);
    if (!hostConfigured(values, io))
      return exportOffline(values.out, hours, values, io, 'host-not-configured');
    let response: Response;
    let bytes: Uint8Array;
    try {
      const host = await connect();
      ({ bytes, response } = await host.http(
        `/api/botharness/diagnostic-logs/export${query.size ? `?${query}` : ''}`,
      ));
    } catch (error) {
      if (isOfflineFallback(error)) return exportOffline(values.out, hours, values, io, error.code);
      throw error;
    }
    writeFileSync(values.out, bytes, { flag: 'wx', mode: 0o600 });
    return {
      saved: true,
      path: values.out,
      bytes: bytes.byteLength,
      entries: Number(response.headers.get('x-diagnostic-log-entries') ?? 0),
      source: 'host',
    };
  }
  let input: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse((await io.readStdin?.()) ?? '');
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error();
    input = parsed as Record<string, unknown>;
  } catch {
    throw new CliLiveError('usage', 'Provide a diagnostic batch JSON on stdin.');
  }
  const host = await connect();
  const { bytes } = await host.http('/api/botharness/client-log', input);
  return JSON.parse(Buffer.from(bytes).toString('utf8'));
}
