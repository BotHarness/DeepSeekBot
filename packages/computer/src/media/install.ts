import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';

import { LocalVideoError } from '../local-video-contract.js';
import type { ComputerProgress, ComputerRuntimeRunner } from '../provider.js';

export const LOCAL_VIDEO_ELECTRON_VERSION = '44.9.3';
export const LOCAL_VIDEO_ARCHIVE_SHA256 =
  '41a1ffa0541cb0f2c9b9fe920dd2cef1793ad0ea2ada1a9582958880f4d1b23c';
export const LOCAL_VIDEO_ARCHIVE_URL =
  `https://github.com/electron/electron/releases/download/v${LOCAL_VIDEO_ELECTRON_VERSION}/electron-v${LOCAL_VIDEO_ELECTRON_VERSION}-win32-x64.zip`;
export const LOCAL_VIDEO_ARCHIVE_BYTES = 158_508_870;
const MANIFEST = '.botharness-video-runtime.json';
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
const ASSETS = ['main.cjs', 'preload.cjs', 'renderer.html', 'renderer.js', 'launcher.cs'] as const;
export const LOCAL_VIDEO_LAUNCHER = 'botharness-media-launcher.exe';

export function localVideoHelperDirectory(): string {
  return join(homedir(), '.botharness', 'local-video', `electron-${LOCAL_VIDEO_ELECTRON_VERSION}-win32-x64`);
}

export function localVideoAssetsDirectory(): string {
  return join(dirname(createRequire(import.meta.url).resolve('@botharness/computer/package.json')), 'native', 'local-video');
}

function supported(platform: string, arch: string): void {
  if (platform !== 'win32' || arch !== 'x64') {
    throw new LocalVideoError('unsupported-platform', 'Local Computer video currently requires Windows x64.');
  }
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest('hex');
}

async function filesIn(directory: string, prefix = ''): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error('Runtime links are not supported');
    if (entry.isDirectory()) result.push(...await filesIn(directory, name));
    else if (entry.isFile() && name !== MANIFEST) result.push(name);
    else if (!entry.isFile()) throw new Error('Unexpected runtime entry');
    if (result.length > 2048) throw new Error('Runtime file limit');
  }
  return result;
}

function childPath(directory: string, name: string): string {
  const root = resolve(directory);
  const path = resolve(root, name);
  if (!path.startsWith(root + sep) || name.includes('\\') || name.split('/').includes('..')) {
    throw new Error('Invalid runtime path');
  }
  return path;
}

/** Install manifest is generated only after the pinned upstream archive verifies.
 * Rehash all files to detect partial extraction/corruption before native loading.
 * Like the Host's own package code, the machine-local manifest is not an ACL boundary.
 */
export async function verifyLocalVideoHelper(
  directory = localVideoHelperDirectory(),
  assets = localVideoAssetsDirectory(),
): Promise<boolean> {
  try {
    if ((await lstat(directory)).isSymbolicLink()) return false;
    const manifestText = await readFile(join(directory, MANIFEST), 'utf8');
    if (Buffer.byteLength(manifestText) > 256 * 1024) return false;
    const manifest: unknown = JSON.parse(manifestText);
    if (typeof manifest !== 'object' || manifest === null || !('archiveSha256' in manifest) ||
      manifest.archiveSha256 !== LOCAL_VIDEO_ARCHIVE_SHA256 || !('files' in manifest) ||
      typeof manifest.files !== 'object' || manifest.files === null) return false;
    if (!('launcherSourceSha256' in manifest) ||
      manifest.launcherSourceSha256 !== await hashFile(join(assets, 'launcher.cs'))) return false;
    const entries = Object.entries(manifest.files);
    if (!entries.length || entries.length > 2048 || !entries.some(([name]) => name === 'electron.exe') ||
      !entries.some(([name]) => name === LOCAL_VIDEO_LAUNCHER) ||
      !entries.some(([name]) => name === 'LICENSE') || !entries.some(([name]) => name === 'LICENSES.chromium.html')) return false;
    const actual = await filesIn(directory);
    if (actual.length !== entries.length) return false;
    for (const [name, digest] of entries) {
      if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/u.test(digest) || !actual.includes(name)) return false;
      const path = childPath(directory, name);
      if (!(await lstat(path)).isFile() || await hashFile(path) !== digest) return false;
    }
    return true;
  } catch { return false; }
}

export async function verifyLocalVideoAssets(directory = localVideoAssetsDirectory()): Promise<void> {
  for (const asset of ASSETS) {
    try {
      const stat = await lstat(join(directory, asset));
      if (!stat.isFile() || stat.size > 256 * 1024) throw new Error('Invalid asset');
    } catch {
      throw new LocalVideoError('helper-missing', 'The Local Computer video helper assets are missing. Reinstall the product.');
    }
  }
}

