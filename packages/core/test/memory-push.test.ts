import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { pushGitRemote, pushMemoryRepository } from '../src/memory/push.js';

const SECRET = 'sekrit-pat-value';

function git(args: readonly string[], cwd: string): void {
  execFileSync('git', [...args], { cwd, stdio: 'ignore', timeout: 30_000, windowsHide: true });
}

function makeRepo(): string {
  const repoPath = mkdtempSync(join(tmpdir(), 'botharness-push-src-'));
  git(['init', '--quiet'], repoPath);
  git(
    [
      '-c',
      'user.email=t@t.t',
      '-c',
      'user.name=t',
      'commit',
      '--quiet',
      '--allow-empty',
      '-m',
      'seed',
    ],
    repoPath,
  );
  return repoPath;
}

function headSha(repoPath: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoPath,
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true,
  }).trim();
}

function makeBare(): string {
  const barePath = mkdtempSync(join(tmpdir(), 'botharness-push-bare-'));
  git(['init', '--quiet', '--bare'], barePath);
  return barePath;
}

const roots: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function track(path: string): string {
  roots.push(path);
  return path;
}

function listen(
  handler: (
    req: unknown,
    res: { writeHead(n: number, h?: unknown): void; end(b?: unknown): void },
  ) => void,
): Promise<string> {
  const server = createServer(handler as Parameters<typeof createServer>[0]);
  servers.push(server);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}/repo.git`);
    });
  });
}

describe('Memory push URL validation', () => {
  it('rejects credential-bearing, local, and blank URLs without running git', async () => {
    for (const remoteUrl of [
      '',
      '/tmp/private.git',
      'file:///tmp/private.git',
      'https://user:secret@github.com/owner/repo.git',
      'https://github.com/owner/repo.git?token=secret',
      'git@github.com:owner/repo.git;echo secret',
    ]) {
      const result = await pushMemoryRepository({
        repoPath: track(mkdtempSync(join(tmpdir(), 'botharness-push-'))),
        remoteUrl,
        credential: { authorizationHeader: `Bearer ${SECRET}` },
      });
      expect(result).toEqual({ ok: false, code: 'invalid-git-url' });
      expect(JSON.stringify(result)).not.toContain(SECRET);
    }
  });

  it('reports missing Host Git before pushing', async () => {
    const root = track(mkdtempSync(join(tmpdir(), 'botharness-no-git-')));
    const originalPath = process.env['PATH'];
    try {
      process.env['PATH'] = join(root, 'absent');
      const result = await pushMemoryRepository({
        repoPath: root,
        remoteUrl: 'https://github.com/owner/repo.git',
      });
      expect(result).toEqual({ ok: false, code: 'git-not-found' });
    } finally {
      if (originalPath === undefined) delete process.env['PATH'];
      else process.env['PATH'] = originalPath;
    }
  });
});

describe('Memory push transport', () => {
  it('pushes HEAD to a remote and reports the pushed sha', async () => {
    const repoPath = track(makeRepo());
    const barePath = track(makeBare());
    const result = await pushGitRemote({ repoPath, remoteUrl: barePath });
    expect(result).toEqual({ ok: true, pushedSha: headSha(repoPath) });
    expect(
      execFileSync('git', ['ls-remote', barePath, 'HEAD'], {
        encoding: 'utf8',
        timeout: 30_000,
        windowsHide: true,
      }),
    ).toContain(headSha(repoPath));
  });

  it('maps HTTP 401 to an auth failure without leaking the credential', async () => {
    const repoPath = track(makeRepo());
    const url = await listen((_req, res) => {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="git"' });
      res.end('unauthorized');
    });
    const result = await pushGitRemote({
      repoPath,
      remoteUrl: url,
      credential: { authorizationHeader: `Bearer ${SECRET}` },
    });
    expect(result).toEqual({ ok: false, code: 'git-push-auth-failed' });
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it('maps a hung remote to a timeout', async () => {
    const repoPath = track(makeRepo());
    const url = await listen(() => {
      // Never respond: the push must die on timeoutMs, not hang the suite.
    });
    const result = await pushGitRemote({
      repoPath,
      remoteUrl: url,
      credential: { authorizationHeader: `Bearer ${SECRET}` },
      timeoutMs: 1_500,
    });
    expect(result).toEqual({ ok: false, code: 'git-push-timeout' });
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });
});
