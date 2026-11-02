import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

const cleanup = vi.hoisted(() => ({ fail: false }));
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return {
    ...actual,
    rm: async (...args: Parameters<typeof actual.rm>) => {
      if (cleanup.fail && String(args[0]).includes('.video-install-')) {
        cleanup.fail = false;
        throw Object.assign(new Error('ENOTEMPTY: directory not empty, rmdir <private staging>'), {
          code: 'ENOTEMPTY',
        });
      }
      return actual.rm(...args);
    },
  };
});
import { ensureMacVideoHelper } from '../src/media/install-macos.js';

let directory: string | undefined;
afterEach(async () => {
  cleanup.fail = false;
  vi.unstubAllGlobals();
  if (directory) await rm(directory, { recursive: true, force: true });
});

it('preserves setup failure when staging cleanup reports ENOTEMPTY and allows retry', async () => {
  directory = await mkdtemp(join(tmpdir(), 'mac-cleanup-repro-'));
  const events: string[] = [];
  const options = {
    dir: join(directory, 'runtime'),
    arch: 'arm64',
    runner: { run: vi.fn() },
    onEvent: (event: string) => events.push(event),
  };
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fixture network failure')));
  cleanup.fail = true;
  await expect(ensureMacVideoHelper(options)).rejects.toThrow('Mac video download failed');
  expect(events.at(-1)).toBe(
    'phase=media-cleanup-refused platform=darwin target=staging code=ENOTEMPTY',
  );
  expect(events.join(' ')).not.toContain('<private staging>');
  await expect(ensureMacVideoHelper(options)).rejects.toThrow('Mac video download failed');
});

it('preserves cancellation when cleanup fails', async () => {
  directory = await mkdtemp(join(tmpdir(), 'mac-cleanup-cancel-'));
  const controller = new AbortController();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => {
      controller.abort();
      throw controller.signal.reason;
    }),
  );
  cleanup.fail = true;
  await expect(
    ensureMacVideoHelper({
      dir: join(directory, 'runtime'),
      arch: 'arm64',
      runner: { run: vi.fn() },
      signal: controller.signal,
    }),
  ).rejects.toMatchObject({ name: 'AbortError' });
});
