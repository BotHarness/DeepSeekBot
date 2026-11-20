import { execFile, spawn } from 'node:child_process';

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

export function engineLoginUrl(line: string): string | undefined {
  return LOGIN_URL.exec(line)?.[0];
}

export function startEngineLogin(
  target: EngineCommand & { name: string; label: string },
  args: string[],
  timeoutMs = 10_000,
): Promise<{ url?: string }> {
  const spec = launch(target, args);
  const command = `${target.name} ${args.join(' ')}`;
  return new Promise((resolve, reject) => {
    const child = spawn(spec.file, spec.args, {
      env: spec.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...(spec.windowsVerbatimArguments === true ? { windowsVerbatimArguments: true } : {}),
      shell: false,
      windowsHide: true,
    });
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
      return (chunk: Buffer) => {
        const text = partial + chunk.toString('utf8');
        const lines = text.split(/\r?\n/u);
        partial = lines.pop() ?? '';
        for (const line of lines) {
          tail = `${tail}${line}\n`.slice(-2000);
          const url = engineLoginUrl(line);
          if (url !== undefined) finish({ url });
        }
      };
    };
    child.stdout.on('data', reader());
    child.stderr.on('data', reader());
    child.on('error', (error: NodeJS.ErrnoException) =>
      finish(
        error.code === 'ENOENT'
          ? new EngineRefusal(
              'engine-not-installed',
              `${target.label} is not installed on this computer`,
            )
          : new EngineRefusal('engine-failed', `${command} did not start: ${error.message}`),
      ),
    );
    child.on('close', (code) => {
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
