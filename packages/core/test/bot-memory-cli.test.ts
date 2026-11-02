import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';

const servers: ReturnType<typeof createServer>[] = [];
const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});

type Call = { method: string; path: string; body: unknown };

async function host(
  route: (call: Call) => {
    status?: number;
    json?: unknown;
    bytes?: Buffer;
    headers?: Record<string, string>;
  },
) {
  const calls: Call[] = [];
  let logins = 0;
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url!, 'http://localhost');
    if (req.method === 'GET' && url.searchParams.has('token')) {
      logins += 1;
      if (url.searchParams.get('token') !== 'private-test-token') {
        res.writeHead(403).end();
        return;
      }
      if (logins % 2 === 0) res.setHeader('set-cookie', 'authority=signed; HttpOnly');
      res.writeHead(302, { location: '/' }).end();
      return;
    }
    expect(req.headers.cookie).toBe('authority=signed');
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString();
    const parsed = text === '' ? undefined : JSON.parse(text);
    const rpc = parsed?.type === 'client-request';
    const call: Call = {
      method: req.method!,
      path: rpc ? parsed.method.replace('botharness/', '') : url.pathname + url.search,
      body: rpc ? parsed.payload.args : parsed,
    };
    calls.push(call);
    const answer = route(call);
    if (rpc) {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({ type: 'server-response', rpcId: parsed.rpcId, result: answer.json }),
      );
      return;
    }
    if (answer.bytes !== undefined) {
      res.writeHead(answer.status ?? 200, answer.headers ?? {});
      res.end(answer.bytes);
      return;
    }
    res.writeHead(answer.status ?? 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(answer.json ?? {}));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing address');
  return { url: `http://127.0.0.1:${address.port}`, calls };
}

async function invokeWithStdin(argv: string[], url: string, stdin: string) {
  const stdout: string[] = [];
  const code = await runBotCreateCli(argv, {
    env: { DEEPSEEKBOT_HOST: url, DEEPSEEKBOT_HOST_TOKEN: 'private-test-token' },
    stdout: (text) => stdout.push(text),
    stderr: () => undefined,
    readStdin: async () => stdin,
  });
  return { code, json: JSON.parse(stdout.join('')) };
}

async function invoke(argv: string[], url: string) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runBotCreateCli(argv, {
    env: { DEEPSEEKBOT_HOST: url, DEEPSEEKBOT_HOST_TOKEN: 'private-test-token' },
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
    readStdin: async () => '',
  });
  const out = stdout.join('');
  expect(out + stderr.join('')).not.toContain('private-test-token');
  return { code, json: JSON.parse(out) };
}

const DM = 'dm-ada';

