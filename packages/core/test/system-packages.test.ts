import { describe, expect, it, vi } from 'vitest';
import {
  aptInstallCommand,
  installSystemPackages,
  parseAptStatus,
  systemInstallAccess,
  type SystemCommandRunner,
} from '../src/system/system-packages.js';

const result = (code: number, stderr = '') => ({ code, stdout: '', stderr });

describe('system package install', () => {
  it('installs directly as root, through passwordless sudo, and otherwise only shows the command', async () => {
    const run = vi.fn(async () => result(0));
    expect(await systemInstallAccess({ run }, { platform: 'linux', uid: 0 })).toBe('root');
    expect(await systemInstallAccess({ run }, { platform: 'linux', uid: 1000 })).toBe('sudo');
    expect(run).toHaveBeenLastCalledWith(['sudo', '-n', 'true']);
    const refused = vi.fn(async (argv: readonly string[]) => result(argv[0] === 'sudo' ? 1 : 0));
    expect(await systemInstallAccess({ run: refused }, { platform: 'linux', uid: 1000 })).toBe(
      'none',
    );
    const noApt = vi.fn(async () => result(1));
    expect(await systemInstallAccess({ run: noApt }, { platform: 'linux', uid: 0 })).toBe('none');
    expect(await systemInstallAccess({ run }, { platform: 'win32' })).toBe('none');
    expect(aptInstallCommand(['xvfb', 'openbox'])).toBe('sudo apt install -y xvfb openbox');
  });

  it('maps apt status lines onto one 0-100 bar', () => {
    expect(parseAptStatus('dlstatus:1:50.0:Retrieving file 1 of 2', 'update')).toEqual({
      percent: 10,
      text: 'Retrieving file 1 of 2',
    });
    expect(parseAptStatus('pmstatus:openbox:50:Installing openbox', 'install')).toEqual({
      percent: 60,
      text: 'Installing openbox',
    });
    expect(parseAptStatus('Reading package lists...', 'install')).toBeUndefined();
  });

  it('runs apt-get update then install through sudo -n and streams progress', async () => {
    const calls: string[][] = [];
    const runner: SystemCommandRunner = {
      run: vi.fn(async () => result(0)),
      runStreaming: vi.fn(async (argv: readonly string[], onChunk: (chunk: string) => void) => {
        calls.push([...argv]);
        onChunk('pmstatus:xvfb:4');
        onChunk('0.0:Installing xvfb\nnoise\n');
        return result(0);
      }),
    };
    const onProgress = vi.fn();
    await installSystemPackages({ packages: ['xvfb'], access: 'sudo', runner, onProgress });
    expect(calls.map((argv) => argv.slice(0, 7))).toEqual([
      ['sudo', '-n', 'env', 'DEBIAN_FRONTEND=noninteractive', 'apt-get', '-o', 'APT::Status-Fd=1'],
      ['sudo', '-n', 'env', 'DEBIAN_FRONTEND=noninteractive', 'apt-get', '-o', 'APT::Status-Fd=1'],
    ]);
    expect(calls[1]?.slice(7)).toEqual(['install', '-y', '--no-install-recommends', 'xvfb']);
    expect(onProgress).toHaveBeenCalledWith({ percent: 52, text: 'Installing xvfb' });
    expect(onProgress).toHaveBeenLastCalledWith({ percent: 100, text: 'done' });
  });

  it('stops at a failed step and never installs without administrator access', async () => {
    const runner: SystemCommandRunner = {
      run: vi.fn(async () => result(0)),
      runStreaming: vi.fn(async () => result(100, 'E: Could not get lock')),
    };
    await expect(
      installSystemPackages({ packages: ['xvfb'], access: 'root', runner }),
    ).rejects.toThrow('apt-get update failed (exit 100): E: Could not get lock');
    expect(runner.runStreaming).toHaveBeenCalledTimes(1);
    await expect(
      installSystemPackages({ packages: ['xvfb'], access: 'none', runner }),
    ).rejects.toThrow('sudo apt install -y xvfb');
  });
});
