import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import type { ComputerProgress, ComputerRuntimeRunner } from '../provider.js';
import { LocalVideoError } from '../local-video-contract.js';

const VERSION = '44.9.3';
const BUILDS = {
  arm64: {
    sha256: '4af51382278d00291dfcda265eddd9bab6e98cebb09f46aadc8438bf606de162',
    bytes: 130639665,
  },
  x64: {
    sha256: '451363b59bb7d2c1c9e0c4baa99106004eaabe724aa21a0c6b4c87469293531a',
    bytes: 134522186,
  },
} as const;
const MANIFEST = '.botharness-video-runtime.json';
export const MAC_VIDEO_EXECUTABLE = 'Electron.app/Contents/MacOS/Electron';
export function macVideoBuild(arch: string = process.arch) {
  if (arch !== 'arm64' && arch !== 'x64')
    throw new LocalVideoError(
      'unsupported-platform',
      'Local Computer video requires an Apple silicon or Intel Mac.',
    );
  return {
    ...BUILDS[arch],
    url: `https://github.com/electron/electron/releases/download/v${VERSION}/electron-v${VERSION}-darwin-${arch}.zip`,
  };
}
export function macVideoHelperDirectory(arch: string = process.arch): string {
  macVideoBuild(arch);
  return join(homedir(), '.botharness', 'local-video', `electron-${VERSION}-darwin-${arch}`);
}
async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest('hex');
}
async function inventory(
  root: string,
  prefix = '',
  budget = { count: 0 },
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    if (++budget.count > 8192) throw new Error('Runtime file limit');
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (name === MANIFEST) continue;
    const path = join(root, name);
    if (entry.isSymbolicLink()) {
      const target = await realpath(path);
      if (!target.startsWith(resolve(root) + sep)) throw new Error('External runtime link');
      result[name] = 'link:' + (await readlink(path));
    } else if (entry.isDirectory()) Object.assign(result, await inventory(root, name, budget));
    else if (entry.isFile()) result[name] = await hashFile(path);
    else throw new Error('Unexpected runtime entry');
  }
  return result;
}
export async function verifyMacVideoHelper(
  directory = macVideoHelperDirectory(),
  arch: string = process.arch,
): Promise<boolean> {
  try {
    if (!(await lstat(directory)).isDirectory() || (await lstat(directory)).isSymbolicLink())
      return false;
    const raw = await readFile(join(directory, MANIFEST), 'utf8');
    if (Buffer.byteLength(raw) > 2 * 1024 * 1024) return false;
    const manifest = JSON.parse(raw) as {
      archiveSha256?: unknown;
      files?: Record<string, unknown>;
    };
    if (
      manifest.archiveSha256 !== macVideoBuild(arch).sha256 ||
      !manifest.files?.[MAC_VIDEO_EXECUTABLE] ||
      !manifest.files['LICENSE'] ||
      !manifest.files['LICENSES.chromium.html']
    )
      return false;
    const actual = await inventory(await realpath(directory));
    return (
      Object.keys(actual).length === Object.keys(manifest.files).length &&
      Object.entries(actual).every(([name, value]) => manifest.files?.[name] === value)
    );
  } catch {
    return false;
  }
}
export async function ensureMacVideoHelper(options: {
  runner: ComputerRuntimeRunner;
  signal?: AbortSignal | undefined;
  onProgress?: ((progress: ComputerProgress) => void) | undefined;
  onEvent?: ((detail: string) => void) | undefined;
  dir?: string | undefined;
  arch?: string | undefined;
}): Promise<void> {
  const arch = options.arch ?? process.arch;
  const build = macVideoBuild(arch);
  const directory = resolve(options.dir ?? macVideoHelperDirectory(arch));
  options.signal?.throwIfAborted();
  if (await verifyMacVideoHelper(directory, arch)) return;
  await mkdir(dirname(directory), { recursive: true, mode: 0o700 });
  const staging = await mkdtemp(join(dirname(directory), '.video-install-'));
  let previous: string | undefined;
  let installed = false;
  const started = Date.now();
  options.onEvent?.(
    `phase=media-install platform=darwin version=${VERSION} archiveBytes=${build.bytes}`,
  );
  try {
    const response = await fetch(build.url, {
      signal: AbortSignal.any([
        AbortSignal.timeout(120_000),
        ...(options.signal ? [options.signal] : []),
      ]),
    });
    if (!response.ok || !response.body) throw new Error('Download failed');
    const archive = join(staging, 'runtime.zip');
    const file = await open(archive, 'wx', 0o600);
    const hash = createHash('sha256');
    let bytes = 0;
    let reported = -1;
    try {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        options.signal?.throwIfAborted();
        bytes += chunk.byteLength;
        if (bytes > build.bytes) throw new Error('Archive exceeds pinned size');
        hash.update(chunk);
        await file.writeFile(chunk);
        const percent = Math.floor((bytes / build.bytes) * 100);
        if (percent !== reported) {
          reported = percent;
          options.onProgress?.({
            percent,
            downloadedBytes: bytes,
            totalBytes: build.bytes,
            text: 'video-runtime',
          });
        }
      }
    } finally {
      await file.close();
    }
    if (bytes !== build.bytes || hash.digest('hex') !== build.sha256)
      throw new Error('Runtime checksum mismatch');
    options.signal?.throwIfAborted();
    const extracted = join(staging, 'runtime');
    await mkdir(extracted, { mode: 0o700 });
    const result = await options.runner.run(['/usr/bin/ditto', '-x', '-k', archive, extracted], {
      signal: options.signal,
      timeoutMs: 60_000,
      maxOutputBytes: 64 * 1024,
    });
    if (result.code !== 0) throw new Error('Runtime extraction failed');
    const files = await inventory(await realpath(extracted));
    await writeFile(
      join(extracted, MANIFEST),
      JSON.stringify({ archiveSha256: build.sha256, files }),
      { mode: 0o600 },
    );
    if (!(await verifyMacVideoHelper(extracted, arch)))
      throw new Error('Runtime verification failed');
    options.signal?.throwIfAborted();
    try {
      await lstat(directory);
      previous = `${directory}.invalid-${randomUUID()}`;
      await rename(directory, previous);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await rename(extracted, directory);
    installed = true;
    options.onEvent?.(`phase=media-installed platform=darwin durationMs=${Date.now() - started}`);
  } catch {
    options.onEvent?.(
      `phase=media-install-refused platform=darwin durationMs=${Date.now() - started}`,
    );
    throw new LocalVideoError(
      'helper-missing',
      'Mac video setup failed. Check the connection and start Local Computer again.',
    );
  } finally {
    await rm(staging, { recursive: true, force: true });
    if (previous) {
      if (installed) await rm(previous, { recursive: true, force: true });
      else await rename(previous, directory);
    }
  }
}
