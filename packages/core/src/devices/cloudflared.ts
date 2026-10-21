import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  accessSync,
  chmodSync,
  constants,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import pins from './cloudflared.json' with { type: 'json' };

export interface CloudflaredAsset {
  name: string;
  sha256: string;
  binarySha256?: string;
}

export const CLOUDFLARED_VERSION: string = pins.version;
export const CLOUDFLARED_ASSETS: Readonly<Record<string, CloudflaredAsset>> = pins.assets;

export const CLOUDFLARED_SOURCES: readonly ((asset: string) => string)[] = [
  (asset) =>
    `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/${asset}`,
];

export type CloudflaredSource = 'env' | 'package' | 'cache' | 'download' | 'path';

export type CloudflaredFailure = 'cloudflared-download-failed' | 'cloudflared-hash-mismatch';

export interface ResolvedCloudflared {
  binary: string;
  source: CloudflaredSource;
  failure?: CloudflaredFailure;
}

export type CloudflaredResolver = () => Promise<ResolvedCloudflared>;

export interface CloudflaredResolverOptions {
  cacheDir?: string;
  anchors?: readonly string[];
  platform?: NodeJS.Platform;
  arch?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  sources?: readonly ((asset: string) => string)[];
  assets?: Readonly<Record<string, CloudflaredAsset>>;
  locatePackage?: (name: string) => string | undefined;
  unpack?: (archive: string, destination: string) => Promise<void>;
  log?: (phase: string, detail?: string) => void;
  stallTimeoutMs?: number;
}

const STALL_TIMEOUT_MS = 30_000;
const DETAIL_CHARS = 300;

export function cloudflaredPlatform(platform: NodeJS.Platform, arch: string): string {
  return `${platform}-${arch}`;
}

export function cloudflaredPackageName(platform: NodeJS.Platform, arch: string): string {
  return `@botharness/cloudflared-${cloudflaredPlatform(platform, arch)}`;
}

export function cloudflaredExecutable(platform: NodeJS.Platform): string {
  return platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
}

export function cloudflaredCacheRoot(dshHome: string): string {
  return join(dshHome, 'botharness', 'cloudflared');
}

function systemTar(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string {
  if (platform !== 'win32') return 'tar';
  return join(env['SystemRoot'] ?? env['SYSTEMROOT'] ?? 'C:\\Windows', 'System32', 'tar.exe');
}

function unpackWithTar(platform: NodeJS.Platform, env: NodeJS.ProcessEnv) {
  return (archive: string, destination: string): Promise<void> =>
    new Promise((resolve, reject) => {
      execFile(
        systemTar(platform, env),
        ['-xzf', archive, '-C', destination],
        { windowsHide: true, maxBuffer: 1024 * 1024 },
        (error, _stdout, stderr) =>
          error === null ? resolve() : reject(new Error(String(stderr).trim() || error.message)),
      );
    });
}

function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('error', reject)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')));
  });
}

function detail(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, DETAIL_CHARS);
}

function locateFrom(anchors: readonly string[]) {
  return (name: string): string | undefined => {
    for (const anchor of anchors) {
      const local = createRequire(anchor);
      try {
        const product = local.resolve('deepseekbot/package.json');
        return dirname(createRequire(product).resolve(`${name}/package.json`));
      } catch {}
      try {
        return dirname(local.resolve(`${name}/package.json`));
      } catch {}
    }
    return undefined;
  };
}

class DownloadError extends Error {
  constructor(
    readonly failure: CloudflaredFailure,
    message: string,
  ) {
    super(message);
  }
}

