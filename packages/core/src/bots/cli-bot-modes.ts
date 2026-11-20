import { CliLiveError } from './cli-live-error.js';
import { INHERIT_BOT_MODE } from '../runtime/bot-mode-settings.js';

type Rpc = (method: string, payload: Record<string, unknown>) => Promise<unknown>;

export const PRODUCT_BOT_MODE = '@product';

export const ALL_BOT_MODES = '@all';

export const BOT_MODE_COMMANDS = [
  {
    command: 'bot-modes',
    description:
      "list the installed DSH modes, the global default every Bot follows and, with <bot-id>, that Bot's own mode",
  },
  {
    command: 'bot-mode-default-set',
    description: `set the mode every Bot without its own uses (<mode>), or \`${PRODUCT_BOT_MODE}\` for Tobs; applies from each Bot's next new Session`,
  },
  {
    command: 'bot-mode-set',
    description: `set one Bot's own mode (<bot-id> <mode>), or \`${INHERIT_BOT_MODE}\` to follow the global default; applies from its next new Session`,
  },
  {
    command: 'bot-mode-template-save',
    description:
      'create a mode template (<name> <mode>...) that limits which modes a Bot can use, or replace one with --id <template-id>',
  },
  {
    command: 'bot-mode-template-delete',
    description: 'delete a mode template (<template-id>) that no Bot uses',
  },
  {
    command: 'bot-mode-template-set',
    description: `limit one Bot to a mode template (<bot-id> <template-id>), or \`${ALL_BOT_MODES}\` to allow every installed mode`,
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
  options: { id?: string } = {},
): Promise<unknown> {
  const args = rest.map((value) => value.trim());
  if (options.id !== undefined && command !== 'bot-mode-template-save')
    usage(`${command} does not take --id; only bot-mode-template-save does.`);
  if (command === 'bot-modes') {
    if (args.length > 1 || args[0] === '') usage('bot-modes takes at most one <bot-id>.');
    return (await connect())('botModes', args.length === 0 ? {} : { slug: args[0] });
  }
  if (command === 'bot-mode-default-set') {
    if (args.length !== 1 || !args[0])
      usage(`bot-mode-default-set needs exactly one <mode>, or ${PRODUCT_BOT_MODE}.`);
    const mode = args[0] === PRODUCT_BOT_MODE ? null : args[0];
    return (await connect())('botModeDefaultSet', { mode });
  }
  if (command === 'bot-mode-template-save') {
    const id = options.id?.trim();
    if (options.id !== undefined && !id) usage('--id needs a <template-id>.');
    const [name, ...modes] = args;
    if (!name || modes.length === 0 || modes.some((mode) => mode === ''))
      usage('bot-mode-template-save needs <name> and at least one <mode>.');
    return (await connect())('botModeTemplateSave', {
      ...(id === undefined ? {} : { id }),
      name,
      modes,
    });
  }
  if (command === 'bot-mode-template-delete') {
    if (args.length !== 1 || !args[0])
      usage('bot-mode-template-delete needs exactly one <template-id>.');
    return (await connect())('botModeTemplateDelete', { id: args[0] });
  }
  if (command === 'bot-mode-template-set') {
    if (args.length !== 2 || !args[0] || !args[1])
      usage(
        `bot-mode-template-set needs <bot-id> and <template-id>, or <bot-id> ${ALL_BOT_MODES}.`,
      );
    const template = args[1] === ALL_BOT_MODES ? null : args[1];
    return (await connect())('botModeTemplateSet', { slug: args[0], template });
  }
  if (args.length !== 2 || !args[0] || !args[1])
    usage(`bot-mode-set needs <bot-id> and <mode>, or <bot-id> ${INHERIT_BOT_MODE}.`);
  const mode = args[1] === INHERIT_BOT_MODE ? null : args[1];
  return (await connect())('botModeSet', { slug: args[0], mode });
}
