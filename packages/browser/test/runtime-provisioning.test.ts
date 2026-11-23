import { spawn } from 'node:child_process';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createBotBrowserRuntime } from '../src/runtime/browser.js';
import {
  LINUX_CHROME_LIB_REQUIREMENTS,
  type BrowserProvisionError,
} from '../src/runtime/provision.js';
import { fakeChild, fakeClient } from './support/runtime.js';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

const spawnMock = vi.mocked(spawn);

beforeEach(() => {
  spawnMock.mockReset();
});

const FULL_LDCONFIG = LINUX_CHROME_LIB_REQUIREMENTS.map(
  (entry) => `\t${entry.soname} (libc6,x86-64) => /lib/x86_64-linux-gnu/${entry.soname}`,
).join('\n');

describe('runtime lifecycle', () => {
  it('installs the pinned fallback when no system browser exists', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child.proc as never);
    const client = fakeClient();
    const installs: string[] = [];
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: () => false,
      installDir: '/tmp/browser-cache',
      installFallback: async (installDir) => {
        installs.push(installDir);
        return '/tmp/browser-cache/chrome-linux64/chrome';
      },
      connect: async () => client,
    });
    const ensuring = runtime.ensure();
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
    child.ready();
    await ensuring;
    expect(installs).toEqual(['/tmp/browser-cache']);
    expect(runtime.binaryPath()).toBe('/tmp/browser-cache/chrome-linux64/chrome');
    expect(spawnMock).toHaveBeenCalledWith(
      '/tmp/browser-cache/chrome-linux64/chrome',
      expect.anything(),
      expect.anything(),
    );
  });

  it('reports a readable error when the pinned fallback cannot install', async () => {
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: () => false,
      installDir: '/tmp/browser-cache',
      installFallback: async () => {
        throw new Error('network down');
      },
      preflight: { run: () => FULL_LDCONFIG },
    });
    const failure = await runtime.ensure().then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toMatchObject({ code: 'provision-no-network' });
    expect(String((failure as Error).message)).toMatch(/looks offline/);
    expect((failure as { detail?: string }).detail).toBe('network down');
  });
});

