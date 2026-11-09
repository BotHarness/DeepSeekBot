import {
  doctorReport,
  DOCTOR_DAY_MS,
  DOCTOR_ERROR_LIMIT,
  updateCheck,
} from '../bots/cli-doctor.js';
import type { DiagnosticLogEnvironment, DiagnosticLogList } from '../diagnostics/diagnostic-log.js';
import type { PrepareTobOperation, TobCliCapability } from './cli-operations.js';
import { TobError } from './service.js';

export const TOB_DIAGNOSTIC_CAPABILITIES: readonly TobCliCapability[] = [
  {
    command: 'doctor',
    description:
      'Health report for a problem the Human reports: versions, Host, plugin, last update and errors in the last 24 hours',
    write: false,
  },
  {
    command: 'diagnostic-logs',
    description:
      'Read the redacted diagnostic log (Client actions, errors, performance, Host warnings)',
    write: false,
  },
];

export const DIAGNOSTIC_ERROR_CODES = ['diagnostic-log-unavailable'] as const;

const ISSUE_URL = 'https://github.com/BotHarness/DeepSeekBot/issues/new?template=01-bug.yml';

export const TOB_DOCTOR_GUIDE = [
  'Read each check whose status is not "ok" and follow its hint before guessing.',
  'Error details: diagnostic-logs --kind error --limit 100.',
  'Never name a cause the report or the log does not show.',
  'Ask the Human before restarting, reinstalling or changing settings, and report only what you verified.',
  `If you cannot fix it, ask the Human to export the log from Diagnostic logs in Tobs and open ${ISSUE_URL} with the versions above and the ZIP.`,
] as const;

type ListQuery = { filter: string; since: number; limit: number };

export function createTobDiagnosticOperations(deps: {
  list(query: ListQuery): DiagnosticLogList | undefined;
  updateRun(): unknown;
  environment(): DiagnosticLogEnvironment;
  now?: () => number;
}): PrepareTobOperation {
  const now = deps.now ?? Date.now;
  const list = (query: ListQuery) => {
    try {
      return deps.list(query);
    } catch {
      throw new TobError('invalid-input');
    }
  };
  return (command, args) => {
    switch (command) {
      case 'diagnostic-logs':
        return {
          run: () => {
            const value = list({
              filter: String(args['filter']),
              since: Number(args['since'] ?? now() - DOCTOR_DAY_MS),
              limit: Number(args['limit']),
            });
            if (value === undefined) throw new TobError('diagnostic-log-unavailable');
            return { ...value, source: 'host' };
          },
        };
      case 'doctor':
        return {
          run: () => {
            const at = now();
            const errors = list({
              filter: 'error',
              since: at - DOCTOR_DAY_MS,
              limit: DOCTOR_ERROR_LIMIT,
            });
            let update;
            try {
              update = updateCheck(deps.updateRun());
            } catch {
              update = {
                id: 'last-update' as const,
                status: 'skip' as const,
                code: 'update-status-unavailable',
              };
            }
            return doctorReport({
              checks: [
                { id: 'host', status: 'ok' },
                { id: 'plugin', status: 'ok' },
                update,
                errors === undefined
                  ? { id: 'log', status: 'fail', code: 'diagnostic-log-unavailable' }
                  : { id: 'log', status: 'ok', source: 'host' },
              ],
              errors,
              source: 'host',
              environment: deps.environment(),
              checkedAt: at,
              next: ['diagnostic-logs --kind error --limit 100'],
              guide: TOB_DOCTOR_GUIDE,
            });
          },
        };
      default:
        return undefined;
    }
  };
}
