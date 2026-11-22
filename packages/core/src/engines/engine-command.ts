import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';

import { engineLaunch } from './engine-launch.js';
import { EngineRefusal, engineEnvironment } from './engine-session.js';

export interface EngineCommand {
  command: string;
  env?: Readonly<Record<string, string | undefined>>;
  extraEnv: Readonly<Record<string, string>>;
}

function launch(target: EngineCommand, args: string[]) {
  const env = target.env ?? process.env;
  return {
    ...engineLaunch(target.command, args, { env }),
    env: engineEnvironment(env, target.extraEnv),
  };
}

export function runEngineCommand(
  target: EngineCommand,
  args: string[],
): Promise<{ ok: boolean; output: string; stdout: string; missing: boolean }> {
  const spec = launch(target, args);
  return new Promise((resolve) => {
    execFile(
      spec.file,
      spec.args,
      {
        env: spec.env,
        timeout: 15_000,
        ...(spec.windowsVerbatimArguments === true ? { windowsVerbatimArguments: true } : {}),
        shell: false,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const code = error !== null && 'code' in error ? error.code : undefined;
        resolve({
          ok: error === null,
          output: `${stdout}\n${stderr}`,
          stdout,
          missing: code === 'ENOENT',
        });
      },
    );
  });
}

export function engineVersion(output: string): string {
  return /\b\d+\.\d+\.\d+[\w.-]*/u.exec(output)?.[0] ?? '';
}

const LOGIN_URL = /https:\/\/\S+/u;
const CODE_PROMPT =
  /(?:^|[\r\n])\s*(?:please\s+)?(?:paste|enter)\s+(?:(?:the|your|an?|manual|authorization|verification|sign.in)\s+)*code\b[^\r\n]*[:>]\s*$/imu;

export interface EngineLoginProcess {
  signal?: AbortSignal;
  onExit?(): void;
}

export type EngineLoginCodeInput = (code: string) => Promise<void>;

export function engineLoginUrl(line: string): string | undefined {
  return LOGIN_URL.exec(stripVTControlCharacters(line))?.[0];
}

function stopLoginProcessTree(child: ChildProcess): void | Promise<void> {
  const { pid } = child;
  if (pid === undefined) return;
  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, (error) => {
        if (error) child.kill('SIGKILL');
        resolve();
      });
    });
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
}

