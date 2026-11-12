import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, it, vi } from 'vitest';
import { readZip } from '../src/bots/zip-archive.js';
import { buildBugReport, createBugReportHttp } from '../src/diagnostics/bug-report.js';
import {
  buildDiagnosticExport,
  createDiagnosticLogWriter,
  createDiagnosticLogHttp,
  diagnosticEventRecorder,
  exportDiagnosticLogOffline,
  listDiagnosticLogs,
} from '../src/diagnostics/diagnostic-log.js';
import {
  createLogHealth,
  LOG_HEALTH_FILENAME,
  LOG_HEALTH_MAX_BYTES,
  readLogHealth,
} from '../src/diagnostics/log-health.js';
import { openLogDatabase } from '../src/logs/log-db.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, writeFileSync: vi.fn(actual.writeFileSync) };
});

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function home() {
  const dir = mkdtempSync(join(tmpdir(), 'log-health-'));
  dirs.push(dir);
  return dir;
}
const environment = { version: 'test', platform: 'test', arch: 'test', node: 'test' };
const row = {
  plugin: 'host',
  owner: 'profile-shared',
  kind: 'host.warn',
  detail: 'fixture',
} as const;

it('observes destructive schema recovery even when the primary open ultimately succeeds', () => {
  const dir = home();
  openLogDatabase({ dir }).close();
  const raw = new DatabaseSync(join(dir, 'logs.db'));
  raw.exec('UPDATE log_schema SET version = 999');
  raw.close();
  const health = createLogHealth(dir);
  const database = openLogDatabase({
    dir,
    onEvidenceGap: (phase, error) => health.failure(phase, error),
  });
  try {
    expect(health.snapshot().transitions).toContainEqual(
      expect.objectContaining({ phase: 'open-failed', lost: 0 }),
    );
    expect(
      buildDiagnosticExport(database, {
        hours: 1,
        now: Date.now,
        environment,
        homes: [],
        health: health.snapshot(),
      }).manifest,
    ).toMatchObject({ completeness: { status: 'partial' } });
  } finally {
    database.close();
  }
});

it('marks real live-handle read failures unavailable instead of treating swallowed errors as empty logs', async () => {
  const dir = home();
  const health = createLogHealth(dir);
  const database = openLogDatabase({
    dir,
    strictReads: true,
    onEvidenceGap: (phase, error) => health.failure(phase, error),
  });
  const raw = new DatabaseSync(join(dir, 'logs.db'));
  try {
    raw.exec('DROP TABLE log_entries');
    expect(
      listDiagnosticLogs(database, { filter: 'all', since: 0, limit: 10, homes: [] }),
    ).toMatchObject({ entries: [], completeness: { status: 'partial', primary: 'unavailable' } });
    expect(
      buildDiagnosticExport(database, {
        hours: 1,
        now: Date.now,
        environment,
        homes: [],
        health: health.snapshot(),
      }).manifest,
    ).toMatchObject({ entries: 0, completeness: { status: 'partial', primary: 'unavailable' } });
    expect(health.snapshot().transitions.at(-1)?.phase).toBe('read-failed');
    const http = createDiagnosticLogHttp({
      database: () => database,
      writer: () => undefined,
      environment,
      homes: [],
      health: () => health.snapshot(),
    });
    const list = await http(new Request('http://localhost/api/botharness/diagnostic-logs'));
    expect(await list.json()).toMatchObject({
      completeness: { status: 'partial', primary: 'unavailable' },
    });
    const archive = await http(
      new Request('http://localhost/api/botharness/diagnostic-logs/export'),
    );
    expect(archive.status).toBe(200);
    expect(archive.headers.get('x-diagnostic-log-completeness')).toBe('partial');
    const bug = createBugReportHttp({
      database: () => database,
      environment,
      homes: [],
      health: () => health.snapshot(),
    });
    const form = new FormData();
    form.set('title', 'Read fault fixture');
    const response = await bug(
      new Request('http://localhost/api/botharness/bug-report', { method: 'POST', body: form }),
    );
    expect(response.status).toBe(200);
    const files = readZip(Buffer.from(await response.arrayBuffer()), {
      maxEntries: 10,
      maxTotalBytes: 100_000,
    });
    const manifest = files.find((file) => file.path === 'manifest.json');
    expect(JSON.parse(Buffer.from(manifest?.data ?? []).toString())).toMatchObject({
      logs: { completeness: { status: 'partial', primary: 'unavailable' } },
    });
  } finally {
    raw.close();
    database.close();
  }
});

