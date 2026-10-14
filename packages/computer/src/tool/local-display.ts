import { spawn, type ChildProcess } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { delimiter, join } from 'node:path';

export interface LocalDisplay {
  readonly display: string;
  readonly env: Readonly<Record<string, string>>;
  readonly managed: boolean;
  alive(): boolean;
  stop(): Promise<void>;
}

export const LOCAL_DISPLAY_SCREEN = '1440x900x24';

export const LOCAL_WINDOW_MANAGER_SETTLE_MS = 1000;

export const LOCAL_WINDOW_MANAGERS = [
  'openbox',
  'xfwm4',
  'fluxbox',
  'icewm',
  'matchbox-window-manager',
] as const;

export const LOCAL_AT_SPI_LAUNCHERS = [
  '/usr/libexec/at-spi-bus-launcher',
  '/usr/lib/at-spi2-core/at-spi-bus-launcher',
] as const;

export class LocalDesktopMissingError extends Error {
  readonly packages: readonly string[];

  constructor(packages: readonly string[], hasDisplayServer: boolean) {
    super(
      hasDisplayServer
        ? `This Linux Host has no window manager for its virtual display, so apps cannot take input focus. Install the missing desktop packages (${packages.join(', ')}), then check again.`
        : `This Linux Host has no desktop display. Install the missing desktop packages (${packages.join(', ')}) so BotHarness can start a virtual one, or run DSH inside a desktop session, then check again.`,
    );
    this.name = 'LocalDesktopMissingError';
    this.packages = packages;
  }
}

async function executable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function findOnPath(name: string, path: string | undefined): Promise<string | undefined> {
  for (const dir of (path ?? '').split(delimiter)) {
    if (dir === '') continue;
    const candidate = join(dir, name);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  return undefined;
}

interface Owned {
  readonly child: ChildProcess;
  exited: boolean;
}

function own(child: ChildProcess): Owned {
  const owned: Owned = { child, exited: false };
  child.once('exit', () => {
    owned.exited = true;
  });
  child.once('error', () => {
    owned.exited = true;
  });
  return owned;
}

async function terminate(owned: Owned): Promise<void> {
  if (owned.exited) return;
  const done = new Promise<void>((resolve) => owned.child.once('exit', () => resolve()));
  owned.child.kill('SIGTERM');
  await done;
}

function firstLine(
  owned: Owned,
  stream: NodeJS.ReadableStream | null | undefined,
  what: string,
  options: { signal?: AbortSignal | undefined; timeoutMs: number },
): Promise<string> {
  return new Promise((resolve, reject) => {
    let out = '';
    let stderr = '';
    owned.child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < 2000) stderr += chunk.toString();
    });
    const timer = setTimeout(
      () => finish(new Error(`${what} did not start in time`)),
      options.timeoutMs,
    );
    const onAbort = (): void => finish(new Error('Local Computer setup cancelled'));
    options.signal?.addEventListener('abort', onAbort, { once: true });
    const onExit = (code: number | null): void =>
      finish(
        new Error(
          `${what} exited (code ${String(code)}): ${stderr.trim().split('\n').pop() ?? ''}`,
        ),
      );
    owned.child.once('exit', onExit);
    let settled = false;
    function finish(result: Error | string): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      owned.child.off('exit', onExit);
      if (typeof result === 'string') resolve(result);
      else reject(result);
    }
    stream?.on('data', (chunk: Buffer) => {
      out += chunk.toString();
      if (out.includes('\n')) finish(out.trim());
    });
  });
}

async function findWindowManager(path: string | undefined): Promise<string | undefined> {
  for (const name of LOCAL_WINDOW_MANAGERS) {
    const found = await findOnPath(name, path);
    if (found !== undefined) return found;
  }
  return undefined;
}

function desktopSession(source: NodeJS.ProcessEnv): boolean {
  return (source['XDG_CURRENT_DESKTOP'] ?? '') !== '' || (source['DESKTOP_SESSION'] ?? '') !== '';
}

function exitsWithin(owned: Owned, ms: number): Promise<boolean> {
  if (owned.exited) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      owned.child.off('exit', onExit);
      resolve(false);
    }, ms);
    const onExit = (): void => {
      clearTimeout(timer);
      resolve(true);
    };
    owned.child.once('exit', onExit);
  });
}

