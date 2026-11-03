import { spawn } from 'node:child_process';
import { PrivateInputFailure } from './diagnostics.js';

export class SecretCommandRefusal extends Error {}

export interface SecretCommandResult {
  consumer: 'command-v1';
  successful: boolean;
  exitCode: number | null;
  exitSignal?: string;
  stdout: string;
  stderr: string;
  truncated: boolean;
}

export const SECRET_COMMAND_OUTPUT_LIMIT = 32_000;
export const SECRET_COMMAND_TIMEOUT_MS = 120_000;

const INTERPRETERS = new Set([
  'sh',
  'bash',
  'zsh',
  'fish',
  'dash',
  'ksh',
  'csh',
  'tcsh',
  'pwsh',
  'powershell',
  'cmd',
  'env',
  'printenv',
  'xargs',
  'sudo',
  'doas',
  'su',
  'nohup',
  'time',
  'timeout',
  'watch',
  'node',
  'nodejs',
  'deno',
  'bun',
  'npx',
  'python',
  'python2',
  'python3',
  'ruby',
  'perl',
  'php',
  'lua',
  'awk',
  'gawk',
  'sed',
  'osascript',
  'make',
  'find',
]);

const RESERVED_ENV =
  /^(?:PATH|HOME|USER|SHELL|IFS|ENV|BASH_ENV|TMPDIR|TERM|LANG|PWD|NODE_OPTIONS|PYTHONPATH|PYTHONSTARTUP|PERL5OPT|RUBYOPT|GIT_SSH_COMMAND|GIT_ASKPASS|SSH_ASKPASS|EDITOR|VISUAL|PAGER|LD_.*|DYLD_.*|LC_.*)$/;

export function secretCommandProgram(program: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/.test(program))
    throw new SecretCommandRefusal('program must be a bare program name without a path');
  if (INTERPRETERS.has(program.toLowerCase().replace(/\.(?:exe|cmd|bat)$/, '')))
    throw new SecretCommandRefusal(
      'program is a shell, interpreter or launcher; name the command-line tool itself',
    );
  return program;
}

export function secretCommandArgs(args: readonly string[]): string[] {
  if (args.length > 64) throw new SecretCommandRefusal('at most 64 arguments are allowed');
  for (const arg of args)
    if (arg.length > 4_000 || arg.includes('\0'))
      throw new SecretCommandRefusal('an argument is too long or contains a NUL byte');
  return [...args];
}

export function secretCommandEnvName(name: string): string {
  if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(name) || RESERVED_ENV.test(name))
    throw new SecretCommandRefusal(
      'environment variable name is not allowed; use the name the tool documents for its credential',
    );
  return name;
}

const PLACEHOLDER = /\{\{[a-z][a-z0-9_]{0,47}\}\}/;

export function secretCommandPlan(input: {
  program: string;
  args: readonly string[];
  env: readonly { name: string; value: string }[];
}): { command: string[]; names: string[] } {
  const command = [secretCommandProgram(input.program), ...secretCommandArgs(input.args)];
  const names = input.env.map((entry) => secretCommandEnvName(entry.name));
  if (
    input.env.length === 0 ||
    input.env.length > 16 ||
    new Set(names).size !== names.length ||
    !input.env.some((entry) => PLACEHOLDER.test(entry.value))
  )
    throw new SecretCommandRefusal(
      'env must hold 1–16 distinct variables and at least one {{field_id}} placeholder',
    );
  if (command.some((part) => PLACEHOLDER.test(part)))
    throw new SecretCommandRefusal(
      'a secret placeholder is allowed only in env values, never in arguments',
    );
  return { command, names };
}

