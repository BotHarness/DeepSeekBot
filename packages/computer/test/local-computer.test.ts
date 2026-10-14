import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Config, DEFAULT_CONFIG } from '../src/index.js';
import { createComputerTargetRuntime, type ComputerTarget } from '../src/target.js';
import { createLocalComputerProvider } from '../src/providers/local.js';
import {
  LOCAL_DRIVER_BUILDS,
  checksum,
  createLocalCuaDriver,
  installLocalDriver,
  localDriverBuild,
  readWithProgress,
} from '../src/tool/local-driver.js';
import { LocalDesktopMissingError } from '../src/tool/local-display.js';
import type { CuaDriver } from '../src/tool/driver.js';
import type { ComputerProvider, ComputerRuntimeRunner } from '../src/provider.js';

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

function fakeDriver(permissions = { accessibility: true, screen_recording: true }): CuaDriver {
  return {
    ensure: vi.fn(async () => ({ status: 'present' as const, arch: 'darwin-universal' })),
    tools: vi.fn(async () => []),
    call: vi.fn(async () => ({ structuredContent: permissions })),
    close: vi.fn(async () => undefined),
  };
}
const runner = (): ComputerRuntimeRunner => ({
  run: vi.fn(async () => ({ code: 0, stdout: '{"ok":true}', stderr: '' })),
});

function fakeRuntime(target: ComputerTarget) {
  const driver = fakeDriver();
  const provider: ComputerProvider = {
    name: target,
    probe: vi.fn(async () => ({ available: true })),
    status: vi.fn(async () => ({ state: 'running' as const })),
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    upstream: () => (target === 'container' ? new URL('http://127.0.0.1:3000') : undefined),
    exportTo: vi.fn(async () => '/exports/proof.tar'),
    importFrom: vi.fn(async () => undefined),
    ...(target === 'container'
      ? {
          webrtc: {
            media: vi.fn(async () => ({
              advertised: { address: '100.101.102.103', port: 39_002 },
              loopbackPort: 32_768,
            })),
            prepare: vi.fn(async () => undefined),
          },
        }
      : {}),
  };
  return { provider, driver };
}

describe('macOS Local Computer', () => {
  it('keeps legacy schema rows container while the fresh Bundle default is local', () => {
    expect(DEFAULT_CONFIG.target).toBe('local');
    expect(Config({}).target.get()).toBe('container');
    expect(Config({ target: 'local' }).target.get()).toBe('local');
    expect(() => Config(JSON.parse('{"target":"remote"}'))).toThrow();
  });

  it('checks doctor and actual read-only OS grants without invoking Docker', async () => {
    const driver = fakeDriver();
    const processRunner = runner();
    const provider = createLocalComputerProvider({
      driver,
      runner: processRunner,
      platform: 'darwin',
    });
    expect(await provider.status()).toEqual({ state: 'stopped' });
    expect(processRunner.run).not.toHaveBeenCalled();
    await provider.start();
    expect(await provider.status()).toMatchObject({ state: 'running' });
    expect(provider.upstream()).toBeUndefined();
    expect(driver.call).toHaveBeenCalledWith(
      'check_permissions',
      { prompt: false },
      expect.any(AbortSignal),
    );
    expect(
      vi.mocked(processRunner.run).mock.calls.every(([args]) => !args.includes('docker')),
    ).toBe(true);
    await provider.stop();
    expect(await provider.status()).toEqual({ state: 'stopped' });
  });

  it('refuses missing permission, closes its process and allows a fresh explicit check', async () => {
    const driver = fakeDriver({ accessibility: false, screen_recording: true });
    const provider = createLocalComputerProvider({ driver, runner: runner(), platform: 'darwin' });
    await expect(provider.start()).rejects.toThrow('Accessibility and Screen Recording');
    expect(await provider.status()).toMatchObject({ state: 'failed' });
    expect(driver.call).toHaveBeenCalledTimes(1);
    expect(driver.close).toHaveBeenCalledTimes(1);
    vi.mocked(driver.call).mockResolvedValue({
      structuredContent: { accessibility: true, screen_recording: true },
    });
    await provider.start();
    expect(await provider.status()).toMatchObject({ state: 'running' });
  });

  it('refuses a Host with no upstream build before installation or a Docker probe', async () => {
    const processRunner = runner();
    const driver = createLocalCuaDriver({ runner: processRunner, platform: 'freebsd' });
    await expect(driver.ensure()).rejects.toThrow('Container Computer');
    expect(processRunner.run).not.toHaveBeenCalled();
    const provider = createLocalComputerProvider({
      driver: fakeDriver(),
      runner: processRunner,
      platform: 'linux',
      arch: 'ia32',
    });
    expect(await provider.probe()).toMatchObject({ available: false });
  });

  it('refuses an incorrect download checksum before extraction or executable launch', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bh694-install-test-'));
    dirs.push(dir);
    const processRunner = runner();
    await expect(
      installLocalDriver({
        dir,
        runner: processRunner,
        download: async () => new Uint8Array([1, 2, 3]),
      }),
    ).rejects.toThrow('checksum mismatch');
    expect(processRunner.run).not.toHaveBeenCalled();
  });

  it('does not become ready if cancelled while setup is in flight', async () => {
    const driver = fakeDriver();
    let finish: (() => void) | undefined;
    vi.mocked(driver.ensure).mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return { status: 'present' as const, arch: 'darwin-universal' };
    });
    const provider = createLocalComputerProvider({ driver, runner: runner(), platform: 'darwin' });
    const preparing = provider.start();
    const stopping = provider.stop();
    finish?.();
    await expect(preparing).rejects.toThrow('cancelled');
    await stopping;
    expect(await provider.status()).toEqual({ state: 'stopped' });
  });
});

