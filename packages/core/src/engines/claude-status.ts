import { mkdirSync } from 'node:fs';

import {
  type EngineCommand,
  type EngineLoginCodeInput,
  type EngineLoginProcess,
  engineVersion,
  runEngineCommand,
  startEngineLogin,
} from './engine-command.js';

export type ClaudeLogin = 'subscription' | 'api-key' | 'signed-out' | 'unknown';

export interface ClaudeStatus {
  installed: boolean;
  version?: string;
  login: ClaudeLogin;
}

export interface ClaudeCommandOptions {
  command: string;
  home: string;
  env?: Readonly<Record<string, string | undefined>>;
}

export function claudeCommandTarget(options: ClaudeCommandOptions): EngineCommand {
  return {
    command: options.command,
    ...(options.env === undefined ? {} : { env: options.env }),
    extraEnv: { CLAUDE_CONFIG_DIR: options.home },
  };
}

const METERED_METHODS = new Set(['console', 'api_key', 'apikey', 'api-key']);

export function parseClaudeAuthStatus(output: string): ClaudeLogin {
  let value: unknown;
  try {
    value = JSON.parse(output.trim());
  } catch {
    return 'unknown';
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'unknown';
  const status = value as Record<string, unknown>;
  if (status['loggedIn'] === false) return 'signed-out';
  if (status['loggedIn'] !== true) return 'unknown';
  const provider = status['apiProvider'];
  if (provider !== undefined && provider !== 'firstParty') return 'api-key';
  const method = typeof status['authMethod'] === 'string' ? status['authMethod'].toLowerCase() : '';
  if (METERED_METHODS.has(method)) return 'api-key';
  const keySource = status['apiKeySource'];
  if (typeof keySource === 'string' && keySource !== 'none') return 'api-key';
  if (typeof status['subscriptionType'] === 'string' && status['subscriptionType'] !== '')
    return 'subscription';
  if (method === 'claude.ai') return 'subscription';
  return 'unknown';
}

export async function detectClaude(options: ClaudeCommandOptions): Promise<ClaudeStatus> {
  const version = await runEngineCommand(claudeCommandTarget(options), ['--version']);
  if (version.missing) return { installed: false, login: 'unknown' };
  if (!version.ok) return { installed: true, login: 'unknown' };
  mkdirSync(options.home, { recursive: true });
  const status = await runEngineCommand(claudeCommandTarget(options), ['auth', 'status', '--json']);
  const login = parseClaudeAuthStatus(status.stdout);
  return {
    installed: true,
    version: engineVersion(version.output),
    login: status.ok || login === 'signed-out' ? login : 'unknown',
  };
}

export function startClaudeLogin(
  options: ClaudeCommandOptions &
    EngineLoginProcess & { onCodeInput?(submit: EngineLoginCodeInput): void },
  timeoutMs = 10_000,
): Promise<{ url?: string }> {
  mkdirSync(options.home, { recursive: true });
  return startEngineLogin(
    {
      ...claudeCommandTarget(options),
      name: 'claude',
      label: 'Claude Code',
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.onExit === undefined ? {} : { onExit: options.onExit }),
      ...(options.onCodeInput === undefined ? {} : { onCodeInput: options.onCodeInput }),
    },
    ['auth', 'login', '--claudeai'],
    timeoutMs,
  );
}
