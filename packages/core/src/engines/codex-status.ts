import { mkdirSync } from 'node:fs';

import {
  type EngineCommand,
  engineLoginUrl,
  engineVersion,
  runEngineCommand,
  startEngineLogin,
} from './engine-command.js';

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

function target(options: CodexCommandOptions): EngineCommand {
  return {
    command: options.command,
    ...(options.env === undefined ? {} : { env: options.env }),
    extraEnv: { CODEX_HOME: options.home },
  };
}

export const codexVersion = engineVersion;

export function parseCodexLoginStatus(output: string): CodexLogin {
  if (/logged in using chatgpt/iu.test(output)) return 'chatgpt';
  if (/logged in using an? api key|api key configured/iu.test(output)) return 'api-key';
  if (/not logged in/iu.test(output)) return 'signed-out';
  return 'unknown';
}

export async function detectCodex(options: CodexCommandOptions): Promise<CodexStatus> {
  const version = await runEngineCommand(target(options), ['--version']);
  if (version.missing) return { installed: false, login: 'unknown' };
  if (!version.ok) return { installed: true, login: 'unknown' };
  mkdirSync(options.home, { recursive: true });
  const status = await runEngineCommand(target(options), ['login', 'status']);
  const login = parseCodexLoginStatus(status.output);
  return {
    installed: true,
    version: codexVersion(version.output),
    login: status.ok || login === 'signed-out' ? login : 'unknown',
  };
}

export const codexLoginUrl = engineLoginUrl;

export function startCodexLogin(
  options: CodexCommandOptions,
  timeoutMs = 10_000,
): Promise<{ url?: string }> {
  mkdirSync(options.home, { recursive: true });
  return startEngineLogin(
    { ...target(options), name: 'codex', label: 'Codex' },
    ['login'],
    timeoutMs,
  );
}
