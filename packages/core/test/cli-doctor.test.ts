import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runDoctor } from '../src/bots/cli-doctor.js';
import { CliLiveError } from '../src/bots/cli-live-error.js';
import { openLogDatabase } from '../src/logs/log-db.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

type Connect = Parameters<typeof runDoctor>[2];
const io = () => ({ env: {} as Record<string, string>, stdout: () => {}, stderr: () => {} });
const NOW = Date.parse('2026-11-09T22:00:00Z');

function homeWithErrors(codes: string[], at: () => number = () => NOW - 60_000) {
  const home = mkdtempSync(join(tmpdir(), 'doctor-home-'));
  dirs.push(home);
  const database = openLogDatabase({ dir: join(home, 'botharness'), now: at });
  for (const code of codes)
    database.write({
      plugin: 'client',
      owner: 'profile-shared',
      kind: 'client.error',
      detail: code,
      payload: JSON.stringify({ level: 'error' }),
    });
  database.close();
  return home;
}

type Check = { id: string; status: string; code?: string; [key: string]: unknown };
const check = (result: unknown, id: string) =>
  (result as { checks: Check[] }).checks.find((entry) => entry.id === id);

describe('doctor CLI', () => {
  it('reports from logs.db alone when the Host is down, with a guide for agents', async () => {
    const home = homeWithErrors([
      'channel-load-timeout',
      'channel-load-timeout phase=retry attempt=2',
      'ws-closed',
    ]);
    const connect = vi.fn(async () => {
      throw new CliLiveError('host-unreachable', 'connect ECONNREFUSED');
    }) as unknown as Connect;
    const result = await runDoctor(
      { home, host: 'http://127.0.0.1:1' },
      io() as never,
      connect,
      () => NOW,
    );
    expect(result).toMatchObject({ ok: false, source: 'offline', fallback: 'host-unreachable' });
    expect(check(result, 'dsh-home')).toMatchObject({ status: 'ok' });
    expect(check(result, 'host')).toMatchObject({ status: 'fail', code: 'host-unreachable' });
    expect(check(result, 'last-update')).toMatchObject({ status: 'skip', code: 'host-required' });
    expect(check(result, 'log')).toMatchObject({ status: 'ok', source: 'offline' });
    expect(check(result, 'errors-24h')).toMatchObject({
      status: 'warn',
      count: 3,
      top: [
        { code: 'client.error:channel-load-timeout', count: 2 },
        { code: 'client.error:ws-closed', count: 1 },
      ],
    });
    expect((result as { guide: string[] }).guide.join('\n')).toContain('Never delete');
    expect((result as { next: string[] }).next[0]).toContain('--offline');
    expect(JSON.stringify(result)).not.toContain(home);
  });

  it('checks the running Host, its plugin and the last update', async () => {
    const home = homeWithErrors([]);
    const http = vi.fn(async (_path: string) => ({
      bytes: new TextEncoder().encode(JSON.stringify({ entries: [] })),
      response: new Response(),
    }));
    const rpc = vi.fn(async () => ({
      kind: 'release',
      name: '@botharness/tobs',
      version: '1.6.2',
      phase: 'failed',
      failure: { reason: 'install-failed', diagnostic: 'ERR_PNPM', logPath: '/tmp/u.log' },
    }));
    const result = await runDoctor(
      { home, host: 'http://127.0.0.1:1' },
      io() as never,
      (async () => ({ http, rpc })) as unknown as Connect,
      () => NOW,
    );
    expect(result).toMatchObject({ ok: true, source: 'host' });
    expect(result).not.toHaveProperty('fallback');
    expect(http.mock.calls[0]![0]).toContain('/api/botharness/diagnostic-logs?filter=error');
    expect(rpc).toHaveBeenCalledWith('updateRun', {});
    expect(check(result, 'plugin')).toMatchObject({ status: 'ok' });
    expect(check(result, 'last-update')).toMatchObject({
      status: 'warn',
      code: 'install-failed',
      version: '1.6.2',
      logPath: '/tmp/u.log',
    });
    expect(check(result, 'errors-24h')).toMatchObject({ status: 'ok', count: 0 });
  });

  it('says the plugin did not load when the Host answers without its routes', async () => {
    const home = homeWithErrors(['boot-failed']);
    const http = vi.fn(async () => {
      throw new CliLiveError('not-found', 'Not found');
    });
    const result = await runDoctor(
      { home, host: 'http://127.0.0.1:1' },
      io() as never,
      (async () => ({ http, rpc: vi.fn() })) as unknown as Connect,
      () => NOW,
    );
    expect(result).toMatchObject({ ok: false, source: 'offline', fallback: 'not-found' });
    expect(check(result, 'host')).toMatchObject({ status: 'ok' });
    expect(check(result, 'plugin')).toMatchObject({ status: 'fail', code: 'plugin-not-loaded' });
    expect(check(result, 'errors-24h')).toMatchObject({ count: 1 });
  });

  it('works offline without connecting and flags a missing DSH home', async () => {
    const connect = vi.fn() as unknown as Connect;
    const home = join(tmpdir(), 'doctor-missing-home-does-not-exist');
    const result = await runDoctor({ home, offline: true }, io() as never, connect, () => NOW);
    expect(connect).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, source: 'offline', fallback: 'offline-requested' });
    expect(check(result, 'dsh-home')).toMatchObject({ status: 'fail', code: 'not-found' });
    expect(check(result, 'log')).toMatchObject({ status: 'warn', code: 'not-found' });
    expect(check(result, 'errors-24h')).toMatchObject({ status: 'skip' });
  });
});

describe('doctor through the tobs entry point', () => {
  it('accepts --home for doctor and the offline log export', async () => {
    const { runBotCreateCli } = await import('../src/bots/bot-create-cli.js');
    const home = homeWithErrors(['boot-failed'], Date.now);
    const lines: string[] = [];
    const cli = {
      env: {} as Record<string, string>,
      stdout: (t: string) => lines.push(t),
      stderr: () => {},
    };
    expect(await runBotCreateCli(['doctor', '--home', home], cli)).toBe(0);
    expect(JSON.parse(lines.pop()!)).toMatchObject({
      source: 'offline',
      fallback: 'host-not-configured',
    });
    const out = join(home, 'logs.zip');
    expect(
      await runBotCreateCli(
        ['diagnostic-logs-export', '--offline', '--home', home, '--out', out],
        cli,
      ),
    ).toBe(0);
    expect(JSON.parse(lines.pop()!)).toMatchObject({ saved: true, source: 'offline', entries: 1 });
    expect(await runBotCreateCli(['diagnostic-logs', '--offline', '--home', home], cli)).toBe(0);
    expect(JSON.parse(lines.pop()!)).toMatchObject({
      source: 'offline',
      entries: [{ code: 'boot-failed' }],
    });
  });
});
