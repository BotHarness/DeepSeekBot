import { existsSync } from 'node:fs';
import { release } from 'node:os';

import type { DiagnosticLogList } from '../diagnostics/diagnostic-log.js';
import type { BotCreateCliIo } from './bot-create-cli.js';
import {
  diagnosticEnvironment,
  diagnosticHome,
  hostConfigured,
  readLogsOffline,
} from './cli-diagnostic-logs.js';
import type { connectLiveHost } from './cli-live.js';
import { CliLiveError } from './cli-live-error.js';

export const DOCTOR_COMMANDS = [
  {
    command: 'doctor',
    description:
      'one health report for Tob and coding agents: versions, Host, plugin, last update, errors in the last 24 hours, and a troubleshooting guide; reads logs.db directly with --offline or when the Host is unavailable',
  },
] as const;

export type DoctorStatus = 'ok' | 'warn' | 'fail' | 'skip';

export interface DoctorCheck {
  id: 'dsh-home' | 'host' | 'plugin' | 'last-update' | 'log' | 'errors-24h';
  status: DoctorStatus;
  code?: string;
  detail?: string;
  hint?: string;
  [key: string]: unknown;
}

const DAY_MS = 24 * 3_600_000;
const TOP_ERRORS = 5;
const ISSUE_URL = 'https://github.com/BotHarness/DeepSeekBot/issues/new?template=01-bug.yml';

export const DOCTOR_GUIDE = [
  'Run every command with the same CLI that printed this report (deepseekbot, tobs, or npx -y @botharness/tobs).',
  'Read each check whose status is not "ok" and follow its hint before guessing.',
  'Error details: diagnostic-logs --kind error --limit 100 (add --offline when the Host is down).',
  'For a failed update, read the file at last-update.logPath, then compare with the release notes: release-info.',
  'Never delete or edit files under DSH_HOME (chats, Memory, credentials). Copy the folder first if a fix has to touch it.',
  'Ask the Human before restarting, reinstalling, or changing settings, and report only what you verified.',
  `If you cannot fix it: diagnostic-logs-export --out tobs-logs.zip, then help the Human open ${ISSUE_URL} with the versions above and attach the ZIP.`,
] as const;

