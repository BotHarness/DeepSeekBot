import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  macVideoBuild,
  MAC_VIDEO_EXECUTABLE,
  verifyMacVideoHelper,
} from '../src/media/install-macos.js';

const directories: string[] = [];
afterEach(async () => {
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
