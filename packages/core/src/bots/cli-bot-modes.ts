import { CliLiveError } from './cli-live-error.js';
import { INHERIT_BOT_MODE } from '../runtime/bot-mode-settings.js';

type Rpc = (method: string, payload: Record<string, unknown>) => Promise<unknown>;

export const PRODUCT_BOT_MODE = '@product';

export const BOT_MODE_COMMANDS = [
  {
    command: 'bot-modes',
    description:
      "list the installed DSH modes, the global default every Bot follows and, with <slug>, that Bot's own mode",
  },
  {
    command: 'bot-mode-default-set',
    description: `set the mode every Bot without its own uses (<mode>), or \`${PRODUCT_BOT_MODE}\` for Tobs; applies from each Bot's next new Session`,
  },
  {
    command: 'bot-mode-set',
    description: `set one Bot's own mode (<slug> <mode>), or \`${INHERIT_BOT_MODE}\` to follow the global default; applies from its next new Session`,
  },
] as const;

type Command = (typeof BOT_MODE_COMMANDS)[number]['command'];

export function isBotModeCommand(command: string): command is Command {
  return BOT_MODE_COMMANDS.some((entry) => entry.command === command);
}

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}

export async function runBotModeCommand(
  command: Command,
  rest: string[],
  connect: () => Promise<Rpc>,
): Promise<unknown> {
  const args = rest.map((value) => value.trim());
  if (command === 'bot-modes') {
    if (args.length > 1 || args[0] === '') usage('bot-modes takes at most one <slug>.');
    return (await connect())('botModes', args.length === 0 ? {} : { slug: args[0] });
  }
  if (command === 'bot-mode-default-set') {
    if (args.length !== 1 || !args[0])
      usage(`bot-mode-default-set needs exactly one <mode>, or ${PRODUCT_BOT_MODE}.`);
    const mode = args[0] === PRODUCT_BOT_MODE ? null : args[0];
    return (await connect())('botModeDefaultSet', { mode });
  }
  if (args.length !== 2 || !args[0] || !args[1])
    usage(`bot-mode-set needs <slug> and <mode>, or <slug> ${INHERIT_BOT_MODE}.`);
  const mode = args[1] === INHERIT_BOT_MODE ? null : args[1];
  return (await connect())('botModeSet', { slug: args[0], mode });
}
