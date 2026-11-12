import { hostname, homedir } from 'node:os';
import { dirname } from 'node:path';

import type { OperationalDatabaseDiagnostics } from '../database/owner.js';
import type { DiagnosticEvents } from './diagnostic-log.js';
import { createDiagnosticRedactor } from './redaction.js';

export function recordDatabaseStartup(
  events: DiagnosticEvents,
  snapshot: OperationalDatabaseDiagnostics,
): void {
  const { startup, recovery } = snapshot;
  const phase =
    snapshot.mode === 'closed'
      ? 'closed'
      : recovery !== undefined
        ? 'recovery'
        : snapshot.mode === 'ready'
          ? 'ready'
          : 'mount-started';
  const writer = startup.observedWriter;
  const redactor = createDiagnosticRedactor({
    homes: [
      { path: dirname(dirname(snapshot.databasePath)), label: '$DSH_HOME' },
      { path: homedir(), label: '~' },
    ],
  });
  events.record(
    'operational-database',
    phase,
    redactor.value({
      initiator: 'host-startup',
      mountId: startup.instanceId,
      pid: startup.pid,
      stage: startup.stage,
      durationMs: startup.durationMs,
      generation: snapshot.generation,
      targetGeneration: startup.targetGeneration,
      migrationGeneration: startup.migrationGeneration,
      code: recovery?.code,
      reason: recovery?.message,
      writerEvidence: writer === undefined ? 'unavailable' : 'metadata-only',
      writerRelation:
        writer === undefined
          ? 'unknown'
          : writer.hostname !== hostname()
            ? 'other-machine'
            : writer.pid === startup.pid
              ? 'same-process'
              : 'same-machine-other-process',
      writerPid: writer?.pid,
      writerInstanceId: writer?.instanceId,
      writerAcquiredAt: writer?.acquiredAt,
    }),
    { level: recovery === undefined ? 'info' : 'warn' },
  );
  for (const [index, cause] of (phase === 'recovery' ? (recovery?.causes ?? []) : []).entries()) {
    events.record(
      'operational-database',
      'failure-cause',
      redactor.value({
        mountId: startup.instanceId,
        pid: startup.pid,
        stage: startup.stage,
        index,
        name: cause.name,
        message: cause.message,
        code: cause.code,
        errcode: cause.errcode,
        syscall: cause.syscall,
      }),
      { level: 'warn' },
    );
  }
}
