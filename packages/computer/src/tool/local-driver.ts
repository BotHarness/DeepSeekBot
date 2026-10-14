import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { ComputerProgress, ComputerRuntimeRunner } from '../provider.js';
import { createMcpCuaDriver, type CuaDriver } from './driver.js';
import { ensureLocalDisplay, type LocalDisplay } from './local-display.js';

export const LOCAL_DRIVER_VERSION = '0.31.0';

export interface LocalDriverBuild {
  readonly id: string;
  readonly asset: string;
  readonly sha256: string;
  readonly executable: string;
  readonly files: Readonly<Record<string, string>>;
  readonly dirName: string;
}

const asset = (label: string, ext: 'tar.gz' | 'zip'): string =>
  `cua-driver-rs-${LOCAL_DRIVER_VERSION}-${label}-binary.${ext}`;

export const LOCAL_DRIVER_BUILDS = {
  'darwin-universal': {
    id: 'darwin-universal',
    asset: asset('darwin-universal', 'tar.gz'),
    sha256: '06cd80b153bdf046dc067fb593e0fc648e780afa37a902ca0515ac25f32f9a4f',
    executable: 'cua-driver',
    files: {
      'libcua_driver_sdk.dylib': 'eba4a77ec52f506e7e9bca6dc5032267a77b5f09f2b0ef4eb0f6bb93e253613f',
      'cua_driver_node_runtime.node':
        'e003290019a04ad4e17c7b74610c18ea11fdacdceeafd9f1267adba1ea79afd0',
      'cua-driver': '7f9dfba2441502680b893dae07f5c7753ac3989dda6d2f18e9b2061884976f91',
    },
    dirName: 'darwin',
  },
  'linux-x86_64': {
    id: 'linux-x86_64',
    asset: asset('linux-x86_64', 'tar.gz'),
    sha256: '59d7d027ad0f24410e88e0cf239a04f8e724de400b5c418fab259f3b5c285ff1',
    executable: 'cua-driver',
    files: { 'cua-driver': 'b59170779e14c08ef9e69c545bd4c6d7a31781fad421c668374d83cdd6721b98' },
    dirName: 'linux-x86_64',
  },
  'linux-arm64': {
    id: 'linux-arm64',
    asset: asset('linux-arm64', 'tar.gz'),
    sha256: 'a960ffe07869846dde1e2a193c7c3236d530f31631b035c637b7dd701dd6dc6f',
    executable: 'cua-driver',
    files: { 'cua-driver': '8598ae792682d88e74c71d5243494e2063b59c42e199f9958dd8350302844c94' },
    dirName: 'linux-arm64',
  },
  'windows-x86_64': {
    id: 'windows-x86_64',
    asset: asset('windows-x86_64', 'zip'),
    sha256: '461c7d4acd12685ab777fa4a3800e25f75d2f06e8a67ab7a1778701eb25e6728',
    executable: 'cua-driver.exe',
    files: {
      'cua-driver.exe': '88c1e2a65e53e3a01d683c87ea45a25c8aaff7b15b369bec33624d30f51ce50d',
      'cua-driver-uia.exe': '87c9ab54f943a3dede6306174ab2bcf373226c167d9f9d92fa13fe85ef2e160a',
    },
    dirName: 'windows-x86_64',
  },
  'windows-arm64': {
    id: 'windows-arm64',
    asset: asset('windows-arm64', 'zip'),
    sha256: 'a65898dfaee3fe7f78671ed2db0b7dc06a3c297ab856a8b70bf7a8c69bf59b95',
    executable: 'cua-driver.exe',
    files: {
      'cua-driver.exe': 'e9f6be4da148465d388eb360ad6fbff1ae2c81ae5e22f941f61b8b8dc6988e6f',
      'cua-driver-uia.exe': '848d5238fffe35c19bdc9e05a0d990f3c4f2db928722bd37dd9c7938a2d3ea79',
    },
    dirName: 'windows-arm64',
  },
} as const satisfies Record<string, LocalDriverBuild>;

