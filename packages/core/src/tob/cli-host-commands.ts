import { BROKER_CLI_READS, cliEffects } from '../bots/cli-effects.js';
import { canonicalCliCommandName } from '../bots/cli-command-names.js';
export { BROKER_CLI_READS as TOB_HOST_CLI_READS } from '../bots/cli-effects.js';
import { parseBotCliArgs } from '../bots/cli-options.js';
import { ownsBot } from '../team/bot-access.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { ChannelStore } from '../channels/store.js';
import type { HumanContext } from '../humans/context.js';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PrepareTobOperation, TobCliCapability } from './cli-operations.js';
import { TobError } from './service.js';

const REFUSED_OPTIONS = ['--host', '--token-file', '--home', '--as', '--administration'];
const REFUSED_COMMANDS = new Set(['ssh-tunnel', 'voice-local-kit', 'audit', 'private', 'tob-cli']);
const MAX_ARGS = 256;
const MAX_ARG_BYTES = 64 * 1024;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const MAX_MESSAGE_CHARS = 4000;

export const TOB_HOST_CLI_CAPABILITY: TobCliCapability = {
  command: 'cli',
  description:
    'Every other deepseekbot command runs on this Host as the Human would run it. Reads run at once; every other command shows the Human an approval card with the exact command first.',
  write: true,
};

export const TOB_HOST_CLI_ERROR_CODES = ['cli-command-failed', 'cli-command-refused'] as const;

export class TobCliCommandError extends TobError {
  constructor(
    readonly commandCode: string,
    readonly detail: string,
  ) {
    super('cli-command-failed');
  }
}

export interface TobHostCliResult {
  exitCode: number;
  stdout: string;
}
export interface TobHostCliRunner {
  (input: {
    argv: readonly string[];
    stdin: string;
    cwd: string | undefined;
    signal: AbortSignal | undefined;
  }): Promise<TobHostCliResult>;
}

function hasOption(argv: readonly string[], name: string): boolean {
  return argv.some((arg) => arg === name || arg.startsWith(`${name}=`));
}

export function authorizeTobBotTargets(
  args: Record<string, unknown>,
  deps: {
    registry: Pick<PersonaBotRegistry, 'getHistorical'>;
    channels: Pick<ChannelStore, 'get'>;
    human: HumanContext;
  },
): void {
  const targets: unknown[] = [];
  for (const field of [
    'slug',
    'botSlug',
    'botId',
    'channelId',
    'sourceBotSlug',
    'targetBotSlug',
    'sourceChannelId',
    'targetChannelId',
  ]) {
    targets.push(args[field]);
  }
  if (Array.isArray(args['members'])) {
    if (args['members'].length > 100) throw new TobError('invalid-request');
    targets.push(...args['members']);
  }
  for (const value of targets) {
    if (typeof value !== 'string') continue;
    const id = value.trim();
    const bot = deps.registry.getHistorical(id);
    if (bot && !ownsBot(deps.human, bot)) throw new TobError('permission-required');
    const channel = deps.channels.get(id);
    if (
      channel?.type === 'dm' &&
      channel.members.some((slug) => {
        const participant = deps.registry.getHistorical(slug);
        return participant && !ownsBot(deps.human, participant);
      })
    )
      throw new TobError('permission-required');
  }
}

export function authorizeTobHostCli(
  argv: readonly string[],
  deps: {
    registry: Pick<PersonaBotRegistry, 'getHistorical'>;
    channels: Pick<ChannelStore, 'get'>;
    human: HumanContext;
  },
): void {
  if (argv[0] === 'members') {
    let action: string | undefined;
    try {
      action = parseBotCliArgs(argv).positionals[1];
    } catch {
      throw new TobError('invalid-request');
    }
    if (action === 'transfer' || action === 'purge') throw new TobError('permission-required');
  }
  for (const token of argv.slice(1)) {
    const value = token.includes('=') ? token.slice(token.indexOf('=') + 1) : token;
    authorizeTobBotTargets({ slug: value }, deps);
  }
}

export function classifyTobHostCli(argv: readonly string[]): { command: string; write: boolean } {
  const command = argv[0];
  if (command === undefined || command.startsWith('-')) throw new TobError('invalid-request');
  if (REFUSED_COMMANDS.has(command) || REFUSED_OPTIONS.some((name) => hasOption(argv, name)))
    throw new TobError('cli-command-refused');
  return {
    command,
    write:
      !BROKER_CLI_READS.has(canonicalCliCommandName(command)) ||
      cliEffects(argv)?.changes !== 'none' ||
      hasOption(argv, '--out'),
  };
}

function input(args: Record<string, unknown>): { argv: string[]; stdin: string; cwd?: string } {
  const allowed = new Set(['argv', 'stdin', 'cwd']);
  if (Object.keys(args).some((key) => !allowed.has(key))) throw new TobError('invalid-request');
  const { argv, stdin, cwd } = args;
  if (
    !Array.isArray(argv) ||
    argv.length === 0 ||
    argv.length > MAX_ARGS ||
    argv.some((arg) => typeof arg !== 'string' || Buffer.byteLength(arg) > MAX_ARG_BYTES)
  )
    throw new TobError('invalid-request');
  if (stdin !== undefined && typeof stdin !== 'string') throw new TobError('invalid-request');
  if (cwd !== undefined) {
    if (typeof cwd !== 'string' || !isAbsolute(cwd)) throw new TobError('invalid-request');
    try {
      if (!statSync(cwd).isDirectory()) throw new TobError('invalid-request');
    } catch {
      throw new TobError('invalid-request');
    }
  }
  return {
    argv: argv as string[],
    stdin: stdin ?? '',
    ...(cwd === undefined ? {} : { cwd: cwd as string }),
  };
}

