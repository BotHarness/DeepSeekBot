import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runDiagnosticLogCommand } from '../src/bots/cli-diagnostic-logs.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

type Connect = Parameters<typeof runDiagnosticLogCommand>[3];
const io = (stdin = '') => ({
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
        { out, hours: '2' },
        io() as never,
        connect,
      ),
    ).toEqual({ saved: true, path: out, bytes: 4, entries: 42 });
    expect(http).toHaveBeenCalledWith('/api/botharness/diagnostic-logs/export?hours=2');
    expect(readFileSync(out)).toHaveLength(4);
    await expect(
      runDiagnosticLogCommand('diagnostic-logs-export', { out }, io() as never, connect),
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
