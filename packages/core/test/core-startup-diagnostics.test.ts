import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import { createCore } from '../src/plugin.js';
import * as roster from '../src/roster/store.js';
import { createCoreStartup } from '../src/diagnostics/core-startup.js';
import { recordDatabaseStartup } from '../src/diagnostics/database-startup.js';
import {
  diagnosticEventRecorder,
  diagnosticLogView,
  exportDiagnosticLogOffline,
} from '../src/diagnostics/diagnostic-log.js';
import { buildBugReport } from '../src/diagnostics/bug-report.js';
import { openLogDatabase } from '../src/logs/log-db.js';
import { readZip } from '../src/bots/zip-archive.js';
import { createTempRoot } from './helpers.js';

afterEach(() => vi.restoreAllMocks());

it('retains a post-database initializer failure, original throw and cleanup, then separates recovery', async () => {
  const dshHome = createTempRoot('core-startup-');
  const logs = openLogDatabase({ dir: join(dshHome, 'botharness') });
  let logsOpen = true;
  const events = diagnosticEventRecorder((rows) => logs.writeMany(rows));
  const options = {
    dshHome,
    startupDiagnostic: events,
    databaseDiagnostic: (snapshot: Parameters<typeof recordDatabaseStartup>[1]) =>
      recordDatabaseStartup(events, snapshot),
  };
  let parserError: unknown;
  try {
    JSON.parse('private user content C:/private.db');
  } catch (error) {
    parserError = error;
  }
  const failure = Object.assign(
    new Error(`Cannot initialize ${join(dshHome, 'private.db')} password=fixture-secret`, {
      cause: Object.assign(new Error('underlying failure', { cause: parserError }), {
        code: 'EACCES',
        syscall: 'open',
      }),
    }),
    { name: 'private error name', code: 'SQLITE_PRIVATE_CANARY' },
  );
  vi.spyOn(roster, 'createRosterStore').mockImplementationOnce(() => {
    throw failure;
  });
  try {
    expect(() => createCore(options)).toThrow(failure);
    const failedRows = logs.range(0, 100).map(diagnosticLogView);
    const failed = failedRows.find((row) => row.source === 'core-startup' && row.code === 'failed');
    expect(failed?.fields).toMatchObject({
      module: 'roster',
      stage: 'initialize',
      databaseMode: 'ready',
      scope: 'application-core',
      pid: process.pid,
      durationMs: expect.any(Number),
      stageDurationMs: expect.any(Number),
    });
    expect(failedRows).toContainEqual(
      expect.objectContaining({
        source: 'operational-database',
        code: 'ready',
        fields: expect.objectContaining({ mountId: failed?.fields?.['mountId'] }),
      }),
    );
    expect(failedRows).toContainEqual(
      expect.objectContaining({ source: 'operational-database', code: 'closed' }),
    );
    expect(
      failedRows.filter((row) => row.source === 'core-startup' && row.code === 'ready'),
    ).toHaveLength(0);
    expect(JSON.stringify(failedRows)).not.toMatch(
      /fixture-secret|private|user content|SQLITE_PRIVATE_CANARY/u,
    );
    logs.close();
    logsOpen = false;
    const environment = {
      version: 'test',
      platform: process.platform,
      arch: process.arch,
      node: process.version,
    };
    const homes = [{ path: dshHome, label: '$DSH_HOME' }];
    const offline = exportDiagnosticLogOffline({ dshHome, hours: 24, environment, homes });
    expect(offline).toBeDefined();
    const offlineFiles = readZip(offline!.archive, { maxEntries: 32, maxTotalBytes: 4 << 20 });
    const offlineText = Buffer.from(
      offlineFiles.find((file) => file.path === 'logs.jsonl')!.data,
    ).toString();
    expect(offlineText).toContain('roster');
    expect(offlineText).toContain('EACCES');
    expect(offlineText).toContain(String(failed?.fields?.['attemptId']));
    expect(offlineText).not.toContain('fixture-secret');
    expect(
      offlineText
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
        .filter((row) => row.source === 'core-startup' && row.code === 'ready'),
    ).toHaveLength(0);
    expect(offlineText).not.toMatch(/private|user content/u);
    const reopened = openLogDatabase({ dir: join(dshHome, 'botharness') });
    try {
      const nextEvents = diagnosticEventRecorder((rows) => reopened.writeMany(rows));
      const core = createCore({
        ...options,
        startupDiagnostic: nextEvents,
        databaseDiagnostic: (snapshot) => recordDatabaseStartup(nextEvents, snapshot),
      });
      try {
        const rows = reopened.range(0, 100).map(diagnosticLogView);
        const ready = rows.find((row) => row.source === 'core-startup' && row.code === 'ready');
        expect(ready?.fields).toMatchObject({ scope: 'application-core', databaseMode: 'ready' });
        expect(
          rows.filter(
            (row) =>
              row.source === 'core-startup' &&
              row.fields['attemptId'] === ready?.fields?.['attemptId'],
          ),
        ).toHaveLength(2);
        expect(ready?.fields?.['attemptId']).not.toBe(failed?.fields?.['attemptId']);
        expect(ready?.fields?.['mountId']).not.toBe(failed?.fields?.['mountId']);
        expect(
          rows.filter((row) => row.source === 'core-startup' && row.code === 'started'),
        ).toHaveLength(2);
        const report = buildBugReport(
          { title: 'Startup', description: 'Fixture', hours: 24, attachments: [] },
          { database: reopened, environment, homes, exportedBy: 'host' },
        );
        const files = readZip(report.archive, { maxEntries: 32, maxTotalBytes: 4 << 20 });
        const text = Buffer.from(
          files.find((file) => file.path === 'diagnostic-logs/logs.jsonl')!.data,
        ).toString();
        expect(text).toContain('EACCES');
        expect(text).toContain('application-core');
        expect(text).not.toMatch(/fixture-secret|private|user content/u);
      } finally {
        await core.runtime.close();
        core.schedules.close();
        core.live.close();
        core.companions.close();
        core.externalMessaging.close();
        core.contentPurge.close();
        core.operationalDatabase.close();
      }
    } finally {
      reopened.close();
    }
  } finally {
    if (logsOpen) logs.close();
  }
});