it('observes actual open refusal and still exports the fallback through existing HTTP routes', async () => {
  const dir = home();
  mkdirSync(join(dir, 'logs.db'));
  writeFileSync(join(dir, 'logs.db', 'fixture'), 'owned blocker');
  const health = createLogHealth(dir);
  try {
    openLogDatabase({ dir, onEvidenceGap: (phase, error) => health.failure(phase, error) });
  } catch (error) {
    health.failure('open-failed', error);
  }
  const { createDiagnosticLogHttp } = await import('../src/diagnostics/diagnostic-log.js');
  const http = createDiagnosticLogHttp({
    database: () => undefined,
    writer: () => undefined,
    environment,
    homes: [],
    health: () => health.snapshot(),
  });
  const response = await http(
    new Request('http://localhost/api/botharness/diagnostic-logs/export'),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('x-diagnostic-log-completeness')).toBe('partial');
  expect(health.snapshot().transitions.some((event) => event.phase === 'open-failed')).toBe(true);
});

it('keeps bounded metadata independent of the failed primary and retains loss after recovery', () => {
  let now = 1000;
  const dir = home();
  const health = createLogHealth(dir, () => now);
  health.failure(
    'open-failed',
    Object.assign(new Error('secret /private/token'), { code: 'EACCES' }),
  );
  let fail = true;
  const writer = createDiagnosticLogWriter(
    {
      writeMany() {
        if (fail) throw Object.assign(new Error('secret /private/token'), { code: 'ENOSPC' });
      },
    },
    { health, maxPending: 1 },
  );
  writer.write([row, row, row]);
  writer.flush();
  now = 2000;
  fail = false;
  writer.write([row]);
  writer.flush();
  const snapshot = readLogHealth(dir);
  expect(snapshot).toMatchObject({
    evidence: 'durable',
    coverage: 'unknown',
    lostEvents: 3,
    lastSuccessfulWrite: 2000,
  });
  expect(snapshot.transitions.map((event) => event.phase)).toEqual([
    'open-failed',
    'queue-loss',
    'write-failed',
    'recovered',
  ]);
  const stored = readFileSync(join(dir, LOG_HEALTH_FILENAME), 'utf8');
  expect(stored).not.toMatch(/secret|private|token/);
  for (let i = 0; i < 50; i++) {
    health.failure('write-failed', new Error());
    health.success();
  }
  expect(health.snapshot().transitions).toHaveLength(32);
  expect(health.snapshot().omittedTransitions).toBeGreaterThan(0);
  expect(statSync(join(dir, LOG_HEALTH_FILENAME)).size).toBeLessThan(LOG_HEALTH_MAX_BYTES);
});

it('retains unknown historical loss after transition eviction and recovers across owner restart', () => {
  const dir = home();
  const health = createLogHealth(dir);
  health.failure('primary-reset', new Error());
  for (let i = 0; i < 40; i++) health.loss(i % 2 === 0 ? 'queue-loss' : 'rate-loss', 0);
  expect(health.snapshot().transitions.some((event) => event.phase === 'primary-reset')).toBe(
    false,
  );
  expect(health.snapshot()).toMatchObject({
    failureObservations: 1,
    primaryResetAttempts: 1,
    degraded: true,
    lostEvents: 0,
  });
  const restarted = createLogHealth(dir);
  restarted.success();
  expect(restarted.snapshot().transitions.at(-1)?.phase).toBe('recovered');
  expect(
    buildDiagnosticExport(undefined, {
      hours: 1,
      now: Date.now,
      environment,
      homes: [],
      health: restarted.snapshot(),
    }).manifest,
  ).toMatchObject({ completeness: { status: 'partial' } });
});

it('survives an unavailable alternate sink and never claims durable zero-loss offline evidence', () => {
  const dir = home();
  const blocked = join(dir, 'blocked');
  writeFileSync(blocked, 'fixture');
  const health = createLogHealth(blocked);
  expect(() => health.failure('open-failed', new Error('/secret/key'), 7)).not.toThrow();
  expect(health.snapshot()).toMatchObject({
    evidence: 'memory-only',
    lostEvents: 7,
    coverage: 'unknown',
  });
  expect(readLogHealth(blocked)).toMatchObject({ evidence: 'unavailable', coverage: 'unknown' });
});

