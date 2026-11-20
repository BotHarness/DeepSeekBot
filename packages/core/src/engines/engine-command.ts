import { execFile, spawn } from 'node:child_process';
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

export function startEngineLogin(
  target: EngineCommand &
    EngineLoginProcess & {
      name: string;
      label: string;
      onCodeInput?(submit: EngineLoginCodeInput): void;
    },
  args: string[],
  timeoutMs = 10_000,
): Promise<{ url?: string }> {
  const spec = launch(target, args);
  const command = `${target.name} ${args.join(' ')}`;
  const manual = target.onCodeInput !== undefined;
  return new Promise((resolve, reject) => {
    const child = spawn(spec.file, spec.args, {
      env: spec.env,
      stdio: [manual ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      ...(target.signal === undefined ? {} : { signal: target.signal }),
      ...(spec.windowsVerbatimArguments === true ? { windowsVerbatimArguments: true } : {}),
      shell: false,
      windowsHide: true,
    });
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
    const finish = (outcome: { url?: string } | Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (outcome instanceof Error) reject(outcome);
      else resolve(outcome);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(
        new EngineRefusal(
          'engine-failed',
          `${command} did not print a sign-in URL${tail.trim() ? `: ${tail.trim()}` : ''}`,
        ),
      );
    }, timeoutMs);
    const reader = () => {
      let partial = '';
      let promptTail = '';
      return (chunk: Buffer) => {
        const output = chunk.toString('utf8');
        if (manual) {
          const prompt = promptTail + output;
          if (CODE_PROMPT.test(prompt)) {
            acceptsCode = true;
            promptTail = '';
          } else promptTail = prompt.slice(-160);
        }
        if (settled) return;
        const text = partial + output;
        const lines = text.split(/\r?\n/u);
        partial = (lines.pop() ?? '').slice(-8192);
        for (const line of lines) {
          if (!manual) tail = `${tail}${line}\n`.slice(-2000);
          const url = engineLoginUrl(line);
          if (url !== undefined) finish({ url });
        }
      };
    };
    child.stdout?.on('data', reader());
    child.stderr?.on('data', reader());
    child.on('error', (error: NodeJS.ErrnoException) =>
      finish(
        error.code === 'ENOENT'
          ? new EngineRefusal(
              'engine-not-installed',
              `${target.label} is not installed on this computer`,
            )
          : new EngineRefusal(
              'engine-failed',
              `${command} did not start${manual ? '' : `: ${error.message}`}`,
            ),
      ),
    );
    child.on('close', (code) => {
      exited = true;
      target.onExit?.();
      if (code === 0) finish({});
      else
        finish(
          new EngineRefusal(
            'engine-failed',
            `${command} exited (${String(code)}) before sign-in started${tail.trim() ? `: ${tail.trim()}` : ''}`,
          ),
        );
    });
    child.unref();
  });
}
