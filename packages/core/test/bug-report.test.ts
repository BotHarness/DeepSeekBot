import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runBugReport } from '../src/bots/cli-bug-report.js';
import { CliLiveError } from '../src/bots/cli-live-error.js';
import { readZip } from '../src/bots/zip-archive.js';
import {
  BUG_REPORT_LIMITS,
  buildBugReport,
  createBugReportHttp,
} from '../src/diagnostics/bug-report.js';
import { openLogDatabase } from '../src/logs/log-db.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const ENV = {
  version: '1.6.2',
  dshVersion: '0.2.2',
  platform: 'darwin',
  arch: 'arm64',
  node: 'v22.11.0',
};
const NOW = Date.parse('2026-11-09T22:13:00Z');
const encode = (text: string) => new TextEncoder().encode(text);

function home(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bug-report-'));
  dirs.push(dir);
  const database = openLogDatabase({ dir: join(dir, 'botharness'), now: () => NOW - 60_000 });
  database.write({
    plugin: 'client',
    owner: 'profile-shared',
    kind: 'client.error',
    detail: 'channel-load-timeout',
    payload: JSON.stringify({ level: 'error', path: join(dir, 'x') }),
  });
  database.close();
  return dir;
}

function files(archive: Uint8Array) {
  const entries = readZip(Buffer.from(archive), { maxEntries: 64, maxTotalBytes: 64 << 20 });
  return new Map(entries.map((entry) => [entry.path, Buffer.from(entry.data)]));
}

describe('bug report bundle', () => {
  it('packs the description, redacted logs and attachments, with a prefilled issue link', () => {
    const dir = home();
    const database = openLogDatabase({ dir: join(dir, 'botharness'), readOnly: true });
    const built = buildBugReport(
      {
        title: 'Group chat keeps loading',
        description: `Stuck since 1.6.2. token=sk-abcdef0123456789abcdef in ${dir}/notes`,
        hours: 24,
        attachments: [
          { name: '../../shot.png', type: 'image/png', data: encode('png') },
          { name: 'shot.png', data: encode('png2') },
        ],
      },
      {
        database,
        environment: ENV,
        homes: [{ path: dir, label: '$DSH_HOME' }],
        client: 'Chrome 131',
        now: () => NOW,
        exportedBy: 'host',
      },
    );
    database.close();
    const zip = files(built.archive);
    expect([...zip.keys()]).toEqual([
      'manifest.json',
      'report.md',
      'diagnostic-logs/manifest.json',
      'diagnostic-logs/logs.jsonl',
      'diagnostic-logs/timeline.txt',
      'attachments/shot.png',
      'attachments/shot-2.png',
    ]);
    const manifest = JSON.parse(zip.get('manifest.json')!.toString());
    expect(manifest).toMatchObject({
      format: 'tobs-bug-report',
      title: 'Group chat keeps loading',
      client: 'Chrome 131',
      logs: { included: true, hours: 24, entries: 1 },
      attachments: [{ name: 'shot.png', bytes: 3, type: 'image/png' }, { name: 'shot-2.png' }],
    });
    const text = [...zip.values()].map((data) => data.toString()).join('\n');
    expect(text).not.toContain(dir);
    expect(text).not.toContain('sk-abcdef0123456789abcdef');
    expect(built.fileName).toBe('tobs-report-2026-11-09-22-13.zip');
    const url = new URL(built.issueUrl);
    expect(url.origin + url.pathname).toBe('https://github.com/BotHarness/DeepSeekBot/issues/new');
    expect(url.searchParams.get('template')).toBe('01-bug.yml');
    expect(url.searchParams.get('title')).toBe('Group chat keeps loading');
    expect(url.searchParams.get('environment')).toContain('Tobs 1.6.2 · DSH 0.2.2 · darwin arm64');
    expect(url.searchParams.get('environment')).toContain(built.fileName);
    expect(url.searchParams.get('behavior')).not.toContain('sk-abcdef');
  });

  it('leaves logs out with hours 0 and refuses more than 25 MB', () => {
    const base = { database: undefined, environment: ENV, homes: [], exportedBy: 'host' as const };
    const built = buildBugReport({ title: 'x', description: '', hours: 0, attachments: [] }, base);
    expect([...files(built.archive).keys()]).toEqual(['manifest.json', 'report.md']);
    expect(() =>
      buildBugReport(
        {
          title: 'x',
          description: '',
          hours: 0,
          attachments: [{ name: 'big.bin', data: new Uint8Array(BUG_REPORT_LIMITS.maxBytes + 1) }],
        },
        base,
      ),
    ).toThrow(expect.objectContaining({ code: 'report-too-large' }));
    expect(() =>
      buildBugReport({ title: ' ', description: '', hours: 0, attachments: [] }, base),
    ).toThrow(expect.objectContaining({ code: 'invalid-report' }));
  });

  it('builds the ZIP from a multipart request on the Host route', async () => {
    const dir = home();
    const database = openLogDatabase({ dir: join(dir, 'botharness') });
    const http = createBugReportHttp({
      database: () => database,
      environment: ENV,
      homes: [],
      now: () => NOW,
    });
    const form = new FormData();
    form.set('title', 'Stuck');
    form.set('description', 'It spins');
    form.set('hours', '1');
    form.append('attachment', new Blob([encode('hello')], { type: 'text/plain' }), 'console.txt');
    const response = await http(
      new Request('http://h/api/botharness/bug-report', { method: 'POST', body: form }),
    );
    database.close();
    expect(response.status).toBe(200);
    expect(response.headers.get('x-bug-report-file')).toBe('tobs-report-2026-11-09-22-13.zip');
    expect(response.headers.get('x-bug-report-issue-url')).toContain('template=01-bug.yml');
    const zip = files(new Uint8Array(await response.arrayBuffer()));
    expect(zip.get('attachments/console.txt')!.toString()).toBe('hello');
    const empty = await http(
      new Request('http://h/api/botharness/bug-report', { method: 'POST', body: new FormData() }),
    );
    expect(empty.status).toBe(400);
    expect(await empty.json()).toMatchObject({ error: { code: 'invalid-report' } });
  });
});

