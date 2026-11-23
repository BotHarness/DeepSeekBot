import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ComputerRuntimeRunner } from '../src/provider.js';
import { createDockerComputerProvider } from '../src/providers/docker.js';
import { runnerWith, ok, fail, fetchOk, specLine } from './support/docker-provider.js';

beforeEach(() => {
  vi.stubGlobal('fetch', () => fetchOk());
});

describe('Docker bind-mount storage', () => {
  const linux = () => 'linux';
  const macos = () => 'darwin';

  it('bind-mounts dataDir on Linux instead of creating a volume', async () => {
    const calls: string[][] = [];
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        calls.push([...argv]);
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') return fail('No such object');
        if (argv[1] === 'image') return ok('webtop-image');
        return ok('ok');
      }),
      config: { dataDir: '/srv/bh-computer' },
      platform: linux,
    });
    await provider.start();
    expect(calls.some((argv) => argv[0] === 'mkdir' && argv.includes('/srv/bh-computer'))).toBe(
      true,
    );
    const run = calls.find((argv) => argv[1] === 'run' && !argv.includes('--rm'));
    expect((run ?? []).join(' ')).toContain('-v /srv/bh-computer:/config');
    expect(calls.some((argv) => argv[1] === 'volume')).toBe(false);
  });

  it('keeps the named volume when dataDir is empty', async () => {
    const calls: string[][] = [];
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        calls.push([...argv]);
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') return fail('No such object');
        if (argv[1] === 'image') return ok('webtop-image');
        return ok('ok');
      }),
      platform: linux,
    });
    await provider.start();
    const run = calls.find((argv) => argv[1] === 'run' && !argv.includes('--rm'));
    expect((run ?? []).join(' ')).toContain('botharness-computer-config:/config');
    expect(calls.some((argv) => argv[1] === 'volume' && argv[2] === 'create')).toBe(true);
    expect(calls.some((argv) => argv[0] === 'mkdir')).toBe(false);
  });

  it('ignores dataDir off Linux with a visible reason', async () => {
    const calls: string[][] = [];
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        calls.push([...argv]);
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') return fail('No such object');
        if (argv[1] === 'image') return ok('webtop-image');
        return ok('ok');
      }),
      config: { dataDir: '/srv/bh-computer' },
      platform: macos,
    });
    await provider.start();
    const run = calls.find((argv) => argv[1] === 'run' && !argv.includes('--rm'));
    expect((run ?? []).join(' ')).toContain('botharness-computer-config:/config');
    const status = await provider.status();
    expect(status.storage?.kind).toBe('volume');
    expect(status.storage?.ignoredReason).toContain('Linux');
  });

  it('rejects a relative dataDir instead of mounting it silently', async () => {
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        return ok('ok');
      }),
      config: { dataDir: 'relative/path' },
      platform: linux,
    });
    await expect(provider.start()).rejects.toThrow(/absolute/);
  });

  it('recreates when the mount no longer matches and names the migration', async () => {
    const calls: string[][] = [];
    const events: string[] = [];
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        calls.push([...argv]);
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') {
          const format = argv.join(' ');
          if (format.includes('HostConfig.Memory')) return specLine();
          if (format.includes('.Mounts')) {
            return ok('volume botharness-computer-config /config;');
          }
          return ok('exited\n');
        }
        return ok('ok');
      }),
      config: { dataDir: '/srv/bh-computer' },
      platform: linux,
      onEvent: (detail) => {
        events.push(detail);
      },
    });
    await provider.start();
    expect(calls.some((argv) => argv[1] === 'rm')).toBe(true);
    const run = calls.find((argv) => argv[1] === 'run' && !argv.includes('--rm'));
    expect((run ?? []).join(' ')).toContain('-v /srv/bh-computer:/config');
    expect(events.some((event) => event.includes('storage changed'))).toBe(true);
  });

  it('fails start when the bind directory cannot be prepared', async () => {
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') return fail('No such object');
        if (argv[1] === 'image') return ok('webtop-image');
        if (argv[0] === 'mkdir') return fail('permission denied');
        return ok('ok');
      }),
      config: { dataDir: '/srv/bh-computer' },
      platform: linux,
    });
    await expect(provider.start()).rejects.toThrow(/permission denied/);
  });

  it('reports resolved storage on status', async () => {
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        return fail('No such object');
      }),
      platform: linux,
    });
    await expect(provider.status()).resolves.toMatchObject({
      state: 'absent',
      storage: { kind: 'volume', target: 'botharness-computer-config' },
    });
  });
});

