import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it, vi } from 'vitest';

const cleanup = vi.hoisted(() => ({ fail: false }));
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return {
    ...actual,
    rm: async (...args: Parameters<typeof actual.rm>) => {
      if (cleanup.fail && String(args[0]).includes('.video-install-')) {
        cleanup.fail = false;
        throw Object.assign(new Error('EBUSY: directory not empty, rmdir <private staging>'), {
          code: 'EBUSY',
        });
      }
      return actual.rm(...args);
    },
  };
});
vi.mock('node:module', async (original) => {
  const actual = await original<typeof import('node:module')>();
  return {
    ...actual,
    createRequire: () => ({
      resolve: () => fileURLToPath(new URL('../package.json', import.meta.url)),
    }),
  };
});
import { ensureLocalVideoHelper } from '../src/media/install.js';

let directory: string | undefined;
afterEach(async () => {
  cleanup.fail = false;
  vi.unstubAllGlobals();
  if (directory) await rm(directory, { recursive: true, force: true });
});

it('preserves setup failure when staging cleanup reports EBUSY and allows retry', async () => {
  directory = await mkdtemp(join(tmpdir(), 'windows-cleanup-repro-'));
  const events: string[] = [];
  const options = {
    dir: join(directory, 'runtime'),
    platform: 'win32',
    arch: 'x64',
    runner: { run: vi.fn() },
    onEvent: (event: string) => events.push(event),
  };
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fixture network failure')));
  cleanup.fail = true;
  await expect(ensureLocalVideoHelper(options)).rejects.toMatchObject({
    setupCode: 'download-failed',
  });
  expect(events.at(-1)).toBe(
    'phase=media-cleanup-refused platform=win32 target=staging code=EBUSY',
  );
  expect(events.join(' ')).not.toContain('<private staging>');
  await expect(ensureLocalVideoHelper(options)).rejects.toThrow(
    'Local Computer video setup failed',
  );
});

it('preserves cancellation when cleanup fails', async () => {
  directory = await mkdtemp(join(tmpdir(), 'windows-cleanup-cancel-'));
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
    ensureLocalVideoHelper({
      dir: join(directory, 'runtime'),
      platform: 'win32',
      arch: 'x64',
      runner: { run: vi.fn() },
      signal: controller.signal,
    }),
  ).rejects.toMatchObject({ name: 'AbortError' });
});

it.each([
  ['ENOSPC', 'disk-full'],
  ['EACCES', 'runtime-write-refused'],
  ['EPERM', 'runtime-write-refused'],
])('classifies %s without exposing paths', async (code, setupCode) => {
  directory = await mkdtemp(join(tmpdir(), 'windows-failure-'));
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(Object.assign(new Error('private path'), { code })),
  );
  await expect(
    ensureLocalVideoHelper({
      dir: join(directory, 'runtime'),
      platform: 'win32',
      arch: 'x64',
      runner: { run: vi.fn() },
    }),
  ).rejects.toMatchObject({ setupCode });
});
it('clears completed download progress before rejecting an invalid archive', async () => {
  directory = await mkdtemp(join(tmpdir(), 'windows-progress-'));
  const progress: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad archive')));
  await expect(
    ensureLocalVideoHelper({
      dir: join(directory, 'runtime'),
      platform: 'win32',
      arch: 'x64',
      runner: { run: vi.fn() },
      onProgress: (value) => progress.push(value),
    }),
  ).rejects.toMatchObject({ setupCode: 'verification-failed' });
  expect(progress.at(-1)).toEqual({ text: 'video-verifying' });
});
