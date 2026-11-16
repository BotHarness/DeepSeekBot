import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';
import { tobCliCommandSchema } from '../tob/cli-request.js';

export const TOB_CLI_COMMANDS = [
  {
    command: 'tob-cli',
    tool: 'deepseekbot_cli',
    description: 'start, inspect or cancel an owned model-free Tob CLI request',
  },
] as const;
export async function runTobCli(
  rest: string[],
  values: { 'args-stdin'?: boolean },
  io: BotCreateCliIo,
  connect: () => Promise<{ rpc: <T>(method: string, args: Record<string, unknown>) => Promise<T> }>,
): Promise<unknown> {
  const allowed = new Set(['host', 'token-file', 'timeout', 'compact', 'args-stdin']);
  if (Object.entries(values).some(([key, value]) => value !== undefined && !allowed.has(key)))
    throw new CliLiveError(
      'agent-scope-denied',
      'Tob CLI requests do not accept authority-selection or unrelated flags.',
    );
  const [action, id] = rest;
  if (action === 'start' && rest.length === 1 && values['args-stdin'] === true) {
    let input: unknown;
    try {
      input = JSON.parse((await io.readStdin?.()) ?? '');
    } catch {
      throw new CliLiveError('usage', '--args-stdin must contain a typed CLI request.');
    }
    const parsed = tobCliCommandSchema.safeParse(input);
    if (!parsed.success)
      throw new CliLiveError(
        'invalid-input',
        'Expected bounded argv and optional stdin; actor, source, Session and cwd are not accepted.',
      );
    return (await connect()).rpc('tobCli', { action, command: parsed.data });
  }
  if (
    (action === 'status' || action === 'cancel') &&
    rest.length === 2 &&
    id &&
    values['args-stdin'] !== true
  )
    return (await connect()).rpc('tobCli', { action, id });
  throw new CliLiveError('usage', 'Use tob-cli start --args-stdin, status <id>, or cancel <id>.');
}