describe('Local Computer on Linux and Windows', () => {
  it('pins one checksummed build per supported Host', () => {
    expect(localDriverBuild('darwin', 'arm64')?.id).toBe('darwin-universal');
    expect(localDriverBuild('darwin', 'x64')?.id).toBe('darwin-universal');
    expect(localDriverBuild('linux', 'x64')?.asset).toBe(
      'cua-driver-rs-0.31.0-linux-x86_64-binary.tar.gz',
    );
    expect(localDriverBuild('linux', 'arm64')?.id).toBe('linux-arm64');
    expect(localDriverBuild('win32', 'x64')?.executable).toBe('cua-driver.exe');
    expect(localDriverBuild('win32', 'arm64')?.asset).toBe(
      'cua-driver-rs-0.31.0-windows-arm64-binary.zip',
    );
    expect(localDriverBuild('linux', 'ia32')).toBeUndefined();
    for (const build of Object.values(LOCAL_DRIVER_BUILDS)) {
      expect(build.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(Object.keys(build.files)).toContain(build.executable);
    }
  });

  it('becomes ready on Linux once a display is reachable, without the macOS prompt argument', async () => {
    const driver = fakeDriver();
    vi.mocked(driver.call).mockResolvedValue({
      structuredContent: { x11: true, wayland: false, atspi: false },
    });
    const processRunner = runner();
    const provider = createLocalComputerProvider({
      driver,
      runner: processRunner,
      platform: 'linux',
      arch: 'x64',
    });
    expect(await provider.probe()).toEqual({ available: true });
    await provider.start();
    expect(await provider.status()).toMatchObject({ state: 'running' });
    expect(driver.call).toHaveBeenCalledWith('check_permissions', {}, expect.any(AbortSignal));
    const [argv, options] = vi.mocked(processRunner.run).mock.calls[0] ?? [];
    expect(argv?.[0]).toMatch(/linux-x86_64[\\/]cua-driver$/);
    expect(argv?.slice(1)).toEqual(['doctor', '--json']);
    expect(options?.env).toMatchObject({ CUA_DRIVER_RS_TELEMETRY_ENABLED: 'false' });
  });

  it('refuses on Linux when the driver reaches no display', async () => {
    const driver = fakeDriver();
    vi.mocked(driver.call).mockResolvedValue({ structuredContent: { x11: false, wayland: false } });
    const provider = createLocalComputerProvider({
      driver,
      runner: runner(),
      platform: 'linux',
      arch: 'arm64',
    });
    await expect(provider.start()).rejects.toThrow('DISPLAY');
    expect(driver.close).toHaveBeenCalledTimes(1);
  });

  it('needs no grant on Windows and runs the .exe doctor', async () => {
    const driver = fakeDriver();
    vi.mocked(driver.call).mockResolvedValue({
      structuredContent: { elevated: false, integrity_level: 'Medium', uia: true },
    });
    const processRunner = runner();
    const provider = createLocalComputerProvider({
      driver,
      runner: processRunner,
      platform: 'win32',
      arch: 'x64',
    });
    await provider.start();
    expect(await provider.status()).toMatchObject({ state: 'running' });
    expect(driver.call).toHaveBeenCalledWith('check_permissions', {}, expect.any(AbortSignal));
    expect(vi.mocked(processRunner.run).mock.calls[0]?.[0][0]).toMatch(/cua-driver\.exe$/);
  });

  it('opens a display on Linux once the driver verifies, reuses it, and stops it on close', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bh1632-linux-'));
    dirs.push(dir);
    const bytes = new Uint8Array([1, 6, 3, 2]);
    await writeFile(join(dir, 'cua-driver'), bytes);
    const stop = vi.fn(async () => undefined);
    const display = vi.fn(async () => ({
      display: ':42',
      env: {},
      managed: true,
      alive: () => true,
      stop,
    }));
    const processRunner = runner();
    const driver = createLocalCuaDriver({
      runner: processRunner,
      platform: 'linux',
      arch: 'x64',
      dir,
      build: {
        ...LOCAL_DRIVER_BUILDS['linux-x86_64'],
        files: { 'cua-driver': checksum(bytes) },
      },
      display,
    });
    await expect(driver.ensure()).resolves.toEqual({ status: 'present', arch: 'linux-x86_64' });
    await driver.ensure();
    expect(display).toHaveBeenCalledTimes(1);
    expect(processRunner.run).not.toHaveBeenCalled();
    await driver.close();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('extracts the Windows zip build with tar -xf', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bh1632-win-'));
    dirs.push(dir);
    const build = localDriverBuild('win32', 'x64');
    if (build === undefined) throw new Error('missing build');
    const bytes = new Uint8Array([7, 7, 7]);
    const processRunner = runner();
    await expect(
      installLocalDriver({
        dir,
        runner: processRunner,
        build: { ...build, sha256: checksum(bytes) },
        download: async () => bytes,
      }),
    ).rejects.toThrow('did not verify');
    const argv = vi.mocked(processRunner.run).mock.calls[0]?.[0];
    expect(argv?.slice(0, 2)).toEqual(['tar', '-xf']);
    expect(argv?.[2]).toMatch(/driver\.zip$/);
    expect(argv?.slice(-2)).toEqual(['cua-driver.exe', 'cua-driver-uia.exe']);
  });
});

describe('Local Computer missing parts', () => {
  it('reports missing desktop packages with the install route a Human can take', async () => {
    const driver = fakeDriver();
    vi.mocked(driver.ensure).mockRejectedValue(
      new LocalDesktopMissingError(['xvfb', 'openbox'], false),
    );
    const provider = createLocalComputerProvider({
      driver,
      runner: runner(),
      platform: 'linux',
      arch: 'x64',
      installAccess: async () => 'sudo',
    });
    await expect(provider.start()).rejects.toThrow('desktop packages');
    expect(await provider.status()).toMatchObject({
      state: 'failed',
      missing: {
        packages: ['xvfb', 'openbox'],
        command: 'sudo apt install -y xvfb openbox',
        install: 'sudo',
      },
    });
  });

  it('shows driver download progress while the check runs', async () => {
    const driver = fakeDriver();
    let release: (() => void) | undefined;
    vi.mocked(driver.ensure).mockImplementation(async (_signal, onProgress) => {
      onProgress?.({ percent: 40, downloadedBytes: 40, totalBytes: 100 });
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { status: 'installed' as const, arch: 'linux-x86_64' };
    });
    vi.mocked(driver.call).mockResolvedValue({ structuredContent: { x11: true } });
    const provider = createLocalComputerProvider({
      driver,
      runner: runner(),
      platform: 'linux',
      arch: 'x64',
    });
    const starting = provider.start();
    await vi.waitFor(() => expect(release).toBeDefined());
    expect(await provider.status()).toMatchObject({
      phase: 'starting',
      progress: { percent: 40, totalBytes: 100 },
    });
    release?.();
    await starting;
    expect(await provider.status()).toEqual({ state: 'running', phase: 'running' });
  });

  it('reads a download in chunks and reports byte progress', async () => {
    const onProgress = vi.fn();
    const body = new Response(new Uint8Array([1, 2, 3, 4]), {
      headers: { 'content-length': '4' },
    });
    expect(await readWithProgress(body, onProgress)).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ percent: 100, downloadedBytes: 4, totalBytes: 4 }),
    );
  });
});