describe('Agent memory commands against a live Host', () => {
  it("reads a Bot's memory through its DM channel", async () => {
    const live = await host(() => ({ json: { ok: true, value: { read: true } } }));
    for (const argv of [
      ['memory-snapshot', 'ada'],
      ['memory-file', 'ada', '--path', 'PERSONA.md'],
      ['memory-history', 'ada'],
      ['memory-diff', 'ada', '--sha', 'a'.repeat(40)],
      ['memory-file-target', 'ada', '--path', 'notes/x.md'],
      ['memory-graph', 'ada', '--offset', '20'],
      ['memory-graph', 'ada', '--path', 'notes/x.md'],
      ['memory-commit-diff', 'ada', '--sha', 'b'.repeat(40)],
      ['memory-changes', 'ada'],
      ['memory-working-diff', 'ada', '--path', 'notes/x.md', '--kind', 'unstaged'],
      ['memory-checkpoints', 'ada'],
      ['memory-versions', 'ada'],
    ])
      expect((await invoke(argv, live.url)).json).toEqual({ read: true });
    expect(live.calls.map((call) => [call.path, call.body])).toEqual([
      ['memorySnapshot', { channelId: DM }],
      ['memoryFile', { channelId: DM, path: 'PERSONA.md' }],
      ['memoryHistory', { channelId: DM }],
      ['memoryDiff', { channelId: DM, sha: 'a'.repeat(40) }],
      ['memoryFileTarget', { slug: 'ada', path: 'notes/x.md' }],
      ['memoryGitGraph', { channelId: DM, offset: 20 }],
      ['memoryGitGraph', { channelId: DM, offset: 0, path: 'notes/x.md' }],
      ['memoryGitCommitDiff', { channelId: DM, sha: 'b'.repeat(40) }],
      ['memoryWorkingChanges', { channelId: DM }],
      ['memoryWorkingDiff', { channelId: DM, path: 'notes/x.md', kind: 'unstaged' }],
      ['memoryRecoveryHistory', { channelId: DM }],
      ['memoryVersions', { channelId: DM }],
    ]);
  });

  it('writes memory only against an expected head, with an idempotency id', async () => {
    const live = await host(() => ({ json: { ok: true, value: { done: true } } }));
    await invokeWithStdin(
      [
        'memory-save',
        'ada',
        '--path',
        'notes/x.md',
        '--body-stdin',
        '--expected-head',
        'c'.repeat(40),
      ],
      live.url,
      'hello',
    );
    await invoke(
      ['memory-restore', 'ada', '--checkpoint', 'cp-2', '--expected-current', 'cp-1'],
      live.url,
    );
    await invoke(
      [
        'memory-restore-commit',
        'ada',
        '--sha',
        'd'.repeat(40),
        '--expected-head',
        'c'.repeat(40),
        '--name',
        'before-run',
      ],
      live.url,
    );
    await invoke(['memory-version-name', 'ada', '--sha', 'd'.repeat(40), '--name', 'v1'], live.url);
    await invoke(['memory-version-unname', 'ada', '--tag', 'v1'], live.url);
    await invoke(['memory-repair', 'ada', '--expected-head', 'c'.repeat(40)], live.url);
    const [save, restore, restoreCommit, name, unname, repair] = live.calls.map(
      (call) => [call.path, call.body as Record<string, unknown>] as const,
    );
    expect(save![0]).toBe('memorySave');
    expect(save![1]).toMatchObject({
      channelId: DM,
      path: 'notes/x.md',
      body: 'hello',
      expectedHead: 'c'.repeat(40),
    });
    expect(save![1]['editId']).toMatch(/^[0-9a-f-]{36}$/);
    expect(restore).toEqual([
      'memoryRestore',
      { channelId: DM, checkpointId: 'cp-2', expectedCurrentId: 'cp-1' },
    ]);
    expect(restoreCommit![1]).toMatchObject({
      channelId: DM,
      sha: 'd'.repeat(40),
      expectedHead: 'c'.repeat(40),
      name: 'before-run',
    });
    expect(restoreCommit![1]['restoreId']).toMatch(/^[0-9a-f-]{36}$/);
    expect(name).toEqual(['memoryNameVersion', { channelId: DM, sha: 'd'.repeat(40), name: 'v1' }]);
    expect(unname).toEqual(['memoryRemoveVersionName', { channelId: DM, tag: 'v1' }]);
    expect(repair![1]).toMatchObject({ channelId: DM, expectedHead: 'c'.repeat(40) });
  });

  it("moves a Bot's Memory to a folder, or back to the default", async () => {
    const live = await host(() => ({
      json: { ok: true, value: { memoryDir: '/srv/memory/ada', moved: true } },
    }));
    const moved = await invoke(
      ['memory-move', 'ada', '--memory-location', '/srv/memory'],
      live.url,
    );
    expect(moved.json).toEqual({ memoryDir: '/srv/memory/ada', moved: true });
    await invoke(['memory-move', 'ada', '--default-location'], live.url);
    expect(live.calls.map((call) => [call.path, call.body])).toEqual([
      ['memoryMove', { slug: 'ada', location: '/srv/memory' }],
      ['memoryMove', { slug: 'ada', location: null }],
    ]);
  });

  it('refuses incomplete memory commands before contacting the Host', async () => {
    const live = await host(() => ({ json: { ok: true, value: {} } }));
    for (const argv of [
      ['memory-file', 'ada'],
      ['memory-diff', 'ada'],
      ['memory-working-diff', 'ada', '--path', 'x', '--kind', 'everything'],
      ['memory-graph', 'ada', '--offset', '-1'],
      ['memory-graph', 'ada', '--path', ' '],
      ['memory-save', 'ada', '--path', 'x', '--body', 'y'],
      ['memory-restore', 'ada', '--checkpoint', 'cp-2'],
      ['memory-restore-commit', 'ada', '--sha', 'd'.repeat(40)],
      ['memory-version-unname', 'ada'],
      ['memory-repair', 'ada'],
      ['memory-move', 'ada'],
      ['memory-move', 'ada', '--memory-location', 'relative/folder'],
      ['memory-move', 'ada', '--memory-location', '/srv/memory', '--default-location'],
    ])
      expect((await invoke(argv, live.url)).json.error.code).toBe('usage');
    expect(live.calls).toEqual([]);
  });
});

