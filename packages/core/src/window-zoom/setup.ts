import { spawn as spawnProcess, type SpawnOptions } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

export const WINDOW_ZOOM_SETUP_PATH = '/api/botharness/window-zoom-setup';
const THEME = '@deepseek-ai/dsh-client-ui-theme';
const PNPM = 'runtime/primary-runtime/dependencies/pnpm/bin/pnpm.mjs';

export type WindowZoomSetupAction = 'enable' | 'disable';
export interface WindowZoomSetupRequest {
  version: 1;
  id: string;
  action: WindowZoomSetupAction;
  status: 'waiting' | 'done' | 'failed' | 'cancelled';
  pid?: number;
  code?: string;
  changed?: boolean;
  requestedAt: string;
  finishedAt?: string;
}
export type WindowZoomSetupStatus =
  | { supported: false; code: string }
  | {
      supported: true;
      enabled: boolean;
      pending?: { action: WindowZoomSetupAction; requestedAt: string };
      last?: {
        action: WindowZoomSetupAction;
        status: 'done' | 'failed';
        code?: string;
        finishedAt?: string;
      };
    };

export interface WindowZoomSetupOptions {
  dshHome: string;
  profileDir: string | undefined;
  platform?: NodeJS.Platform;
  execPath?: string;
  argv?: readonly string[];
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  alive?: (pid: number) => boolean;
  spawn?: (
    command: string,
    args: readonly string[],
    options: SpawnOptions,
  ) => {
    pid?: number | undefined;
    unref(): void;
    on?(event: 'error', listener: (error: Error) => void): unknown;
  };
  log?: (phase: string, detail: Record<string, string | number | boolean>) => void;
}

const refusal = (code: string, status = 409) =>
  Response.json({ error: { code, message: code } }, { status });
class SetupRefusal extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
function refuse(code: string): never {
  throw new SetupRefusal(code);
}
function defaultAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function desktopAppFor(
  platform: NodeJS.Platform,
  paths: readonly (string | undefined)[],
  exists: (path: string) => boolean = existsSync,
): string | undefined {
  for (const path of paths) {
    if (!path) continue;
    const normalized = path.replaceAll('\\', '/');
    if (platform === 'darwin') {
      const match = /^(.+?\.app)\/Contents\//.exec(normalized);
      if (match && exists(join(match[1]!, 'Contents/Resources', PNPM))) return match[1];
    } else if (platform === 'win32') {
      const index = normalized.toLowerCase().indexOf('/resources/');
      if (index <= 0) continue;
      const directory = path.slice(0, index);
      if (
        exists(join(directory, 'resources', PNPM)) &&
        exists(join(directory, 'DeepSeek Harness.exe'))
      )
        return directory;
    }
  }
  return undefined;
}

