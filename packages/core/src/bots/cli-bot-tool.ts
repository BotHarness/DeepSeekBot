import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';

export const BOT_TOOL_COMMANDS = [
  {
    command: 'bot-tools',
    description: 'list the Harness Bot tools the direct runner can call, with input schemas',
  },
  {
    command: 'bot-tool',
    description:
      'run one Harness Bot tool as a Bot directly, without the model (args JSON from stdin)',
  },
] as const;

type LiveRpc = <T>(method: string, args: Record<string, unknown>) => Promise<T>;

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}

export async function runBotToolCommand(
  command: (typeof BOT_TOOL_COMMANDS)[number]['command'],
  rest: string[],
  values: { 'args-stdin'?: boolean },
  io: BotCreateCliIo,
  connect: () => Promise<{ rpc: LiveRpc }>,
): Promise<unknown> {
  if (command === 'bot-tools') {
    if (rest.length !== 0) usage('bot-tools takes no positional arguments.');
    return (await connect()).rpc('botTools', {});
  }
  if (rest.length !== 2 || rest.some((value) => !value.trim()))
    usage('bot-tool needs a bot id and a tool name.');
  let args: Record<string, unknown> = {};
  if (values['args-stdin'] === true) {
    try {
      const parsed: unknown = JSON.parse(await (io.readStdin?.() ?? Promise.resolve('')));
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        throw new Error('not an object');
      args = parsed as Record<string, unknown>;
    } catch {
      usage('--args-stdin must be a JSON object of tool arguments.');
    }
  }
  return (await connect()).rpc('botToolRun', {
    slug: rest[0]!.trim(),
    tool: rest[1]!.trim(),
    args,
  });
}
