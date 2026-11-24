import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import {
  waylandIssue,
  waylandIssues,
  type DesktopAccessIssue,
  type WaylandIssueCode,
} from '../desktop-availability.js';
import { LocalVideoError } from '../local-video-contract.js';
import type { ComputerProvider, ComputerStatus } from '../provider.js';
import type { CuaDriver } from '../tool/driver.js';
import { localDriverEnv } from '../tool/local-driver.js';
import { waylandArguments, waylandResult, waylandTools } from './wayland-tools.js';

interface PortalProcess {
  write(value: object): void;
  close(): Promise<void>;
}

type OpenPortal = (handlers: {
  readonly message: (value: unknown) => void;
  readonly exited: (started: boolean) => void;
}) => PortalProcess;

function openPortal(handlers: Parameters<OpenPortal>[0]): PortalProcess {
  const directory = dirname(
    createRequire(import.meta.url).resolve('@botharness/computer/package.json'),
  );
  const helper = join(directory, 'native', 'wayland', 'portal-desktop.py');
  const child = spawn('/usr/bin/python3', ['-u', helper], {
    stdio: ['pipe', 'pipe', 'ignore'],
    windowsHide: true,
    shell: false,
    env: localDriverEnv(),
  });
  const lines = createInterface({ input: child.stdout });
  let started = false;
  let closed = false;
  lines.on('line', (line) => {
    let decoded: unknown;
    try {
      decoded = JSON.parse(line);
    } catch {
      return;
    }
    started = true;
    handlers.message(decoded);
  });
  const ended = new Promise<void>((resolve) => {
    child.once('close', () => {
      closed = true;
      lines.close();
      handlers.exited(started);
      resolve();
    });
  });
  child.on('error', () => undefined);
  child.stdin.on('error', () => undefined);
  return {
    write(value) {
      child.stdin.write(`${JSON.stringify(value)}\n`);
    },
    async close() {
      if (closed) return;
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 1_000);
      try {
        await ended;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

function portalToken(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(value);
}

function readToken(path: string): string | undefined {
  try {
    const value = readFileSync(path, 'utf8').trim();
    return portalToken(value) ? value : undefined;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

function saveToken(path: string, token: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${token}\n`, { mode: 0o600, flag: 'wx' });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function completion<T>() {
  let resolve = (_value: T): void => {};
  let reject = (_error: Error): void => {};
  const promise = new Promise<T>((success, failure) => {
    resolve = success;
    reject = failure;
  });
  return { promise, resolve, reject };
}

interface Pending extends ReturnType<typeof completion<unknown>> {
  readonly timer: ReturnType<typeof setTimeout>;
}

export function createWaylandDesktop(options: {
  readonly profileDir: string;
  readonly onStatusChanged: () => void;
  readonly onUnavailable: () => void;
  readonly open?: OpenPortal;
}): { provider: ComputerProvider; driver: CuaDriver } {
  const path = join(options.profileDir, 'computer-wayland-permission');
  let status: ComputerStatus = { state: 'stopped' };
  let issue: DesktopAccessIssue | undefined;
  let process: PortalProcess | undefined;
  let stopping: Promise<void> | undefined;
  let start: ReturnType<typeof completion<void>> | undefined;
  let savedGrant = false;
  let sequence = 0;
  const calls = new Map<number, Pending>();
  const refusal = (code: WaylandIssueCode): LocalVideoError =>
    new LocalVideoError(code, waylandIssues[code]);

  function update(next: ComputerStatus, reason?: DesktopAccessIssue) {
    const wasRunning = status.state === 'running';
    const becameInactive =
      (reason?.code === 'desktop-locked' || reason?.code === 'desktop-screen-inactive') &&
      issue?.code !== reason.code;
    status = next;
    issue = reason;
    if (becameInactive || (wasRunning && reason !== undefined)) options.onUnavailable();
    options.onStatusChanged();
  }

  function unavailable(reason: DesktopAccessIssue) {
    savedGrant = false;
    const starting =
      reason.code === 'desktop-consent-pending' || reason.code === 'desktop-restoring';
    update(
      {
        state: starting ? 'stopped' : 'failed',
        phase: starting ? 'starting' : 'failed',
        refusal: reason.code,
        detail: reason.detail,
      },
      reason,
    );
    if (!starting) start?.reject(refusal(reason.code));
  }

  function finishCall(id: number, error: Error | undefined, value?: unknown): void {
    const pending = calls.get(id);
    if (pending === undefined) return;
    calls.delete(id);
    clearTimeout(pending.timer);
    if (error === undefined) pending.resolve(value);
    else pending.reject(error);
  }

  async function close(): Promise<void> {
    if (stopping !== undefined) return stopping;
    const owner = process;
    process = undefined;
    start?.reject(new Error('The Wayland desktop was stopped.'));
    stopping = (async () => {
      await owner?.close();
      for (const id of calls.keys()) finishCall(id, refusal('desktop-portal-ended'));
    })().finally(() => {
      stopping = undefined;
    });
    await stopping;
  }

  function onMessage(value: unknown) {
    if (!record(value)) return;
    if (portalToken(value['token'])) {
      try {
        saveToken(path, value['token']);
        savedGrant = true;
      } catch {
        unavailable({
          code: 'desktop-portal-token-write',
          detail: waylandIssues['desktop-portal-token-write'],
        });
        void close().catch(() => undefined);
      }
      return;
    }
    if ('state' in value) {
      if (value['state'] === 'ready') {
        if (!savedGrant) {
          const code = 'desktop-consent-required';
          unavailable({ code, detail: waylandIssues[code] });
          void close().catch(() => undefined);
          return;
        }
        update({ state: 'running', phase: 'running' });
        start?.resolve();
      } else {
        const reason = waylandIssue(value['state']);
        if (reason !== undefined) unavailable(reason);
      }
      return;
    }
    const id = value['id'];
    if (typeof id !== 'number') return;
    const reason = waylandIssue(value['refusal']);
    if (reason !== undefined) finishCall(id, refusal(reason.code));
    else if (typeof value['error'] === 'string') finishCall(id, new Error(value['error']));
    else if (record(value['value'])) finishCall(id, undefined, value['value']);
  }

  const provider: ComputerProvider = {
    name: 'local',
    probe: async () => ({ available: true }),
    status: async () => status,
    isRunning: () => status.state === 'running',
    unavailable: () => issue,
    async start() {
      await stopping;
      if (status.state === 'running') return;
      if (start !== undefined) return start.promise;
      const joiningRestore = process !== undefined && issue?.code === 'desktop-restoring';
      let token: string | undefined;
      if (!joiningRestore) {
        try {
          token = readToken(path);
        } catch {
          const code = 'desktop-portal-token-write';
          unavailable({ code, detail: waylandIssues[code] });
          throw refusal(code);
        }
        const reason = token === undefined ? 'desktop-consent-pending' : 'desktop-restoring';
        unavailable({ code: reason, detail: waylandIssues[reason] });
      }
      const attempt = completion<void>();
      start = attempt;
      const timer = setTimeout(() => {
        const ended = 'desktop-portal-ended';
        unavailable({ code: ended, detail: waylandIssues[ended] });
        void close().catch(() => undefined);
      }, 130_000);
      try {
        if (process === undefined) {
          const owner = (options.open ?? openPortal)({
            message: (value) => {
              if (process === owner) onMessage(value);
            },
            exited: (started) => {
              if (process !== owner) return;
              process = undefined;
              const code = started ? 'desktop-portal-ended' : 'desktop-portal-dependencies';
              if (status.state !== 'failed') unavailable({ code, detail: waylandIssues[code] });
              for (const id of calls.keys()) finishCall(id, refusal(code));
            },
          });
          process = owner;
        }
        if (!joiningRestore)
          process.write({ method: 'start', ...(token === undefined ? {} : { token }) });
        await attempt.promise;
      } finally {
        clearTimeout(timer);
        if (start === attempt) start = undefined;
      }
    },
    async stop() {
      update({ state: 'stopped' });
      await close();
    },
    upstream: () => undefined,
  };
  const driver: CuaDriver = {
    ensure: async () => ({ status: 'present', arch: globalThis.process.arch }),
    tools: async () => waylandTools,
    async call(method, args, signal) {
      signal?.throwIfAborted();
      if (status.state !== 'running' || process === undefined)
        throw refusal(issue?.code ?? 'desktop-portal-ended');
      if (calls.size >= 16) throw new Error('The Wayland desktop has too many pending actions.');
      const input = waylandArguments(method, args);
      const id = ++sequence;
      const pending = completion<unknown>();
      const timer = setTimeout(() => {
        const code = 'desktop-portal-ended';
        unavailable({ code, detail: waylandIssues[code] });
        void close().catch(() => undefined);
      }, 10_000);
      calls.set(id, { ...pending, timer });
      process.write({ id, method, args: input });
      const answer = await pending.promise;
      signal?.throwIfAborted();
      if (status.state !== 'running') throw refusal(issue?.code ?? 'desktop-portal-ended');
      if (!record(answer)) throw new Error('The Wayland desktop returned an invalid response.');
      return waylandResult(method, answer);
    },
    close,
  };
  return { provider, driver };
}
