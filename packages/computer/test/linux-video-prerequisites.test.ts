import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requireLinuxVideoPrerequisites } from '../src/media/linux-prerequisites.js';
import type { ComputerRuntimeRunner } from '../src/provider.js';

const filesystem = vi.hoisted(() => ({ access: vi.fn(), readFile: vi.fn() }));
vi.mock('node:fs/promises', () => filesystem);

beforeEach(() => {
  vi.stubGlobal('process', { ...process, getuid: () => 1000 });
  vi.stubEnv('XDG_RUNTIME_DIR', '/run/user/1000');
  filesystem.access.mockResolvedValue(undefined);
  filesystem.readFile.mockResolvedValue('1');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const runner = (): ComputerRuntimeRunner => ({
  run: vi.fn(async () => ({ code: 0, stdout: '', stderr: '' })),
});

describe('Linux video prerequisites', () => {
  it('checks the current user manager without changing server configuration', async () => {
    const commands = runner();
    await requireLinuxVideoPrerequisites(commands);
    expect(vi.mocked(commands.run).mock.calls.map(([args]) => args)).toEqual([
      ['systemctl', '--user', 'show-environment'],
      ['python3', '--version'],
      ['unzip', '-v'],
    ]);
    expect(
      vi.mocked(commands.run).mock.calls.every(([, options]) => options?.timeoutMs === 2000),
    ).toBe(true);
  });

  it('refuses root before starting any external command', async () => {
    vi.stubGlobal('process', { ...process, getuid: () => 0 });
    const commands = runner();
    await expect(requireLinuxVideoPrerequisites(commands)).rejects.toMatchObject({
      code: 'helper-start-failed',
    });
    expect(commands.run).not.toHaveBeenCalled();
  });

  it('refuses disabled unprivileged namespaces without disabling the Chromium sandbox', async () => {
    filesystem.readFile.mockResolvedValue('0');
    const commands = runner();
    await expect(requireLinuxVideoPrerequisites(commands)).rejects.toThrow(
      'User namespaces are disabled',
    );
    expect(commands.run).not.toHaveBeenCalled();
  });

  it('refuses unavailable user managers and cgroup v1 without creating a desktop', async () => {
    const commands = runner();
    vi.mocked(commands.run).mockResolvedValue({
      code: 1,
      stdout: '',
      stderr: 'private diagnostic',
    });
    await expect(requireLinuxVideoPrerequisites(commands)).rejects.toThrow('systemd user manager');
    filesystem.access.mockRejectedValue(new Error('missing'));
    vi.mocked(commands.run).mockClear();
    await expect(requireLinuxVideoPrerequisites(commands)).rejects.toThrow('cgroup v2');
    expect(commands.run).not.toHaveBeenCalled();
  });
});