async function attachToDisplay(options: {
  source: NodeJS.ProcessEnv;
  display: string;
  wm: string | undefined;
  dbus: string | undefined;
  onEvent?: ((detail: string) => void) | undefined;
  signal?: AbortSignal | undefined;
  timeoutMs?: number | undefined;
}): Promise<LocalDisplay> {
  const { source, display, wm, dbus } = options;
  if (wm === undefined) {
    const packages = (await missingDesktopPackages(source)).filter((name) => name !== 'xvfb');
    throw new LocalDesktopMissingError(packages.length > 0 ? packages : ['openbox'], true);
  }
  const timeoutMs = options.timeoutMs ?? 10_000;
  const children: Owned[] = [];
  let stopped = false;
  const stop = async (): Promise<void> => {
    stopped = true;
    const running = children.splice(0).reverse();
    for (const owned of running) await terminate(owned);
    if (running.length > 0) options.onEvent?.('phase=display-stopped');
  };
  try {
    const env: Record<string, string> = {};
    if ((source['DBUS_SESSION_BUS_ADDRESS'] ?? '') === '' && dbus !== undefined) {
      const bus = own(
        spawn(dbus, ['--session', '--nofork', '--nopidfile', '--print-address=1'], {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { PATH: source['PATH'] ?? '', HOME: source['HOME'] ?? '', DISPLAY: display },
        }),
      );
      children.push(bus);
      env['DBUS_SESSION_BUS_ADDRESS'] = await firstLine(bus, bus.child.stdout, 'D-Bus', {
        signal: options.signal,
        timeoutMs,
      });
    }
    const manager = own(
      spawn(wm, [], { stdio: 'ignore', env: { ...source, DISPLAY: display, ...env } }),
    );
    const running = !(await exitsWithin(manager, LOCAL_WINDOW_MANAGER_SETTLE_MS));
    if (running) children.push(manager);
    options.onEvent?.(
      `phase=display source=session display=${display} wm=${running ? (wm.split('/').pop() ?? wm) : 'existing'} dbus=${String(env['DBUS_SESSION_BUS_ADDRESS'] !== undefined)}`,
    );
    return {
      display,
      env,
      managed: false,
      alive: () => !stopped && children.every((owned) => !owned.exited),
      stop,
    };
  } catch (error) {
    await stop();
    throw error;
  }
}

export async function missingDesktopPackages(
  source: NodeJS.ProcessEnv = process.env,
): Promise<string[]> {
  const path = source['PATH'];
  let atSpi = false;
  for (const launcher of LOCAL_AT_SPI_LAUNCHERS) atSpi ||= await executable(launcher);
  const needsServer = (source['DISPLAY'] ?? '') === '';
  return [
    ...(needsServer && (await findOnPath('Xvfb', path)) === undefined ? ['xvfb'] : []),
    ...((await findWindowManager(path)) === undefined ? ['openbox'] : []),
    ...((await findOnPath('dbus-daemon', path)) === undefined ? ['dbus'] : []),
    ...(atSpi ? [] : ['at-spi2-core']),
  ];
}

export async function ensureLocalDisplay(options: {
  source?: NodeJS.ProcessEnv | undefined;
  onEvent?: ((detail: string) => void) | undefined;
  signal?: AbortSignal | undefined;
  timeoutMs?: number | undefined;
}): Promise<LocalDisplay> {
  const source = options.source ?? process.env;
  const existing = source['DISPLAY'] ?? '';
  const path = source['PATH'];
  if ((source['WAYLAND_DISPLAY'] ?? '') !== '' || (existing !== '' && desktopSession(source))) {
    options.onEvent?.(`phase=display source=session display=${existing || 'wayland'}`);
    return {
      display: existing,
      env: {},
      managed: false,
      alive: () => true,
      stop: async () => undefined,
    };
  }
  const wm = await findWindowManager(path);
  const dbus = await findOnPath('dbus-daemon', path);
  if (existing !== '') return attachToDisplay({ ...options, source, display: existing, wm, dbus });
  const xvfb = await findOnPath('Xvfb', path);
  if (xvfb === undefined || wm === undefined)
    throw new LocalDesktopMissingError(await missingDesktopPackages(source), xvfb !== undefined);

  const timeoutMs = options.timeoutMs ?? 10_000;
  const started = Date.now();
  const children: Owned[] = [];
  const stop = async (): Promise<void> => {
    const running = children.splice(0).reverse();
    for (const owned of running) await terminate(owned);
    if (running.length > 0) options.onEvent?.('phase=display-stopped');
  };
  try {
    const server = own(
      spawn(xvfb, ['-displayfd', '3', '-screen', '0', LOCAL_DISPLAY_SCREEN, '-nolisten', 'tcp'], {
        stdio: ['ignore', 'ignore', 'pipe', 'pipe'],
      }),
    );
    children.push(server);
    const display = `:${await firstLine(server, server.child.stdio[3] as NodeJS.ReadableStream, 'Xvfb', { signal: options.signal, timeoutMs })}`;
    const env: Record<string, string> = {};
    if (dbus !== undefined) {
      const bus = own(
        spawn(dbus, ['--session', '--nofork', '--nopidfile', '--print-address=1'], {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { PATH: path ?? '', HOME: source['HOME'] ?? '', DISPLAY: display },
        }),
      );
      children.push(bus);
      env['DBUS_SESSION_BUS_ADDRESS'] = await firstLine(bus, bus.child.stdout, 'D-Bus', {
        signal: options.signal,
        timeoutMs,
      });
    }
    const manager = own(
      spawn(wm, [], {
        stdio: 'ignore',
        env: { ...source, DISPLAY: display, ...env },
      }),
    );
    children.push(manager);
    options.onEvent?.(
      `phase=display source=xvfb display=${display} wm=${wm.split('/').pop() ?? wm} dbus=${String(dbus !== undefined)} durationMs=${String(Date.now() - started)}`,
    );
    return {
      display,
      env,
      managed: true,
      alive: () => children.length > 0 && children.every((owned) => !owned.exited),
      stop,
    };
  } catch (error) {
    await stop();
    throw error;
  }
}
