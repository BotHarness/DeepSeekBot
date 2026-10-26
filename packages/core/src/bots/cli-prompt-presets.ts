import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';

type Rpc = (method: string, payload: Record<string, unknown>) => Promise<unknown>;

export const PROMPT_PRESET_OPTIONS = {
  'parts-stdin': { type: 'boolean' },
  'expected-revision': { type: 'string' },
  confirm: { type: 'boolean' },
} as const;

export interface PromptPresetValues {
  name?: string;
  preset?: string;
  'parts-stdin'?: boolean;
  'expected-revision'?: string;
  confirm?: boolean;
}

export const PROMPT_PRESET_COMMANDS = [
  {
    command: 'prompt-parts',
    description: 'list the editable Prompt Preset parts with their built-in default text',
  },
  {
    command: 'prompt-presets',
    description: 'list Prompt Presets and the global one every Bot inherits',
  },
  {
    command: 'prompt-preset-create',
    description: 'create a Prompt Preset (--name, part texts as JSON with --parts-stdin)',
  },
  {
    command: 'prompt-preset-update',
    description: 'rename a Prompt Preset or change its parts (null resets a part to inherit)',
  },
  {
    command: 'prompt-preset-delete',
    description:
      'delete a Prompt Preset; Bots that used it fall back to the global one (--confirm)',
  },
  {
    command: 'prompt-global-set',
    description: 'choose the Prompt Preset every Bot inherits, or built-in',
  },
  {
    command: 'bot-prompt',
    description:
      "show a Bot's effective Prompt Preset parts, the layer each comes from, and whether a change waits for its next Session or compaction",
  },
  {
    command: 'bot-prompt-set',
    description:
      "choose a Bot's Prompt Preset (--preset <id>|global) or override its own parts with --parts-stdin",
  },
] as const;

type Command = (typeof PROMPT_PRESET_COMMANDS)[number]['command'];

export function isPromptPresetCommand(command: string): command is Command {
  return PROMPT_PRESET_COMMANDS.some((entry) => entry.command === command);
}

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}

async function partsFrom(
  values: PromptPresetValues,
  io: Pick<BotCreateCliIo, 'readStdin'>,
): Promise<Record<string, unknown> | undefined> {
  if (values['parts-stdin'] !== true) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse((await io.readStdin?.()) ?? '');
  } catch {
    usage('--parts-stdin must be a JSON object of {"<part-id>": "text" | null}.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    usage('--parts-stdin must be a JSON object of {"<part-id>": "text" | null}.');
  return parsed as Record<string, unknown>;
}

function positionals(command: Command, rest: string[], count: number, what: string): string[] {
  if (rest.length !== count || rest.some((value) => !value.trim()))
    usage(count === 0 ? `${command} takes no positional arguments.` : `${command} needs ${what}.`);
  return rest.map((value) => value.trim());
}

export async function runPromptPresetCommand(
  command: Command,
  rest: string[],
  values: PromptPresetValues,
  io: Pick<BotCreateCliIo, 'readStdin'>,
  connect: () => Promise<Rpc>,
): Promise<unknown> {
  if (command === 'prompt-parts' || command === 'prompt-presets') {
    positionals(command, rest, 0, '');
    return (await connect())(command === 'prompt-parts' ? 'promptParts' : 'promptPresets', {});
  }
  if (command === 'prompt-preset-create') {
    positionals(command, rest, 0, '');
    const name = values.name?.trim();
    if (!name) usage('prompt-preset-create needs --name.');
    const parts = await partsFrom(values, io);
    return (await connect())('promptPresetCreate', {
      name,
      ...(parts === undefined ? {} : { parts }),
    });
  }
  if (command === 'prompt-preset-update') {
    const [id] = positionals(command, rest, 1, 'exactly one Prompt Preset id');
    const raw = values['expected-revision'];
    if (raw !== undefined && !/^\d+$/u.test(raw))
      usage('--expected-revision must be a nonnegative integer.');
    const parts = await partsFrom(values, io);
    if (values.name === undefined && parts === undefined)
      usage('prompt-preset-update needs --name or --parts-stdin.');
    return (await connect())('promptPresetUpdate', {
      id,
      ...(values.name === undefined ? {} : { name: values.name }),
      ...(parts === undefined ? {} : { parts }),
      ...(raw === undefined ? {} : { expectedRevision: Number(raw) }),
    });
  }
  if (command === 'prompt-preset-delete') {
    const [id] = positionals(command, rest, 1, 'exactly one Prompt Preset id');
    if (values.confirm !== true)
      usage('prompt-preset-delete needs --confirm; Bots that use it fall back to the global one.');
    return (await connect())('promptPresetDelete', { id });
  }
  if (command === 'prompt-global-set') {
    const [id] = positionals(command, rest, 1, 'a Prompt Preset id, or built-in');
    return (await connect())('promptGlobalSet', { presetId: id === 'built-in' ? null : id });
  }
  const [slug] = positionals(command, rest, 1, 'exactly one bot id');
  if (command === 'bot-prompt') return (await connect())('botPrompt', { slug });
  const preset = values.preset?.trim();
  const parts = await partsFrom(values, io);
  if (preset === undefined && parts === undefined)
    usage('bot-prompt-set needs --preset <id>|global or --parts-stdin.');
  return (await connect())('botPromptSet', {
    slug,
    ...(preset === undefined ? {} : { presetId: preset === 'global' ? null : preset }),
    ...(parts === undefined ? {} : { parts }),
  });
}