it('bounds cyclic causes, omits arbitrary thrown content, and never turns missing completion into success', () => {
  const rows: unknown[] = [];
  const tracker = createCoreStartup({
    record: (source, phase, fields) => rows.push({ source, phase, fields }),
  });
  tracker.enter('roster');
  const error = new Error('first');
  error.cause = error;
  tracker.failed(error);
  expect(rows).toHaveLength(3);
  expect(JSON.stringify(rows)).not.toContain('ready');
  const incomplete: string[] = [];
  createCoreStartup({ record: (_source, phase) => incomplete.push(phase) });
  expect(incomplete).toEqual(['started']);
  const thrown: string[] = [];
  const arbitrary = createCoreStartup({ record: (_source, phase) => thrown.push(phase) });
  arbitrary.failed({ message: 'private user content' });
  expect(thrown).toEqual(['started', 'failed']);
});

it('ignores recorder failures on successful and failed construction', () => {
  const tracker = createCoreStartup({
    record: () => {
      throw new Error('recorder failed');
    },
  });
  expect(() => tracker.ready()).not.toThrow();
  expect(() => tracker.failed(new Error('initializer failed'))).not.toThrow();
});

it('omits user content and every path form before persistence and caps long cause chains', () => {
  const rows: Array<{ phase: string; fields: Record<string, unknown> }> = [];
  const tracker = createCoreStartup({
    record: (_source, phase, fields) => rows.push({ phase, fields }),
  });
  let error: Error = new SyntaxError(
    'private user content C:\\private.db /private.db \\\server\\share\\private.db password=fixture-secret',
  );
  for (let i = 0; i < 8; i++) error = new Error('private user content', { cause: error });
  tracker.failed(error);
  expect(rows.filter((row) => row.phase === 'failure-cause')).toHaveLength(4);
  expect(JSON.stringify(rows)).not.toMatch(/private|fixture-secret|server|share/u);
});

it('reports constructed degraded Core separately from healthy database readiness', async () => {
  const dshHome = createTempRoot('core-startup-degraded-');
  const writer = createCore({ dshHome });
  const events: Array<{ phase: string; fields: Record<string, unknown> }> = [];
  let degraded: ReturnType<typeof createCore> | undefined;
  try {
    degraded = createCore({
      dshHome,
      startupDiagnostic: { record: (_source, phase, fields) => events.push({ phase, fields }) },
    });
    expect(degraded.operationalDatabase.mode).toBe('recovery');
    expect(events).toContainEqual(
      expect.objectContaining({
        phase: 'ready',
        fields: expect.objectContaining({ scope: 'application-core', databaseMode: 'recovery' }),
      }),
    );
    expect(events.map((event) => event.phase)).toEqual(['started', 'ready']);
  } finally {
    for (const core of [degraded, writer]) {
      if (core === undefined) continue;
      await core.runtime.close();
      core.schedules.close();
      core.live.close();
      core.companions.close();
      core.externalMessaging.close();
      core.contentPurge.close();
      core.operationalDatabase.close();
    }
  }
});