export function createWindowZoomSetup(options: WindowZoomSetupOptions) {
  const platform = options.platform ?? process.platform;
  const now = options.now ?? (() => new Date());
  const alive = options.alive ?? defaultAlive;
  const spawn = options.spawn ?? spawnProcess;
  const statePath = join(options.dshHome, 'botharness', 'window-zoom-setup.json');
  const record = (phase: string, detail: Record<string, string | number | boolean>) => {
    try {
      options.log?.(phase, detail);
    } catch {}
  };
  const readState = (): WindowZoomSetupRequest | undefined => {
    try {
      const value = JSON.parse(readFileSync(statePath, 'utf8')) as WindowZoomSetupRequest;
      return value?.version === 1 && typeof value.id === 'string' ? value : undefined;
    } catch {
      return undefined;
    }
  };
  const writeState = (value: WindowZoomSetupRequest) => {
    mkdirSync(dirname(statePath), { recursive: true });
    const temporary = `${statePath}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });
    renameSync(temporary, statePath);
  };
  const target = () => {
    if (platform !== 'darwin' && platform !== 'win32') refuse('zoom-setup-platform-unsupported');
    const profileDir = options.profileDir;
    let desktop: string;
    try {
      desktop = realpathSync(join(options.dshHome, 'profiles', 'desktop'));
      if (!profileDir || realpathSync(profileDir) !== desktop) refuse('zoom-setup-not-desktop');
    } catch (error) {
      if (error instanceof SetupRefusal) throw error;
      refuse('zoom-setup-not-desktop');
    }
    const desktopApp = desktopAppFor(platform, [
      options.execPath ?? process.execPath,
      ...(options.argv ?? process.argv).slice(1),
    ]);
    if (!desktopApp) refuse('zoom-setup-desktop-app-unresolved');
    const manifest = JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      dsh?: { profile?: { bundles?: string[] } };
    };
    const bundles = manifest.dsh?.profile?.bundles ?? [];
    const entry =
      !bundles.includes('deepseekbot') && bundles.includes('tobs') ? 'tobs' : 'deepseekbot';
    let script: string | undefined;
    try {
      const product = realpathSync(join(desktop, 'node_modules', entry));
      const own = join(product, 'dist/desktop-zoom-setup.mjs');
      script = existsSync(own)
        ? own
        : join(
            dirname(
              createRequire(join(product, 'package.json')).resolve('deepseekbot/package.json'),
            ),
            'dist/desktop-zoom-setup.mjs',
          );
    } catch {}
    if (!script || !existsSync(script)) refuse('zoom-setup-command-unavailable');
    const link = manifest.dependencies?.[THEME];
    return {
      desktop,
      desktopApp,
      script,
      enabled: typeof link === 'string' && link === `link:node_modules/${entry}/desktop-theme`,
    };
  };
  const status = (): WindowZoomSetupStatus => {
    let enabled: boolean;
    try {
      enabled = target().enabled;
    } catch (error) {
      if (error instanceof SetupRefusal) return { supported: false, code: error.code };
      return { supported: false, code: 'zoom-setup-unavailable' };
    }
    let state = readState();
    if (state?.status === 'waiting' && (state.pid === undefined || !alive(state.pid))) {
      state = {
        ...state,
        status: 'failed',
        code: 'zoom-setup-helper-exited',
        finishedAt: now().toISOString(),
      };
      writeState(state);
    }
    return {
      supported: true,
      enabled,
      ...(state?.status === 'waiting'
        ? { pending: { action: state.action, requestedAt: state.requestedAt } }
        : {}),
      ...(state?.status === 'done' || state?.status === 'failed'
        ? {
            last: {
              action: state.action,
              status: state.status,
              ...(state.code ? { code: state.code } : {}),
              ...(state.finishedAt ? { finishedAt: state.finishedAt } : {}),
            },
          }
        : {}),
    };
  };
  const schedule = (action: WindowZoomSetupAction) => {
    const { desktop, desktopApp, script, enabled } = target();
    if (enabled === (action === 'enable')) refuse(`zoom-setup-already-${action}d`);
    const request: WindowZoomSetupRequest = {
      version: 1,
      id: randomUUID(),
      action,
      status: 'waiting',
      requestedAt: now().toISOString(),
    };
    writeState(request);
    const env = { ...(options.env ?? process.env), ELECTRON_RUN_AS_NODE: '1' };
    const child = spawn(
      options.execPath ?? process.execPath,
      [
        script,
        action,
        '--home',
        options.dshHome,
        '--profile',
        'desktop',
        '--desktop-app',
        desktopApp,
        '--after-quit',
        statePath,
        '--request',
        request.id,
      ],
      { cwd: desktop, env, detached: true, stdio: 'ignore', windowsHide: true },
    );
    child.on?.('error', (error) => {
      record('spawn-failed', { message: error.message });
      if (readState()?.id === request.id)
        writeState({
          ...request,
          status: 'failed',
          code: 'zoom-setup-helper-spawn-failed',
          finishedAt: now().toISOString(),
        });
    });
    child.unref();
    writeState({ ...request, ...(child.pid === undefined ? {} : { pid: child.pid }) });
    record('scheduled', { action, request: request.id, pid: child.pid ?? 0 });
    return status();
  };
  const cancel = () => {
    const state = readState();
    if (state?.status !== 'waiting') refuse('zoom-setup-not-pending');
    writeState({ ...state, status: 'cancelled', finishedAt: now().toISOString() });
    record('cancelled', { action: state.action, request: state.id });
    return status();
  };
  return {
    status,
    schedule,
    cancel,
    async fetch(request: Request): Promise<Response> {
      if (request.method === 'GET') return Response.json(status());
      if (request.method !== 'POST') return refusal('zoom-setup-method-not-allowed', 405);
      let input: unknown;
      try {
        input = await request.json();
      } catch {
        return refusal('zoom-setup-invalid-request', 400);
      }
      const action = (input as { action?: unknown } | null)?.action;
      try {
        if (action === 'enable' || action === 'disable') return Response.json(schedule(action));
        if (action === 'cancel') return Response.json(cancel());
        return refusal('zoom-setup-invalid-request', 400);
      } catch (error) {
        if (error instanceof SetupRefusal) return refusal(error.code);
        record('failed', { message: String((error as Error).message ?? error) });
        return refusal('zoom-setup-unavailable', 500);
      }
    },
  };
}
