import { access, readFile } from 'node:fs/promises';
import { LocalVideoError } from '../local-video-contract.js';
import type { ComputerRuntimeRunner } from '../provider.js';

export async function requireLinuxVideoPrerequisites(runner: ComputerRuntimeRunner): Promise<void> {
  const refuse = (message: string): never => {
    throw new LocalVideoError('helper-start-failed', message);
  };
  if (process.getuid?.() === 0)
    refuse(
      'Linux Local Computer video requires a non-root user. The Chromium sandbox stays enabled.',
    );
  if (!process.env['XDG_RUNTIME_DIR'])
    refuse('Linux video needs the logged-in user’s XDG_RUNTIME_DIR and systemd user manager.');
  try {
    await access('/sys/fs/cgroup/cgroup.controllers');
    const clone = await readFile('/proc/sys/kernel/unprivileged_userns_clone', 'utf8').catch(
      () => '1',
    );
    if (clone.trim() === '0')
      refuse(
        'Linux video requires a working unprivileged Chromium sandbox. User namespaces are disabled.',
      );
    for (const args of [
      ['systemctl', '--user', 'show-environment'],
      ['python3', '--version'],
      ['unzip', '-v'],
    ]) {
      const result = await runner.run(args, { timeoutMs: 2000, maxOutputBytes: 64 * 1024 });
      if (result.code !== 0) throw new Error('prerequisite');
    }
  } catch (error) {
    if (error instanceof LocalVideoError) throw error;
    refuse(
      'Linux video requires cgroup v2, an available systemd user manager, Python 3 and unzip. Prepare them explicitly, then start Local Computer again.',
    );
  }
}
