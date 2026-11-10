import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReadStream } from 'node:fs';
import {
  LOCAL_VIDEO_ARCHIVE_SHA256,
  LOCAL_VIDEO_LAUNCHER,
  verifyLocalVideoHelper,
} from '../src/media/install.js';

const streams = vi.hoisted(() => ({
  opened: (_path: string, _stream: ReadStream) => undefined as void,
}));
vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>();
  return {
    ...fs,
    createReadStream: (...args: Parameters<typeof fs.createReadStream>) => {
      const stream = fs.createReadStream(...args);
      streams.opened(String(args[0]), stream);
      return stream;
    },
  };
});

const directories: string[] = [];
afterEach(async () => {
  streams.opened = () => undefined;
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
async function installed() {
  const directory = await mkdtemp(join(tmpdir(), 'video-install-test-'));
  directories.push(directory);
  const files: Record<string, string> = {};
  for (const name of ['electron.exe', LOCAL_VIDEO_LAUNCHER, 'LICENSE', 'LICENSES.chromium.html']) {
    const content = Buffer.from(`fixture ${name}`);
    await writeFile(join(directory, name), content);
    files[name] = createHash('sha256').update(content).digest('hex');
  }
  const launcherSourceSha256 = createHash('sha256')
    .update(await readFile(new URL('../native/local-video/launcher.cs', import.meta.url)))
    .digest('hex');
  await writeFile(
    join(directory, '.botharness-video-runtime.json'),
    JSON.stringify({ archiveSha256: LOCAL_VIDEO_ARCHIVE_SHA256, launcherSourceSha256, files }),
  );
  return directory;
}

describe('Local Computer video runtime verification', () => {
  it('closes the active hash stream on cancellation and can verify again immediately', async () => {
    const directory = await installed();
    const abort = new AbortController();
    let active: ReadStream | undefined;
    let closed = Promise.resolve();
    streams.opened = (path, stream) => {
      if (!path.endsWith('electron.exe')) return;
      active = stream;
      closed = new Promise<void>((resolve) => stream.once('close', resolve));
      stream.once('data', () => abort.abort());
    };
    await expect(verifyLocalVideoHelper(directory, undefined, abort.signal)).rejects.toThrow();
    await closed;
    expect(active?.destroyed).toBe(true);
    streams.opened = () => undefined;
    expect(await verifyLocalVideoHelper(directory)).toBe(true);
  });

  it('accepts a complete verified installation and detects executable corruption', async () => {
    const directory = await installed();
    expect(await verifyLocalVideoHelper(directory)).toBe(true);
    await writeFile(join(directory, 'electron.exe'), 'changed');
    expect(await verifyLocalVideoHelper(directory)).toBe(false);
  });

  it('refuses missing licenses and unexpected files before native loading', async () => {
    const directory = await installed();
    await writeFile(join(directory, 'unexpected.dll'), 'extra');
    expect(await verifyLocalVideoHelper(directory)).toBe(false);
    await rm(join(directory, 'unexpected.dll'));
    await rm(join(directory, 'LICENSES.chromium.html'));
    expect(await verifyLocalVideoHelper(directory)).toBe(false);
  });

  it('refuses a manifest for a different archive or escaping its install directory', async () => {
    const directory = await installed();
    const path = join(directory, '.botharness-video-runtime.json');
    const original = JSON.parse(await readFile(path, 'utf8')) as {
      archiveSha256: string;
      files: Record<string, string>;
    };
    await writeFile(path, JSON.stringify({ ...original, archiveSha256: '0'.repeat(64) }));
    expect(await verifyLocalVideoHelper(directory)).toBe(false);
    await writeFile(
      path,
      JSON.stringify({ ...original, files: { ...original.files, '../other.exe': '0'.repeat(64) } }),
    );
    expect(await verifyLocalVideoHelper(directory)).toBe(false);
  });
  it('refuses a compiled launcher receipt from a different trusted source revision', async () => {
    const directory = await installed();
    const path = join(directory, '.botharness-video-runtime.json');
    const original = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    await writeFile(path, JSON.stringify({ ...original, launcherSourceSha256: '0'.repeat(64) }));
    expect(await verifyLocalVideoHelper(directory)).toBe(false);
  });
});
