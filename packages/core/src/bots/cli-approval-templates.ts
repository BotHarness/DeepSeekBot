import {
  encodeApprovalTemplateGuidance,
  parseApprovalTemplateGuidance,
} from '../workspaces/approval-template-guidance.js';
import { readApprovalTemplateFile } from '../workspaces/approval-templates.js';
export { APPROVAL_TEMPLATE_OPTIONS } from './cli-option-spec.js';

import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';

type Rpc = (method: string, payload: Record<string, unknown>) => Promise<unknown>;

export interface ApprovalTemplateValues {
  bot?: string;
  file?: string;
  from?: string;
  blank?: boolean;
  'parts-file'?: string;
  'apply-to'?: string;
  'text-stdin'?: boolean;
  'literal-template'?: boolean;
  confirm?: boolean;
  'delete-revision'?: string;
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
    command: 'approval-template-global-set',
    description: 'select the global Approval Template default, or off',
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
  if (values['parts-file'] !== undefined) {
    if (values.file !== undefined || values['text-stdin'] === true || values.blank === true)
      usage('Use only one content input.');
    let value: unknown;
    try {
      value = JSON.parse(readApprovalTemplateFile(values['parts-file']));
    } catch {
      return usage('Cannot read guidance JSON.');
    }
    const parts = parseApprovalTemplateGuidance(value);
    if (parts === undefined)
      return usage('Guidance needs alwaysAsk/alwaysAllow string arrays and freeText.');
    return encodeApprovalTemplateGuidance(parts);
  }
  if (values.file !== undefined && values['text-stdin'] === true)
    usage('Give the template text with --file or --text-stdin, not both.');
  if (values.file !== undefined) {
    try {
      return readApprovalTemplateFile(values.file);
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
  if (
    values['literal-template'] &&
    command !== 'approval-template-global-set' &&
    command !== 'approval-template-set'
  )
    usage('--literal-template is only supported by template selection commands.');
  if (command === 'approval-template-global-set') {
    if (rest.length !== 1 || !rest[0]?.trim())
      usage('approval-template-global-set needs a template name or off.');
    const rpc = await connect();
    return rpc('approvalTemplateGlobalSet', {
      template: !values['literal-template'] && rest[0] === 'off' ? null : rest[0],
    });
  }
  if (command === 'approval-template-set') {
    if (rest.length !== 2 || rest.some((value) => !value.trim()))
      usage('approval-template-set needs a bot id and a template name (or off).');
    const rpc = await connect();
    const template = rest[1]!.trim();
    return rpc('botApprovalTemplateSet', {
      slug: rest[0]!.trim(),
      template: values['literal-template']
        ? template
        : template === 'off'
          ? null
          : template === 'inherit'
            ? '@global'
            : template,
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
  if (subcommand !== 'create' && (values.from !== undefined || values.blank === true))
    usage('--blank and --from require create.');
  if (values['apply-to'] !== undefined && values['apply-to'].trim() === '')
    usage('--apply-to needs a Bot id.');
  if (values['apply-to'] !== undefined && subcommand !== 'create' && subcommand !== 'edit')
    usage('--apply-to requires create or edit.');
  const apply = async (rpc: Rpc, result: unknown): Promise<unknown> => {
    if (values['apply-to'] === undefined) return result;
    await rpc('botApprovalTemplateSet', { slug: values['apply-to'], template: name });
    return result;
  };
  if (subcommand === 'create') {
    const from = values.from?.trim();
    const inputs = [
      values.from !== undefined,
      values.blank === true,
      values['parts-file'] !== undefined,
      values.file !== undefined,
      values['text-stdin'] === true,
    ];
    if (inputs.filter(Boolean).length !== 1 || from === '')
      usage('Choose one source: --from, --blank, --parts-file, --file or --text-stdin.');
    const text =
      from !== undefined
        ? undefined
        : values.blank === true
          ? encodeApprovalTemplateGuidance({ alwaysAsk: [], alwaysAllow: [], freeText: '' })
          : await templateText(values, io);
    const rpc = await connect();
    return apply(
      rpc,
      await rpc('approvalTemplateCreate', {
        name,
        ...(text === undefined ? {} : { text }),
        ...(from === undefined ? {} : { from }),
      }),
    );
  }
  if (subcommand === 'edit') {
    const text = await templateText(values, io);
    const rpc = await connect();
    return apply(rpc, await rpc('approvalTemplateUpdate', { name, text }));
  }
  if (subcommand === 'delete') {
    const revision = values['delete-revision'];
    if (values.confirm === true && (revision === undefined || !/^[a-f0-9]{64}$/u.test(revision)))
      usage(
        'Preview approval-template delete first, then pass --confirm --delete-revision <revision>.',
      );
    if (values.confirm !== true && revision !== undefined)
      usage('--delete-revision requires --confirm.');
    const rpc = await connect();
    return values.confirm === true
      ? rpc('approvalTemplateDelete', { name, confirmed: true, revision })
      : rpc('approvalTemplateDeletePreview', { name });
  }
  const rpc = await connect();
  const bot = subcommand === 'list' ? values.bot?.trim() : undefined;
  const listed = (await rpc('approvalTemplates', bot ? { slug: bot } : {})) as {
    templates?: unknown;
    selected?: unknown;
    globalDefault?: unknown;
    effective?: unknown;
    source?: unknown;
  };
  const templates = Array.isArray(listed?.templates)
    ? (listed.templates as { name: string; text: string }[])
    : [];
  if (subcommand === 'list')
    return {
      templates: templates.map(({ text: _text, ...summary }) => summary),
      ...(listed.globalDefault === undefined ? {} : { globalDefault: listed.globalDefault }),
      ...(bot
        ? {
            bot,
            selected: listed.selected ?? null,
            ...(listed.source === undefined
              ? {}
              : { effective: listed.effective, source: listed.source }),
          }
        : {}),
    };
  const found = templates.find((template) => template.name === name);
  if (found === undefined)
    throw new CliLiveError('unknown-template', `The Host has no Approval Template named ${name}.`);
  return { template: found };
}
