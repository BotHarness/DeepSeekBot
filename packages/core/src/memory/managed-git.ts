import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { delimiter, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import pins from './managed-git.json' with { type: 'json' };
import { probeGit, resetGitCapabilities, type GitAvailability } from './git-probe.js';

export interface ManagedGitAsset {
  name: string;
  sha256: string;
}

export const MANAGED_GIT_RELEASE: string = pins.release;
export const MANAGED_GIT_ASSETS: Readonly<Record<string, ManagedGitAsset>> = pins.assets;

export const MANAGED_GIT_SOURCES: readonly ((asset: string) => string)[] = [
  (asset) => `https://media.botharness.ai/git/dugite-native/${MANAGED_GIT_RELEASE}/${asset}`,
  (asset) =>
    `https://github.com/desktop/dugite-native/releases/download/${MANAGED_GIT_RELEASE}/${asset}`,
];

export type GitSource = 'system' | 'managed';

export type GitInstallFailure = 'unsupported' | 'network' | 'checksum' | 'unpack' | 'unrunnable';

export type GitInstallState =
  | { phase: 'idle' }
  | { phase: 'downloading'; received: number; total?: number }
  | { phase: 'verifying' }
  | { phase: 'unpacking' }
  | { phase: 'failed'; reason: GitInstallFailure; detail?: string };

export type GitStatus = (
  | { available: true; version: string; source: GitSource }
  | Extract<GitAvailability, { available: false }>
) & { installable: boolean; install: GitInstallState };

export interface GitService {
  resolve(): GitStatus;
  status(): GitStatus;
  install(): GitStatus;
  settled(): Promise<void>;
}

export interface GitServiceOptions {
  dshHome: string;
  platform?: NodeJS.Platform;
  arch?: string;
  env?: NodeJS.ProcessEnv;
  probe?: () => GitAvailability;
  fetchImpl?: typeof fetch;
  sources?: readonly ((asset: string) => string)[];
  assets?: Readonly<Record<string, ManagedGitAsset>>;
  unpack?: (archive: string, destination: string) => Promise<void>;
  log?: (message: string) => void;
  stallTimeoutMs?: number;
}

const STALL_TIMEOUT_MS = 30_000;
const DETAIL_CHARS = 300;

export function managedGitRoot(dshHome: string): string {
  return join(dshHome, 'botharness', 'git');
}

export function managedGitBinDir(installDir: string, platform: NodeJS.Platform): string {
  return platform === 'win32' ? join(installDir, 'dist', 'cmd') : join(installDir, 'shim');
}

export function managedGitShim(distDir: string, platform: NodeJS.Platform): string {
  const quoted = `'${distDir.replaceAll("'", `'\\''`)}'`;
  const linux =
    platform === 'linux'
      ? [
          'export PREFIX="$D"',
          '[ -n "$GIT_SSL_CAINFO" ] || export GIT_SSL_CAINFO="$D/ssl/cacert.pem"',
        ]
      : [];
  return [
    '#!/bin/sh',
    `D=${quoted}`,
    'export GIT_EXEC_PATH="$D/libexec/git-core"',
    'export GIT_TEMPLATE_DIR="$D/share/git-core/templates"',
    '[ -n "$GIT_CONFIG_SYSTEM" ] || export GIT_CONFIG_SYSTEM="$D/etc/gitconfig"',
    ...linux,
    'exec "$D/bin/git" "$@"',
    '',
  ].join('\n');
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

class InstallError extends Error {
  constructor(
    readonly reason: GitInstallFailure,
    message: string,
  ) {
    super(message);
  }
}

export function createGitService(options: GitServiceOptions): GitService {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const env = options.env ?? process.env;
  const probe = options.probe ?? (() => probeGit());
  const fetchImpl = options.fetchImpl ?? fetch;
  const sources = options.sources ?? MANAGED_GIT_SOURCES;
  const unpack = options.unpack ?? unpackWithTar(platform, env);
  const log = options.log ?? (() => undefined);
  const stallTimeoutMs = options.stallTimeoutMs ?? STALL_TIMEOUT_MS;
  const asset = (options.assets ?? MANAGED_GIT_ASSETS)[`${platform}-${arch}`];
  const root = managedGitRoot(options.dshHome);
  const installDir = join(root, MANAGED_GIT_RELEASE);
  const binDir = managedGitBinDir(installDir, platform);
  let state: GitInstallState = { phase: 'idle' };
  let active = false;
  let running: Promise<void> = Promise.resolve();
  let last: GitStatus | undefined;

  const installed = (): boolean => existsSync(join(installDir, 'installed.json'));

  const activate = (): string | undefined => {
    const previous = env['PATH'];
    const path = previous ?? '';
    if (!path.split(delimiter).includes(binDir)) env['PATH'] = binDir + delimiter + path;
    resetGitCapabilities();
    return previous;
  };

  const snapshot = (git: GitAvailability): GitStatus => {
    last = git.available
      ? {
          available: true,
          version: git.version,
          source: active ? 'managed' : 'system',
          installable: asset !== undefined,
          install: state,
        }
      : { ...git, installable: asset !== undefined, install: state };
    return last;
  };

  const resolve = (): GitStatus => {
    const system = probe();
    if (system.available || active || !installed()) return snapshot(system);
    const previous = activate();
    const managed = probe();
    if (managed.available) {
      active = true;
      return snapshot(managed);
    }
    if (previous === undefined) delete env['PATH'];
    else env['PATH'] = previous;
    resetGitCapabilities();
    return snapshot(system);
  };

  const download = async (target: string, received: (bytes: number) => void): Promise<void> => {
    if (asset === undefined) throw new InstallError('unsupported', `${platform}-${arch}`);
    const failures: string[] = [];
    let mismatched = false;
    for (const source of sources) {
      const url = source(asset.name);
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
        const total = Number(response.headers.get('content-length')) || undefined;
        let bytes = 0;
        state = { phase: 'downloading', received: 0, ...(total === undefined ? {} : { total }) };
        await pipeline(
          Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
          new Transform({
            transform(chunk: Buffer, _encoding, done) {
              stalled();
              bytes += chunk.length;
              received(bytes);
              done(null, chunk);
            },
          }),
          createWriteStream(target),
          { signal: controller.signal },
        );
        clearTimeout(timer);
        state = { phase: 'verifying' };
        const actual = await sha256File(target);
        if (actual !== asset.sha256) {
          mismatched = true;
          throw new Error(`checksum ${actual} does not match ${asset.sha256}`);
        }
        log(`git phase=downloaded source=${host} bytes=${bytes}`);
        return;
      } catch (error) {
        const reason = controller.signal.aborted ? controller.signal.reason : error;
        failures.push(`${host}: ${detail(reason)}`);
        log(`git phase=download-failed source=${host} error=${detail(reason)}`);
      } finally {
        clearTimeout(timer);
      }
    }
    if (mismatched) throw new InstallError('checksum', failures.join('; '));
    throw new InstallError('network', failures.join('; '));
  };

  const run = async (): Promise<void> => {
    const stamp = `${process.pid}-${Date.now()}`;
    const archive = join(root, `${MANAGED_GIT_RELEASE}.${stamp}.tar.gz`);
    const staging = join(root, `${MANAGED_GIT_RELEASE}.${stamp}`);
    try {
      mkdirSync(root, { recursive: true });
      state = { phase: 'downloading', received: 0 };
      await download(archive, (received) => {
        if (state.phase === 'downloading') state = { ...state, received };
      });
      state = { phase: 'unpacking' };
      mkdirSync(join(staging, 'dist'), { recursive: true });
      try {
        await unpack(archive, join(staging, 'dist'));
      } catch (error) {
        throw new InstallError('unpack', detail(error));
      }
      if (platform !== 'win32') {
        mkdirSync(join(staging, 'shim'));
        const shim = join(staging, 'shim', 'git');
        writeFileSync(shim, managedGitShim(join(installDir, 'dist'), platform));
        chmodSync(shim, 0o755);
      }
      writeFileSync(
        join(staging, 'installed.json'),
        `${JSON.stringify({ release: MANAGED_GIT_RELEASE, asset: asset?.name })}\n`,
      );
      const previous = `${staging}.previous`;
      if (existsSync(installDir)) renameSync(installDir, previous);
      try {
        renameSync(staging, installDir);
      } catch (error) {
        if (existsSync(previous)) renameSync(previous, installDir);
        throw new InstallError('unpack', detail(error));
      }
      for (const entry of readdirSync(root)) {
        if (entry !== MANAGED_GIT_RELEASE)
          rmSync(join(root, entry), { recursive: true, force: true });
      }
      state = { phase: 'idle' };
      const status = resolve();
      if (!status.available) {
        throw new InstallError('unrunnable', `managed Git ${status.reason}`);
      }
      log(`git phase=installed release=${MANAGED_GIT_RELEASE} version=${status.version}`);
    } catch (error) {
      const reason = error instanceof InstallError ? error.reason : 'unpack';
      state = { phase: 'failed', reason, detail: detail(error) };
      log(`git phase=install-failed reason=${reason} error=${detail(error)}`);
    } finally {
      rmSync(archive, { force: true });
      rmSync(staging, { recursive: true, force: true });
      rmSync(`${staging}.previous`, { recursive: true, force: true });
    }
  };

  return {
    resolve,
    status: () => {
      if (
        state.phase === 'downloading' ||
        state.phase === 'verifying' ||
        state.phase === 'unpacking'
      ) {
        return { ...(last ?? resolve()), install: state };
      }
      return resolve();
    },
    install: () => {
      const current = resolve();
      if (current.available) return current;
      if (current.install.phase !== 'idle' && current.install.phase !== 'failed') return current;
      if (asset === undefined) {
        state = { phase: 'failed', reason: 'unsupported', detail: `${platform}-${arch}` };
        return snapshot(probe());
      }
      log(`git phase=install-started release=${MANAGED_GIT_RELEASE} asset=${asset.name}`);
      state = { phase: 'downloading', received: 0 };
      running = run();
      return { ...current, install: state };
    },
    settled: () => running,
  };
}
