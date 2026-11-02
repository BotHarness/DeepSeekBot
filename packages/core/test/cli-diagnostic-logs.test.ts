import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runDiagnosticLogCommand } from '../src/bots/cli-diagnostic-logs.js';
import { CliLiveError } from '../src/bots/cli-live-error.js';
import { readZip } from '../src/bots/zip-archive.js';
import { openLogDatabase } from '../src/logs/log-db.js';

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
  it('reads filtered entries from the same route the modal uses', async () => {
    const http = vi.fn(async () => ({
      bytes: new TextEncoder().encode('{"entries":[{"code":"click"}]}'),
      response: new Response(),
    }));
    const result = await runDiagnosticLogCommand(
      'diagnostic-logs',
      { kind: 'error', limit: '50', since: '1000' },
      io() as never,
      (async () => ({ http })) as unknown as Connect,
    );
    expect(result).toEqual({ entries: [{ code: 'click' }] });
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
    ).toEqual({ saved: true, path: out, bytes: 4, entries: 42, source: 'host' });
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
    ).rejects.toMatchObject({ code: 'not-found' });
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
