import { execFile, spawn as spawnProcess, type SpawnOptions } from 'node:child_process';
import { join } from 'node:path';
import { desktopAppFor } from '../window-zoom/setup.js';

export const DESKTOP_WINDOW_PATH = '/api/botharness/desktop-window';
const MIN_INTERVAL_MS = 1_500;

export type DesktopWindowReveal =
  | { ok: true; launched: boolean }
  | { ok: false; code: DesktopWindowRefusal };
export type DesktopWindowRefusal =
  | 'desktop-window-platform-unsupported'
  | 'desktop-window-app-unresolved'
  | 'desktop-window-launch-failed';

export interface DesktopWindowOptions {
  platform?: NodeJS.Platform;
  execPath?: string;
  argv?: readonly string[];
  env?: NodeJS.ProcessEnv;
  parentPid?: number;
  now?: () => number;
  parentCommandLine?: (pid: number) => Promise<string | undefined>;
  spawn?: (
    command: string,
    args: readonly string[],
    options: SpawnOptions,
  ) => { unref(): void; on?(event: 'error', listener: (error: Error) => void): unknown };
  log?: (phase: string, detail: Record<string, string | number | boolean>) => void;
}

export function userDataArgument(commandLine: string | undefined): string | undefined {
  if (commandLine === undefined) return undefined;
  const match = /"--user-data-dir=([^"]+)"|--user-data-dir=(?:"([^"]+)"|(\S+))/u.exec(commandLine);
  const dir = match?.[1] ?? match?.[2] ?? match?.[3];
  return dir === undefined ? undefined : `--user-data-dir=${dir}`;
}

function windowsCommandLine(pid: number): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
      ],
      { windowsHide: true, timeout: 10_000 },
      (error, stdout) => resolve(error ? undefined : stdout.trim() || undefined),
    );
  });
}

export function createDesktopWindowReveal(options: DesktopWindowOptions = {}) {
  const platform = options.platform ?? process.platform;
  const now = options.now ?? Date.now;
  const spawn = options.spawn ?? spawnProcess;
  const parentPid = options.parentPid ?? process.ppid;
  const readCommandLine = options.parentCommandLine ?? windowsCommandLine;
  const record = (phase: string, detail: Record<string, string | number | boolean>) => {
    try {
      options.log?.(phase, detail);
    } catch {}
  };
  const resolveApp = () =>
    desktopAppFor(platform, [
      options.execPath ?? process.execPath,
      ...(options.argv ?? process.argv).slice(1),
    ]);
  let userData: Promise<string | undefined> | undefined;
  let lastLaunch = -Infinity;
  const reveal = async (): Promise<DesktopWindowReveal> => {
    if (platform !== 'win32') return { ok: false, code: 'desktop-window-platform-unsupported' };
    const desktopApp = resolveApp();
    if (desktopApp === undefined) return { ok: false, code: 'desktop-window-app-unresolved' };
    userData ??= readCommandLine(parentPid).then(userDataArgument, () => undefined);
    const dataArgument = await userData;
    const at = now();
    if (at - lastLaunch < MIN_INTERVAL_MS) return { ok: true, launched: false };
    lastLaunch = at;
    const env = { ...(options.env ?? process.env) };
    delete env['ELECTRON_RUN_AS_NODE'];
    delete env['NODE_OPTIONS'];
    try {
      const child = spawn(
        join(desktopApp, 'DeepSeek Harness.exe'),
        dataArgument === undefined ? [] : [dataArgument],
        { env, detached: true, stdio: 'ignore', windowsHide: true },
      );
      child.on?.('error', (error) => record('launch-failed', { message: error.message }));
      child.unref();
    } catch (error) {
      record('launch-failed', { message: String((error as Error).message ?? error) });
      return { ok: false, code: 'desktop-window-launch-failed' };
    }
    record('revealed', { userData: dataArgument !== undefined });
    return { ok: true, launched: true };
  };
  return {
    reveal,
    prime() {
      if (platform === 'win32' && resolveApp() !== undefined)
        userData ??= readCommandLine(parentPid).then(userDataArgument, () => undefined);
    },
    async fetch(request: Request): Promise<Response> {
      let input: unknown;
      try {
        input = await request.json();
      } catch {
        input = undefined;
      }
      if ((input as { action?: unknown } | null)?.action !== 'reveal')
        return Response.json(
          { ok: false, code: 'desktop-window-invalid-request' },
          { status: 400 },
        );
      const result = await reveal();
      return Response.json(result, { status: result.ok ? 200 : 409 });
    },
  };
}