function spawnEngineLogin(target: EngineCommand, args: string[], acceptsInput: boolean) {
  const spec = launch(target, args);
  return spawn(spec.file, spec.args, {
    env: spec.env,
    stdio: [acceptsInput ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
    ...(spec.windowsVerbatimArguments === true ? { windowsVerbatimArguments: true } : {}),
    shell: false,
    windowsHide: true,
  });
}

interface EngineLoginTarget extends EngineCommand, EngineLoginProcess {
  name: string;
  label: string;
  onCodeInput?(submit: EngineLoginCodeInput): void;
}

interface DeviceLoginOutput {
  onLine(line: string, url: string | undefined): number | undefined;
}

type LoginFailure = 'failed' | 'cancelled' | 'timed-out';
type DeviceLoginExit = 'completed' | LoginFailure;
type BrowserLoginStart = { url?: string };

export function startEngineLogin(
  target: EngineLoginTarget,
  args: string[],
  timeoutMs?: number,
): Promise<BrowserLoginStart>;
export function startEngineLogin(
  target: EngineLoginTarget,
  args: string[],
  output: DeviceLoginOutput,
): Promise<DeviceLoginExit>;
export function startEngineLogin(
  target: EngineLoginTarget,
  args: string[],
  output: number | DeviceLoginOutput = 10_000,
): Promise<BrowserLoginStart | DeviceLoginExit> {
  const command = `${target.name} ${args.join(' ')}`;
  const manual = target.onCodeInput !== undefined;
  const device = typeof output === 'number' ? undefined : output;
  const maxLineLength = device === undefined ? 8192 : 4096;
  return new Promise((resolve, reject) => {
    const child = spawnEngineLogin(target, args, manual);
    let acceptsCode = false;
    let exited = false;
    const stdin = child.stdin;
    if (stdin !== null) {
      stdin.on('error', () => undefined);
      target.onCodeInput?.(async (code) => {
        if (exited || !stdin.writable || child.killed || target.signal?.aborted)
          throw new EngineRefusal(
            'engine-login-not-pending',
            'Claude Code sign-in ended. Start sign-in again to submit a code.',
          );
        if (!acceptsCode)
          throw new EngineRefusal(
            'engine-code-not-requested',
            'Claude Code has not asked for a code on stdin. Use the browser callback or a Claude Code version that offers a code prompt.',
          );
        acceptsCode = false;
        await new Promise<void>((written, failed) => {
          stdin.write(`${code}\n`, (error) => {
            if (error)
              failed(
                new EngineRefusal(
                  'engine-code-delivery-failed',
                  'Could not send the code to Claude Code.',
                ),
              );
            else written();
          });
        });
      });
    }
    let tail = '';
    let settled = false;
    let failure: { kind: LoginFailure; error: EngineRefusal } | undefined;
    let termination: void | Promise<void>;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (outcome: BrowserLoginStart | DeviceLoginExit | Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (outcome instanceof Error) reject(outcome);
      else resolve(outcome);
    };
    const stop = (kind: LoginFailure, error: EngineRefusal) => {
      if (failure !== undefined) return;
      failure = { kind, error };
      clearTimeout(timer);
      termination = stopLoginProcessTree(child);
    };
    const abort = () =>
      stop('cancelled', new EngineRefusal('engine-failed', `${command} was cancelled`));
    const resetTimer = (timeoutMs: number) => {
      clearTimeout(timer);
      timer = setTimeout(
        () =>
          stop(
            'timed-out',
            new EngineRefusal(
              'engine-failed',
              `${command} did not print a sign-in URL${tail.trim() ? `: ${tail.trim()}` : ''}`,
            ),
          ),
        timeoutMs,
      );
    };
    resetTimer(typeof output === 'number' ? output : 10_000);
    const readLine = (line: string) => {
      if (settled || failure !== undefined) return;
      if (device !== undefined) {
        const text = line.slice(-maxLineLength);
        const expiresIn = device.onLine(stripVTControlCharacters(text), engineLoginUrl(text));
        if (expiresIn !== undefined) resetTimer(expiresIn);
      } else {
        if (!manual) tail = `${tail}${line}\n`.slice(-2000);
        const url = engineLoginUrl(line);
        if (url !== undefined) finish({ url });
      }
    };
    const read = (stream: ChildProcess['stdout']) => {
      let partial = '';
      let promptTail = '';
      stream?.setEncoding('utf8').on('data', (output: string) => {
        if (manual) {
          const prompt = promptTail + output;
          if (CODE_PROMPT.test(prompt)) {
            acceptsCode = true;
            promptTail = '';
          } else promptTail = prompt.slice(-160);
        }
        if (settled || failure !== undefined) return;
        const lines = (partial + output).split(/\r?\n/u);
        partial = (lines.pop() ?? '').slice(-maxLineLength);
        for (const line of lines) readLine(line);
      });
      if (device !== undefined) stream?.on('end', () => readLine(partial));
    };
    read(child.stdout);
    read(child.stderr);
    child.on('error', (error: NodeJS.ErrnoException) => {
      if (failure !== undefined) return;
      const refusal =
        error.code === 'ENOENT'
          ? new EngineRefusal(
              'engine-not-installed',
              `${target.label} is not installed on this computer`,
            )
          : new EngineRefusal(
              'engine-failed',
              `${command} did not start${manual || device !== undefined ? '' : `: ${error.message}`}`,
            );
      stop('failed', refusal);
    });
    child.on('close', (code) => {
      exited = true;
      target.signal?.removeEventListener('abort', abort);
      void Promise.resolve(termination).then(() => {
        target.onExit?.();
        if (device !== undefined) finish(failure?.kind ?? (code === 0 ? 'completed' : 'failed'));
        else if (failure !== undefined) finish(failure.error);
        else if (code === 0) finish({});
        else
          finish(
            new EngineRefusal(
              'engine-failed',
              `${command} exited (${String(code)}) before sign-in started${tail.trim() ? `: ${tail.trim()}` : ''}`,
            ),
          );
      });
    });
    if (target.signal?.aborted) abort();
    else target.signal?.addEventListener('abort', abort, { once: true });
    child.unref();
  });
}
