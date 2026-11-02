import { existsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

import {
  DIAGNOSTIC_LOG_LIMITS,
  exportDiagnosticLogOffline,
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
      'read the local diagnostic log (Client actions, errors, performance, Host warnings); --kind all|error|perf|action',
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

function exportOffline(
  out: string,
  hours: number,
  values: { home?: string },
  io: BotCreateCliIo,
  fallback: string | undefined,
) {
  const dshHome = values.home?.trim() || io.env['DSH_HOME']?.trim() || resolveDshHome(io.env);
  const dshVersion = installedDshVersion();
  let exported: ReturnType<typeof exportDiagnosticLogOffline>;
  try {
    exported = exportDiagnosticLogOffline({
      dshHome,
      hours,
      homes: [
        { path: dshHome, label: '$DSH_HOME' },
        { path: homedir(), label: '~' },
      ],
      environment: {
        version: installedRelease(import.meta.url).version(),
        ...(dshVersion === undefined ? {} : { dshVersion }),
        platform: process.platform,
        arch: process.arch,
        node: process.version,
      },
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
    const kind = values.kind?.trim() || 'all';
    if (!FILTERS.has(kind))
      throw new CliLiveError('usage', '--kind must be all, error, perf or action.');
    const query = new URLSearchParams({ filter: kind });
    if (values.since !== undefined) {
      const since = Number(values.since);
      if (!Number.isSafeInteger(since) || since < 0)
        throw new CliLiveError('usage', '--since must be epoch milliseconds.');
      query.set('since', String(since));
    }
    if (values.limit !== undefined) {
      const limit = Number(values.limit);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
        throw new CliLiveError('usage', '--limit must be 1–1000.');
      query.set('limit', String(limit));
    }
    const host = await connect();
    const { bytes } = await host.http(`/api/botharness/diagnostic-logs?${query}`);
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
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
    if (!values.host && !io.env['DEEPSEEKBOT_HOST'])
      return exportOffline(values.out, hours, values, io, 'host-not-configured');
    let response: Response;
    let bytes: Uint8Array;
    try {
      const host = await connect();
      ({ bytes, response } = await host.http(
        `/api/botharness/diagnostic-logs/export${query.size ? `?${query}` : ''}`,
      ));
    } catch (error) {
      if (error instanceof CliLiveError && OFFLINE_FALLBACK.has(error.code))
        return exportOffline(values.out, hours, values, io, error.code);
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
