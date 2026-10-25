import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ensureMacVideoHelper,
  macVideoBuild,
  MAC_VIDEO_EXECUTABLE,
  verifyMacVideoHelper,
} from '../src/media/install-macos.js';

const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
async function installed() {
  const directory = await mkdtemp(join(tmpdir(), 'mac-video-test-'));
  directories.push(directory);
  const files: Record<string, string> = {};
  for (const name of [
    MAC_VIDEO_EXECUTABLE,
    'LICENSE',
    'LICENSES.chromium.html',
    'Framework/Versions/A/library',
  ]) {
    await mkdir(dirname(join(directory, name)), { recursive: true });
    await writeFile(join(directory, name), name);
    files[name] = createHash('sha256').update(name).digest('hex');
  }
  await symlink('A', join(directory, 'Framework/Versions/Current'));
  files['Framework/Versions/Current'] = 'link:A';
  await writeFile(
    join(directory, '.botharness-video-runtime.json'),
    JSON.stringify({ archiveSha256: macVideoBuild('arm64').sha256, files }),
  );
  return directory;
}
describe('Mac pinned capture runtime', () => {
  it('reuses a verified runtime without downloading or extracting again', async () => {
    const dir = await installed();
    const fetch = vi.fn();
    const runner = { run: vi.fn() };
    vi.stubGlobal('fetch', fetch);
    await ensureMacVideoHelper({ dir, arch: 'arm64', runner });
    expect(fetch).not.toHaveBeenCalled();
    expect(runner.run).not.toHaveBeenCalled();
  });
  it('accepts framework symlinks inside the verified runtime and detects binary changes', async () => {
    const dir = await installed();
    expect(await verifyMacVideoHelper(dir, 'arm64')).toBe(true);
    await writeFile(join(dir, MAC_VIDEO_EXECUTABLE), 'corrupt');
    expect(await verifyMacVideoHelper(dir, 'arm64')).toBe(false);
  });
  it('refuses architecture mismatch, missing files and unexpected files', async () => {
    const dir = await installed();
    expect(await verifyMacVideoHelper(dir, 'x64')).toBe(false);
    await writeFile(join(dir, 'extra'), 'extra');
    expect(await verifyMacVideoHelper(dir, 'arm64')).toBe(false);
    await rm(join(dir, 'extra'));
    await rm(join(dir, 'LICENSE'));
    expect(await verifyMacVideoHelper(dir, 'arm64')).toBe(false);
  });
  it('refuses links escaping the installation even if the manifest names them', async () => {
    const dir = await installed();
    await rm(join(dir, 'Framework/Versions/Current'));
    await symlink(tmpdir(), join(dir, 'Framework/Versions/Current'));
    const path = join(dir, '.botharness-video-runtime.json');
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    manifest.files['Framework/Versions/Current'] = 'link:' + tmpdir();
    await writeFile(path, JSON.stringify(manifest));
    expect(await verifyMacVideoHelper(dir, 'arm64')).toBe(false);
  });
});

it('distinguishes a bounded download failure from checksum verification and preserves cancellation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mac-video-download-'));
  directories.push(dir);
  const events: string[] = [];
  const runner = { run: vi.fn() };
  const options = {
    dir: join(dir, 'runtime'),
    arch: 'arm64',
    runner,
    onEvent: (event: string) => events.push(event),
  };
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private URL')));
  await expect(ensureMacVideoHelper(options)).rejects.toThrow('download failed');
  expect(events.at(-1)).toContain('stage=download code=download-failed');
  expect(events.join(' ')).not.toContain('private URL');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad runtime')));
  await expect(ensureMacVideoHelper(options)).rejects.toThrow('verification failed');
  expect(events.at(-1)).toContain('stage=verify code=verify-failed');
  expect(runner.run).not.toHaveBeenCalled();
  const controller = new AbortController();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => {
      controller.abort();
      throw controller.signal.reason;
    }),
  );
  await expect(
    ensureMacVideoHelper({ ...options, signal: controller.signal }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(events.at(-1)).toContain('code=cancelled');
});
