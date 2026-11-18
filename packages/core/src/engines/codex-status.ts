import { execFile, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

import { engineEnvironment } from './engine-session.js';

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

function run(
  options: CodexCommandOptions,
  args: string[],
): Promise<{ ok: boolean; output: string; missing: boolean }> {
  return new Promise((resolve) => {
    execFile(
      options.command,
      args,
      {
        env: engineEnvironment(options.env ?? process.env, { CODEX_HOME: options.home }),
        timeout: 15_000,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const code = (error as NodeJS.ErrnoException | null)?.code;
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
  if (/logged in using an? api key/iu.test(output)) return 'api-key';
  if (/not logged in/iu.test(output)) return 'signed-out';
  return 'unknown';
}

export async function detectCodex(options: CodexCommandOptions): Promise<CodexStatus> {
  const version = await run(options, ['--version']);
  if (version.missing || !version.ok) return { installed: false, login: 'unknown' };
  mkdirSync(options.home, { recursive: true });
  const status = await run(options, ['login', 'status']);
  return {
    installed: true,
    version: version.output.trim().split(/\s+/u).pop() ?? '',
    login: parseCodexLoginStatus(status.output),
  };
}

export function startCodexLogin(options: CodexCommandOptions): Promise<{ url?: string }> {
  mkdirSync(options.home, { recursive: true });
  return new Promise((resolve, reject) => {
    const child = spawn(options.command, ['login'], {
      env: engineEnvironment(options.env ?? process.env, { CODEX_HOME: options.home }),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let output = '';
    let settled = false;
    const settle = (url?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(url === undefined ? {} : { url });
    };
    const timer = setTimeout(() => settle(), 10_000);
    const read = (chunk: Buffer) => {
      output += chunk.toString('utf8');
      const url = /https:\/\/\S+/u.exec(output)?.[0];
      if (url !== undefined) settle(url);
    };
    child.stdout.on('data', read);
    child.stderr.on('data', read);
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', () => settle());
    child.unref();
  });
}
