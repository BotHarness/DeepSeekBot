import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { checksum, createLocalCuaDriver, LOCAL_DRIVER_BUILDS } from '../src/tool/local-driver.js';
import type { CuaDriver, createMcpCuaDriver } from '../src/tool/driver.js';
import type { LocalDesktopBinding } from '../src/tool/local-desktop.js';

const transport = vi.hoisted(() => ({
  options: undefined as Parameters<typeof createMcpCuaDriver>[0] | undefined,
  close: vi.fn(async () => undefined),
  call: vi.fn(async () => undefined),
}));
vi.mock('../src/tool/driver.js', () => ({
  createMcpCuaDriver: (options: Parameters<typeof createMcpCuaDriver>[0]): CuaDriver => {
    transport.options = options;
    return {
      ensure: options.ensure,
      tools: async () => [],
      call: transport.call,
      close: transport.close,
    };
  },
}));
const directories: string[] = [];
afterEach(async () => {
  vi.clearAllMocks();
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
});

it('reopens the input transport with the shared display environment after generation changes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'video-driver-binding-'));
  directories.push(dir);
  const bytes = Buffer.from('verified fixture');
  await writeFile(join(dir, 'cua-driver'), bytes);
  let binding: LocalDesktopBinding = {
    generation: 'first',
    managed: true,
    alive: () => true,
    env: { PATH: '/bin', DISPLAY: ':71', XAUTHORITY: 'first-authority' },
  };
  const stop = vi.fn(async () => undefined);
  const driver = createLocalCuaDriver({
    platform: 'linux',
    arch: 'x64',
    dir,
    runner: { run: vi.fn(async () => ({ code: 0, stdout: '', stderr: '' })) },
    build: { ...LOCAL_DRIVER_BUILDS['linux-x86_64'], files: { 'cua-driver': checksum(bytes) } },
    desktop: { ensure: async () => binding, current: () => binding, close: stop },
  });
  await driver.ensure();
  expect(transport.options?.transport.env).toEqual(binding.env);
  await driver.call('get_screen_size', {});
  binding = {
    ...binding,
    generation: 'second',
    env: { PATH: '/bin', DISPLAY: ':72', XAUTHORITY: 'second-authority' },
  };
  await expect(driver.call('click', {})).rejects.toThrow('start Local Computer again');
  await driver.ensure();
  expect(transport.close).toHaveBeenCalledTimes(2);
  expect(transport.options?.transport.env).toEqual(binding.env);
  await driver.call('click', {});
  expect(transport.call).toHaveBeenCalledTimes(2);
  transport.close.mockRejectedValueOnce(new Error('transport refused'));
  await expect(driver.close()).rejects.toThrow('transport refused');
  expect(stop).toHaveBeenCalledOnce();
});
