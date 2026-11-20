import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { readZip } from '../src/bots/zip-archive.js';
import {
  CLIENT_LOG_PATH,
  createDiagnosticLogHttp,
  createDiagnosticLogWriter,
  DIAGNOSTIC_LOG_LIMITS,
  DIAGNOSTIC_LOGS_EXPORT_PATH,
  DIAGNOSTIC_LOGS_PATH,
  diagnosticLogView,
  hostLogExporter,
  parseClientLogBatch,
} from '../src/diagnostics/diagnostic-log.js';
import { openLogDatabase, type LogDatabase } from '../src/logs/log-db.js';

const SESSION = '00000000-0000-4000-8000-000000000001';
const HOME = '/Users/vain';
const dirs: string[] = [];
const databases: LogDatabase[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function harness(
  now = () => 1_800_000_000_000,
  onClientEntries?: (session: string, entries: readonly unknown[]) => void,
) {
  const dir = mkdtempSync(join(tmpdir(), 'diagnostic-log-'));
  dirs.push(dir);
  const database = openLogDatabase({ dir, now });
  databases.push(database);
  const writer = createDiagnosticLogWriter(database, { flushMs: 60_000 });
  const http = createDiagnosticLogHttp({
    database: () => database,
    writer: () => writer,
    environment: { version: '1.6.2', platform: 'darwin', arch: 'arm64', node: 'v24.0.0' },
    homes: [{ path: HOME, label: '~' }],
    now,
    ...(onClientEntries === undefined ? {} : { onClientEntries }),
  });
  return { database, writer, http, now };
}

const post = (body: unknown) =>
  new Request(`http://localhost${CLIENT_LOG_PATH}`, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const get = (path: string) => new Request(`http://localhost${path}`);
const entry = (ts: number, category: string, code: string, fields?: unknown, level = 'info') => ({
  ts,
  category,
  level,
  code,
  ...(fields === undefined ? {} : { fields }),
});

describe('diagnostic log ingest', () => {
  it('keeps valid entries, drops malformed ones and scrubs home paths', () => {
    const batch = parseClientLogBatch({
      version: 1,
      session: SESSION,
      dropped: 2,
      entries: [
        entry(1, 'action', 'click', { role: 'button', label: 'Send', nested: { no: 1 } }),
        entry(2, 'error', 'uncaught-error', { message: `boom at ${HOME}/code/app.ts` }, 'error'),
        entry(3, 'secret', 'x'),
        entry(4, 'perf', 'Bad Code!'),
      ],
    });
    expect(batch.rejected).toBe(2);
    expect(batch.dropped).toBe(2);
    expect(batch.entries[0]?.fields).toEqual({ role: 'button', label: 'Send' });
    expect(batch.entries[1]?.fields?.['message']).toBe('boom at ~/code/app.ts');
  });

  it('drops entries dated more than a day ahead and keeps older history', async () => {
    const { http, now, database } = harness();
    database.write({
      ts: now() - 60_000,
      plugin: 'client',
      owner: 'profile-shared',
      kind: 'client.action',
      detail: 'old',
    });
    const response = await http(
      post({
        version: 1,
        session: SESSION,
        entries: [
          entry(now() + 365 * 86_400_000, 'action', 'click'),
          entry(now(), 'action', 'click'),
        ],
      }),
    );
    expect(await response.json()).toMatchObject({ accepted: 1 });
    await http(get(DIAGNOSTIC_LOGS_PATH));
    expect(database.query({ kinds: ['client.action'] }).map((row) => row.ts)).toEqual([
      now(),
      now() - 60_000,
    ]);
  });

  it('hands accepted entries to the Client issue observer', async () => {
    const seen: Array<{ session: string; codes: string[] }> = [];
    const { http, now } = harness(undefined, (session, entries) =>
      seen.push({ session, codes: entries.map((e) => (e as { code: string }).code) }),
    );
    await http(
      post({
        version: 1,
        session: SESSION,
        entries: [entry(now(), 'error', 'uncaught-error', {}, 'error'), entry(-1, 'action', 'x')],
      }),
    );
    expect(seen).toEqual([{ session: SESSION, codes: ['uncaught-error'] }]);
  });

  it('refuses a malformed envelope or an oversized body', async () => {
    const { http } = harness();
    expect((await http(post({ version: 2, session: SESSION, entries: [] }))).status).toBe(400);
    const huge = 'x'.repeat(DIAGNOSTIC_LOG_LIMITS.bodyBytes + 1);
    expect((await http(post(huge))).status).toBe(413);
  });

  it('round-trips a report through logs.db to the list route with filters', async () => {
    const { http, now } = harness();
    const at = now();
    const response = await http(
      post({
        version: 1,
        session: SESSION,
        entries: [
          entry(at - 3000, 'action', 'click', { label: 'Open chat' }),
          entry(at - 2000, 'perf', 'long-frame', { ms: 420 }),
          entry(
            at - 1000,
            'invariant',
            'timeline-window-lost-groups',
            { groups: 12, rendered: 0 },
            'warn',
          ),
        ],
      }),
    );
    expect(response.status).toBe(200);
    const all = await (await http(get(`${DIAGNOSTIC_LOGS_PATH}?filter=all`))).json();
    expect(all.entries.map((row: { code: string }) => row.code)).toEqual([
      'timeline-window-lost-groups',
      'long-frame',
      'click',
    ]);
    expect(all.entries[0]).toMatchObject({
      source: 'client',
      category: 'invariant',
      level: 'warn',
      session: SESSION,
      fields: { groups: 12, rendered: 0 },
    });
    const errors = await (await http(get(`${DIAGNOSTIC_LOGS_PATH}?filter=error`))).json();
    expect(errors.entries.map((row: { code: string }) => row.code)).toEqual([
      'timeline-window-lost-groups',
    ]);
    const perf = await (await http(get(`${DIAGNOSTIC_LOGS_PATH}?filter=perf`))).json();
    expect(perf.entries.map((row: { code: string }) => row.code)).toEqual(['long-frame']);
    expect((await http(get(`${DIAGNOSTIC_LOGS_PATH}?filter=nope`))).status).toBe(400);
  });

  it('records a dropped marker when the per-minute budget is spent', async () => {
    const { http, now, database } = harness();
    const many = (count: number) =>
      Array.from({ length: count }, (_, index) => entry(now() - index, 'action', 'click'));
    for (let sent = 0; sent < DIAGNOSTIC_LOG_LIMITS.entriesPerMinute; sent += 200)
      await http(post({ version: 1, session: SESSION, entries: many(200) }));
    const refused = await (
      await http(post({ version: 1, session: SESSION, entries: many(5) }))
    ).json();
    expect(refused.accepted).toBe(0);
    await http(get(DIAGNOSTIC_LOGS_PATH));
    const marker = database.query({ kinds: ['client.lifecycle'] }).map(diagnosticLogView);
    expect(marker[0]).toMatchObject({ code: 'log-dropped', fields: { rateLimited: 5 } });
  });
});

describe('diagnostic log export', () => {
  it('exports a redacted ZIP with a manifest, JSONL and a readable timeline', async () => {
    const { http, now } = harness();
    await http(
      post({
        version: 1,
        session: SESSION,
        entries: [
          entry(now() - 5000, 'navigation', 'select', { kind: 'channel', channel: 'c1' }),
          entry(
            now() - 4000,
            'error',
            'console-error',
            { message: 'token sk-abcdefghijklmnopqrstuvwx leaked' },
            'error',
          ),
        ],
      }),
    );
    const response = await http(get(`${DIAGNOSTIC_LOGS_EXPORT_PATH}?hours=1`));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    expect(response.headers.get('x-diagnostic-log-entries')).toBe('2');
    const files = readZip(Buffer.from(await response.arrayBuffer()), {
      maxEntries: 8,
      maxTotalBytes: 1 << 20,
    });
    const byName = new Map(files.map((file) => [file.path, Buffer.from(file.data).toString()]));
    expect([...byName.keys()]).toEqual(['manifest.json', 'logs.jsonl', 'timeline.txt']);
    const manifest = JSON.parse(byName.get('manifest.json')!);
    expect(manifest).toMatchObject({
      format: 'deepseekbot-diagnostic-logs',
      entries: 2,
      clientSessions: 1,
      environment: { version: '1.6.2' },
      counts: { 'client.navigation': 1, 'client.error': 1 },
    });
    expect(manifest.redaction.hits['secret-token']).toBe(1);
    expect(byName.get('logs.jsonl')).not.toContain('sk-abcdefghijklmnopqrstuvwx');
    expect(byName.get('timeline.txt')).toMatch(/client\.navigation\s+select\s+kind="channel"/u);
  });

  it('leaves entries dated after the export out of the archive', async () => {
    const { http, now } = harness();
    await http(
      post({
        version: 1,
        session: SESSION,
        entries: [
          entry(now() - 1000, 'action', 'click'),
          entry(now() + 3_600_000, 'action', 'later'),
        ],
      }),
    );
    const response = await http(get(`${DIAGNOSTIC_LOGS_EXPORT_PATH}?hours=1`));
    expect(response.headers.get('x-diagnostic-log-entries')).toBe('1');
  });

  it('refuses an out-of-range window', async () => {
    const { http } = harness();
    expect((await http(get(`${DIAGNOSTIC_LOGS_EXPORT_PATH}?hours=999`))).status).toBe(400);
  });
});

describe('Host logger sink', () => {
  it('keeps Host warnings and errors, scrubs home paths, and skips info and debug', () => {
    const rows: Array<{ kind: string; detail: string }> = [];
    const exporter = hostLogExporter((batch) => rows.push(...batch), { home: HOME });
    const message = (type: 'info' | 'warn' | 'error' | 'debug', name: string, args: unknown[]) => ({
      sn: 1,
      ts: 1,
      type,
      level: 1,
      name,
      args,
    });
    exporter.export(message('warn', 'dsh-session', [`could not read ${HOME}/x.json`]));
    exporter.export(message('info', 'botharness', ['diagnostic-bundle phase=exported']));
    exporter.export(message('info', 'dsh-session', ['chatty']));
    exporter.export(message('error', 'botharness', [new Error('boom')]));
    exporter.export(message('debug', 'botharness', ['noise']));
    expect(rows).toEqual([
      expect.objectContaining({ kind: 'host.warn', detail: 'could not read ~/x.json' }),
      expect.objectContaining({
        kind: 'host.error',
        detail: expect.stringMatching(/^Error: boom/u),
      }),
    ]);
  });
});

describe('module log rows', () => {
  it('lifts a JSON lifecycle detail into fields and flags refusals', () => {
    expect(
      diagnosticLogView({
        id: 1,
        ts: 1,
        plugin: 'bot-network',
        owner: 'profile-shared',
        kind: 'connect-refresh-refused',
        detail: '{"phase":"connect-refresh-refused","code":"network-denied","durationMs":1}',
      }),
    ).toMatchObject({
      source: 'bot-network',
      category: 'module',
      level: 'warn',
      code: 'connect-refresh-refused',
      fields: { code: 'network-denied', durationMs: 1 },
    });
  });
});

describe('logs.db batch writes', () => {
  it('writes a batch in one transaction and prunes to the row cap', () => {
    const dir = mkdtempSync(join(tmpdir(), 'diagnostic-log-'));
    dirs.push(dir);
    const database = openLogDatabase({ dir, maxRows: 3 });
    databases.push(database);
    database.writeMany(
      [1, 2, 3, 4, 5].map((ts) => ({
        ts: Date.now() + ts,
        plugin: 'client',
        owner: 'profile-shared' as const,
        kind: 'client.action',
        detail: `n${ts}`,
      })),
    );
    expect(database.query().map((row) => row.detail)).toEqual(['n5', 'n4', 'n3']);
    expect(database.range(0, 10).map((row) => row.detail)).toEqual(['n3', 'n4', 'n5']);
  });

  it('evicts by arrival order so a fast client clock cannot push out newer rows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'diagnostic-log-'));
    dirs.push(dir);
    const database = openLogDatabase({ dir, maxRows: 2 });
    databases.push(database);
    const row = (ts: number, detail: string) => ({
      ts,
      plugin: 'client',
      owner: 'profile-shared' as const,
      kind: 'client.action',
      detail,
    });
    database.writeMany([row(Date.now() + 3_600_000, 'ahead')]);
    database.writeMany([row(Date.now(), 'a'), row(Date.now(), 'b')]);
    expect(database.query().map((entry) => entry.detail)).toEqual(['b', 'a']);
  });

  it('exports more rows than one list page holds', () => {
    const dir = mkdtempSync(join(tmpdir(), 'diagnostic-log-'));
    dirs.push(dir);
    const database = openLogDatabase({ dir });
    databases.push(database);
    database.writeMany(
      Array.from({ length: 1500 }, (_, index) => ({
        ts: Date.now() - 1500 + index,
        plugin: 'client',
        owner: 'profile-shared' as const,
        kind: 'client.action',
        detail: `n${index}`,
      })),
    );
    expect(database.range(0, DIAGNOSTIC_LOG_LIMITS.exportMaxRows + 1)).toHaveLength(1500);
  });
});
