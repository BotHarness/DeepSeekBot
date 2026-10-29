import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { parseAgentManagement } from '../src/bots/cli-agent-management.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createShareDrafts, shareDraftFlags } from '../src/marketplace/share-draft.js';
import { createCore } from '../src/plugin.js';
import { createTobShareDraftOperations } from '../src/tob/cli-share-draft-operations.js';
import { TobError } from '../src/tob/service.js';
import { createTempRoot } from './helpers.js';

const closes: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closes.splice(0).reverse()) await close();
});

function write(root: string, path: string, data: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), data);
}

function tree(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else
        out[relative(root, full)] = createHash('sha256').update(readFileSync(full)).digest('hex');
    }
  };
  walk(root);
  return out;
}

function fixture() {
  const core = createCore({
    dshHome: createTempRoot('share-draft-'),
    agents: {
      async runOrchestrator() {},
      async runAssignment() {},
      async close() {},
      requestAssignment() {
        throw new Error('unexpected model execution');
      },
    },
  });
  closes.push(async () => {
    await core.runtime.close();
    core.operationalDatabase.close();
  });
  const drafts = createShareDrafts({
    root: createTempRoot('share-drafts-'),
    memoryDir: (slug) =>
      core.registry.get(slug) === undefined ? undefined : core.registry.memoryDirFor(slug),
  });
  const bridge = createBridgeMethods({ ...core, shareDrafts: drafts });
  const created = bridge.create({ displayName: 'Helper', operationKey: 'create-helper-01' });
  if (!created.ok) throw new Error(created.error.code);
  const slug = created.value.bot.slug;
  const memory = core.registry.memoryDirFor(slug)!;
  write(memory, 'notes/today.md', 'Today I wrote a poem.');
  write(memory, 'notes/keys.md', 'Deploy key: sk-live0123456789abcdefghijkl\nUse it for the API.');
  write(memory, 'notes/contacts.md', 'Mail alice@example.com or call +1 415-555-0100.');
  execFileSync('git', ['add', '-A'], { cwd: memory });
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'seed'], {
    cwd: memory,
  });
  return { core, bridge, drafts, slug, memory };
}

