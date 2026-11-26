import { canonicalCliCommandName } from './cli-command-names.js';
import { CliLiveError } from './cli-live-error.js';
import { INHERIT_BOT_MODE } from '../runtime/bot-mode-settings.js';

type Rpc = (method: string, payload: Record<string, unknown>) => Promise<unknown>;

export const PRODUCT_BOT_MODE = '@product';

export const ALL_BOT_MODES = '@all';

export const BOT_MODE_COMMANDS = [
  {
    command: 'loadouts',
    description:
      "list the installed Loadouts, the global default every Bot follows and, with <bot-id>, that Bot's own Loadout (formerly bot-modes)",
  },
  {
    command: 'loadout-default-set',
    description: `set the Loadout every Bot without its own uses (<loadout>), or \`${PRODUCT_BOT_MODE}\` for Tobs; applies from each Bot's next new Session`,
  },
  {
    command: 'loadout-set',
    description: `set one Bot's own Loadout (<bot-id> <loadout>), or \`${INHERIT_BOT_MODE}\` to follow the global default; applies from its next new Session`,
  },
  {
    command: 'loadout-template-save',
    description:
      'create a Loadout template (<name> <loadout>...) that limits which Loadouts a Bot can use, or replace one with --id <template-id>',
  },
  {
    command: 'loadout-template-delete',
    description: 'delete a Loadout template (<template-id>) that no Bot uses',
  },
  {
    command: 'loadout-template-set',
    description: `limit one Bot to a Loadout template (<bot-id> <template-id>), or \`${ALL_BOT_MODES}\` to allow every installed Loadout`,
  },
] as const;

type Command = (typeof BOT_MODE_COMMANDS)[number]['command'];

export function isBotModeCommand(command: string): boolean {
  const canonical = canonicalCliCommandName(command);
  return BOT_MODE_COMMANDS.some((entry) => entry.command === canonical);
}

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}

export async function runBotModeCommand(
  requested: string,
  rest: string[],
  connect: () => Promise<Rpc>,
  options: { id?: string } = {},
): Promise<unknown> {
  const command = canonicalCliCommandName(requested) as Command;
  const args = rest.map((value) => value.trim());
  if (options.id !== undefined && command !== 'loadout-template-save')
    usage(`${command} does not take --id; only loadout-template-save does.`);
  if (command === 'loadouts') {
    if (args.length > 1 || args[0] === '') usage('loadouts takes at most one <bot-id>.');
    return (await connect())('botModes', args.length === 0 ? {} : { slug: args[0] });
  }
  if (command === 'loadout-default-set') {
    if (args.length !== 1 || !args[0])
      usage(`loadout-default-set needs exactly one <loadout>, or ${PRODUCT_BOT_MODE}.`);
    const mode = args[0] === PRODUCT_BOT_MODE ? null : args[0];
    return (await connect())('botModeDefaultSet', { mode });
  }
  if (command === 'loadout-template-save') {
    const id = options.id?.trim();
    if (options.id !== undefined && !id) usage('--id needs a <template-id>.');
    const [name, ...modes] = args;
    if (!name || modes.length === 0 || modes.some((mode) => mode === ''))
      usage('loadout-template-save needs <name> and at least one <loadout>.');
    return (await connect())('botModeTemplateSave', {
      ...(id === undefined ? {} : { id }),
      name,
      modes,
    });
  }
  if (command === 'loadout-template-delete') {
    if (args.length !== 1 || !args[0])
      usage('loadout-template-delete needs exactly one <template-id>.');
    return (await connect())('botModeTemplateDelete', { id: args[0] });
  }
  if (command === 'loadout-template-set') {
    if (args.length !== 2 || !args[0] || !args[1])
      usage(`loadout-template-set needs <bot-id> and <template-id>, or <bot-id> ${ALL_BOT_MODES}.`);
    const template = args[1] === ALL_BOT_MODES ? null : args[1];
    return (await connect())('botModeTemplateSet', { slug: args[0], template });
  }
  if (args.length !== 2 || !args[0] || !args[1])
    usage(`loadout-set needs <bot-id> and <loadout>, or <bot-id> ${INHERIT_BOT_MODE}.`);
  const mode = args[1] === INHERIT_BOT_MODE ? null : args[1];
  return (await connect())('botModeSet', { slug: args[0], mode });
}