export function localDriverBuild(
  platform: string = process.platform,
  arch: string = process.arch,
): LocalDriverBuild | undefined {
  if (platform === 'darwin') return LOCAL_DRIVER_BUILDS['darwin-universal'];
  const cpu = arch === 'x64' ? 'x86_64' : arch === 'arm64' ? 'arm64' : undefined;
  if (cpu === undefined) return undefined;
  if (platform === 'linux') return LOCAL_DRIVER_BUILDS[`linux-${cpu}`];
  if (platform === 'win32') return LOCAL_DRIVER_BUILDS[`windows-${cpu}`];
  return undefined;
}

export function unsupportedLocalHost(platform: string, arch: string): string {
  return `Local Computer has no driver for this Host (${platform}-${arch}). Select Container Computer.`;
}

export function localDriverDirectory(
  build: LocalDriverBuild | undefined = localDriverBuild(),
  home = homedir(),
): string {
  return join(home, '.botharness', 'cua-driver', LOCAL_DRIVER_VERSION, build?.dirName ?? 'darwin');
}

export function localDriverExecutable(
  dir: string,
  build: LocalDriverBuild | undefined = localDriverBuild(),
): string {
  return join(dir, build?.executable ?? 'cua-driver');
}

export const LOCAL_DRIVER_QUIET_ENV = {
  CUA_DRIVER_RS_TELEMETRY_ENABLED: 'false',
  CUA_DRIVER_RS_UPDATE_CHECK: 'false',
} as const;

const PASSED_ENV = [
  'DISPLAY',
  'WAYLAND_DISPLAY',
  'XAUTHORITY',
  'XDG_RUNTIME_DIR',
  'XDG_SESSION_TYPE',
  'DBUS_SESSION_BUS_ADDRESS',
  'SystemRoot',
  'windir',
  'SystemDrive',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'ProgramData',
  'TEMP',
  'TMP',
  'ComSpec',
  'PATHEXT',
] as const;

export function localDriverEnv(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {
    PATH: source['PATH'] ?? '/usr/bin:/bin',
    HOME: homedir(),
    ...LOCAL_DRIVER_QUIET_ENV,
    CUA_DRIVER_EMBEDDED: '1',
  };
  for (const name of PASSED_ENV) {
    const value = source[name];
    if (value !== undefined && value !== '') env[name] = value;
  }
  return env;
}

