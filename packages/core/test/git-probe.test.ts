import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { cloneMemoryRepository } from '../src/memory/clone.js';
import { parseGitVersion, probeGit, type GitProbeHost } from '../src/memory/git-probe.js';
import { ensureMemoryRepository } from '../src/memory/repository.js';
import { createTempRoot } from './helpers.js';

function failure(code: string | number): Error {
  return Object.assign(new Error('git failed'), { code });
}

function host(overrides: Partial<GitProbeHost> & { version?: string } = {}): GitProbeHost {
  const { version = 'git version 2.47.1', ...rest } = overrides;
  return {
    platform: 'linux',
    path: '/usr/bin',
    exists: () => true,
    realpath: (path) => path,
    run: () => version,
    ...rest,
  };
}

function fakeGitOnPath(version: string): string {
  const bin = join(createTempRoot('botharness-fake-git-'), 'bin');
  mkdirSync(bin);
  const git = join(bin, 'git');
  writeFileSync(
    git,
    `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "git version ${version}"; exit 0; fi\nexit 129\n`,
  );
  chmodSync(git, 0o755);
  return bin;
}

describe('Git version parsing', () => {
  it('reads the version from platform-specific git --version output', () => {
    expect(parseGitVersion('git version 2.39.3 (Apple Git-146)\n')).toBe('2.39.3');
    expect(parseGitVersion('git version 2.45.1.windows.1\n')).toBe('2.45.1');
    expect(parseGitVersion('git version 2.34.1\n')).toBe('2.34.1');
    expect(parseGitVersion('xcrun: error: invalid active developer path')).toBeUndefined();
  });
});

describe('Git probe', () => {
  it('accepts Git 2.28 and newer', () => {
    expect(probeGit(host({ version: 'git version 2.28.0' }))).toEqual({
      available: true,
      version: '2.28.0',
    });
    expect(probeGit(host({ version: 'git version 3.0.0' }))).toEqual({
      available: true,
      version: '3.0.0',
    });
  });

  it('treats a missing executable as missing', () => {
    const run = vi.fn(() => {
      throw failure('ENOENT');
    });
    expect(probeGit(host({ run }))).toEqual({ available: false, reason: 'missing' });
  });

  it('treats a Git that fails or prints no version as unrunnable', () => {
    const run = vi.fn(() => {
      throw failure(1);
    });
    expect(probeGit(host({ run }))).toEqual({ available: false, reason: 'unrunnable' });
    expect(probeGit(host({ version: 'something else' }))).toEqual({
      available: false,
      reason: 'unrunnable',
    });
  });

  it('treats Git older than 2.28 as too old', () => {
    expect(probeGit(host({ version: 'git version 2.27.9' }))).toEqual({
      available: false,
      reason: 'too-old',
      version: '2.27.9',
    });
    expect(probeGit(host({ version: 'git version 1.9.5' }))).toMatchObject({ reason: 'too-old' });
  });

  it('detects the macOS stub without running git, which would open the install prompt', () => {
    const run = vi.fn((command: string) => {
      if (command === 'xcode-select') throw failure(2);
      return 'git version 2.39.3 (Apple Git-146)';
    });
    expect(
      probeGit(
        host({
          platform: 'darwin',
          path: '/usr/bin:/bin',
          exists: (p) => p === '/usr/bin/git',
          run,
        }),
      ),
    ).toEqual({ available: false, reason: 'unrunnable' });
    expect(run).not.toHaveBeenCalledWith('git', ['--version']);
  });

  it('runs git on macOS when the Command Line Tools are installed or another Git comes first', () => {
    const withTools = vi.fn(() => 'git version 2.39.3 (Apple Git-146)');
    expect(probeGit(host({ platform: 'darwin', run: withTools }))).toEqual({
      available: true,
      version: '2.39.3',
    });
    const homebrew = vi.fn((command: string) => {
      if (command === 'xcode-select') throw failure(2);
      return 'git version 2.47.1';
    });
    expect(
      probeGit(
        host({
          platform: 'darwin',
          path: '/opt/homebrew/bin:/usr/bin',
          exists: (p) => p === '/opt/homebrew/bin/git' || p === '/usr/bin/git',
          run: homebrew,
        }),
      ),
    ).toEqual({ available: true, version: '2.47.1' });
    expect(homebrew).not.toHaveBeenCalledWith('xcode-select', ['-p']);
  });

  it('reports the Host decision through the gitStatus bridge method', () => {
    const status = {
      available: false as const,
      reason: 'too-old' as const,
      version: '2.20.1',
      installable: true,
      install: { phase: 'idle' as const },
    };
    const methods = createBridgeMethods({
      git: { status: () => status, install: () => status },
    } as unknown as Parameters<typeof createBridgeMethods>[0]);
    expect(methods.gitStatus()).toEqual({ ok: true, value: status });
  });
});

describe.skipIf(process.platform === 'win32')('Bot creation with an old Git', () => {
  it('reports git-not-found instead of a generic memory failure', async () => {
    vi.stubEnv('PATH', fakeGitOnPath('2.20.1'));
    try {
      const root = createTempRoot();
      expect(ensureMemoryRepository({ memoryDir: join(root, 'memory') })).toMatchObject({
        ok: false,
        code: 'git-not-found',
      });
      expect(
        await cloneMemoryRepository({
          url: 'https://github.com/owner/repo.git',
          destination: join(root, 'clone'),
        }),
      ).toEqual({ ok: false, code: 'git-not-found' });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('Git availability reuse', () => {
  it('asks again when PATH changes inside the reuse window', () => {
    const installed = probeGit();
    vi.stubEnv('PATH', join(createTempRoot('botharness-no-git-'), 'absent'));
    try {
      expect(probeGit()).toMatchObject({ available: false });
    } finally {
      vi.unstubAllEnvs();
    }
    expect(probeGit()).toEqual(installed);
  });
});