type Connect = Parameters<typeof runBugReport>[2];
const io = (stdin = '') => ({
  env: {} as Record<string, string>,
  stdout: () => {},
  stderr: () => {},
  readStdin: async () => stdin,
});

describe('bug-report CLI', () => {
  it('builds the report offline when the Host is down', async () => {
    const dir = home();
    const shot = join(dir, 'screen shot.png');
    writeFileSync(shot, 'png');
    const out = join(dir, 'my report.zip');
    const down = vi.fn(async () => {
      throw new CliLiveError('host-unreachable', 'down');
    }) as unknown as Connect;
    const result = await runBugReport(
      {
        out,
        title: 'Broken after update',
        'body-stdin': true,
        attach: [shot],
        home: dir,
        hours: '168',
        host: 'http://127.0.0.1:1',
      },
      io('The window stays blank.') as never,
      down,
    );
    expect(result).toMatchObject({
      saved: true,
      attachments: 1,
      source: 'offline',
      fallback: 'host-unreachable',
      logs: { included: true },
    });
    const zip = files(readFileSync(out));
    expect(zip.get('report.md')!.toString()).toContain('The window stays blank.');
    expect(zip.has('attachments/screen shot.png')).toBe(true);
    expect(
      new URL((result as { issueUrl: string }).issueUrl).searchParams.get('environment'),
    ).toContain('my report.zip');
  });

  it('posts to the Host when it is reachable and refuses bad input before connecting', async () => {
    const dir = home();
    const stream = vi.fn(
      async () =>
        new Response(new Uint8Array([80, 75, 5, 6]), {
          headers: {
            'x-bug-report-file': 'tobs-report-2026-11-09-22-13.zip',
            'x-bug-report-issue-url':
              'https://github.com/BotHarness/DeepSeekBot/issues/new?template=01-bug.yml&environment=Report+bundle%3A+tobs-report-2026-11-09-22-13.zip',
          },
        }),
    );
    const connect = (async () => ({ stream })) as unknown as Connect;
    const out = join(dir, 'r.zip');
    const result = await runBugReport(
      { out, title: 'x', hours: '0', host: 'http://127.0.0.1:1' },
      io() as never,
      connect,
    );
    expect(result).toMatchObject({ source: 'host', bytes: 4 });
    expect((result as { issueUrl: string }).issueUrl).toContain('r.zip');
    const [path, init] = stream.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe('/api/botharness/bug-report');
    expect((init.body as FormData).get('hours')).toBe('0');
    const never = vi.fn() as unknown as Connect;
    for (const values of [
      {},
      { out: join(dir, 'a.zip') },
      { out: join(dir, 'a.zip'), title: 'x', hours: '500' },
      { out, title: 'x' },
      { out: join(dir, 'a.zip'), title: 'x', attach: [join(dir, 'missing.png')] },
    ])
      await expect(runBugReport(values, io() as never, never)).rejects.toMatchObject({
        code: 'usage',
      });
    expect(never).not.toHaveBeenCalled();
  });
});