describe('Profile Computer Target lifecycle', () => {
  it('creates only the selected strategy and refuses archive transfer in local mode', async () => {
    const factory = vi.fn(fakeRuntime);
    const runtime = createComputerTargetRuntime({
      target: () => 'local',
      create: factory,
      onChange: vi.fn(),
    });
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith('local');
    await runtime.provider.start();
    expect(runtime.isRunning()).toBe(true);
    await expect(runtime.provider.exportTo?.('/tmp')).rejects.toThrow('Container Computer');
    await runtime.dispose();
    await expect(runtime.driver.call('click', {})).rejects.toThrow('Target changed');
  });

  it('refuses stale actions immediately and clears grants before switching, while preserving container transfer', async () => {
    let target: ComputerTarget = 'container';
    const old = fakeRuntime('container');
    const next = fakeRuntime('local');
    const onChange = vi.fn();
    const runtime = createComputerTargetRuntime({
      target: () => target,
      create: (value) => (value === 'container' ? old : next),
      onChange,
    });
    await expect(runtime.provider.exportTo?.('/exports')).resolves.toBe('/exports/proof.tar');
    await expect(runtime.provider.webrtc?.media()).resolves.toMatchObject({ loopbackPort: 32_768 });
    target = 'local';
    await expect(runtime.provider.webrtc?.media()).resolves.toBeUndefined();
    expect(runtime.isRunning()).toBe(false);
    await expect(runtime.driver.call('click', {})).rejects.toThrow('Target changed');
    expect(old.driver.call).not.toHaveBeenCalled();
    await runtime.sync();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(old.provider.stop).toHaveBeenCalledTimes(1);
    expect(runtime.provider.name).toBe('local');
    expect(runtime.isRunning()).toBe(false);
    await expect(runtime.provider.webrtc?.prepare()).rejects.toThrow('Container Computer');
    await runtime.provider.start();
    expect(runtime.isRunning()).toBe(true);
    await runtime.driver.call('click', {});
    expect(next.driver.call).toHaveBeenCalledTimes(1);
  });
});