function topErrors(list: DiagnosticLogList) {
  const counts = new Map<string, { code: string; count: number; last: number }>();
  for (const entry of list.entries) {
    const code = `${entry.source}.${entry.category}:${entry.code.split(/\s/u, 1)[0]}`;
    const seen = counts.get(code);
    if (seen === undefined) counts.set(code, { code, count: 1, last: entry.ts });
    else {
      seen.count += 1;
      seen.last = Math.max(seen.last, entry.ts);
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || b.last - a.last)
    .slice(0, TOP_ERRORS)
    .map((item) => ({ ...item, last: new Date(item.last).toISOString() }));
}

function updateCheck(run: unknown): DoctorCheck {
  if (typeof run !== 'object' || run === null)
    return { id: 'last-update', status: 'ok', detail: 'No update has run since the Host started.' };
  const value = run as Record<string, unknown>;
  const failure =
    typeof value['failure'] === 'object' && value['failure'] !== null
      ? (value['failure'] as Record<string, unknown>)
      : undefined;
  const phase = String(value['phase'] ?? 'unknown');
  const summary = {
    kind: value['kind'],
    name: value['name'],
    version: value['version'],
    phase,
  };
  if (phase === 'failed')
    return {
      id: 'last-update',
      status: 'warn',
      code: typeof failure?.['reason'] === 'string' ? failure['reason'] : 'update-failed',
      ...summary,
      ...(typeof failure?.['diagnostic'] === 'string' ? { detail: failure['diagnostic'] } : {}),
      ...(typeof failure?.['logPath'] === 'string' ? { logPath: failure['logPath'] } : {}),
      hint: 'Read logPath and the diagnostic; update-status shows the full run.',
    };
  if (phase === 'installed' || phase === 'cancelled')
    return { id: 'last-update', status: 'ok', ...summary };
  return {
    id: 'last-update',
    status: 'warn',
    code: 'update-running',
    ...summary,
    hint: 'An update is still running; check again with update-status.',
  };
}

export async function runDoctor(
  values: { offline?: boolean; home?: string; host?: string },
  io: BotCreateCliIo,
  connect: () => Promise<Awaited<ReturnType<typeof connectLiveHost>>>,
  now: () => number = Date.now,
): Promise<unknown> {
  const environment = diagnosticEnvironment();
  const dshHome = diagnosticHome(values, io);
  const checks: DoctorCheck[] = [];
  const since = now() - DAY_MS;
  const errorQuery = new URLSearchParams({
    filter: 'error',
    since: String(since),
    limit: '1000',
  });

  checks.push(
    existsSync(dshHome)
      ? { id: 'dsh-home', status: 'ok' }
      : {
          id: 'dsh-home',
          status: 'fail',
          code: 'not-found',
          hint: 'Pass --home with the DSH home folder, or set DSH_HOME.',
        },
  );

  let errors: DiagnosticLogList | undefined;
  let source: 'host' | 'offline' = 'offline';
  let fallback: string | undefined;
  let host: Awaited<ReturnType<typeof connect>> | undefined;
  if (values.offline === true) {
    fallback = 'offline-requested';
    checks.push({ id: 'host', status: 'skip', code: fallback });
  } else if (!hostConfigured(values, io)) {
    fallback = 'host-not-configured';
    checks.push({
      id: 'host',
      status: 'skip',
      code: fallback,
      hint: 'Pass --host or set DEEPSEEKBOT_HOST to also check the running Host.',
    });
  } else {
    try {
      host = await connect();
      const { bytes } = await host.http(`/api/botharness/diagnostic-logs?${errorQuery}`);
      errors = JSON.parse(Buffer.from(bytes).toString('utf8')) as DiagnosticLogList;
      source = 'host';
      checks.push({ id: 'host', status: 'ok' }, { id: 'plugin', status: 'ok' });
    } catch (error) {
      if (!(error instanceof CliLiveError)) throw error;
      fallback = error.code;
      if (error.code === 'not-found')
        checks.push(
          { id: 'host', status: 'ok' },
          {
            id: 'plugin',
            status: 'fail',
            code: 'plugin-not-loaded',
            hint: 'The Host answers but the Tobs plugin did not load. Read the Host terminal output or its log, and the last update.',
          },
        );
      else
        checks.push({
          id: 'host',
          status: 'fail',
          code: error.code,
          detail: error.message,
          hint:
            error.code === 'host-unauthorized'
              ? 'The Host is running but refused the login; check --token-file or the Host address.'
              : 'Start DSH (or check that it is still running) and that the address is right.',
        });
    }
  }

  if (host !== undefined && source === 'host') {
    try {
      checks.push(updateCheck(await host.rpc('updateRun', {})));
    } catch (error) {
      checks.push({
        id: 'last-update',
        status: 'skip',
        code: error instanceof CliLiveError ? error.code : 'update-status-unavailable',
      });
    }
  } else
    checks.push({
      id: 'last-update',
      status: 'skip',
      code: 'host-required',
      hint: 'The update record lives in the running Host.',
    });

  if (errors === undefined) {
    try {
      errors = readLogsOffline({ filter: 'error', since, limit: 1000 }, values, io);
      checks.push({ id: 'log', status: 'ok', source: 'offline' });
    } catch (error) {
      if (!(error instanceof CliLiveError)) throw error;
      checks.push({
        id: 'log',
        status: error.code === 'not-found' ? 'warn' : 'fail',
        code: error.code,
        detail: error.message,
      });
    }
  } else checks.push({ id: 'log', status: 'ok', source: 'host' });

  if (errors === undefined)
    checks.push({ id: 'errors-24h', status: 'skip', code: 'log-unavailable' });
  else {
    const top = topErrors(errors);
    checks.push({
      id: 'errors-24h',
      status: errors.entries.length === 0 ? 'ok' : 'warn',
      count: errors.entries.length,
      ...(errors.entries.length >= 1000 ? { truncated: true } : {}),
      ...(top.length === 0 ? {} : { top }),
    });
  }

  const offline = source === 'offline';
  return {
    ok: checks.every((check) => check.status !== 'fail'),
    source,
    ...(fallback === undefined || !offline ? {} : { fallback }),
    checkedAt: new Date(now()).toISOString(),
    versions: {
      tobs: environment.version,
      ...(environment.dshVersion === undefined ? {} : { dsh: environment.dshVersion }),
      node: environment.node,
      os: `${environment.platform} ${release()} ${environment.arch}`,
    },
    checks,
    next: [
      `diagnostic-logs --kind error --limit 100${offline ? ' --offline' : ''}`,
      'diagnostic-logs-export --out tobs-logs.zip',
    ],
    guide: DOCTOR_GUIDE,
  };
}
