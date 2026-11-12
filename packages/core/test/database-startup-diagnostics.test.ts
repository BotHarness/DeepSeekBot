import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

import { mountOperationalDatabase, type OperationalDatabaseOwner } from '../src/database/owner.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { recordDatabaseStartup } from '../src/diagnostics/database-startup.js';
import { createDiagnosticRedactor } from '../src/diagnostics/redaction.js';
import {
  createDiagnosticLogHttp,
  DIAGNOSTIC_LOGS_EXPORT_PATH,
  diagnosticEventRecorder,
  diagnosticLogView,
} from '../src/diagnostics/diagnostic-log.js';
import { buildBugReport } from '../src/diagnostics/bug-report.js';
import { openLogDatabase } from '../src/logs/log-db.js';
import { readZip } from '../src/bots/zip-archive.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

it.each([
  'Migration failed: {"password":"fixture-password"}',
  String.raw`password="left\"right"`,
  String.raw`password='left\'right'`,
  'password="truncated fixture-password',
])('redacts complete quoted credentials in error text: %s', (message) => {
  const redacted = createDiagnosticRedactor({ homes: [] }).text(message);
  expect(redacted).toContain('<secret>');
  expect(redacted).not.toMatch(/fixture-password|left|right|truncated/u);
});

it('reports the failing lease stage and both mount identities before core startup continues', () => {
  const dshHome = createTempRoot('database-startup-diagnostics-');
  const first = trackTestOwner(mountOperationalDatabase({ dshHome, instanceId: 'first' }));
  const snapshots: unknown[] = [];
  const second = trackTestOwner(
    mountOperationalDatabase({
      dshHome,
      instanceId: 'second',
      onDiagnostic: (snapshot) => snapshots.push(snapshot),
    }),
  );
  expect(second.mode).toBe('recovery');
  expect(snapshots).toContainEqual(
    expect.objectContaining({
      mode: 'recovery',
      startup: expect.objectContaining({
        instanceId: 'second',
        pid: process.pid,
        stage: 'lease-lock',
        observedWriter: expect.objectContaining({ instanceId: 'first', pid: process.pid }),
      }),
      recovery: expect.objectContaining({
        code: 'lease-unavailable',
        causes: expect.arrayContaining([
          expect.objectContaining({ code: 'ERR_SQLITE_ERROR', errcode: 5 }),
        ]),
      }),
    }),
  );
  first.close();
  expect(second.diagnostics().startup.observedWriter?.instanceId).toBe('first');
});

it('identifies a real separate process without treating metadata as proof of live ownership', async () => {
  const dshHome = createTempRoot('database-startup-diagnostics-');
  const root = join(dshHome, 'botharness');
  mkdirSync(root);
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import { DatabaseSync } from 'node:sqlite';
    import { writeFileSync } from 'node:fs';
    import { hostname } from 'node:os';
    import { join } from 'node:path';
    const root = process.argv[1];
    const db = new DatabaseSync(join(root, 'botharness.writer-lock.db'));
    db.exec('BEGIN IMMEDIATE');
    writeFileSync(join(root, 'botharness.writer.json'), JSON.stringify({instanceId:'child-writer',pid:process.pid,hostname:hostname(),acquiredAt:new Date().toISOString()}));
    console.log('ready');
    setInterval(() => {}, 1000);
  `,
      root,
    ],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const exited = once(child, 'exit');
  try {
    await Promise.race([
      once(child.stdout, 'data'),
      exited.then(() => {
        throw new Error('Writer exited before acquiring lease');
      }),
    ]);
    const entries: unknown[] = [];
    const owner = trackTestOwner(
      mountOperationalDatabase({
        dshHome,
        onDiagnostic: (snapshot) =>
          recordDatabaseStartup(
            { record: (source, phase, fields) => entries.push({ source, phase, fields }) },
            snapshot,
          ),
      }),
    );
    expect(owner.mode).toBe('recovery');
    expect(entries).toContainEqual(
      expect.objectContaining({
        phase: 'recovery',
        fields: expect.objectContaining({
          writerRelation: 'same-machine-other-process',
          writerPid: child.pid,
          writerInstanceId: 'child-writer',
          writerEvidence: 'metadata-only',
        }),
      }),
    );
    expect(JSON.stringify(entries)).not.toContain(hostname());
  } finally {
    child.kill();
    await exited;
  }
  expect(trackTestOwner(mountOperationalDatabase({ dshHome })).mode).toBe('ready');
});

it('exports correlated migration causes through both report paths without exposing secret paths', async () => {
  const dshHome = createTempRoot('database-startup-diagnostics-');
  const logs = openLogDatabase({ dir: join(dshHome, 'botharness') });
  const events = diagnosticEventRecorder((rows) => rows.forEach((row) => logs.write(row)));
  const token = 'sk-abcdefghijklmnopqrstuv123456';
  let owner: OperationalDatabaseOwner | undefined;
  try {
    owner = trackTestOwner(
      mountOperationalDatabase({
        dshHome,
        instanceId: 'failed-mount',
        onDiagnostic: (snapshot) => recordDatabaseStartup(events, snapshot),
        schemaPlan: defineSchemaPlan([
          {
            generation: 2,
            module: 'fixture',
            description: 'failing migration',
            migrate() {
              throw new Error(
                `Cannot migrate ${join(dshHome, 'private.db')} ${token} password=fixture-password`,
                {
                  cause: new Error('underlying failure'),
                },
              );
            },
          },
        ]),
      }),
    );
    expect(owner.mode).toBe('recovery');
    const environment = {
      version: 'test',
      platform: process.platform,
      arch: process.arch,
      node: process.version,
    };
    const homes = [{ path: dshHome, label: '$DSH_HOME' }];
    const http = createDiagnosticLogHttp({
      database: () => logs,
      writer: () => undefined,
      environment,
      homes,
    });
    const response = await http(new Request(`http://localhost${DIAGNOSTIC_LOGS_EXPORT_PATH}`));
    expect(response.status).toBe(200);
    const bugReport = buildBugReport(
      { title: 'Startup failed', description: 'Fixture', hours: 24, attachments: [] },
      { database: logs, environment, homes, exportedBy: 'host' },
    );
    for (const [archive, path] of [
      [Buffer.from(await response.arrayBuffer()), 'logs.jsonl'],
      [bugReport.archive, 'diagnostic-logs/logs.jsonl'],
    ] as const) {
      const files = readZip(Buffer.from(archive), { maxEntries: 32, maxTotalBytes: 4 << 20 });
      const text = Buffer.from(files.find((file) => file.path === path)!.data).toString();
      expect(text).not.toContain(dshHome);
      expect(text).not.toContain(token);
      expect(text).not.toContain('fixture-password');
      expect(text).not.toContain(hostname());
      const rows = text
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(rows).toContainEqual(
        expect.objectContaining({
          code: 'recovery',
          fields: expect.objectContaining({
            mountId: 'failed-mount',
            stage: 'migration',
            migrationGeneration: 2,
            code: 'migration-failed',
          }),
        }),
      );
      expect(rows).toContainEqual(
        expect.objectContaining({
          code: 'failure-cause',
          fields: expect.objectContaining({
            mountId: 'failed-mount',
            message: 'underlying failure',
          }),
        }),
      );
    }
    expect(JSON.stringify(logs.range(0, 100).map(diagnosticLogView))).not.toContain(token);
    expect(JSON.stringify(logs.range(0, 100).map(diagnosticLogView))).not.toContain(
      'fixture-password',
    );
  } finally {
    owner?.close();
    logs.close();
  }
});

