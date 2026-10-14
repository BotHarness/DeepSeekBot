import { execFileSync } from 'node:child_process';
import { existsSync, statfsSync } from 'node:fs';

import { BROWSER_FAILURE_KINDS, type BrowserFailureKind } from '../failure-kinds.js';

export {
  BROWSER_FAILURE_KINDS,
  isBrowserFailureKind,
  type BrowserFailureKind,
} from '../failure-kinds.js';

export const PROVISION_MIN_FREE_BYTES = 500 * 1024 * 1024;

export class BrowserProvisionError extends Error {
  readonly code: BrowserFailureKind;
  readonly detail?: string;
  readonly packages?: readonly string[];

  constructor(
    code: BrowserFailureKind,
    message: string,
    detail?: string,
    packages?: readonly string[],
  ) {
    super(message);
    this.name = 'BrowserProvisionError';
    this.code = code;
    if (detail !== undefined) this.detail = detail;
    if (packages !== undefined) this.packages = packages;
  }
}

export function toBrowserErrorBody(error: unknown): {
  ok: false;
  error: string;
  code?: BrowserFailureKind;
  detail?: string;
  packages?: readonly string[];
} {
  if (error instanceof BrowserProvisionError) {
    return {
      ok: false,
      error: error.message,
      code: error.code,
      ...(error.detail === undefined ? {} : { detail: error.detail }),
      ...(error.packages === undefined ? {} : { packages: error.packages }),
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { ok: false, error: message };
}

const NETWORK_PATTERNS =
  /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ECONNABORTED|ETIMEDOUT|EPIPE|EHOSTUNREACH|ENETUNREACH|fetch failed|failed to fetch|network|getaddrinfo|socket hang up|socket disconnected|unable to resolve|certificate|self.signed|CERT_|TLS|SSL|proxy|offline|DNS|download failed|request.*failed/i;

const DISK_PATTERNS = /ENOSPC|no space left|disk full|not enough space|insufficient.*space/i;

const PERMISSION_PATTERNS =
  /EACCES|EPERM|EROFS|permission denied|operation not permitted|read.only|access is denied/i;

export function classifyInstallError(error: unknown): BrowserFailureKind {
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
      ? ((error as { code: string }).code.toUpperCase() as string)
      : '';
  if (code === 'ENOSPC') return 'provision-no-disk-space';
  if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') return 'provision-no-permission';
  const message = error instanceof Error ? error.message : String(error);
  if (DISK_PATTERNS.test(message)) return 'provision-no-disk-space';
  if (PERMISSION_PATTERNS.test(message)) return 'provision-no-permission';
  if (NETWORK_PATTERNS.test(message)) return 'provision-no-network';
  return 'provision-failed';
}

export function installFailure(error: unknown, cacheDir: string): BrowserProvisionError {
  const kind = classifyInstallError(error);
  const raw = error instanceof Error ? error.message : String(error);
  switch (kind) {
    case 'provision-no-network':
      return new BrowserProvisionError(
        kind,
        'The Bot Browser download failed because this machine looks offline; reconnect it to the internet, then open the browser again.',
        raw,
      );
    case 'provision-no-disk-space':
      return new BrowserProvisionError(
        kind,
        `The Bot Browser download failed because the disk is full; free at least ${formatMiB(PROVISION_MIN_FREE_BYTES)}, then open the browser again.`,
        raw,
      );
    case 'provision-no-permission':
      return new BrowserProvisionError(
        kind,
        `The Bot Browser download failed because the download folder is not writable (${cacheDir}); ask the machine owner to fix its permissions, then open the browser again.`,
        raw,
      );
    default:
      return new BrowserProvisionError(
        'provision-failed',
        'The Bot Browser download failed; open the browser again to retry, and if it keeps failing show Details to the machine owner.',
        raw,
      );
  }
}

export function formatMiB(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export function formatProgressMiB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface StatfsLike {
  statfsSync(path: string): { bavail: number; bsize: number };
}

function nearestExistingDir(dir: string, exists: (path: string) => boolean): string {
  let current = dir;
  for (;;) {
    if (exists(current)) return current;
    const parent = current.replace(/[\\/][^\\/]*$/, '');
    if (parent === '' || parent === current) return current;
    current = parent;
  }
}

export function freeBytesFor(
  dir: string,
  deps: { fs?: StatfsLike; exists?: (path: string) => boolean } = {},
): number | undefined {
  try {
    const statfs = deps.fs ?? { statfsSync };
    const exists = deps.exists ?? existsSync;
    const anchor = nearestExistingDir(dir, exists);
    const stats = statfs.statfsSync(anchor);
    const free = stats.bavail * stats.bsize;
    return Number.isFinite(free) && free >= 0 ? free : undefined;
  } catch {
    return undefined;
  }
}

export function checkDiskSpace(
  dir: string,
  requiredBytes: number = PROVISION_MIN_FREE_BYTES,
  deps: { fs?: StatfsLike; exists?: (path: string) => boolean } = {},
): { ok: true } | { ok: false; availableBytes: number } {
  const free = freeBytesFor(dir, deps);
  if (free === undefined || free >= requiredBytes) return { ok: true };
  return { ok: false, availableBytes: free };
}

export function diskSpaceFailure(
  cacheDir: string,
  availableBytes: number,
  requiredBytes: number = PROVISION_MIN_FREE_BYTES,
): BrowserProvisionError {
  return new BrowserProvisionError(
    'provision-no-disk-space',
    `The Bot Browser needs ${formatMiB(requiredBytes)} of free space to download, but only ${formatMiB(availableBytes)} is free; free some space, then open the browser again.`,
    `cacheDir=${cacheDir} free=${formatMiB(availableBytes)} required=${formatMiB(requiredBytes)}`,
  );
}

export interface LinuxLibRequirement {
  readonly soname: string;
  readonly packages: readonly string[];
}

export const LINUX_CHROME_LIB_REQUIREMENTS: readonly LinuxLibRequirement[] = [
  { soname: 'libnss3.so', packages: ['libnss3'] },
  { soname: 'libatk-1.0.so.0', packages: ['libatk1.0-0t64'] },
  { soname: 'libatk-bridge-2.0.so.0', packages: ['libatk-bridge2.0-0t64'] },
  { soname: 'libcups.so.2', packages: ['libcups2t64'] },
  { soname: 'libasound.so.2', packages: ['libasound2t64'] },
  { soname: 'libgbm.so.1', packages: ['libgbm1'] },
  { soname: 'libXcomposite.so.1', packages: ['libxcomposite1'] },
  { soname: 'libXdamage.so.1', packages: ['libxdamage1'] },
  { soname: 'libXfixes.so.3', packages: ['libxfixes3'] },
  { soname: 'libXrandr.so.2', packages: ['libxrandr2'] },
  { soname: 'libxkbcommon.so.0', packages: ['libxkbcommon0'] },
  { soname: 'libcairo.so.2', packages: ['libcairo2'] },
  { soname: 'libpango-1.0.so.0', packages: ['libpango-1.0-0'] },
  { soname: 'libX11.so.6', packages: ['libx11-6'] },
  { soname: 'libXext.so.6', packages: ['libxext6'] },
  { soname: 'libatspi.so.0', packages: ['libatspi2.0-0t64'] },
  { soname: 'libxcb.so.1', packages: ['libxcb1'] },
];

export function requiredPackages(requirements: readonly LinuxLibRequirement[]): string[] {
  return [...new Set(requirements.flatMap((entry) => entry.packages))].sort();
}

export function aptInstallCommand(requirements: readonly LinuxLibRequirement[]): string {
  return `sudo apt install -y ${requiredPackages(requirements).join(' ')}`;
}

export const CHROME_LIB_PACKAGES: ReadonlySet<string> = new Set(
  requiredPackages(LINUX_CHROME_LIB_REQUIREMENTS),
);

export function parseLdconfigSonames(output: string): Set<string> {
  const found = new Set<string>();
  for (const line of output.split('\n')) {
    const match = /^\s*(\S+)\s+\([^)]*\)\s+=>\s+\S+/u.exec(line);
    if (match?.[1] !== undefined) found.add(match[1]);
  }
  return found;
}

export function missingFromSonames(
  cached: ReadonlySet<string>,
  requirements: readonly LinuxLibRequirement[] = LINUX_CHROME_LIB_REQUIREMENTS,
): LinuxLibRequirement[] {
  return requirements.filter((entry) => !cached.has(entry.soname));
}

export function parseLddMissing(output: string): string[] {
  const missing: string[] = [];
  for (const line of output.split('\n')) {
    const match = /^\s*(\S+)\s+=>\s+not found/u.exec(line);
    if (match?.[1] !== undefined && !missing.includes(match[1])) missing.push(match[1]);
  }
  return missing;
}

export interface PreflightDeps {
  readonly run?: (command: string, args: readonly string[]) => string;
}

function defaultRun(command: string, args: readonly string[]): string {
  return execFileSync(command, [...args], { encoding: 'utf8', timeout: 10_000 }) as string;
}

export function detectMissingSystemLibs(
  platform: NodeJS.Platform = process.platform,
  deps?: PreflightDeps,
): LinuxLibRequirement[] {
  if (platform !== 'linux') return [];
  try {
    const run = deps?.run ?? defaultRun;
    return missingFromSonames(parseLdconfigSonames(run('ldconfig', ['-p'])));
  } catch {
    return [];
  }
}

export function missingLibsOfBinary(binary: string, deps?: PreflightDeps): string[] {
  try {
    const run = deps?.run ?? defaultRun;
    return parseLddMissing(run('ldd', [binary]));
  } catch {
    return [];
  }
}

export function missingLibsFailure(
  missing: readonly string[],
  options?: { beforeDownload?: boolean; exitCode?: number | null },
): BrowserProvisionError {
  const names = missing.map((entry) => entry).join(', ');
  const relevant = LINUX_CHROME_LIB_REQUIREMENTS.filter((entry) =>
    missing.some(
      (name) => name === entry.soname || name.startsWith(entry.soname.replace(/\.so.*$/u, '')),
    ),
  );
  const needed = relevant.length > 0 ? relevant : LINUX_CHROME_LIB_REQUIREMENTS;
  const command = aptInstallCommand(needed);
  const packages = requiredPackages(needed);
  const detail =
    `missing: ${names}\nUbuntu 24.04: ${command}` +
    (options?.exitCode === undefined || options.exitCode === null
      ? ''
      : `\nexit code ${String(options.exitCode)}`);
  if (options?.beforeDownload === true) {
    return new BrowserProvisionError(
      'provision-missing-libs',
      `The Bot Browser cannot run on this machine yet: system libraries are missing (${names}). Install them first with the command in Details — nothing was downloaded.`,
      detail,
      packages,
    );
  }
  return new BrowserProvisionError(
    'provision-missing-libs',
    `The Bot Browser cannot start on this machine: system libraries are missing (${names}). Install them with the command in Details, then open the browser again.`,
    detail,
    packages,
  );
}

const SANDBOX_PATTERNS = /sandbox|namespace|clone.*EPERM|zygote/i;

const RUNNING_AS_ROOT = /running as root/i;

function sandboxFailure(options: {
  binary: string;
  code: number | null;
  stderr: string;
  platform: NodeJS.Platform;
}): BrowserProvisionError {
  const tail = `exit code ${String(options.code ?? 'unknown')}\n${options.stderr.slice(-500)}`;
  if (RUNNING_AS_ROOT.test(options.stderr)) {
    return new BrowserProvisionError(
      'startup-sandbox',
      'The Bot Browser refused to start because the Host runs as root, where Chrome cannot use its sandbox; run the Host as a regular user, then open the browser again.',
      tail,
    );
  }
  if (options.platform !== 'linux') {
    return new BrowserProvisionError(
      'startup-sandbox',
      'The Bot Browser refused to start because the OS blocked its sandbox; show Details to the machine owner, then open the browser again.',
      tail,
    );
  }
  return new BrowserProvisionError(
    'startup-sandbox',
    'The Bot Browser refused to start because the OS blocked its sandbox. On Ubuntu 23.10 and later this is usually AppArmor restricting unprivileged user namespaces for a Chrome outside system paths; add the AppArmor profile in Details for this browser, then open the browser again.',
    `${appArmorUsernsGuide(options.binary)}\n\n${tail}`,
  );
}

function appArmorUsernsGuide(binary: string): string {
  const path = binary === '' ? '/path/to/chrome' : binary;
  return [
    'Likely cause: AppArmor restricts unprivileged user namespaces (kernel.apparmor_restrict_unprivileged_userns=1).',
    'Check: sudo dmesg | grep -i apparmor   (look for a "userns_create" denial)',
    'Fix: save this as /etc/apparmor.d/botharness-chrome, then run sudo apparmor_parser -r /etc/apparmor.d/botharness-chrome',
    '',
    'abi <abi/4.0>,',
    'include <tunables/global>',
    '',
    `profile botharness-chrome ${JSON.stringify(path)} flags=(unconfined) {`,
    '  userns,',
    '  include if exists <local/botharness-chrome>',
    '}',
  ].join('\n');
}

export function diagnoseStartupExit(options: {
  binary: string;
  code: number | null;
  stderr: string;
  platform?: NodeJS.Platform;
  missingLibs?: readonly string[];
}): BrowserProvisionError {
  const platform = options.platform ?? process.platform;
  if (platform === 'linux') {
    const missing = options.missingLibs ?? [];
    if (missing.length > 0) return missingLibsFailure(missing, { exitCode: options.code });
  }
  const stderr = options.stderr.trim();
  if (SANDBOX_PATTERNS.test(stderr)) {
    return sandboxFailure({ ...options, platform, stderr });
  }
  return new BrowserProvisionError(
    'startup-crashed',
    `The Bot Browser exited during startup (code ${String(options.code ?? 'unknown')}); open the browser again to retry, and if it keeps failing show Details to the machine owner.`,
    stderr === '' ? `exit code ${String(options.code ?? 'unknown')}` : stderr.slice(-500),
  );
}

export function startupTimeoutFailure(timeoutMs: number): BrowserProvisionError {
  return new BrowserProvisionError(
    'startup-timeout',
    `The Bot Browser took longer than ${String(Math.round(timeoutMs / 1000))}s to start; the machine may be slow or overloaded. Open the browser again to retry.`,
    `timeoutMs=${String(timeoutMs)}`,
  );
}

export function spawnFailure(error: unknown, binary: string): BrowserProvisionError {
  const raw = error instanceof Error ? error.message : String(error);
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '').toUpperCase()
      : '';
  if (code === 'EACCES' || code === 'EPERM' || PERMISSION_PATTERNS.test(raw)) {
    return new BrowserProvisionError(
      'startup-spawn-failed',
      `The Bot Browser program could not be started because it is not executable (${binary}); ask the machine owner to fix its permissions, then open the browser again.`,
      raw,
    );
  }
  return new BrowserProvisionError(
    'startup-spawn-failed',
    `The Bot Browser program could not be started (${binary}); it may have been blocked or removed by antivirus. Allow-list the browser folder, then open the browser again to re-download if needed.`,
    raw,
  );
}

export function missingBinaryFailure(explicit: string): BrowserProvisionError {
  return new BrowserProvisionError(
    'startup-missing-binary',
    explicit === ''
      ? 'No Chrome, Edge, or Chromium was found for the Bot Browser; install one or set browserPath in the browser plugin configuration.'
      : `The configured Bot Browser binary does not exist: ${explicit}; fix browserPath in the browser plugin configuration or clear it to use the automatic download.`,
    explicit === '' ? 'no system browser and no install directory' : `browserPath=${explicit}`,
  );
}
