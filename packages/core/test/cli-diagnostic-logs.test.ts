import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runDiagnosticLogCommand } from '../src/bots/cli-diagnostic-logs.js';
import { CliLiveError } from '../src/bots/cli-live-error.js';
import { readZip } from '../src/bots/zip-archive.js';
import { DatabaseSync } from 'node:sqlite';

import { LOG_DB_FILENAME, openLogDatabase } from '../src/logs/log-db.js';
import { createLogHealth } from '../src/diagnostics/log-health.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

type Connect = Parameters<typeof runDiagnosticLogCommand>[3];
const io = (stdin = '') => ({
  env: {} as Record<string, string>,
  stdout: () => {},
  stderr: () => {},
  readStdin: async () => stdin,
});

describe('diagnostic log CLI', () => {
  it('returns the same structured completeness for online and offline exports', async () => {
    const home = mkdtempSync(join(tmpdir(), 'diagnostic-shape-'));
    dirs.push(home);
    const dir = join(home, 'botharness');
    openLogDatabase({ dir }).close();
    createLogHealth(dir).failure('write-failed', new Error(), 3);
    const offline = await runDiagnosticLogCommand(
      'diagnostic-logs-export',
      { home, offline: true, out: join(home, 'offline.zip') },
      io() as never,
      vi.fn() as unknown as Connect,
    );
    if (typeof offline !== 'object' || offline === null || !('completeness' in offline))
      throw new Error('missing completeness');
    const http = vi.fn(async () => ({
      bytes: new Uint8Array([80, 75, 5, 6]),
      response: new Response(null, {
        headers: { 'x-diagnostic-log-completeness': JSON.stringify(offline.completeness) },
      }),
    }));
    const online = await runDiagnosticLogCommand(
      'diagnostic-logs-export',
      { home, host: 'http://127.0.0.1:1', out: join(home, 'online.zip') },
      io() as never,
      (async () => ({ http })) as unknown as Connect,
    );
    expect(online).toMatchObject({ completeness: offline.completeness });
    expect(offline.completeness).toMatchObject({
      status: 'partial',
      primary: 'available',
      health: { lostEvents: 3 },
    });
  });
  it('reads filtered entries from the same route the modal uses', async () => {
    const http = vi.fn(async () => ({
      bytes: new TextEncoder().encode('{"entries":[{"code":"click"}]}'),
      response: new Response(),
    }));
    const result = await runDiagnosticLogCommand(
      'diagnostic-logs',
      { kind: 'error', limit: '50', since: '1000', host: 'http://127.0.0.1:1' },
      io() as never,
      (async () => ({ http })) as unknown as Connect,
    );
    expect(result).toEqual({ entries: [{ code: 'click' }], source: 'host' });
    expect(http).toHaveBeenCalledWith(
      '/api/botharness/diagnostic-logs?filter=error&since=1000&limit=50',
    );
  });

  it('writes the export ZIP without overwriting and reports its size', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'diagnostic-cli-'));
    dirs.push(dir);
    const out = join(dir, 'logs.zip');
    const http = vi.fn(async () => ({
      bytes: new Uint8Array([80, 75, 5, 6]),
      response: new Response(null, { headers: { 'x-diagnostic-log-entries': '42' } }),
    }));
    const connect = (async () => ({ http })) as unknown as Connect;
    expect(
      await runDiagnosticLogCommand(
        'diagnostic-logs-export',
        { out, hours: '2', host: 'http://127.0.0.1:1' },
        io() as never,
        connect,
      ),
    ).toMatchObject({
      saved: true,
      path: out,
      bytes: 4,
      entries: 42,
      source: 'host',
      completeness: { status: 'unknown', primary: 'unknown', health: { evidence: 'unavailable' } },
    });
    expect(http).toHaveBeenCalledWith('/api/botharness/diagnostic-logs/export?hours=2');
    expect(readFileSync(out)).toHaveLength(4);
    await expect(
      runDiagnosticLogCommand(
        'diagnostic-logs-export',
        { out, host: 'http://127.0.0.1:1' },
        io() as never,
        connect,
      ),
    ).rejects.toMatchObject({ code: 'usage' });
    expect(http).toHaveBeenCalledTimes(1);
  });

  it('records a batch from stdin through the Client ingest route', async () => {
    const http = vi.fn(async () => ({
      bytes: new TextEncoder().encode('{"ok":true,"accepted":1}'),
      response: new Response(),
    }));
    const batch = { version: 1, session: 'agent-qa-0001', entries: [] };
    expect(
      await runDiagnosticLogCommand(
        'diagnostic-log-record',
        {},
        io(JSON.stringify(batch)) as never,
        (async () => ({ http })) as unknown as Connect,
      ),
    ).toEqual({ ok: true, accepted: 1 });
    expect(http).toHaveBeenCalledWith('/api/botharness/client-log', batch);
  });

  it('exports straight from logs.db when the Host cannot be reached', async () => {
    const home = mkdtempSync(join(tmpdir(), 'diagnostic-home-'));
    dirs.push(home);
    const database = openLogDatabase({ dir: join(home, 'botharness') });
    database.write({
      plugin: 'client',
      owner: 'profile-shared',
      kind: 'client.error',
      detail: 'uncaught-error',
      payload: JSON.stringify({ level: 'error', message: 'boom' }),
    });
    database.close();
    const out = join(home, 'offline.zip');
    const connect = vi.fn(async () => {
      throw new CliLiveError('host-unreachable', 'down');
    }) as unknown as Connect;
    const result = await runDiagnosticLogCommand(
      'diagnostic-logs-export',
      { out, home, host: 'http://127.0.0.1:1' },
      io() as never,
      connect,
    );
    expect(result).toMatchObject({
      saved: true,
      entries: 1,
      source: 'offline',
      fallback: 'host-unreachable',
    });
    const files = readZip(readFileSync(out), { maxEntries: 8, maxTotalBytes: 1 << 20 });
    const manifest = JSON.parse(
      Buffer.from(files.find((file) => file.path === 'manifest.json')!.data).toString(),
    );
    expect(manifest).toMatchObject({ exportedBy: 'cli-offline', entries: 1 });
  });

  it('goes straight to logs.db when no Host address is configured', async () => {
    const home = mkdtempSync(join(tmpdir(), 'diagnostic-home-'));
    dirs.push(home);
    openLogDatabase({ dir: join(home, 'botharness') }).close();
    const connect = vi.fn() as unknown as Connect;
    expect(
      await runDiagnosticLogCommand(
        'diagnostic-logs-export',
        { out: join(home, 'y.zip'), home },
        io() as never,
        connect,
      ),
    ).toMatchObject({ source: 'offline', fallback: 'host-not-configured', entries: 0 });
    expect(connect).not.toHaveBeenCalled();
  });

  it('exports offline on request without connecting, and says when no log exists', async () => {
    const home = mkdtempSync(join(tmpdir(), 'diagnostic-home-'));
    dirs.push(home);
    const connect = vi.fn() as unknown as Connect;
    await expect(
      runDiagnosticLogCommand(
        'diagnostic-logs-export',
        { out: join(home, 'x.zip'), home, offline: true },
        io() as never,
        connect,
      ),
    ).resolves.toMatchObject({
      saved: true,
      completeness: {
        status: 'partial',
        primary: 'unavailable',
        health: { evidence: 'unavailable' },
      },
    });
    expect(connect).not.toHaveBeenCalled();
  });

  it('leaves a log with an unsupported schema untouched and says it cannot read it', async () => {
    const home = mkdtempSync(join(tmpdir(), 'diagnostic-home-'));
    dirs.push(home);
    const dir = join(home, 'botharness');
    const database = openLogDatabase({ dir });
    database.write({ plugin: 'client', owner: 'profile-shared', kind: 'error', detail: '{}' });
    database.close();
    const raw = new DatabaseSync(join(dir, LOG_DB_FILENAME));
    raw.exec('UPDATE log_schema SET version = 999 WHERE singleton = 1');
    raw.close();
    const before = statSync(join(dir, LOG_DB_FILENAME)).size;
    await expect(
      runDiagnosticLogCommand(
        'diagnostic-logs-export',
        { out: join(home, 'z.zip'), home, offline: true },
        io() as never,
        vi.fn() as unknown as Connect,
      ),
    ).resolves.toMatchObject({
      saved: true,
      completeness: { status: 'partial', primary: 'unavailable' },
    });
    const check = new DatabaseSync(join(dir, LOG_DB_FILENAME), { readOnly: true });
    expect(check.prepare('SELECT COUNT(*) AS n FROM log_entries').get()).toMatchObject({ n: 1 });
    check.close();
    expect(statSync(join(dir, LOG_DB_FILENAME)).size).toBe(before);
  });

  it('says the log is unreadable when its entries table is gone', async () => {
    const home = mkdtempSync(join(tmpdir(), 'diagnostic-home-'));
    dirs.push(home);
    const dir = join(home, 'botharness');
    openLogDatabase({ dir }).close();
    const raw = new DatabaseSync(join(dir, LOG_DB_FILENAME));
    raw.exec('DROP TABLE log_entries');
    raw.close();
    await expect(
      runDiagnosticLogCommand(
        'diagnostic-logs-export',
        { out: join(home, 'w.zip'), home, offline: true },
        io() as never,
        vi.fn() as unknown as Connect,
      ),
    ).resolves.toMatchObject({
      saved: true,
      completeness: { status: 'partial', primary: 'unavailable' },
    });
  });

  it('falls back to logs.db when the Host answers with something that is not a log list', async () => {
    const home = mkdtempSync(join(tmpdir(), 'diagnostic-home-'));
    dirs.push(home);
    openLogDatabase({ dir: join(home, 'botharness') }).close();
    for (const body of ['<html>proxy error</html>', '{"error":"busy"}', 'null']) {
      const http = vi.fn(async () => ({
        bytes: new TextEncoder().encode(body),
        response: new Response(),
      }));
      expect(
        await runDiagnosticLogCommand(
          'diagnostic-logs',
          { home, host: 'http://127.0.0.1:1' },
          io() as never,
          (async () => ({ http })) as unknown as Connect,
        ),
      ).toMatchObject({ source: 'offline', fallback: 'host-protocol-error', entries: [] });
    }
  });

  it('reads entries straight from logs.db when the Host is down', async () => {
    const home = mkdtempSync(join(tmpdir(), 'diagnostic-home-'));
    dirs.push(home);
    const database = openLogDatabase({ dir: join(home, 'botharness') });
    database.write({
      plugin: 'client',
      owner: 'profile-shared',
      kind: 'client.error',
      detail: 'uncaught-error',
      payload: JSON.stringify({ level: 'error', path: join(home, 'secret.txt') }),
    });
    database.write({
      plugin: 'client',
      owner: 'profile-shared',
      kind: 'client.action',
      detail: 'click',
    });
    database.close();
    const down = vi.fn(async () => {
      throw new CliLiveError('host-unreachable', 'down');
    }) as unknown as Connect;
    const result = (await runDiagnosticLogCommand(
      'diagnostic-logs',
      { kind: 'error', home, host: 'http://127.0.0.1:1' },
      io() as never,
      down,
    )) as { entries: Array<{ code: string; fields: Record<string, unknown> }> };
    expect(result).toMatchObject({
      source: 'offline',
      fallback: 'host-unreachable',
      filter: 'error',
    });
    expect(result.entries.map((entry) => entry.code)).toEqual(['uncaught-error']);
    expect(JSON.stringify(result)).not.toContain(home);
    const connect = vi.fn() as unknown as Connect;
    expect(
      await runDiagnosticLogCommand(
        'diagnostic-logs',
        { home, offline: true },
        io() as never,
        connect,
      ),
    ).toMatchObject({
      source: 'offline',
      entries: [{ code: 'click' }, { code: 'uncaught-error' }],
    });
    expect(connect).not.toHaveBeenCalled();
  });

  it('refuses bad flags before connecting', async () => {
    const connect = vi.fn() as unknown as Connect;
    for (const [command, values] of [
      ['diagnostic-logs', { kind: 'secrets' }],
      ['diagnostic-logs', { limit: '0' }],
      ['diagnostic-logs-export', {}],
      ['diagnostic-logs-export', { out: '/tmp/x.zip', hours: '500' }],
    ] as const)
      await expect(
        runDiagnosticLogCommand(command, values, io() as never, connect),
      ).rejects.toMatchObject({ code: 'usage' });
    expect(connect).not.toHaveBeenCalled();
  });
});
