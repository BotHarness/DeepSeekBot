import { readFileSync } from 'node:fs';

import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';

type Rpc = (method: string, payload: Record<string, unknown>) => Promise<unknown>;

export const APPROVAL_TEMPLATE_OPTIONS = {
  from: { type: 'string' },
  'text-stdin': { type: 'boolean' },
} as const;

export interface ApprovalTemplateValues {
  bot?: string;
  file?: string;
  from?: string;
  'text-stdin'?: boolean;
}

export const APPROVAL_TEMPLATE_COMMANDS = [
  {
    command: 'approval-template',
    description:
      'list, show, create, edit or delete Approval Templates; editing or deleting one a Bot uses asks the Human from a Bot Shell',
  },
  {
    command: 'approval-templates',
    description:
      'list the Approval Templates a Bot can select for auto approval (--bot shows its selection)',
  },
  {
    command: 'approval-template-show',
    description: 'print the full text of one Approval Template',
  },
  {
    command: 'approval-template-set',
    description:
      "select a Bot's Approval Template, or `off`; from a Bot's Shell this always asks the Human",
  },
] as const;

type Command = (typeof APPROVAL_TEMPLATE_COMMANDS)[number]['command'];

const SUBCOMMANDS = ['list', 'show', 'create', 'edit', 'delete'] as const;
type Subcommand = (typeof SUBCOMMANDS)[number];

export function isApprovalTemplateCommand(command: string): command is Command {
  return APPROVAL_TEMPLATE_COMMANDS.some((entry) => entry.command === command);
}

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}

const POSITIONALS: Record<Subcommand, number> = {
  list: 0,
  show: 1,
  create: 1,
  edit: 1,
  delete: 1,
};

async function templateText(
  values: ApprovalTemplateValues,
  io: Pick<BotCreateCliIo, 'readStdin'>,
): Promise<string> {
  if (values.file !== undefined && values['text-stdin'] === true)
    usage('Give the template text with --file or --text-stdin, not both.');
  if (values.file !== undefined) {
    try {
      return readFileSync(values.file, 'utf8');
    } catch {
      throw new CliLiveError('invalid-input', `Cannot read ${values.file}.`);
    }
  }
  if (values['text-stdin'] === true) return io.readStdin?.() ?? Promise.resolve('');
  return usage('Give the template Markdown with --file <path> or --text-stdin.');
}

function normalize(command: Command, rest: string[]): { subcommand: Subcommand; args: string[] } {
  if (command === 'approval-templates') return { subcommand: 'list', args: rest };
  if (command === 'approval-template-show') return { subcommand: 'show', args: rest };
  const [subcommand, ...args] = rest;
  if (!SUBCOMMANDS.includes(subcommand as Subcommand))
    usage('approval-template needs one of: ' + SUBCOMMANDS.join(', ') + '.');
  return { subcommand: subcommand as Subcommand, args };
}

export async function runApprovalTemplateCommand(
  command: Command,
  rest: string[],
  values: ApprovalTemplateValues,
  io: Pick<BotCreateCliIo, 'readStdin'>,
  connect: () => Promise<Rpc>,
): Promise<unknown> {
  if (command === 'approval-template-set') {
    if (rest.length !== 2 || rest.some((value) => !value.trim()))
      usage('approval-template-set needs a bot id and a template name (or off).');
    const rpc = await connect();
    const template = rest[1]!.trim();
    return rpc('botApprovalTemplateSet', {
      slug: rest[0]!.trim(),
      template: template === 'off' ? null : template,
    });
  }
  const { subcommand, args } = normalize(command, rest);
  if (args.length !== POSITIONALS[subcommand] || args.some((value) => !value.trim()))
    usage(
      subcommand === 'list'
        ? 'approval-template list takes no positional arguments.'
        : `approval-template ${subcommand} needs exactly one template name.`,
    );
  const name = args[0]?.trim() ?? '';
  if (subcommand === 'create') {
    const from = values.from?.trim();
    if (from !== undefined && (values.file !== undefined || values['text-stdin'] === true))
      usage('approval-template create takes --from, or the text with --file or --text-stdin.');
    const text = from === undefined ? await templateText(values, io) : undefined;
    const rpc = await connect();
    return rpc('approvalTemplateCreate', {
      name,
      ...(text === undefined ? {} : { text }),
      ...(from === undefined ? {} : { from }),
    });
  }
  if (subcommand === 'edit') {
    const text = await templateText(values, io);
    const rpc = await connect();
    return rpc('approvalTemplateUpdate', { name, text });
  }
  if (subcommand === 'delete') {
    const rpc = await connect();
    return rpc('approvalTemplateDelete', { name });
  }
  const rpc = await connect();
  const bot = subcommand === 'list' ? values.bot?.trim() : undefined;
  const listed = (await rpc('approvalTemplates', bot ? { slug: bot } : {})) as {
    templates?: unknown;
    selected?: unknown;
  };
  const templates = Array.isArray(listed?.templates)
    ? (listed.templates as { name: string; text: string }[])
    : [];
  if (subcommand === 'list')
    return {
      templates: templates.map(({ text: _text, ...summary }) => summary),
      ...(bot ? { bot, selected: listed.selected ?? null } : {}),
    };
  const found = templates.find((template) => template.name === name);
  if (found === undefined)
    throw new CliLiveError('unknown-template', `The Host has no Approval Template named ${name}.`);
  return { template: found };
}