describe('Docker storage migration notice', () => {
  function volumeMountedRunner(): ComputerRuntimeRunner {
    return runnerWith((argv) => {
      if (argv[1] === 'info') return ok('27.0.0');
      if (argv[1] === 'inspect') {
        const format = argv.join(' ');
        if (format.includes('HostConfig.Memory')) return specLine();
        if (format.includes('.Mounts')) return ok('volume botharness-computer-config /config;');
        return ok('running\n');
      }
      return ok('ok');
    });
  }

  it('leaves a running container alone on storage change and hints migration', async () => {
    const calls: string[][] = [];
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        calls.push([...argv]);
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') {
          const format = argv.join(' ');
          if (format.includes('HostConfig.Memory')) return specLine();
          if (format.includes('.Mounts')) {
            return ok('volume botharness-computer-config /config;');
          }
          return ok('running\n');
        }
        return ok('ok');
      }),
      config: { dataDir: '/srv/bh-computer' },
      platform: () => 'linux',
    });
    await provider.start();
    expect(calls.some((argv) => argv[1] === 'rm')).toBe(false);
    const status = await provider.status();
    expect(status.state).toBe('running');
    expect(status.storage?.kind).toBe('bind');
    expect(status.storage?.target).toBe('/srv/bh-computer');
    expect(status.storage?.migrationHint).toContain('保持不变');
  });

  it('stays quiet when the live mount already matches', async () => {
    const provider = createDockerComputerProvider({
      runner: volumeMountedRunner(),
      platform: () => 'linux',
    });
    const status = await provider.status();
    expect(status.storage?.migrationHint).toBeUndefined();
  });

  it('ignores dataDir on Windows like other non-Linux platforms', async () => {
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') return fail('No such object');
        if (argv[1] === 'image') return ok('webtop-image');
        return ok('ok');
      }),
      config: { dataDir: 'D:\\bh-computer' },
      platform: () => 'win32',
    });
    await provider.start();
    const status = await provider.status();
    expect(status.storage?.kind).toBe('volume');
    expect(status.storage?.ignoredReason).toContain('Linux');
  });
});

describe('Docker bind-mount QA override', () => {
  const OLD_ENV = process.env.BOTHARNESS_COMPUTER_FORCE_BIND;

  function restoreEnv(): void {
    if (OLD_ENV === undefined) delete process.env.BOTHARNESS_COMPUTER_FORCE_BIND;
    else process.env.BOTHARNESS_COMPUTER_FORCE_BIND = OLD_ENV;
  }

  it('engages the bind path on macOS when the override is set', async () => {
    process.env.BOTHARNESS_COMPUTER_FORCE_BIND = '1';
    try {
      const calls: string[][] = [];
      const provider = createDockerComputerProvider({
        runner: runnerWith((argv) => {
          calls.push([...argv]);
          if (argv[1] === 'info') return ok('27.0.0');
          if (argv[1] === 'inspect') return fail('No such object');
          if (argv[1] === 'image') return ok('webtop-image');
          return ok('ok');
        }),
        config: { dataDir: '/tmp/bh-bind-test' },
        platform: () => 'darwin',
      });
      await provider.start();
      const run = calls.find((argv) => argv[1] === 'run' && !argv.includes('--rm'));
      expect((run ?? []).join(' ')).toContain('-v /tmp/bh-bind-test:/config');
      const status = await provider.status();
      expect(status.storage).toMatchObject({ kind: 'bind', target: '/tmp/bh-bind-test' });
      expect(status.storage?.ignoredReason).toBeUndefined();
    } finally {
      restoreEnv();
    }
  });

  it('leaves the macOS ignore path alone without the override', async () => {
    delete process.env.BOTHARNESS_COMPUTER_FORCE_BIND;
    try {
      const provider = createDockerComputerProvider({
        runner: runnerWith((argv) => {
          if (argv[1] === 'info') return ok('27.0.0');
          return fail('No such object');
        }),
        config: { dataDir: '/tmp/bh-bind-test' },
        platform: () => 'darwin',
      });
      const status = await provider.status();
      expect(status.storage?.kind).toBe('volume');
      expect(status.storage?.ignoredReason).toContain('Linux');
    } finally {
      restoreEnv();
    }
  });
});

describe('Docker mount comparison', () => {
  function mountsRunner(mountsLine: string, calls: string[][] = []): ComputerRuntimeRunner {
    return runnerWith((argv) => {
      calls.push([...argv]);
      if (argv[1] === 'info') return ok('27.0.0');
      if (argv[1] === 'inspect') {
        const format = argv.join(' ');
        if (format.includes('HostConfig.Memory')) return specLine();
        if (format.includes('.Mounts')) return ok(mountsLine);
        return ok('exited\n');
      }
      if (argv[1] === 'image') return ok('webtop-image');
      return ok('ok');
    });
  }

  it('matches named volumes by name, not by host path', async () => {
    const calls: string[][] = [];
    const provider = createDockerComputerProvider({
      runner: mountsRunner(
        'volume /var/lib/docker/volumes/botharness-computer-config/_data /config;',
        calls,
      ),
      platform: () => 'linux',
    });
    await provider.start();
    expect(calls.some((argv) => argv[1] === 'rm')).toBe(false);
    const status = await provider.status();
    expect(status.storage?.migrationHint).toBeUndefined();
  });

  it('matches bind sources exactly', async () => {
    const calls: string[][] = [];
    const provider = createDockerComputerProvider({
      runner: mountsRunner('bind /srv/bh-computer /config;', calls),
      config: { dataDir: '/srv/bh-computer' },
      platform: () => 'linux',
    });
    await provider.start();
    expect(calls.some((argv) => argv[1] === 'rm')).toBe(false);
    const run = calls.find((argv) => argv[1] === 'start');
    expect(run).toBeDefined();
  });

  it('still rebuilds when the bind path actually changed', async () => {
    const calls: string[][] = [];
    const provider = createDockerComputerProvider({
      runner: mountsRunner('bind /srv/old-place /config;', calls),
      config: { dataDir: '/srv/bh-computer' },
      platform: () => 'linux',
    });
    await provider.start();
    expect(calls.some((argv) => argv[1] === 'rm')).toBe(true);
  });
});
