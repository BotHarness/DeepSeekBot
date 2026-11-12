import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

import type { DiagnosticEvents } from './diagnostic-log.js';
import type { UpdateRunSummary } from '../release/update-runs.js';

export const UPDATE_CORRELATION_MAX_AGE_MS = 7 * 24 * 3_600_000;
const version = z
  .string()
  .max(100)
  .regex(/^(?:unknown|\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?)$/u);
const markerSchema = z
  .object({
    format: z.literal(1),
    updateId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/u),
    oldVersion: version,
    targetVersion: version,
    phase: z.enum([
      'checking',
      'installing',
      'cancelling',
      'applying',
      'installed',
      'failed',
      'cancelled',
      'restart-requested',
      'restart-failed',
    ]),
    at: z.number().int().nonnegative(),
    pid: z.number().int().positive(),
  })
  .strict();
type Marker = z.infer<typeof markerSchema>;

export function createUpdateLifecycle(options: {
  dir: string;
  events: DiagnosticEvents;
  runningVersion: string;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const path = join(options.dir, 'update-correlation.json');
  let current: Marker | undefined;
  let startupObserved = false;
  const emit: DiagnosticEvents['record'] = (...args) => {
    try {
      options.events.record(...args);
    } catch {}
  };
  const safeVersion = (value: string) => (version.safeParse(value).success ? value : 'unknown');
  const record = (marker: Marker) => {
    current = marker;
    emit('release-update', marker.phase, { ...marker });
    try {
      mkdirSync(options.dir, { recursive: true });
      writeFileSync(path + '.tmp', JSON.stringify(marker), { mode: 0o600 });
      renameSync(path + '.tmp', path);
    } catch {
      emit('release-update', 'correlation-write-failed', { updateId: marker.updateId });
    }
  };
  return {
    observe(summary: UpdateRunSummary) {
      if (summary.kind !== 'release') return;
      const parsed = markerSchema.safeParse({
        format: 1,
        updateId: summary.id,
        oldVersion: safeVersion(options.runningVersion),
        targetVersion: safeVersion(summary.version),
        phase: summary.phase,
        at: now(),
        pid: process.pid,
      });
      if (parsed.success) record(parsed.data);
    },
    restartRequested(targetVersion: string) {
      if (
        current === undefined ||
        !['installed', 'restart-requested', 'restart-failed'].includes(current.phase) ||
        current.targetVersion !== targetVersion
      )
        return;
      record({ ...current, phase: 'restart-requested', at: now() });
    },
    restartFailed() {
      if (current?.phase === 'restart-requested')
        record({ ...current, phase: 'restart-failed', at: now() });
    },
    startup(mountId: string, stage = 'unknown') {
      if (startupObserved) return;
      startupObserved = true;
      try {
        let retain = false;
        if (statSync(path).size > 4096) throw new Error('oversize');
        const parsed = markerSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
        if (
          !parsed.success ||
          parsed.data.at > now() ||
          now() - parsed.data.at > UPDATE_CORRELATION_MAX_AGE_MS
        ) {
          emit('release-update', 'correlation-discarded', { reason: 'invalid-or-expired' });
        } else {
          const marker = parsed.data;
          current = marker;
          retain = marker.pid === process.pid;
          emit('release-update', 'startup-observed', {
            updateId: marker.updateId,
            oldVersion: marker.oldVersion,
            targetVersion: marker.targetVersion,
            previousPhase: marker.phase,
            runningVersion: safeVersion(options.runningVersion),
            mountId,
            stage,
            previousProcessExit: 'unknown',
            previousPid: marker.pid,
            pid: process.pid,
            processRelation: marker.pid === process.pid ? 'same-pid-unknown' : 'different-process',
            targetObserved:
              marker.targetVersion !== 'unknown' &&
              safeVersion(options.runningVersion) !== 'unknown' &&
              safeVersion(options.runningVersion) === marker.targetVersion,
            transitionOutcome: ['failed', 'cancelled', 'installed'].includes(marker.phase)
              ? marker.phase
              : 'unknown',
          });
        }
        if (!retain) rmSync(path);
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
          emit('release-update', 'correlation-read-failed', { reason: 'unavailable' });
          try {
            rmSync(path);
          } catch {}
        }
      }
    },
  };
}
