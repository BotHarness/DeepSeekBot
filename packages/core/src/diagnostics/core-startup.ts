import { randomUUID } from 'node:crypto';

import type { OperationalDatabaseDiagnostics } from '../database/owner.js';
import type { DiagnosticEvents, DiagnosticEventFields } from './diagnostic-log.js';

export function createCoreStartup(events: DiagnosticEvents | undefined) {
  const attemptId = randomUUID();
  const mountId = randomUUID();
  const started = performance.now();
  let module = 'operational-database';
  let stage = 'mount';
  let stageStarted = started;
  let databaseMode: OperationalDatabaseDiagnostics['mode'] | 'unknown' = 'unknown';
  const record = (phase: string, fields: DiagnosticEventFields = {}) => {
    try {
      events?.record(
        'core-startup',
        phase,
        {
          attemptId,
          mountId,
          pid: process.pid,
          scope: 'application-core',
          module,
          stage,
          durationMs: performance.now() - started,
          stageDurationMs: performance.now() - stageStarted,
          databaseMode,
          ...fields,
        },
        { level: phase === 'failed' || phase === 'failure-cause' ? 'warn' : 'info' },
      );
    } catch {}
  };
  record('started');
  return {
    mountId,
    enter(nextModule: string, nextStage = 'initialize') {
      module = nextModule;
      stage = nextStage;
      stageStarted = performance.now();
    },
    mounted(snapshot: OperationalDatabaseDiagnostics) {
      databaseMode = snapshot.mode;
    },
    ready() {
      module = 'core';
      stage = 'constructed';
      stageStarted = performance.now();
      record('ready');
    },
    failed(error: unknown) {
      record('failed');
      const seen = new Set<Error>();
      let cause = error;
      for (let index = 0; cause instanceof Error && index < 4 && !seen.has(cause); index++) {
        seen.add(cause);
        record('failure-cause', {
          index,
          name: ['Error', 'TypeError', 'RangeError', 'SyntaxError', 'AggregateError'].includes(
            cause.name,
          )
            ? cause.name
            : 'Error',
          message: '<omitted>',
          code:
            'code' in cause &&
            typeof cause.code === 'string' &&
            /^(?:ERR_SQLITE_ERROR|SQLITE_BUSY|SQLITE_LOCKED|SQLITE_CANTOPEN|SQLITE_READONLY|SQLITE_CORRUPT|SQLITE_FULL|SQLITE_IOERR|SQLITE_CONSTRAINT|SQLITE_MISMATCH|SQLITE_NOTADB|SQLITE_ERROR|EACCES|EPERM|ENOENT|ENOTDIR|EISDIR|ENOSPC|EMFILE|EBUSY|EIO)$/u.test(
              cause.code,
            )
              ? cause.code
              : undefined,
          errcode:
            'errcode' in cause &&
            typeof cause.errcode === 'number' &&
            Number.isSafeInteger(cause.errcode)
              ? cause.errcode
              : undefined,
          syscall:
            'syscall' in cause &&
            typeof cause.syscall === 'string' &&
            ['open', 'read', 'write', 'rename', 'mkdir', 'stat', 'unlink'].includes(cause.syscall)
              ? cause.syscall
              : undefined,
        });
        cause = cause.cause;
      }
    },
  };
}