/** Called by Local Computer's existing explicit install/start lifecycle, not by viewing. */
export async function ensureLocalVideoHelper(options: {
  readonly runner: ComputerRuntimeRunner;
  readonly signal?: AbortSignal | undefined;
  readonly onProgress?: ((progress: ComputerProgress) => void) | undefined;
  readonly onEvent?: ((detail: string) => void) | undefined;
  readonly dir?: string | undefined;
  readonly platform?: string | undefined;
  readonly arch?: string | undefined;
}): Promise<void> {
  supported(options.platform ?? process.platform, options.arch ?? process.arch);
  const directory = resolve(options.dir ?? localVideoHelperDirectory());
  const assets = localVideoAssetsDirectory();
  options.signal?.throwIfAborted();
  await verifyLocalVideoAssets(assets);
  if (await verifyLocalVideoHelper(directory, assets)) return;
  const started = Date.now();
  options.onEvent?.(`phase=media-install version=${LOCAL_VIDEO_ELECTRON_VERSION} archiveBytes=${LOCAL_VIDEO_ARCHIVE_BYTES}`);
  await mkdir(dirname(directory), { recursive: true, mode: 0o700 });
  const staging = await mkdtemp(join(dirname(directory), '.video-install-'));
  let invalid: string | undefined;
  try {
    const response = await fetch(LOCAL_VIDEO_ARCHIVE_URL, {
      signal: AbortSignal.any([AbortSignal.timeout(120_000), ...(options.signal ? [options.signal] : [])]),
    });
    if (!response.ok || !response.body) throw new Error('Runtime download failed');
    const archive = join(staging, 'runtime.zip');
    const hash = createHash('sha256');
    const { open } = await import('node:fs/promises');
    const file = await open(archive, 'wx', 0o600);
    let downloadedBytes = 0;
    let reported = -1;
    try {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        options.signal?.throwIfAborted();
        downloadedBytes += chunk.byteLength;
        if (downloadedBytes > MAX_ARCHIVE_BYTES) throw new Error('Runtime download exceeds limit');
        hash.update(chunk);
        await file.writeFile(chunk);
        const percent = Math.min(100, Math.floor(downloadedBytes / LOCAL_VIDEO_ARCHIVE_BYTES * 100));
        if (percent !== reported) {
          reported = percent;
          options.onProgress?.({ percent, downloadedBytes, totalBytes: LOCAL_VIDEO_ARCHIVE_BYTES, text: 'video-runtime' });
        }
      }
    } finally { await file.close(); }
    if (hash.digest('hex') !== LOCAL_VIDEO_ARCHIVE_SHA256) throw new Error('Runtime checksum mismatch');
    options.signal?.throwIfAborted();
    const extracted = join(staging, 'runtime');
    await mkdir(extracted, { mode: 0o700 });
    const result = await options.runner.run(['tar', '-xf', archive, '-C', extracted], {
      signal: options.signal,
      timeoutMs: 60_000,
      maxOutputBytes: 64 * 1024,
    });
    if (result.code !== 0) throw new Error('Runtime extraction failed');
    options.signal?.throwIfAborted();
    const launcherSourceSha256 = await hashFile(join(assets, 'launcher.cs'));
    // Invoke the built-in .NET Framework compiler directly. Add-Type would spawn
    // a compiler behind PowerShell and leave a descendant after a root timeout.
    // No shell source, compiler server, policy change or SDK install is involved.
    const compiler = join(process.env['SystemRoot'] ?? 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
    const compilation = await options.runner.run([
      compiler, '/nologo', '/noconfig', '/target:exe', '/platform:x64', '/optimize+',
      `/out:${join(extracted, LOCAL_VIDEO_LAUNCHER)}`, join(assets, 'launcher.cs'),
    ], {
      signal: options.signal,
      timeoutMs: 60_000,
      maxOutputBytes: 64 * 1024,
    });
    if (compilation.code !== 0) throw new Error('Job launcher compilation failed');
    if (launcherSourceSha256 !== await hashFile(join(assets, 'launcher.cs'))) throw new Error('Launcher source changed during compilation');
    const files: Record<string, string> = {};
    for (const name of await filesIn(extracted)) {
      options.signal?.throwIfAborted();
      files[name] = await hashFile(childPath(extracted, name));
    }
    await writeFile(join(extracted, MANIFEST), JSON.stringify({
      archiveSha256: LOCAL_VIDEO_ARCHIVE_SHA256,
      launcherSourceSha256,
      launcherCompilerSha256: await hashFile(compiler),
      files,
    }), { mode: 0o600 });
    if (!await verifyLocalVideoHelper(extracted, assets)) throw new Error('Runtime verification failed');
    options.signal?.throwIfAborted();
    try {
      await lstat(directory);
      invalid = `${directory}.invalid-${randomUUID()}`;
      await rename(directory, invalid);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await rename(extracted, directory);
    options.onEvent?.(`phase=media-installed durationMs=${Date.now() - started}`);
  } catch {
    options.onEvent?.(`phase=media-install-refused durationMs=${Date.now() - started}`);
    throw new LocalVideoError('helper-missing', 'Local Computer video setup failed. Check the connection and start Local Computer again.');
  } finally {
    // Both paths are owned siblings produced above, never archive-supplied paths.
    await rm(staging, { recursive: true, force: true });
    if (invalid) await rm(invalid, { recursive: true, force: true });
  }
}
