import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

export const LOG_HEALTH_FILENAME = 'diagnostic-health.json';
export const LOG_HEALTH_MAX_BYTES = 16 * 1024;
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const transition = z.object({
  ts: count,
  phase: z.enum([
    'open-failed',
    'write-failed',
    'primary-reset',
    'recovered',
    'queue-loss',
    'rate-loss',
  ]),
  cause: z.enum(['permission', 'space', 'busy', 'unreadable', 'unknown', 'none']),
  lost: count,
});
const schema = z.object({
  version: z.literal(1),
  observedSince: count,
  lastSuccessfulWrite: count.nullable(),
  lostEvents: count,
  failureObservations: count.default(0),
  primaryResetAttempts: count.default(0),
  degraded: z.boolean().default(false),
  omittedTransitions: count,
  transitions: z.array(transition).max(32),
});
type HealthState = z.infer<typeof schema>;
export interface LogHealthSnapshot extends HealthState {
  evidence: 'durable' | 'memory-only' | 'unavailable';
  coverage: 'unknown';
}
type Phase = z.infer<typeof transition>['phase'];

export function readLogHealth(dir: string): LogHealthSnapshot {
  try {
    const path = join(dir, LOG_HEALTH_FILENAME);
    if (statSync(path).size > LOG_HEALTH_MAX_BYTES) throw new Error();
    const parsed = schema.parse(JSON.parse(readFileSync(path, 'utf8')));
    return { ...parsed, evidence: 'durable', coverage: 'unknown' };
  } catch {
    return {
      version: 1,
      observedSince: 0,
      lastSuccessfulWrite: null,
      lostEvents: 0,
      failureObservations: 0,
      primaryResetAttempts: 0,
      degraded: false,
      omittedTransitions: 0,
      transitions: [],
      evidence: 'unavailable',
      coverage: 'unknown',
    };
  }
}

function causeOf(error: unknown): z.infer<typeof transition>['cause'] {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  const sqlite =
    typeof error === 'object' &&
    error !== null &&
    'errcode' in error &&
    typeof error.errcode === 'number'
      ? error.errcode & 255
      : undefined;
  if (sqlite === 5 || sqlite === 6) return 'busy';
  if (sqlite === 13) return 'space';
  if (sqlite === 23) return 'permission';
  if (sqlite === 11 || sqlite === 26) return 'unreadable';
  if (code === 'EACCES' || code === 'EPERM') return 'permission';
  if (code === 'ENOSPC' || code === 'EDQUOT') return 'space';
  if (code === 'SQLITE_BUSY' || code === 'ERR_SQLITE_BUSY') return 'busy';
  if (code === 'SQLITE_CORRUPT') return 'unreadable';
  return 'unknown';
}

export function createLogHealth(dir: string, now: () => number = Date.now) {
  const prior = readLogHealth(dir);
  const state: HealthState = {
    version: 1,
    observedSince: prior.observedSince || now(),
    lastSuccessfulWrite: prior.lastSuccessfulWrite,
    lostEvents: prior.lostEvents,
    failureObservations: prior.failureObservations,
    primaryResetAttempts: prior.primaryResetAttempts,
    degraded: prior.degraded,
    omittedTransitions: prior.omittedTransitions,
    transitions: prior.transitions,
  };
  let evidence: LogHealthSnapshot['evidence'] = prior.evidence;
  let dirty = false;
  const persist = () => {
    if (!dirty) return;
    try {
      mkdirSync(dir, { recursive: true });
      const path = join(dir, LOG_HEALTH_FILENAME);
      writeFileSync(path + '.tmp', JSON.stringify(state), { mode: 0o600 });
      renameSync(path + '.tmp', path);
      evidence = 'durable';
      dirty = false;
    } catch {
      evidence = 'memory-only';
    }
  };
  const append = (phase: Phase, lost: number, cause: z.infer<typeof transition>['cause']) => {
    state.lostEvents = Math.min(Number.MAX_SAFE_INTEGER, state.lostEvents + lost);
    const last = state.transitions.at(-1);
    if (last?.phase === phase && last.cause === cause)
      last.lost = Math.min(Number.MAX_SAFE_INTEGER, last.lost + lost);
    else state.transitions.push({ ts: now(), phase, cause, lost });
    if (state.transitions.length > 32) {
      state.transitions.shift();
      state.omittedTransitions = Math.min(Number.MAX_SAFE_INTEGER, state.omittedTransitions + 1);
    }
    dirty = true;
  };
  return {
    failure(phase: 'open-failed' | 'write-failed' | 'primary-reset', error: unknown, lost = 0) {
      state.degraded = true;
      state.failureObservations = Math.min(Number.MAX_SAFE_INTEGER, state.failureObservations + 1);
      if (phase === 'primary-reset')
        state.primaryResetAttempts = Math.min(
          Number.MAX_SAFE_INTEGER,
          state.primaryResetAttempts + 1,
        );
      append(phase, lost, causeOf(error));
      persist();
    },
    loss(phase: 'queue-loss' | 'rate-loss', lost: number) {
      append(phase, lost, 'none');
    },
    success() {
      state.lastSuccessfulWrite = now();
      dirty = true;
      if (state.degraded) {
        append('recovered', 0, 'none');
        state.degraded = false;
      }
      persist();
    },
    snapshot(): LogHealthSnapshot {
      persist();
      return structuredClone({ ...state, evidence, coverage: 'unknown' });
    },
  };
}
export type LogHealth = ReturnType<typeof createLogHealth>;