export function secretCommandDenial(args: unknown): string | undefined {
  if (typeof args !== 'object' || args === null) return 'secret_cli arguments are invalid';
  const input = args as { program?: unknown; args?: unknown; env?: unknown };
  if (
    typeof input.program !== 'string' ||
    !Array.isArray(input.args) ||
    !input.args.every((arg) => typeof arg === 'string') ||
    !Array.isArray(input.env) ||
    !input.env.every(
      (entry: unknown) =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as { name?: unknown }).name === 'string' &&
        typeof (entry as { value?: unknown }).value === 'string',
    )
  )
    return 'secret_cli arguments are invalid';
  try {
    secretCommandPlan(input as Parameters<typeof secretCommandPlan>[0]);
    return undefined;
  } catch (error) {
    if (error instanceof SecretCommandRefusal) return 'secret_cli refused: ' + error.message;
    throw error;
  }
}

export function secretCommandBaseEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const kept =
    process.platform === 'win32'
      ? ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP']
      : ['PATH', 'HOME', 'USER', 'LANG', 'TMPDIR'];
  const env: NodeJS.ProcessEnv = { TERM: 'dumb', NO_COLOR: '1' };
  for (const name of kept) if (source[name] !== undefined) env[name] = source[name];
  return env;
}

export function maskSecrets(text: string, secrets: readonly string[]): string {
  let masked = text;
  for (const secret of secrets) {
    if (secret.length < 6) continue;
    for (const form of new Set([
      secret,
      Buffer.from(secret, 'utf8').toString('base64'),
      Buffer.from(secret, 'utf8').toString('base64').replace(/=+$/, ''),
      Buffer.from(secret, 'utf8').toString('base64url'),
      Buffer.from(secret, 'utf8').toString('hex'),
      encodeURIComponent(secret),
    ]))
      masked = masked.split(form).join('[secret]');
  }
  return masked;
}

export function runSecretCommand(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
  secrets: readonly string[],
  signal: AbortSignal,
  timeoutMs = SECRET_COMMAND_TIMEOUT_MS,
): Promise<SecretCommandResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted || argv[0] === undefined) {
      reject(new PrivateInputFailure('The command was cancelled before it started.', 'cancelled'));
      return;
    }
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const output = { stdout: '', stderr: '' };
    let truncated = false;
    let stopped: 'timeout' | 'cancelled' | undefined;
    const stop = (reason: 'timeout' | 'cancelled') => {
      stopped ??= reason;
      child.kill('SIGKILL');
    };
    const timer = setTimeout(() => stop('timeout'), timeoutMs);
    const abort = () => stop('cancelled');
    signal.addEventListener('abort', abort, { once: true });
    for (const stream of ['stdout', 'stderr'] as const)
      child[stream].on('data', (chunk: Buffer) => {
        const room = SECRET_COMMAND_OUTPUT_LIMIT * 4 - output[stream].length;
        if (room <= 0) {
          truncated = true;
          return;
        }
        output[stream] += chunk.toString('utf8').slice(0, room);
      });
    child.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(
        new SecretCommandRefusal(
          `the program could not be started (${typeof error.code === 'string' ? error.code : error.name}); is it installed and allowed by the Shell sandbox?`,
        ),
      );
    });
    child.on('close', (code, exitSignal) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      if (stopped !== undefined) {
        reject(
          new PrivateInputFailure(
            stopped === 'timeout'
              ? `The command did not finish within ${timeoutMs / 1000} seconds and was stopped.`
              : 'The command was cancelled before it finished.',
            stopped,
          ),
        );
        return;
      }
      const clip = (text: string): string => {
        const masked = maskSecrets(text, secrets);
        if (masked.length <= SECRET_COMMAND_OUTPUT_LIMIT) return masked;
        truncated = true;
        return masked.slice(0, SECRET_COMMAND_OUTPUT_LIMIT);
      };
      const stdout = clip(output.stdout);
      const stderr = clip(output.stderr);
      resolve({
        consumer: 'command-v1',
        successful: code === 0,
        exitCode: code,
        ...(code === null && exitSignal !== null ? { exitSignal } : {}),
        stdout,
        stderr,
        truncated,
      });
    });
  });
}
