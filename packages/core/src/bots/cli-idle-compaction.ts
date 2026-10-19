import { CliLiveError } from './cli-live-error.js';
import { MAX_CACHE_LIFETIME_SECONDS } from '../runtime/idle-compaction-settings.js';

type Rpc = (method: string, payload: Record<string, unknown>) => Promise<unknown>;

export const IDLE_COMPACTION_COMMANDS = [
  {
    command: 'idle-compaction',
    description:
      'show whether idle Orchestrator Sessions are compacted while their prompt cache is warm, and each route’s cache lifetime',
  },
  {
    command: 'idle-compaction-set',
    description: 'turn idle compaction on or off for every Bot (on | off)',
  },
  {
    command: 'idle-compaction-cache-set',
    description:
      'set one route’s prompt-cache lifetime in seconds (<provider>/<model> <seconds>), or `auto` to resolve it again',
  },
] as const;

type Command = (typeof IDLE_COMPACTION_COMMANDS)[number]['command'];

export function isIdleCompactionCommand(command: string): command is Command {
  return IDLE_COMPACTION_COMMANDS.some((entry) => entry.command === command);
}

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}

export async function runIdleCompactionCommand(
  command: Command,
  rest: string[],
  connect: () => Promise<Rpc>,
): Promise<unknown> {
  if (command === 'idle-compaction') {
    if (rest.length !== 0) usage('idle-compaction takes no arguments.');
    return (await connect())('idleCompaction', {});
  }
  if (command === 'idle-compaction-set') {
    const value = rest.length === 1 ? rest[0]!.trim() : '';
    if (value !== 'on' && value !== 'off') usage('idle-compaction-set needs exactly on or off.');
    return (await connect())('idleCompactionSet', { enabled: value === 'on' });
  }
  if (rest.length !== 2)
    usage('idle-compaction-cache-set needs <provider>/<model> and <seconds> or auto.');
  const route = rest[0]!.trim();
  const slash = route.indexOf('/');
  const provider = slash < 0 ? '' : route.slice(0, slash).trim();
  const model = slash < 0 ? '' : route.slice(slash + 1).trim();
  if (!provider || !model)
    usage('idle-compaction-cache-set needs <provider>/<model>, for example deepseek/<model>.');
  const value = rest[1]!.trim();
  let seconds: number | null = null;
  if (value !== 'auto') {
    if (!/^\d+$/u.test(value) || Number(value) > MAX_CACHE_LIFETIME_SECONDS)
      usage(
        `idle-compaction-cache-set needs whole seconds from 0 to ${MAX_CACHE_LIFETIME_SECONDS}, or auto.`,
      );
    seconds = Number(value);
  }
  return (await connect())('idleCompactionCacheLifetimeSet', { provider, model, seconds });
}