describe('first-run provisioning UX', () => {
  it('reports download progress and settles it after install', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child.proc as never);
    const client = fakeClient();
    const progress: [number, number][] = [];
    const settled = vi.fn();
    const events: string[] = [];
    const installs: string[] = [];
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: () => false,
      installDir: '/tmp/browser-cache',
      installFallback: async (installDir, hooks) => {
        installs.push(installDir);
        hooks?.onProgress?.(30, 100);
        hooks?.onProgress?.(100, 100);
        return '/tmp/browser-cache/chrome-linux64/chrome';
      },
      preflight: { run: () => FULL_LDCONFIG },
      onEvent: (detail) => events.push(detail),
      onInstallProgress: (downloaded, total) => progress.push([downloaded, total]),
      onInstallSettled: settled,
      connect: async () => client,
    });
    const ensuring = runtime.ensure();
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
    child.ready();
    await ensuring;
    expect(installs).toEqual(['/tmp/browser-cache']);
    expect(progress).toEqual([
      [0, 0],
      [30, 100],
      [100, 100],
    ]);
    expect(settled).toHaveBeenCalledOnce();
    expect(events.some((event) => event.includes('installing Chrome for Testing'))).toBe(true);
    expect(events.some((event) => event.includes('install progress'))).toBe(true);
    expect(events.some((event) => event.startsWith('installed '))).toBe(true);
    expect(runtime.binaryPath()).toBe('/tmp/browser-cache/chrome-linux64/chrome');
    await runtime.stop();
  });

  it('refuses to download when system libraries are missing, before any install', async () => {
    const installer = vi.fn(async () => '/tmp/browser-cache/chrome');
    const onProgress = vi.fn();
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: () => false,
      installDir: '/tmp/browser-cache',
      installFallback: installer,
      preflight: { run: () => '\tlibc.so.6 (libc6,x86-64) => /lib/libc.so.6\n' },
      onInstallProgress: onProgress,
    });
    const failure = (await runtime.ensure().then(
      () => undefined,
      (error: unknown) => error,
    )) as BrowserProvisionError;
    expect(failure.code).toBe('provision-missing-libs');
    expect(failure.message).toMatch(/nothing was downloaded/);
    expect(failure.message).toMatch(/libatk-1\.0\.so\.0/);
    expect(failure.detail).toContain('sudo apt install -y');
    expect(installer).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();
  });

  it.each([
    ['network', new Error('getaddrinfo EAI_AGAIN storage.googleapis.com'), 'provision-no-network'],
    [
      'disk',
      Object.assign(new Error('write error'), { code: 'ENOSPC' }),
      'provision-no-disk-space',
    ],
    ['permission', new Error('EACCES: permission denied, mkdir'), 'provision-no-permission'],
  ])('maps a %s download failure to its cause and action', async (_kind, error, code) => {
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: () => false,
      installDir: '/tmp/browser-cache',
      installFallback: async () => {
        throw error;
      },
      preflight: { run: () => FULL_LDCONFIG },
    });
    const failure = (await runtime.ensure().then(
      () => undefined,
      (cause: unknown) => cause,
    )) as BrowserProvisionError;
    expect(failure.code).toBe(code);
    expect(failure.message).not.toContain((error as Error).message);
  });

  it('diagnoses exit 127 with the missing libraries instead of the bare code', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child.proc as never);
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: (path) => path === '/usr/bin/google-chrome',
      preflight: {
        run: (command) => (command === 'ldd' ? '\tlibatk-1.0.so.0 => not found\n' : FULL_LDCONFIG),
      },
      connect: async () => fakeClient(),
    });
    const ensuring = runtime.ensure();
    child.proc.emit('exit', 127);
    const failure = (await ensuring.then(
      () => undefined,
      (error: unknown) => error,
    )) as BrowserProvisionError;
    expect(failure.code).toBe('provision-missing-libs');
    expect(failure.message).toMatch(/libatk-1\.0\.so\.0/);
    expect(failure.detail).toContain('exit code 127');
    expect(failure.detail).toContain('sudo apt install -y');
  });

  it('detects a sandbox refusal from startup stderr', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child.proc as never);
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: (path) => path === '/usr/bin/google-chrome',
      preflight: { run: () => '' },
      connect: async () => fakeClient(),
    });
    const ensuring = runtime.ensure();
    child.proc.stderr.emit(
      'data',
      Buffer.from('[42:42] Running as root without --no-sandbox is not supported.\n'),
    );
    child.proc.emit('exit', 1);
    const failure = (await ensuring.then(
      () => undefined,
      (error: unknown) => error,
    )) as BrowserProvisionError;
    expect(failure.code).toBe('startup-sandbox');
    expect(failure.message).not.toMatch(/headless/);
  });

  it('bounds a browser that never reports its endpoint', async () => {
    const child = fakeChild();
    Object.assign(child.proc, { pid: 4321, signalCode: null });
    spawnMock.mockReturnValue(child.proc as never);
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: (path) => path === '/usr/bin/google-chrome',
      launchTimeoutMs: 50,
      connect: async () => fakeClient(),
    });
    const ensuring = runtime.ensure();
    child.proc.stderr.emit(
      'data',
      Buffer.from(
        'waiting for sandbox\ntoken=private-startup-token\nhttps://example.com/?token=hidden\n',
      ),
    );
    const failure = (await ensuring.then(
      () => undefined,
      (error: unknown) => error,
    )) as BrowserProvisionError;
    expect(failure.code).toBe('startup-timeout');
    expect(failure.message).toMatch(/took longer/);
    expect(JSON.parse(failure.detail!)).toMatchObject({
      timeoutMs: 50,
      binary: '/usr/bin/google-chrome',
      pid: 4321,
      exitCode: null,
      signalCode: null,
      killed: false,
    });
    expect(failure.detail).toContain('waiting for sandbox');
    expect(failure.detail).not.toContain('private-startup-token');
    expect(failure.detail).not.toContain('hidden');
    await runtime.stop();
  });

  it('reports an explicit missing binary path with its cause', async () => {
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      browserPath: '/opt/missing-chrome',
      fileExists: () => false,
    });
    const failure = (await runtime.ensure().then(
      () => undefined,
      (error: unknown) => error,
    )) as BrowserProvisionError;
    expect(failure.code).toBe('startup-missing-binary');
    expect(failure.message).toContain('/opt/missing-chrome');
  });

  it('maps a spawn refusal for a vanished binary to antivirus-or-permissions guidance', async () => {
    const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
    spawnMock.mockImplementation(((...args: unknown[]) =>
      (actual.spawn as (...inner: unknown[]) => unknown)(...args)) as typeof spawn);
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: () => false,
      installDir: '/tmp/browser-cache',
      installFallback: async () => '/tmp/browser-cache-removed/chrome',
      preflight: { run: () => FULL_LDCONFIG },
    });
    const failure = (await runtime.ensure().then(
      () => undefined,
      (error: unknown) => error,
    )) as BrowserProvisionError;
    expect(failure.code).toBe('startup-spawn-failed');
    expect(failure.message).toMatch(/antivirus/);
    expect(failure.detail).toMatch(/ENOENT/);
  });
});