it('records successful startup and close, and diagnostic observer failures do not block the owner', () => {
  const snapshots: unknown[] = [];
  const owner = trackTestOwner(
    mountOperationalDatabase({
      dshHome: createTempRoot('database-startup-diagnostics-'),
      onDiagnostic: (snapshot) => {
        snapshots.push(snapshot);
        throw new Error('observer unavailable');
      },
      onObserverError: () => {
        throw new Error('observer error handler unavailable');
      },
    }),
  );
  expect(owner.mode).toBe('ready');
  owner.close();
  expect(snapshots).toContainEqual(
    expect.objectContaining({
      mode: 'ready',
      startup: expect.objectContaining({ stage: 'ready', durationMs: expect.any(Number) }),
    }),
  );
  expect(snapshots).toContainEqual(expect.objectContaining({ mode: 'closed' }));
});

it('bounds long cyclic cause chains without losing the refusal code', () => {
  const errors = Array.from({ length: 6 }, () => new Error('x'.repeat(1000)));
  for (const [index, error] of errors.entries()) error.cause = errors[(index + 1) % errors.length];
  const owner = trackTestOwner(
    mountOperationalDatabase({
      dshHome: createTempRoot('database-startup-diagnostics-'),
      schemaPlan: defineSchemaPlan([
        {
          generation: 2,
          module: 'fixture',
          description: 'cyclic causes',
          migrate() {
            throw errors[0];
          },
        },
      ]),
    }),
  );
  expect(owner.recovery?.code).toBe('migration-failed');
  expect(owner.recovery?.causes).toHaveLength(4);
  expect(owner.recovery?.causes?.every((cause) => cause.message.length <= 600)).toBe(true);
});

it('preserves recovery when nested Error fields are malformed', () => {
  const malformed = new Error('fixture');
  Object.defineProperties(malformed, { name: { value: undefined }, message: { value: null } });
  const owner = trackTestOwner(
    mountOperationalDatabase({
      dshHome: createTempRoot('database-startup-diagnostics-'),
      schemaPlan: defineSchemaPlan([
        {
          generation: 2,
          module: 'fixture',
          description: 'malformed cause',
          migrate() {
            throw new Error('migration failed', { cause: malformed });
          },
        },
      ]),
    }),
  );
  expect(owner.mode).toBe('recovery');
  expect(owner.recovery?.causes).toContainEqual({ name: 'Error', message: 'Unknown error' });
});

it('handles rejected diagnostic observers and error handlers', async () => {
  const errors: unknown[] = [];
  const owner = trackTestOwner(
    mountOperationalDatabase({
      dshHome: createTempRoot('database-startup-diagnostics-'),
      onDiagnostic: async () => {
        throw new Error('async observer');
      },
      onObserverError: async (error) => {
        errors.push(error);
        throw new Error('async handler');
      },
    }),
  );
  owner.close();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(owner.mode).toBe('closed');
  expect(errors).toHaveLength(3);
});

it.each([
  ['botharness.writer-lock.db', 'lease-open'],
  ['botharness.writer.json', 'lease-metadata'],
])('distinguishes a blocked %s from writer contention', (blocked, stage) => {
  const dshHome = createTempRoot('database-startup-diagnostics-');
  mkdirSync(join(dshHome, 'botharness', blocked), { recursive: true });
  const owner = trackTestOwner(mountOperationalDatabase({ dshHome }));
  expect(owner.mode).toBe('recovery');
  expect(owner.diagnostics()).toMatchObject({
    startup: { stage },
    recovery: {
      causes: expect.arrayContaining([expect.objectContaining({ code: expect.any(String) })]),
    },
  });
  expect(owner.recovery?.message).not.toBe('Profile writer lease is held');
});
