import { execFile, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

import { engineLaunch } from './engine-launch.js';
import { EngineRefusal, engineEnvironment } from './engine-session.js';

export type CodexLogin = 'chatgpt' | 'api-key' | 'signed-out' | 'unknown';

export interface CodexStatus {
  installed: boolean;
  version?: string;
  login: CodexLogin;
}

export interface CodexCommandOptions {
  command: string;
  home: string;
  env?: Readonly<Record<string, string | undefined>>;
}

function launch(options: CodexCommandOptions, args: string[]) {
  const env = options.env ?? process.env;
  return {
    ...engineLaunch(options.command, args, { env }),
    env: engineEnvironment(env, { CODEX_HOME: options.home }),
  };
}

function run(
  options: CodexCommandOptions,
  args: string[],
): Promise<{ ok: boolean; output: string; missing: boolean }> {
  const target = launch(options, args);
  return new Promise((resolve) => {
    execFile(
      target.file,
      target.args,
      {
        env: target.env,
        timeout: 15_000,
        windowsHide: true,
        ...(target.windowsVerbatimArguments === true ? { windowsVerbatimArguments: true } : {}),
      },
      (error, stdout, stderr) => {
        const code = error !== null && 'code' in error ? error.code : undefined;
        resolve({
          ok: error === null,
          output: `${stdout}\n${stderr}`,
          missing: code === 'ENOENT',
        });
      },
    );
  });
}

export function parseCodexLoginStatus(output: string): CodexLogin {
  if (/logged in using chatgpt/iu.test(output)) return 'chatgpt';
  if (/logged in using an? api key|api key configured/iu.test(output)) return 'api-key';
  if (/not logged in/iu.test(output)) return 'signed-out';
  return 'unknown';
}

export async function detectCodex(options: CodexCommandOptions): Promise<CodexStatus> {
  const version = await run(options, ['--version']);
  if (version.missing) return { installed: false, login: 'unknown' };
  if (!version.ok) return { installed: true, login: 'unknown' };
  mkdirSync(options.home, { recursive: true });
  const status = await run(options, ['login', 'status']);
  const login = parseCodexLoginStatus(status.output);
  return {
    installed: true,
    version: version.output.trim().split(/\s+/u).pop() ?? '',
    login: status.ok || login === 'signed-out' ? login : 'unknown',
  };
}

const LOGIN_URL = /https:\/\/\S+/u;

export function codexLoginUrl(line: string): string | undefined {
  return LOGIN_URL.exec(line)?.[0];
}

export function startCodexLogin(
  options: CodexCommandOptions,
  timeoutMs = 10_000,
): Promise<{ url?: string }> {
  mkdirSync(options.home, { recursive: true });
  const target = launch(options, ['login']);
  return new Promise((resolve, reject) => {
    const child = spawn(target.file, target.args, {
      env: target.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      ...(target.windowsVerbatimArguments === true ? { windowsVerbatimArguments: true } : {}),
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
          `codex login did not print a sign-in URL${tail.trim() ? `: ${tail.trim()}` : ''}`,
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
          const url = codexLoginUrl(line);
          if (url !== undefined) finish({ url });
        }
      };
    };
    child.stdout.on('data', reader());
    child.stderr.on('data', reader());
    child.on('error', (error: NodeJS.ErrnoException) =>
      finish(
        error.code === 'ENOENT'
          ? new EngineRefusal('engine-not-installed', 'Codex is not installed on this computer')
          : new EngineRefusal('engine-failed', `codex login did not start: ${error.message}`),
      ),
    );
    child.on('close', (code) => {
      if (code === 0) finish({});
      else
        finish(
          new EngineRefusal(
            'engine-failed',
            `codex login exited (${String(code)}) before sign-in started${tail.trim() ? `: ${tail.trim()}` : ''}`,
          ),
        );
    });
    child.unref();
  });
}
