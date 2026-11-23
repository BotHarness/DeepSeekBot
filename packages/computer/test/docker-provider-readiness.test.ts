import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ComputerRuntimeRunner } from '../src/provider.js';
import { createDockerComputerProvider } from '../src/providers/docker.js';
import { runnerWith, ok, fail, fetchOk, specLine } from './support/docker-provider.js';

const fetchRefused = (): Promise<Response> => Promise.reject(new Error('connection refused'));

beforeEach(() => {
  vi.stubGlobal('fetch', () => fetchOk());
});

describe('Docker desktop readiness gate', () => {
  function stoppedRunner(calls: string[][] = []): ComputerRuntimeRunner {
    let serving = false;
    return {
      run: async (argv) => {
        calls.push([...argv]);
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') {
          const format = argv.join(' ');
          if (format.includes('HostConfig.Memory')) return specLine();
          return ok(serving ? 'running\n' : 'exited\n');
        }
        if (argv[1] === 'start' || (argv[1] === 'run' && !argv.includes('--rm'))) {
          serving = true;
        }
        return ok('ok');
      },
    };
  }

  it('waits for the desktop HTTP before reporting running', async () => {
    let attempts = 0;
    const provider = createDockerComputerProvider({
      runner: stoppedRunner(),
      fetchImpl: (async () => {
        attempts += 1;
        if (attempts < 3) throw new Error('connection refused');
        return fetchOk();
      }) as unknown as typeof fetch,
    });
    await provider.start();
    expect(attempts).toBeGreaterThanOrEqual(3);
    expect(provider.upstream()).toBeDefined();
    await expect(provider.status()).resolves.toMatchObject({ state: 'running' });
  });

  it('gates a freshly created container the same way', async () => {
    const calls: string[][] = [];
    let attempts = 0;
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        calls.push([...argv]);
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') return fail('No such object');
        if (argv[1] === 'image') return ok('webtop-image');
        return ok('ok');
      }),
      fetchImpl: (async () => {
        attempts += 1;
        if (attempts < 2) throw new Error('connection refused');
        return fetchOk();
      }) as unknown as typeof fetch,
    });
    await provider.start();
    const create = calls.find((argv) => argv[1] === 'run' && !argv.includes('--rm'));
    expect(create).toBeDefined();
    expect(attempts).toBeGreaterThanOrEqual(2);
    expect(provider.upstream()).toBeDefined();
  });

  it('fails start when the desktop never serves', async () => {
    const provider = createDockerComputerProvider({
      runner: stoppedRunner(),
      fetchImpl: () => fetchRefused(),
      readyTimeoutMs: 60,
      sleepImpl: async () => undefined,
    });
    await expect(provider.start()).rejects.toThrow(/未响应/);
    await expect(provider.status()).resolves.toMatchObject({ state: 'failed', phase: 'failed' });
  });

  it('stop cancels the desktop wait', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const provider = createDockerComputerProvider({
      runner: stoppedRunner(),
      fetchImpl: (async () => {
        await gate;
        throw new Error('connection refused');
      }) as unknown as typeof fetch,
    });
    const starting = provider.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const stopping = provider.stop();
    release();
    await expect(starting).rejects.toThrow(/cancelled/);
    await stopping;
  });

  it('already-running desktops confirm readiness too', async () => {
    let attempts = 0;
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') {
          const format = argv.join(' ');
          if (format.includes('HostConfig.Memory')) return specLine();
          return ok('running\n');
        }
        return ok('ok');
      }),
      fetchImpl: (async () => {
        attempts += 1;
        if (attempts < 2) throw new Error('connection refused');
        return fetchOk();
      }) as unknown as typeof fetch,
    });
    await provider.start();
    expect(attempts).toBeGreaterThanOrEqual(2);
  });

  it('export restart tolerates an unready desktop without failing the export', async () => {
    const events: string[] = [];
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') return ok('running\n');
        return ok('ok');
      }),
      fetchImpl: () => fetchRefused(),
      readyTimeoutMs: 60,
      sleepImpl: async () => undefined,
      onEvent: (detail) => {
        events.push(detail);
      },
    });
    await expect(provider.exportTo?.('/tmp/exports')).resolves.toMatch(/\.tar$/);
    expect(events.some((event) => event.includes('readiness'))).toBe(true);
    expect(provider.upstream()).toBeUndefined();
  });

  it('reports the waiting detail while the desktop boots', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const provider = createDockerComputerProvider({
      runner: stoppedRunner(),
      fetchImpl: (async () => {
        await gate;
        return fetchOk();
      }) as unknown as typeof fetch,
    });
    const starting = provider.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const status = await provider.status();
    expect(status.phase).toBe('starting');
    expect(status.detail).toContain('等待桌面');
    release();
    await starting;
  });
});