describe('Share Draft', () => {
  it('flags secrets, emails and phone numbers', () => {
    expect(shareDraftFlags('token: ghp_abcdefghijklmnopqrstuvwxyz0123')).toContain('secret');
    expect(shareDraftFlags('-----BEGIN OPENSSH PRIVATE KEY-----')).toContain('private-key');
    expect(shareDraftFlags('https://bob:hunter22@example.com/x')).toContain('url-credential');
    expect(shareDraftFlags('电话 13812345678')).toContain('phone');
    expect(shareDraftFlags('A plain note about poems.')).toEqual([]);
  });

  it('copies the Memory into a draft, decides each file, and never changes the source', () => {
    const f = fixture();
    const before = tree(f.memory);
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: f.memory, encoding: 'utf8' });
    const started = f.bridge.shareDraftStart({ slug: f.slug });
    if (!started.ok) throw new Error(started.error.code);
    expect(started.value.state).toBe('reviewing');
    const byPath = Object.fromEntries(started.value.files.map((file) => [file.path, file]));
    expect(byPath['notes/keys.md']).toMatchObject({ status: 'pending', flags: ['secret'] });
    expect(byPath['notes/contacts.md']?.flags).toEqual(['email', 'phone']);
    expect(byPath['notes/today.md']?.flags).toEqual([]);
    expect(f.drafts.root).not.toContain(f.memory);

    expect(f.bridge.shareDraftFinish({ slug: f.slug })).toMatchObject({
      ok: false,
      error: { code: 'share-draft-pending' },
    });
    expect(f.bridge.shareDraftFile({ slug: f.slug, path: 'notes/keys.md' })).toMatchObject({
      ok: true,
      value: { text: expect.stringContaining('sk-live') },
    });
    expect(
      f.bridge.shareDraftDecide({ slug: f.slug, path: '../escape', decision: 'keep' }),
    ).toMatchObject({ ok: false, error: { code: 'share-draft-file-not-found' } });

    for (const file of started.value.files)
      if (!file.path.startsWith('notes/'))
        f.bridge.shareDraftDecide({ slug: f.slug, path: file.path, decision: 'keep' });
    f.bridge.shareDraftDecide({ slug: f.slug, path: 'notes/today.md', decision: 'keep' });
    f.bridge.shareDraftDecide({ slug: f.slug, path: 'notes/keys.md', decision: 'drop' });
    const rewritten = f.bridge.shareDraftDecide({
      slug: f.slug,
      path: 'notes/contacts.md',
      decision: 'rewrite',
      text: 'Reach the owner through the Bot.',
    });
    expect(
      rewritten.ok && rewritten.value.files.find((x) => x.path === 'notes/contacts.md'),
    ).toMatchObject({ status: 'rewritten', flags: [] });
    const finished = f.bridge.shareDraftFinish({ slug: f.slug });
    expect(finished).toMatchObject({
      ok: true,
      value: { state: 'ready', summary: { dropped: 1, rewritten: 1, pending: 0 } },
    });

    const source = f.drafts.source(f.slug);
    if (!source.ok) throw new Error(source.code);
    const paths = source.value.plan.files.map((file) => file.path);
    expect(paths).not.toContain('notes/keys.md');
    expect(readFileSync(join(source.value.dir, 'notes/contacts.md'), 'utf8')).toBe(
      'Reach the owner through the Bot.',
    );
    expect(existsSync(join(source.value.dir, 'notes/keys.md'))).toBe(false);

    expect(tree(f.memory)).toEqual(before);
    expect(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: f.memory, encoding: 'utf8' })).toBe(
      head,
    );
    expect(
      execFileSync('git', ['status', '--porcelain'], { cwd: f.memory, encoding: 'utf8' }),
    ).toBe('');
  });

  it('exports a ready draft without Git history and goes back to reviewing after a change', () => {
    const f = fixture();
    const started = f.bridge.shareDraftStart({ slug: f.slug });
    if (!started.ok) throw new Error(started.error.code);
    for (const file of started.value.files)
      f.bridge.shareDraftDecide({ slug: f.slug, path: file.path, decision: 'keep' });
    f.bridge.shareDraftFinish({ slug: f.slug });
    const target = join(createTempRoot('share-export-'), 'helper');
    const exported = f.drafts.exportTo(f.slug, target);
    expect(exported).toMatchObject({ ok: true, value: { files: started.value.files.length } });
    expect(existsSync(join(target, '.git'))).toBe(false);
    expect(existsSync(join(target, 'notes/today.md'))).toBe(true);

    f.bridge.shareDraftDecide({ slug: f.slug, path: 'notes/keys.md', decision: 'drop' });
    expect(f.bridge.shareDraftGet({ slug: f.slug })).toMatchObject({
      ok: true,
      value: { state: 'reviewing' },
    });
    expect(f.drafts.source(f.slug)).toMatchObject({ ok: false, code: 'share-draft-not-ready' });
    expect(f.bridge.shareDraftDiscard({ slug: f.slug })).toEqual({
      ok: true,
      value: { discarded: true },
    });
    expect(f.drafts.source(f.slug)).toMatchObject({ ok: false, code: 'share-draft-required' });
  });

  it('refuses Tob and unknown Bots', () => {
    const f = fixture();
    expect(f.bridge.shareDraftStart({ slug: 'bot-missing' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
  });
});

describe('Tob Share Draft operations', () => {
  it('reads and decides only through the draft and maps refusals to stable codes', async () => {
    const f = fixture();
    const ops = createTobShareDraftOperations({ bridge: () => f.bridge });
    const run = async (command: string, args: Record<string, unknown>) =>
      (await ops(command, args))!.run(() => {});
    await expect(run('share-draft-show', { slug: f.slug })).rejects.toEqual(
      new TobError('share-draft-not-found'),
    );
    f.bridge.shareDraftStart({ slug: f.slug });
    const shown = (await run('share-draft-show', { slug: f.slug })) as {
      files: Array<{ path: string; flags?: string[] }>;
    };
    expect(shown.files.find((file) => file.path === 'notes/keys.md')?.flags).toEqual(['secret']);
    expect(await run('share-draft-file', { slug: f.slug, path: 'notes/today.md' })).toMatchObject({
      text: 'Today I wrote a poem.',
    });
    await expect(run('share-draft-finish', { slug: f.slug })).rejects.toEqual(
      new TobError('share-draft-pending'),
    );
    expect(await ops('share-draft-start', { slug: f.slug })).toBeUndefined();
    expect(await ops('share-draft-export', { slug: f.slug })).toBeUndefined();
  });

  it('parses the scoped CLI and keeps start, export and discard with the Human', async () => {
    const io = {
      env: {},
      stdout: () => {},
      stderr: () => {},
      readStdin: async () => 'New text',
    };
    expect(
      await parseAgentManagement(
        'share-draft-decide',
        ['bot-1'],
        { path: 'a.md', 'rewrite-stdin': true },
        io,
      ),
    ).toEqual({
      command: 'share-draft-decide',
      args: { slug: 'bot-1', path: 'a.md', decision: 'rewrite', text: 'New text' },
      write: true,
    });
    await expect(
      parseAgentManagement(
        'share-draft-decide',
        ['bot-1'],
        { path: 'a.md', keep: true, drop: true },
        io,
      ),
    ).rejects.toMatchObject({ code: 'usage' });
    expect(await parseAgentManagement('share-draft-start', ['bot-1'], {}, io)).toBeUndefined();
    expect(await parseAgentManagement('share-draft-export', ['bot-1'], {}, io)).toBeUndefined();
  });
});

describe('share-draft CLI', () => {
  const servers: ReturnType<typeof createServer>[] = [];
  afterEach(async () => {
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

  async function host() {
    const calls: Array<{ method: string; args: Record<string, unknown> }> = [];
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method === 'GET') {
        res.setHeader('set-cookie', 'authority=signed; HttpOnly');
        res.writeHead(302, { location: '/' }).end();
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const method = body.method.replace('botharness/', '');
      calls.push({ method, args: body.payload.args });
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          type: 'server-response',
          rpcId: body.rpcId,
          result: { ok: true, value: { method } },
        }),
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing address');
    return { url: `http://127.0.0.1:${address.port}`, calls };
  }

  async function invoke(argv: string[], url: string, stdin = '') {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const code = await runBotCreateCli(argv, {
      env: { DEEPSEEKBOT_HOST: url, DEEPSEEKBOT_HOST_TOKEN: 'private-test-token' },
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
      readStdin: async () => stdin,
    });
    return { code, out: stdout.join(''), err: stderr.join('') };
  }

  it('maps each command to its bridge method', async () => {
    const live = await host();
    for (const argv of [
      ['share-draft-start', 'bot-1'],
      ['share-draft-show', 'bot-1'],
      ['share-draft-file', 'bot-1', '--path', 'notes/a.md'],
      ['share-draft-decide', 'bot-1', '--path', 'notes/a.md', '--drop'],
      ['share-draft-decide', 'bot-1', '--path', 'notes/b.md', '--rewrite-stdin'],
      ['share-draft-finish', 'bot-1'],
      ['share-draft-export', 'bot-1'],
      ['share-draft-discard', 'bot-1'],
    ])
      expect((await invoke(argv, live.url, 'Clean text')).code).toBe(0);
    expect(live.calls).toEqual([
      { method: 'shareDraftStart', args: { slug: 'bot-1' } },
      { method: 'shareDraftGet', args: { slug: 'bot-1' } },
      { method: 'shareDraftFile', args: { slug: 'bot-1', path: 'notes/a.md' } },
      { method: 'shareDraftDecide', args: { slug: 'bot-1', path: 'notes/a.md', decision: 'drop' } },
      {
        method: 'shareDraftDecide',
        args: { slug: 'bot-1', path: 'notes/b.md', decision: 'rewrite', text: 'Clean text' },
      },
      { method: 'shareDraftFinish', args: { slug: 'bot-1' } },
      { method: 'shareDraftExport', args: { slug: 'bot-1' } },
      { method: 'shareDraftDiscard', args: { slug: 'bot-1' } },
    ]);
  });

  it('refuses a decision without exactly one choice', async () => {
    const live = await host();
    const result = await invoke(['share-draft-decide', 'bot-1', '--path', 'a.md'], live.url);
    expect(result.code).not.toBe(0);
    expect(live.calls).toEqual([]);
  });
});