it('counts direct event rate loss without changing the recorder interface', () => {
  const health = createLogHealth(home(), () => 1000);
  let rows = 0;
  const events = diagnosticEventRecorder(
    (batch) => {
      rows += batch.length;
    },
    { now: () => 1000, onLoss: (count) => health.loss('rate-loss', count) },
  );
  for (let i = 0; i < 700; i++) events.record('fixture', 'started', {});
  expect(rows).toBe(600);
  expect(health.snapshot()).toMatchObject({
    lostEvents: 100,
    transitions: [{ phase: 'rate-loss', lost: 100 }],
  });
});

it('bounds additional storage for a 600-event flush against the existing writer', () => {
  const run = (withHealth: boolean) => {
    const dir = home();
    const database = openLogDatabase({ dir });
    const health = withHealth ? createLogHealth(dir) : undefined;
    const writer = createDiagnosticLogWriter(database, health === undefined ? {} : { health });
    const writes = vi.mocked(writeFileSync);
    writes.mockClear();
    try {
      const start = performance.now();
      writer.write(Array.from({ length: 600 }, () => row));
      expect(
        writes.mock.calls.filter(([path]) => String(path).endsWith(LOG_HEALTH_FILENAME + '.tmp')),
      ).toHaveLength(0);
      writer.flush();
      const durationMs = performance.now() - start;
      expect(database.query({ limit: 1000 })).toHaveLength(600);
      if (health !== undefined)
        expect(statSync(join(dir, LOG_HEALTH_FILENAME)).size).toBeLessThan(LOG_HEALTH_MAX_BYTES);
      expect(
        writes.mock.calls.filter(([path]) => String(path).endsWith(LOG_HEALTH_FILENAME + '.tmp')),
      ).toHaveLength(withHealth ? 1 : 0);
      if (health !== undefined) {
        for (let i = 0; i < 600; i++) health.loss('rate-loss', 1);
        expect(
          writes.mock.calls.filter(([path]) => String(path).endsWith(LOG_HEALTH_FILENAME + '.tmp')),
        ).toHaveLength(1);
        health.snapshot();
        health.snapshot();
        expect(
          writes.mock.calls.filter(([path]) => String(path).endsWith(LOG_HEALTH_FILENAME + '.tmp')),
        ).toHaveLength(2);
      }
      return durationMs;
    } finally {
      database.close();
    }
  };
  const baselineMs = run(false);
  const healthMs = run(true);
  console.info(
    JSON.stringify({
      fixture: '600-event-flush',
      baselineMs,
      healthMs,
      maxHealthBytes: LOG_HEALTH_MAX_BYTES,
    }),
  );
});

it('exports partial packages online and offline, preserves corrupt primary bytes, and includes bug-report metadata', () => {
  const dshHome = home();
  const dir = join(dshHome, 'botharness');
  mkdirSync(dir);
  writeFileSync(join(dir, 'logs.db'), 'original unreadable bytes');
  const health = createLogHealth(dir, () => 1000);
  health.failure('open-failed', new Error('/secret'), 2);
  const built = exportDiagnosticLogOffline({
    dshHome,
    hours: 1,
    environment,
    homes: [],
    now: () => 2000,
  });
  expect(built?.manifest).toMatchObject({
    entries: 0,
    completeness: {
      status: 'partial',
      primary: 'unavailable',
      health: { evidence: 'durable', lostEvents: 2 },
    },
  });
  expect(readFileSync(join(dir, 'logs.db'), 'utf8')).toBe('original unreadable bytes');
  const online = buildDiagnosticExport(
    {
      range() {
        throw new Error('private /path');
      },
    },
    { hours: 1, now: () => 2000, environment, homes: [], health: health.snapshot() },
  );
  expect(online.manifest).toMatchObject({
    completeness: { status: 'partial', primary: 'unavailable' },
  });
  const report = buildBugReport(
    { title: 'fixture', description: '', hours: 1, attachments: [] },
    {
      database: undefined,
      environment,
      homes: [],
      exportedBy: 'host',
      health: health.snapshot(),
      now: () => 2000,
    },
  );
  expect(report.manifest['logs']).toMatchObject({
    included: true,
    entries: 0,
    completeness: { status: 'partial' },
  });
  const files = readZip(report.archive, { maxEntries: 10, maxTotalBytes: 100_000 });
  expect(files.map((file) => Buffer.from(file.data).toString()).join('')).not.toMatch(
    /original unreadable|\/private|\/secret/,
  );
});