describe('Memory image byte export', () => {
  it('exports a document-relative image using the selected Markdown source and content revision', async () => {
    const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const live = await host(() => ({ bytes, headers: { 'content-type': 'image/png' } }));
    const dir = mkdtempSync(join(tmpdir(), 'memory-markdown-cli-'));
    dirs.push(dir);
    const out = join(dir, 'figure.png');
    const result = await invoke(
      [
        'memory-image',
        'ada',
        '--path',
        'notes/a.md',
        '--image-source',
        'index',
        '--image-revision',
        'a'.repeat(64),
        '--image-reference',
        '../figure.png',
        '--out',
        out,
      ],
      live.url,
    );
    expect(result.code).toBe(0);
    expect(result.json).toMatchObject({
      path: 'notes/a.md',
      source: 'index',
      reference: '../figure.png',
    });
    expect(readFileSync(out)).toEqual(bytes);
    expect(new URL(live.calls[0]!.path, live.url).searchParams.get('reference')).toBe(
      '../figure.png',
    );
  });

  it('exports only the requested source/revision to a new file and keeps stdout JSON', async () => {
    const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const live = await host(() => ({ bytes, headers: { 'content-type': 'image/png' } }));
    const dir = mkdtempSync(join(tmpdir(), 'memory-image-cli-'));
    dirs.push(dir);
    const out = join(dir, 'preview.png');
    const argv = [
      'memory-image',
      'ada',
      '--path',
      'notes/a.png',
      '--image-source',
      'index',
      '--image-revision',
      'a'.repeat(64),
      '--out',
      out,
    ];
    const result = await invoke(argv, live.url);
    expect(result.code).toBe(0);
    expect(result.json).toMatchObject({
      source: 'index',
      revision: 'a'.repeat(64),
      mime: 'image/png',
      bytes: 8,
      out,
    });
    expect(readFileSync(out)).toEqual(bytes);
    expect(live.calls[0]?.path).toBe(
      '/api/botharness/memory/image?' +
        new URLSearchParams({
          slug: 'ada',
          path: 'notes/a.png',
          source: 'index',
          revision: 'a'.repeat(64),
        }),
    );
    expect((await invoke(argv, live.url)).code).not.toBe(0);
    expect(readFileSync(out)).toEqual(bytes);
  });
  it('returns the same stale-content refusal as the UI without creating a file', async () => {
    const live = await host(() => ({
      status: 409,
      json: { error: { code: 'memory-image-stale', message: 'Image changed; refresh the view' } },
    }));
    const dir = mkdtempSync(join(tmpdir(), 'memory-image-cli-'));
    dirs.push(dir);
    const result = await invoke(
      [
        'memory-image',
        'ada',
        '--path',
        'a.png',
        '--image-source',
        'worktree',
        '--image-revision',
        'a'.repeat(64),
        '--out',
        join(dir, 'a.png'),
      ],
      live.url,
    );
    expect(result.code).not.toBe(0);
    expect(result.json.error.code).toBe('memory-image-stale');
  });
});

describe('Memory export format parity', () => {
  it.each([
    ['jpg', 'image/jpeg'],
    ['gif', 'image/gif'],
    ['webp', 'image/webp'],
    ['svg', 'image/svg+xml'],
  ])(
    'exports original %s bytes with detected MIME in one JSON receipt',
    async (extension, mime) => {
      const bytes = readFileSync(
        new URL(`./fixtures/memory-images/blue.${extension}`, import.meta.url),
      );
      const live = await host(() => ({ bytes, headers: { 'content-type': mime } }));
      const dir = mkdtempSync(join(tmpdir(), 'memory-format-cli-'));
      dirs.push(dir);
      const out = join(dir, `preview.${extension}`);
      const result = await invoke(
        [
          'memory-image',
          'ada',
          '--path',
          `preview.${extension}`,
          '--image-source',
          'worktree',
          '--image-revision',
          'a'.repeat(64),
          '--out',
          out,
        ],
        live.url,
      );
      expect(result.code).toBe(0);
      expect(result.json).toMatchObject({ mime, bytes: bytes.length, out });
      expect(readFileSync(out)).toEqual(bytes);
    },
  );
});
