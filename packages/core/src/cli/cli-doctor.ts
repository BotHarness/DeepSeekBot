import { existsSync } from 'node:fs';

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

import {
  doctorReport,
  DOCTOR_DAY_MS,
  DOCTOR_ERROR_LIMIT,
  updateCheck,
  type DoctorCheck,
} from '../diagnostics/doctor-report.js';

export const DOCTOR_COMMANDS = [
  {
    command: 'doctor',
    description:
      'one health report for Tob and coding agents: versions, Host, plugin, last update, errors in the last 24 hours, and a troubleshooting guide; reads logs.db directly with --offline or when the Host is unavailable',
  },
] as const;

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

export async function runDoctor(
  values: { offline?: boolean; home?: string; host?: string },
  io: BotCreateCliIo,
  connect: () => Promise<Awaited<ReturnType<typeof connectLiveHost>>>,
  now: () => number = Date.now,
): Promise<unknown> {
  const environment = diagnosticEnvironment();
  const dshHome = diagnosticHome(values, io);
  const checks: DoctorCheck[] = [];
  const since = now() - DOCTOR_DAY_MS;
  const errorQuery = new URLSearchParams({
    filter: 'error',
    since: String(since),
    limit: String(DOCTOR_ERROR_LIMIT),
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
      let parsed: unknown;
      try {
        parsed = JSON.parse(Buffer.from(bytes).toString('utf8'));
      } catch {
        parsed = undefined;
      }
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !Array.isArray((parsed as { entries?: unknown }).entries)
      )
        throw new CliLiveError('host-protocol-error', 'The Host returned an unreadable log list.');
      errors = parsed as DiagnosticLogList;
      source = 'host';
      checks.push({ id: 'host', status: 'ok' }, { id: 'plugin', status: 'ok' });
    } catch (error) {
      if (!(error instanceof CliLiveError)) throw error;
      fallback = error.code;
      if (error.code === 'not-found' || (error.code === 'host-refused' && error.status === 404))
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
      errors = readLogsOffline({ filter: 'error', since, limit: DOCTOR_ERROR_LIMIT }, values, io);
    } catch (error) {
      if (!(error instanceof CliLiveError)) throw error;
      checks.push({
        id: 'log',
        status: error.code === 'not-found' ? 'warn' : 'fail',
        code: error.code,
        detail: error.message,
      });
    }
  }
  if (errors !== undefined) {
    const completeness = errors.completeness;
    if (completeness?.['primary'] === 'unavailable') {
      checks.push({
        id: 'log',
        status: 'warn',
        code: existsSync(dshHome) ? 'log-unavailable' : 'not-found',
        source,
        completeness,
        hint: 'Export diagnostics to inspect retained health evidence; the error count is unavailable.',
      });
      errors = undefined;
    } else
      checks.push({
        id: 'log',
        status: completeness?.['status'] === 'partial' ? 'warn' : 'ok',
        ...(completeness?.['status'] === 'partial' ? { code: 'partial-evidence' } : {}),
        source,
        ...(completeness === undefined ? {} : { completeness }),
      });
  }

  const offline = source === 'offline';
  return doctorReport({
    checks,
    errors,
    source,
    ...(fallback === undefined || !offline ? {} : { fallback }),
    environment,
    checkedAt: now(),
    next: [
      `diagnostic-logs --kind error --limit 100${offline ? ' --offline' : ''}`,
      'diagnostic-logs-export --out tobs-logs.zip',
    ],
    guide: DOCTOR_GUIDE,
  });
}
