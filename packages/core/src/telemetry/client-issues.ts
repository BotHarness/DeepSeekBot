import type { ClientLogEntry } from '../diagnostics/diagnostic-log.js';
import type { TelemetryExceptionEntry, TelemetryService, TelemetryStackFrame } from './service.js';

export const CLIENT_ISSUE_KINDS = [
  'uncaught_error',
  'unhandled_rejection',
  'resource_load_failed',
  'console_error',
  'rpc_failed',
  'rpc_threw',
  'rpc_slow',
  'long_task',
  'invariant',
] as const;
export type ClientIssueKind = (typeof CLIENT_ISSUE_KINDS)[number];

export const CLIENT_ISSUE_DURATION_BUCKETS = ['under_1s', '1s_3s', '3s_10s', 'over_10s'] as const;

export const CLIENT_ISSUE_LIMITS = {
  reportsPerHour: 60,
  exceptionsPerHour: 20,
  sessions: 200,
  maxFrames: 20,
} as const;

const KINDS: Readonly<Record<string, ClientIssueKind>> = {
  'uncaught-error': 'uncaught_error',
  'unhandled-rejection': 'unhandled_rejection',
  'resource-load-failed': 'resource_load_failed',
  'console-error': 'console_error',
  'rpc-failed': 'rpc_failed',
  'rpc-threw': 'rpc_threw',
  'rpc-slow': 'rpc_slow',
  'long-task': 'long_task',
  'long-frame': 'long_task',
};
const TYPE = /^[A-Za-z_$][\w$.]{0,63}$/u;
const CHROME_FRAME = /^at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/u;
const GECKO_FRAME = /^(.*?)@(.+?):(\d+):(\d+)$/u;

type Mechanism = 'onerror' | 'onunhandledrejection';

function kindOf(entry: ClientLogEntry): ClientIssueKind | undefined {
  if (entry.level !== 'error' && entry.level !== 'warn') return;
  if (entry.category === 'invariant') return 'invariant';
  return KINDS[entry.code];
}

function bucket(ms: unknown): (typeof CLIENT_ISSUE_DURATION_BUCKETS)[number] | undefined {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return;
  if (ms < 1000) return 'under_1s';
  if (ms < 3000) return '1s_3s';
  if (ms < 10_000) return '3s_10s';
  return 'over_10s';
}

function basename(path: string): string {
  const clean = path.replace(/[?#].*$/u, '').replace(/\\/gu, '/');
  const base = clean.slice(clean.lastIndexOf('/') + 1);
  return /^[\w.@-]{1,120}$/u.test(base) ? base : '<anonymous>';
}

function functionName(raw: string | undefined): string {
  const name = raw?.trim() ?? '';
  return /^[\w$.<>\s[\]-]{1,80}$/u.test(name) ? name : '<anonymous>';
}

export function clientStackFrames(stack: string): TelemetryStackFrame[] {
  const frames: TelemetryStackFrame[] = [];
  for (const part of stack.split(' | ')) {
    const line = part.trim();
    const match = CHROME_FRAME.exec(line) ?? GECKO_FRAME.exec(line);
    if (match === null) continue;
    const path = match[2]!;
    const filename = basename(path);
    frames.push({
      platform: 'web:javascript',
      function: functionName(match[1]),
      filename,
      abs_path: filename,
      lineno: Number(match[3]),
      colno: Number(match[4]),
      in_app: /^\/[^/]/u.test(path) && /\.m?js$/u.test(filename),
    });
    if (frames.length >= CLIENT_ISSUE_LIMITS.maxFrames) break;
  }
  return frames.reverse();
}

export function clientException(entry: ClientLogEntry): TelemetryExceptionEntry | undefined {
  const mechanism: Mechanism | undefined =
    entry.code === 'uncaught-error'
      ? 'onerror'
      : entry.code === 'unhandled-rejection'
        ? 'onunhandledrejection'
        : undefined;
  const stack = entry.fields?.['stack'];
  if (mechanism === undefined || typeof stack !== 'string') return;
  const frames = clientStackFrames(stack);
  if (!frames.some((frame) => frame.in_app)) return;
  const name = entry.fields?.['name'];
  return {
    type: typeof name === 'string' && TYPE.test(name) ? name : 'Error',
    mechanism: { type: mechanism, handled: false },
    stacktrace: { type: 'raw', frames },
  };
}

function hourBudget(limit: number, now: () => number) {
  let hour = -1;
  let used = 0;
  return () => {
    const current = Math.floor(now() / 3_600_000);
    if (current !== hour) {
      hour = current;
      used = 0;
    }
    if (used >= limit) return false;
    used += 1;
    return true;
  };
}

export interface ClientIssueReporter {
  observe(session: string, entries: readonly ClientLogEntry[]): void;
}

export function createClientIssueReporter(options: {
  telemetry: Pick<TelemetryService, 'enabled' | 'capture' | 'captureException'>;
  now?: () => number;
}): ClientIssueReporter {
  const now = options.now ?? Date.now;
  const seen = new Map<string, Set<string>>();
  const report = hourBudget(CLIENT_ISSUE_LIMITS.reportsPerHour, now);
  const exception = hourBudget(CLIENT_ISSUE_LIMITS.exceptionsPerHour, now);
  const first = (session: string, key: string): boolean => {
    let keys = seen.get(session);
    if (keys === undefined) {
      if (seen.size >= CLIENT_ISSUE_LIMITS.sessions) seen.delete(seen.keys().next().value!);
      keys = new Set();
      seen.set(session, keys);
    }
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  };
  return {
    observe(session, entries) {
      if (!options.telemetry.enabled) return;
      try {
        for (const entry of entries) {
          const kind = kindOf(entry);
          if (kind === undefined) continue;
          if (first(session, kind) && report()) {
            const duration = bucket(entry.fields?.['ms']);
            options.telemetry.capture('app:client_issue_report', {
              kind,
              ...(duration === undefined ? {} : { duration_bucket: duration }),
            });
          }
          const thrown = clientException(entry);
          if (thrown === undefined) continue;
          const top = thrown.stacktrace.frames.at(-1);
          const key = `exception:${thrown.type}:${top?.filename}:${top?.lineno}:${top?.colno}`;
          if (first(session, key) && exception()) options.telemetry.captureException(thrown);
        }
      } catch {
        return;
      }
    },
  };
}