function outcome(result: TobHostCliResult, scrub: (text: string) => string): unknown {
  const text = scrub(result.stdout).trim();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {}
  if (result.exitCode === 0) return parsed;
  const error =
    typeof parsed === 'object' && parsed !== null
      ? (parsed as { error?: { code?: unknown; message?: unknown } }).error
      : undefined;
  throw new TobCliCommandError(
    typeof error?.code === 'string' ? error.code : 'cli-command-failed',
    (typeof error?.message === 'string' ? error.message : text || 'The command failed.').slice(
      0,
      MAX_MESSAGE_CHARS,
    ),
  );
}

export function createTobHostCliOperations(deps: {
  run: TobHostCliRunner;
  authorize?: (argv: readonly string[]) => void;
  scrub?: (text: string) => string;
}): PrepareTobOperation {
  const scrub = deps.scrub ?? ((text: string) => text);
  return (command, args, signal) => {
    if (command !== 'cli') return undefined;
    const request = input(args);
    const { command: name, write } = classifyTobHostCli(request.argv);
    deps.authorize?.(request.argv);
    const execute = async (guard: () => void, beforeEffect?: () => void) => {
      guard();
      deps.authorize?.(request.argv);
      if (write) beforeEffect?.();
      let result: TobHostCliResult;
      try {
        result = await deps.run({
          argv: request.argv,
          stdin: request.stdin,
          cwd: request.cwd,
          signal,
        });
      } catch (error) {
        if (error instanceof TobError && error.code === 'request-too-large') throw error;
        throw new TobError(
          signal?.aborted
            ? write
              ? 'operation-outcome-uncertain'
              : 'operation-cancelled'
            : write
              ? 'operation-outcome-uncertain'
              : 'operation-failed',
        );
      }
      return outcome(result, scrub);
    };
    if (!write) return { run: (guard) => execute(guard) };
    return {
      proposal: {
        command: name,
        target: name,
        via: 'cli',
        previousValue: null,
        patch: {
          argv: request.argv,
          ...(request.cwd === undefined ? {} : { cwd: request.cwd }),
          ...(request.stdin === ''
            ? {}
            : {
                stdinBytes: Buffer.byteLength(request.stdin),
                stdinSha256: createHash('sha256').update(request.stdin).digest('hex'),
              }),
        },
      },
      run: execute,
    };
  };
}

export function spawnHostCli(options: {
  modulePath: () => string;
  host: () => { origin: string; token: string } | undefined;
}): TobHostCliRunner {
  return ({ argv, stdin, cwd, signal }) =>
    new Promise((resolve, reject) => {
      let target: { origin: string; token: string } | undefined;
      let modulePath: string;
      try {
        target = options.host();
        modulePath = options.modulePath();
      } catch {
        target = undefined;
        modulePath = '';
      }
      if (!target) {
        reject(new TobError('operation-failed'));
        return;
      }
      const token = target.token;
      const env: NodeJS.ProcessEnv = { ...process.env };
      for (const key of Object.keys(env))
        if (key.startsWith('DEEPSEEKBOT_') || key === 'DSH_HOME') delete env[key];
      env['DEEPSEEKBOT_HOST'] = target.origin;
      env['DEEPSEEKBOT_HOST_TOKEN'] = target.token;
      const code = `import { runBotCreateCli } from ${JSON.stringify(
        pathToFileURL(modulePath).href,
      )};\nprocess.exitCode = await runBotCreateCli(process.argv.slice(1), { env: process.env, stdout: (text) => process.stdout.write(text + '\\n'), stderr: () => {}, readStdin: async () => { const chunks = []; for await (const chunk of process.stdin) chunks.push(chunk); return Buffer.concat(chunks).toString('utf8'); } });\n`;
      const child = spawn(process.execPath, ['--input-type=module', '-e', code, '--', ...argv], {
        env,
        ...(cwd === undefined ? {} : { cwd }),
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'ignore'],
        ...(signal === undefined ? {} : { signal }),
      });
      const chunks: Buffer[] = [];
      let bytes = 0;
      child.stdout.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_OUTPUT_BYTES) {
          child.kill();
          return;
        }
        chunks.push(chunk);
      });
      child.once('error', reject);
      child.once('close', (exitCode) => {
        if (bytes > MAX_OUTPUT_BYTES) {
          reject(new TobError('request-too-large'));
          return;
        }
        resolve({
          exitCode: exitCode ?? 1,
          stdout: Buffer.concat(chunks)
            .toString('utf8')
            .replaceAll(token, '[redacted]')
            .replaceAll(encodeURIComponent(token), '[redacted]'),
        });
      });
      child.stdin.on('error', () => {});
      child.stdin.end(stdin);
    });
}