export function checksum(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function verifyLocalDriver(
  dir: string,
  build: LocalDriverBuild | undefined = localDriverBuild(),
): Promise<boolean> {
  if (build === undefined) return false;
  try {
    for (const [file, digest] of Object.entries(build.files)) {
      if (checksum(await readFile(join(dir, file))) !== digest) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function readWithProgress(
  response: Response,
  onProgress?: (progress: ComputerProgress) => void,
): Promise<Uint8Array> {
  const totalBytes = Number(response.headers.get('content-length') ?? 0);
  if (response.body === null || onProgress === undefined)
    return new Uint8Array(await response.arrayBuffer());
  const chunks: Uint8Array[] = [];
  let downloadedBytes = 0;
  let reported = -1;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
    downloadedBytes += chunk.byteLength;
    const percent = totalBytes > 0 ? Math.floor((downloadedBytes / totalBytes) * 100) : 0;
    if (percent !== reported) {
      reported = percent;
      onProgress({ percent, downloadedBytes, totalBytes, text: 'download' });
    }
  }
  const bytes = new Uint8Array(downloadedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function installLocalDriver(options: {
  dir: string;
  runner: ComputerRuntimeRunner;
  build?: LocalDriverBuild | undefined;
  signal?: AbortSignal | undefined;
  download?: (() => Promise<Uint8Array>) | undefined;
  onProgress?: ((progress: ComputerProgress) => void) | undefined;
}): Promise<void> {
  const build = options.build ?? localDriverBuild();
  if (build === undefined) throw new Error(unsupportedLocalHost(process.platform, process.arch));
  const bytes = await (options.download?.() ??
    (async () => {
      const response = await fetch(
        `https://github.com/trycua/cua/releases/download/cua-driver-rs-v${LOCAL_DRIVER_VERSION}/${build.asset}`,
        {
          signal: AbortSignal.any([
            AbortSignal.timeout(120_000),
            ...(options.signal === undefined ? [] : [options.signal]),
          ]),
        },
      );
      if (!response.ok)
        throw new Error(`Local Computer driver download failed: HTTP ${String(response.status)}`);
      return readWithProgress(response, options.onProgress);
    })());
  if (options.signal?.aborted) throw new Error('Local Computer setup cancelled');
  if (checksum(bytes) !== build.sha256) throw new Error('Local Computer driver checksum mismatch');
  await mkdir(options.dir, { recursive: true, mode: 0o700 });
  const staging = await mkdtemp(join(options.dir, '.install-'));
  try {
    const zip = build.asset.endsWith('.zip');
    const archive = join(staging, zip ? 'driver.zip' : 'driver.tar.gz');
    await writeFile(archive, bytes, { mode: 0o600 });
    const result = await options.runner.run([
      'tar',
      zip ? '-xf' : '-xzf',
      archive,
      '-C',
      staging,
      ...Object.keys(build.files),
    ]);
    if (result.code !== 0 || !(await verifyLocalDriver(staging, build)))
      throw new Error('Local Computer driver extraction did not verify');
    if (options.signal?.aborted) throw new Error('Local Computer setup cancelled');
    await chmod(join(staging, build.executable), 0o755);
    for (const file of Object.keys(build.files))
      await rename(join(staging, file), join(options.dir, file));
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export function createLocalCuaDriver(options: {
  runner: ComputerRuntimeRunner;
  dir?: string | undefined;
  onEvent?: ((detail: string) => void) | undefined;
  platform?: string | undefined;
  arch?: string | undefined;
  build?: LocalDriverBuild | undefined;
  display?: ((signal?: AbortSignal) => Promise<LocalDisplay>) | undefined;
}): CuaDriver {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const build = options.build ?? localDriverBuild(platform, arch);
  const dir = options.dir ?? localDriverDirectory(build);
  const env = localDriverEnv();
  const openDisplay =
    options.display ??
    ((signal?: AbortSignal) => ensureLocalDisplay({ onEvent: options.onEvent, signal }));
  let display: LocalDisplay | undefined;
  let ensuring: ReturnType<CuaDriver['ensure']> | undefined;
  const driver = createMcpCuaDriver({
    onEvent: options.onEvent,
    retryReadOnly: false,
    async beforeOpen() {
      if (!(await verifyLocalDriver(dir, build)))
        throw new Error(
          'Local Computer driver checksum mismatch; check permissions again to repair',
        );
    },
    transport: {
      command: localDriverExecutable(dir, build),
      args: ['mcp', '--direct', '--embedded'],
      env,
    },
    ensure: async (signal, onProgress) => {
      if (build === undefined) throw new Error(unsupportedLocalHost(platform, arch));
      ensuring ??= (async () => {
        let status: 'present' | 'installed' = 'present';
        if (!(await verifyLocalDriver(dir, build))) {
          options.onEvent?.(
            `phase=install version=${LOCAL_DRIVER_VERSION} target=local build=${build.id}`,
          );
          await installLocalDriver({ dir, runner: options.runner, build, signal, onProgress });
          status = 'installed';
        }
        if (platform === 'linux' && display?.alive() !== true) {
          await display?.stop();
          display = await openDisplay(signal);
          Object.assign(env, display.env, { DISPLAY: display.display });
        }
        return { status, arch: build.id };
      })();
      try {
        return await ensuring;
      } finally {
        ensuring = undefined;
      }
    },
  });
  return {
    ...driver,
    async close() {
      await driver.close();
      const owned = display;
      display = undefined;
      await owned?.stop();
    },
  };
}
