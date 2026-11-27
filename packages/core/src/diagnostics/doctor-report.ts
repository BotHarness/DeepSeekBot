import { release } from 'node:os';
import type { DiagnosticLogEnvironment, DiagnosticLogList } from './diagnostic-log.js';

export type DoctorStatus = 'ok' | 'warn' | 'fail' | 'skip';

export interface DoctorCheck {
  id: 'dsh-home' | 'host' | 'plugin' | 'last-update' | 'log' | 'errors-24h';
  status: DoctorStatus;
  code?: string;
  detail?: string;
  hint?: string;
  [key: string]: unknown;
}

export const DOCTOR_DAY_MS = 24 * 3_600_000;
export const DOCTOR_ERROR_LIMIT = 1000;
const TOP_ERRORS = 5;

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

export function updateCheck(run: unknown): DoctorCheck {
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

export function doctorReport(options: {
  checks: DoctorCheck[];
  errors: DiagnosticLogList | undefined;
  source: 'host' | 'offline';
  fallback?: string;
  environment: DiagnosticLogEnvironment;
  checkedAt: number;
  next: readonly string[];
  guide: readonly string[];
}) {
  const { checks, errors, environment } = options;
  if (errors === undefined)
    checks.push({ id: 'errors-24h', status: 'skip', code: 'log-unavailable' });
  else {
    const top = topErrors(errors);
    checks.push({
      id: 'errors-24h',
      status:
        errors.entries.length === 0 && errors.completeness?.['status'] !== 'partial'
          ? 'ok'
          : 'warn',
      count: errors.entries.length,
      ...(errors.completeness === undefined ? {} : { completeness: errors.completeness }),
      ...(errors.entries.length >= DOCTOR_ERROR_LIMIT ? { truncated: true } : {}),
      ...(top.length === 0 ? {} : { top }),
    });
  }
  return {
    ok: checks.every((check) => check.status !== 'fail'),
    source: options.source,
    ...(options.fallback === undefined ? {} : { fallback: options.fallback }),
    checkedAt: new Date(options.checkedAt).toISOString(),
    versions: {
      tobs: environment.version,
      ...(environment.dshVersion === undefined ? {} : { dsh: environment.dshVersion }),
      node: environment.node,
      os: `${environment.platform} ${release()} ${environment.arch}`,
    },
    checks,
    next: options.next,
    guide: options.guide,
  };
}
