import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { delimiter, join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { probeGit, type GitAvailability } from '../src/memory/git-probe.js';
import {
  createGitService,
  MANAGED_GIT_ASSETS,
  MANAGED_GIT_RELEASE,
  MANAGED_GIT_SOURCES,
  managedGitRoot,
  managedGitShim,
  type GitServiceOptions,
} from '../src/memory/managed-git.js';
import { createTempRoot } from './helpers.js';

const ASSET = 'dugite-native-test-ubuntu-x64.tar.gz';

function fakeDistribution(): { bytes: Buffer; sha256: string } {
  const root = createTempRoot('botharness-fake-dugite-');
  const dist = join(root, 'dist');
  mkdirSync(join(dist, 'bin'), { recursive: true });
  mkdirSync(join(dist, 'libexec', 'git-core'), { recursive: true });
  writeFileSync(
    join(dist, 'bin', 'git'),
    '#!/bin/sh\necho "git version 2.53.0"\necho "exec=$GIT_EXEC_PATH" >&2\n',
  );
  chmodSync(join(dist, 'bin', 'git'), 0o755);
  const archive = join(root, ASSET);
  execFileSync('tar', ['-czf', archive, '-C', dist, '.']);
  const bytes = readFileSync(archive);
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function probeWith(env: NodeJS.ProcessEnv): () => GitAvailability {
  return () =>
    probeGit({
      platform: 'linux',
      path: env['PATH'],
      exists: existsSync,
      realpath: realpathSync,
      run: (command, args) =>
        execFileSync(command, [...args], { env, encoding: 'utf8', stdio: 'pipe' }),
    });
}

function setup(overrides: Partial<GitServiceOptions> = {}) {
  const dshHome = createTempRoot('botharness-managed-git-');
  const emptyBin = join(dshHome, 'empty-bin');
  mkdirSync(emptyBin);
  const env: NodeJS.ProcessEnv = { PATH: emptyBin };
  const logs: string[] = [];
  const requested: string[] = [];
  const dist = fakeDistribution();
  const options: GitServiceOptions = {
    dshHome,
    platform: 'linux',
    arch: 'x64',
    env,
    probe: probeWith(env),
    assets: { 'linux-x64': { name: ASSET, sha256: dist.sha256 } },
    sources: [(asset) => `https://mirror.test/${asset}`, (asset) => `https://github.test/${asset}`],
    fetchImpl: (async (url: string) => {
      requested.push(url);
      if (url.startsWith('https://mirror.test/')) return new Response('down', { status: 503 });
      return new Response(new Uint8Array(dist.bytes), {
        headers: { 'content-length': String(dist.bytes.length) },
      });
    }) as typeof fetch,
    log: (message) => logs.push(message),
    ...overrides,
  };
  return { dshHome, env, logs, requested, dist, options };
}

describe('Managed Git pins', () => {
  it('pins a checksum and both download sources for every supported platform', () => {
    expect(Object.keys(MANAGED_GIT_ASSETS)).toEqual(
      expect.arrayContaining([
        'win32-x64',
        'win32-arm64',
        'darwin-x64',
        'darwin-arm64',
        'linux-x64',
        'linux-arm64',
      ]),
    );
    for (const asset of Object.values(MANAGED_GIT_ASSETS)) {
      expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/u);
      expect(asset.name).toContain(MANAGED_GIT_RELEASE.slice(1, 7));
    }
    expect(MANAGED_GIT_SOURCES.map((source) => new URL(source('a.tar.gz')).host)).toEqual([
      'media.botharness.ai',
      'github.com',
    ]);
  });

  it('writes a POSIX shim that sets the relocation environment dugite expects', () => {
    const linux = managedGitShim("/home/o'neil/git/dist", 'linux');
    expect(linux).toContain(`D='/home/o'\\''neil/git/dist'`);
    expect(linux).toContain('export GIT_EXEC_PATH="$D/libexec/git-core"');
    expect(linux).toContain('GIT_SSL_CAINFO="$D/ssl/cacert.pem"');
    expect(linux).toContain('exec "$D/bin/git" "$@"');
    expect(managedGitShim('/x', 'darwin')).not.toContain('GIT_SSL_CAINFO');
  });
});

describe.skipIf(process.platform === 'win32')('Managed Git install', () => {
  it('downloads from the next source when the mirror fails, verifies it and puts it on PATH', async () => {
    const { dshHome, env, logs, requested, options } = setup();
    const git = createGitService(options);
    expect(git.status()).toMatchObject({
      available: false,
      reason: 'missing',
      installable: true,
      install: { phase: 'idle' },
    });

    expect(git.install().install.phase).toBe('downloading');
    await git.settled();

    expect(requested).toEqual([`https://mirror.test/${ASSET}`, `https://github.test/${ASSET}`]);
    expect(git.status()).toMatchObject({
      available: true,
      version: '2.53.0',
      source: 'managed',
      install: { phase: 'idle' },
    });
    const bin = join(managedGitRoot(dshHome), MANAGED_GIT_RELEASE, 'shim');
    expect(env['PATH']?.split(delimiter)[0]).toBe(bin);
    expect(readdirSync(managedGitRoot(dshHome))).toEqual([MANAGED_GIT_RELEASE]);
    const { stderr } = spawnSync('git', ['status'], { env, encoding: 'utf8' });
    expect(stderr).toContain(join(managedGitRoot(dshHome), MANAGED_GIT_RELEASE, 'dist', 'libexec'));
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^git phase=download-failed source=mirror\.test error=HTTP 503/u),
        expect.stringMatching(/^git phase=installed release=/u),
      ]),
    );
  });

  it('rejects a download whose checksum does not match and installs nothing', async () => {
    const { dshHome, env, options } = setup();
    const git = createGitService({
      ...options,
      assets: { 'linux-x64': { name: ASSET, sha256: '0'.repeat(64) } },
    });
    git.install();
    await git.settled();
    expect(git.status()).toMatchObject({
      available: false,
      install: { phase: 'failed', reason: 'checksum' },
    });
    expect(readdirSync(managedGitRoot(dshHome))).toEqual([]);
    expect(env['PATH']).toBe(join(dshHome, 'empty-bin'));
  });

  it('tries GitHub when the mirror serves a corrupt file', async () => {
    const { dist, requested, options } = setup({
      fetchImpl: (async (url: string) => {
        requested.push(url);
        return new Response(
          url.startsWith('https://mirror.test/') ? 'corrupt' : new Uint8Array(dist.bytes),
        );
      }) as typeof fetch,
    });
    const git = createGitService(options);
    git.install();
    await git.settled();
    expect(requested).toHaveLength(2);
    expect(git.status()).toMatchObject({ available: true, source: 'managed' });
  });

  it('gives up on a source that stops sending data and tries the next one', async () => {
    const requested: string[] = [];
    const aborted: string[] = [];
    const { dist, logs, options } = setup({
      stallTimeoutMs: 50,
      fetchImpl: (async (url: string, init?: RequestInit) => {
        requested.push(url);
        init?.signal?.addEventListener('abort', () => aborted.push(url));
        if (url.startsWith('https://mirror.test/')) {
          return new Promise<Response>((_resolve, reject) =>
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)),
          );
        }
        return new Response(new Uint8Array(dist.bytes));
      }) as typeof fetch,
    });
    const git = createGitService(options);
    const scheduleDeadline = setTimeout;
    const cancelDeadline = clearTimeout;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      git.install();
      await vi.advanceTimersByTimeAsync(49);
      const beforeDeadline = { requested: [...requested], aborted: [...aborted] };
      await vi.advanceTimersByTimeAsync(1);
      const atDeadline = { requested: [...requested], aborted: [...aborted] };
      await Promise.race([
        git.settled(),
        new Promise<never>((_resolve, reject) => {
          deadline = scheduleDeadline(
            () => reject(new Error('Managed Git fallback did not settle')),
            2_000,
          );
        }),
      ]);
      expect(beforeDeadline).toEqual({ requested: [`https://mirror.test/${ASSET}`], aborted: [] });
      expect(atDeadline).toEqual({
        requested: [`https://mirror.test/${ASSET}`, `https://github.test/${ASSET}`],
        aborted: [`https://mirror.test/${ASSET}`],
      });
      expect(requested).toEqual([`https://mirror.test/${ASSET}`, `https://github.test/${ASSET}`]);
      expect(aborted).toEqual([`https://mirror.test/${ASSET}`]);
      expect(git.status()).toMatchObject({ available: true, source: 'managed' });
      expect(logs).toContainEqual(
        expect.stringMatching(/source=mirror\.test error=no data for 0\.05s/u),
      );
      expect(logs).toContainEqual(
        expect.stringMatching(/^git phase=downloaded source=github\.test /u),
      );
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      cancelDeadline(deadline);
      vi.useRealTimers();
    }
  });

  it('reports a network failure naming every source when all downloads fail', async () => {
    const { options } = setup({
      fetchImpl: (async () => {
        throw new Error('getaddrinfo ENOTFOUND');
      }) as typeof fetch,
    });
    const git = createGitService(options);
    git.install();
    await git.settled();
    const status = git.status();
    expect(status.install).toMatchObject({ phase: 'failed', reason: 'network' });
    expect(status.install.phase === 'failed' && status.install.detail).toMatch(
      /mirror\.test: .*ENOTFOUND.*github\.test: .*ENOTFOUND/u,
    );
  });

  it('uses the installed Managed Git on the next Host start but prefers a usable system Git', async () => {
    const first = setup();
    const installer = createGitService(first.options);
    installer.install();
    await installer.settled();

    const env: NodeJS.ProcessEnv = { PATH: join(first.dshHome, 'empty-bin') };
    const restarted = createGitService({ ...first.options, env, probe: probeWith(env) });
    expect(restarted.resolve()).toMatchObject({ available: true, source: 'managed' });

    const systemEnv: NodeJS.ProcessEnv = { PATH: '/usr/bin' };
    const withSystem = createGitService({
      ...first.options,
      env: systemEnv,
      probe: () => ({ available: true, version: '2.47.1' }),
    });
    expect(withSystem.resolve()).toMatchObject({ available: true, source: 'system' });
    expect(systemEnv['PATH']).toBe('/usr/bin');
  });

  it('leaves PATH alone when an installed Managed Git cannot run, and reinstalls over it', async () => {
    const first = setup();
    const installer = createGitService(first.options);
    installer.install();
    await installer.settled();
    const real = join(managedGitRoot(first.dshHome), MANAGED_GIT_RELEASE, 'dist', 'bin', 'git');
    writeFileSync(real, '#!/bin/sh\nexit 1\n');

    const env: NodeJS.ProcessEnv = { PATH: join(first.dshHome, 'empty-bin') };
    const restarted = createGitService({ ...first.options, env, probe: probeWith(env) });
    expect(restarted.resolve()).toMatchObject({ available: false, reason: 'missing' });
    expect(env['PATH']).toBe(join(first.dshHome, 'empty-bin'));

    restarted.install();
    await restarted.settled();
    expect(restarted.status()).toMatchObject({ available: true, source: 'managed' });
    expect(readdirSync(managedGitRoot(first.dshHome))).toEqual([MANAGED_GIT_RELEASE]);
  });

  it('does not offer an install on a platform without a pinned build', () => {
    const { options } = setup({ platform: 'freebsd', arch: 'x64' });
    const git = createGitService(options);
    expect(git.status()).toMatchObject({ available: false, installable: false });
    expect(git.install().install).toMatchObject({ phase: 'failed', reason: 'unsupported' });
  });

  it('starts the install through the gitInstall bridge method', async () => {
    const { options } = setup();
    const git = createGitService(options);
    const methods = createBridgeMethods({ git } as unknown as Parameters<
      typeof createBridgeMethods
    >[0]);
    expect(methods.gitInstall()).toMatchObject({
      ok: true,
      value: { install: { phase: 'downloading' } },
    });
    await git.settled();
    expect(methods.gitStatus()).toMatchObject({ ok: true, value: { source: 'managed' } });
  });
});
