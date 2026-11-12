import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createUpdateLifecycle,
  UPDATE_CORRELATION_MAX_AGE_MS,
} from '../src/diagnostics/update-lifecycle.js';
import { diagnosticEventRecorder, diagnosticLogView } from '../src/diagnostics/diagnostic-log.js';
import { openLogDatabase } from '../src/logs/log-db.js';
import { createUpdateRuns } from '../src/release/update-runs.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const target = { kind: 'release', name: 'deepseekbot', version: '1.2.0' } as const;
const updateId = 'update-4057';
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'update-lifecycle-'));
  dirs.push(dir);
  const database = openLogDatabase({ dir });
  const events = diagnosticEventRecorder((rows) => database.writeMany(rows));
  const lifecycle = createUpdateLifecycle({
    dir,
    events,
    runningVersion: '1.1.0',
    now: () => 1000,
  });
  const runs = createUpdateRuns({ observe: lifecycle.observe });
  return {
    dir,
    database,
    events,
    lifecycle,
    runs,
    rows: () =>
      database.query({ plugin: 'release-update', limit: 100 }).map(diagnosticLogView).reverse(),
  };
}

describe('update lifecycle process evidence', () => {
  it.each(['failed', 'cancelled'] as const)(
    'persists %s without raw installer data',
    async (reason) => {
      const f = fixture();
      try {
        await f.runs.run(target, { requestId: updateId, joinable: false }, async (handle) => {
          handle.installing();
          f.runs.log({
            requestId: updateId,
            jobId: 'secret-job',
            argv: ['pnpm', '--token=SECRET'],
            text: 'SECRET output',
          });
          return {
            status: 'failed',
            reason,
            diagnostic: 'SECRET diagnostic',
            logPath: '/private/SECRET',
          };
        });
        createUpdateLifecycle({
          dir: f.dir,
          events: f.events,
          runningVersion: '1.1.0',
          now: () => 2000,
        }).startup('mount-new');
        expect(f.rows().map((r) => r.code)).toEqual([
          'checking',
          'installing',
          reason,
          'startup-observed',
        ]);
        expect(f.rows().at(-1)?.fields).toMatchObject({
          updateId,
          previousPhase: reason,
          transitionOutcome: reason,
          previousProcessExit: 'unknown',
        });
        expect(JSON.stringify(f.rows())).not.toContain('SECRET');
        expect(existsSync(join(f.dir, 'update-correlation.json'))).toBe(true);
      } finally {
        f.database.close();
      }
    },
  );

  it('links installed/restart-requested to observed startup without asserting clean exit', async () => {
    const f = fixture();
    try {
      await f.runs.run(target, { requestId: updateId, joinable: false }, async (handle) => {
        handle.installing();
        f.runs.state({ requestId: updateId, phase: 'applying' });
        return { status: 'installed', applied: false };
      });
      f.lifecycle.restartRequested('1.2.0');
      const next = createUpdateLifecycle({
        dir: f.dir,
        events: f.events,
        runningVersion: '1.2.0',
        now: () => 2000,
      });
      next.startup('mount-new');
      next.startup('mount-new');
      expect(f.rows().map((r) => r.code)).toEqual([
        'checking',
        'installing',
        'applying',
        'installed',
        'restart-requested',
        'startup-observed',
      ]);
      expect(f.rows().at(-1)?.fields).toMatchObject({
        updateId,
        oldVersion: '1.1.0',
        targetVersion: '1.2.0',
        targetObserved: true,
        transitionOutcome: 'unknown',
        mountId: 'mount-new',
        processRelation: 'same-pid-unknown',
      });
    } finally {
      f.database.close();
    }
  });

  it.each(['installing', 'applying', 'restart-failed'] as const)(
    'leaves %s interruption unknown',
    (phase) => {
      const f = fixture();
      try {
        f.lifecycle.observe({
          id: updateId,
          ...target,
          phase: phase === 'restart-failed' ? 'installed' : phase,
        });
        if (phase === 'restart-failed') {
          f.lifecycle.restartRequested('1.2.0');
          f.lifecycle.restartFailed();
        }
        createUpdateLifecycle({
          dir: f.dir,
          events: f.events,
          runningVersion: '1.1.0',
          now: () => 2000,
        }).startup('mount-new');
        expect(f.rows().at(-1)?.fields).toMatchObject({
          previousPhase: phase,
          transitionOutcome: 'unknown',
          targetObserved: false,
        });
      } finally {
        f.database.close();
      }
    },
  );

  it('bounds retention and rejects malformed or oversized marker data', () => {
    const f = fixture();
    try {
      f.lifecycle.observe({ id: updateId, ...target, phase: 'checking' });
      expect(readFileSync(join(f.dir, 'update-correlation.json')).length).toBeLessThan(4096);
      createUpdateLifecycle({
        dir: f.dir,
        events: f.events,
        runningVersion: '1.1.0',
        now: () => 1001 + UPDATE_CORRELATION_MAX_AGE_MS,
      }).startup('mount-new');
      expect(f.rows().at(-1)?.code).toBe('correlation-discarded');
      writeFileSync(join(f.dir, 'update-correlation.json'), 'x'.repeat(5000));
      createUpdateLifecycle({ dir: f.dir, events: f.events, runningVersion: '1.1.0' }).startup(
        'another-mount',
      );
      expect(f.rows().at(-1)?.code).toBe('correlation-read-failed');
      expect(existsSync(join(f.dir, 'update-correlation.json'))).toBe(false);
    } finally {
      f.database.close();
    }
  });

  it('discards schema-invalid input and ignores Plugin updates', () => {
    const f = fixture();
    try {
      f.lifecycle.observe({ id: updateId, kind: 'plugin', version: '1.2.0', phase: 'installing' });
      expect(existsSync(join(f.dir, 'update-correlation.json'))).toBe(false);
      writeFileSync(
        join(f.dir, 'update-correlation.json'),
        JSON.stringify({ format: 1, phase: 'installed', output: 'SECRET' }),
      );
      createUpdateLifecycle({ dir: f.dir, events: f.events, runningVersion: '1.1.0' }).startup(
        'mount',
      );
      expect(f.rows().at(-1)?.code).toBe('correlation-discarded');
      expect(JSON.stringify(f.rows())).not.toContain('SECRET');
    } finally {
      f.database.close();
    }
  });

  it('does not treat two unknown versions as proof of the target', () => {
    const f = fixture();
    try {
      f.lifecycle.observe({
        id: updateId,
        ...target,
        version: 'unsafe metadata',
        phase: 'installed',
      });
      createUpdateLifecycle({
        dir: f.dir,
        events: f.events,
        runningVersion: 'unknown',
        now: () => 2000,
      }).startup('mount');
      expect(f.rows().at(-1)?.fields).toMatchObject({
        targetVersion: 'unknown',
        runningVersion: 'unknown',
        targetObserved: false,
      });
    } finally {
      f.database.close();
    }
  });

  it('retains a same-process marker for a subsequent different-process observation', () => {
    const f = fixture();
    try {
      f.lifecycle.observe({ id: updateId, ...target, phase: 'installing' });
      createUpdateLifecycle({
        dir: f.dir,
        events: f.events,
        runningVersion: '1.1.0',
        now: () => 2000,
      }).startup('same-process-mount');
      const path = join(f.dir, 'update-correlation.json');
      expect(existsSync(path)).toBe(true);
      const marker = JSON.parse(readFileSync(path, 'utf8'));
      writeFileSync(path, JSON.stringify({ ...marker, pid: process.pid + 1 }));
      createUpdateLifecycle({
        dir: f.dir,
        events: f.events,
        runningVersion: '1.1.0',
        now: () => 3000,
      }).startup('new-process-mount');
      expect(f.rows().at(-1)?.fields).toMatchObject({
        processRelation: 'different-process',
        previousPhase: 'installing',
        transitionOutcome: 'unknown',
      });
      expect(existsSync(path)).toBe(false);
    } finally {
      f.database.close();
    }
  });

  it('deduplicates progress phases and keeps diagnostic failures out of installation control', async () => {
    const f = fixture();
    try {
      await f.runs.run(target, { requestId: updateId, joinable: false }, async (handle) => {
        handle.installing();
        for (let index = 0; index < 100; index++)
          f.runs.state({ requestId: updateId, phase: 'installing' });
        return { status: 'installed', applied: false };
      });
      expect(f.rows().map((row) => row.code)).toEqual(['checking', 'installing', 'installed']);
      const broken = createUpdateLifecycle({
        dir: join(f.dir, 'update-correlation.json'),
        events: {
          record() {
            throw new Error('unavailable');
          },
        },
        runningVersion: '1.1.0',
      });
      const runs = createUpdateRuns({ observe: broken.observe });
      await expect(
        runs.run(target, { requestId: updateId, joinable: false }, async () => ({
          status: 'installed',
          applied: false,
        })),
      ).resolves.toEqual({ status: 'installed', applied: false });
    } finally {
      f.database.close();
    }
  });
});