export function createCloudflaredResolver(
  options: CloudflaredResolverOptions = {},
): CloudflaredResolver {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sources = options.sources ?? CLOUDFLARED_SOURCES;
  const unpack = options.unpack ?? unpackWithTar(platform, env);
  const log = options.log ?? (() => undefined);
  const stallTimeoutMs = options.stallTimeoutMs ?? STALL_TIMEOUT_MS;
  const locatePackage =
    options.locatePackage ?? locateFrom([...(options.anchors ?? []), import.meta.url]);
  const asset = (options.assets ?? CLOUDFLARED_ASSETS)[cloudflaredPlatform(platform, arch)];
  const executable = cloudflaredExecutable(platform);
  const binarySha256 = asset?.binarySha256 ?? asset?.sha256;
  const installDir =
    options.cacheDir === undefined ? undefined : join(options.cacheDir, CLOUDFLARED_VERSION);
  const cached = installDir === undefined ? undefined : join(installDir, executable);
  let pending: Promise<void> | undefined;

  const verified = async (path: string): Promise<boolean> =>
    existsSync(path) && (await sha256File(path)) === binarySha256;

  const fromPackage = async (): Promise<string | undefined> => {
    const name = cloudflaredPackageName(platform, arch);
    const directory = locatePackage(name);
    if (directory === undefined) return undefined;
    const binary = join(directory, 'bin', executable);
    try {
      if (await verified(binary)) {
        if (platform !== 'win32') {
          try {
            accessSync(binary, constants.X_OK);
          } catch {
            chmodSync(binary, 0o755);
          }
        }
        return binary;
      }
    } catch {}
    log('cloudflared-package-refused', `package=${name}`);
    return undefined;
  };

  const fetchAsset = async (pinned: CloudflaredAsset, target: string): Promise<void> => {
    const failures: string[] = [];
    let mismatched = false;
    for (const source of sources) {
      const url = source(pinned.name);
      const host = new URL(url).host;
      const controller = new AbortController();
      let timer: NodeJS.Timeout | undefined;
      const stalled = (): void => {
        clearTimeout(timer);
        timer = setTimeout(
          () => controller.abort(new Error(`no data for ${stallTimeoutMs / 1000}s`)),
          stallTimeoutMs,
        );
      };
      try {
        stalled();
        const response = await fetchImpl(url, { signal: controller.signal });
        if (!response.ok || response.body === null) throw new Error(`HTTP ${response.status}`);
        await pipeline(
          Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
          new Transform({
            transform(chunk: Buffer, _encoding, done) {
              stalled();
              done(null, chunk);
            },
          }),
          createWriteStream(target),
          { signal: controller.signal },
        );
        clearTimeout(timer);
        const actual = await sha256File(target);
        if (actual !== pinned.sha256) {
          mismatched = true;
          throw new Error(`sha256 ${actual} does not match the pin`);
        }
        return;
      } catch (error) {
        const reason = controller.signal.aborted ? controller.signal.reason : error;
        failures.push(`${host}: ${detail(reason)}`);
        log('cloudflared-download-failed', `source=${host} error=${detail(reason)}`);
        rmSync(target, { force: true });
      } finally {
        clearTimeout(timer);
      }
    }
    throw new DownloadError(
      mismatched ? 'cloudflared-hash-mismatch' : 'cloudflared-download-failed',
      failures.join('; '),
    );
  };

  const install = async (pinned: CloudflaredAsset, root: string, target: string): Promise<void> => {
    const stamp = `${process.pid}-${Date.now()}`;
    const download = join(root, `.${pinned.name}.${stamp}`);
    const staging = join(root, `.${CLOUDFLARED_VERSION}.${stamp}`);
    try {
      mkdirSync(root, { recursive: true });
      log('cloudflared-download', `version=${CLOUDFLARED_VERSION} asset=${pinned.name}`);
      await fetchAsset(pinned, download);
      let binary = download;
      if (pinned.name.endsWith('.tgz')) {
        mkdirSync(staging, { recursive: true });
        try {
          await unpack(download, staging);
        } catch (error) {
          throw new DownloadError('cloudflared-download-failed', `unpack: ${detail(error)}`);
        }
        binary = join(staging, executable);
        if (!(await verified(binary)))
          throw new DownloadError('cloudflared-hash-mismatch', 'extracted binary differs');
      }
      if (platform !== 'win32') chmodSync(binary, 0o755);
      mkdirSync(dirname(target), { recursive: true });
      renameSync(binary, target);
      for (const entry of readdirSync(root))
        if (entry !== CLOUDFLARED_VERSION)
          rmSync(join(root, entry), { recursive: true, force: true });
      log('cloudflared-installed', `version=${CLOUDFLARED_VERSION}`);
    } catch (error) {
      if (error instanceof DownloadError) throw error;
      throw new DownloadError('cloudflared-download-failed', detail(error));
    } finally {
      rmSync(download, { force: true });
      rmSync(staging, { recursive: true, force: true });
    }
  };

  const fromCache = async (): Promise<ResolvedCloudflared | undefined> => {
    if (asset === undefined || options.cacheDir === undefined || cached === undefined)
      return undefined;
    try {
      if (await verified(cached)) return { binary: cached, source: 'cache' };
    } catch {}
    if (existsSync(cached)) {
      log('cloudflared-cache-refused', `version=${CLOUDFLARED_VERSION}`);
      rmSync(cached, { force: true });
    }
    pending ??= install(asset, options.cacheDir, cached).finally(() => {
      pending = undefined;
    });
    try {
      await pending;
      return { binary: cached, source: 'download' };
    } catch (error) {
      const failure =
        error instanceof DownloadError ? error.failure : 'cloudflared-download-failed';
      log(failure, `error=${detail(error)}`);
      return { binary: 'cloudflared', source: 'path', failure };
    }
  };

  return async () => {
    const override = env['DEEPSEEKBOT_CLOUDFLARED'];
    if (override !== undefined && override !== '') return { binary: override, source: 'env' };
    if (asset !== undefined) {
      const packaged = await fromPackage();
      if (packaged !== undefined) return { binary: packaged, source: 'package' };
    }
    return (await fromCache()) ?? { binary: 'cloudflared', source: 'path' };
  };
}
