import { CliLiveError } from './cli-live-error.js';

type Rpc = (method: string, payload: Record<string, unknown>) => Promise<unknown>;

export const APPROVAL_TEMPLATE_COMMANDS = [
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

export function isApprovalTemplateCommand(command: string): command is Command {
  return APPROVAL_TEMPLATE_COMMANDS.some((entry) => entry.command === command);
}

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}

const POSITIONALS: Record<Command, number> = {
  'approval-templates': 0,
  'approval-template-show': 1,
  'approval-template-set': 2,
};

export async function runApprovalTemplateCommand(
  command: Command,
  rest: string[],
  values: { bot?: string },
  connect: () => Promise<Rpc>,
): Promise<unknown> {
  const count = POSITIONALS[command];
  if (rest.length !== count || rest.some((value) => !value.trim()))
    usage(
      command === 'approval-templates'
        ? 'approval-templates takes no positional arguments.'
        : command === 'approval-template-show'
          ? 'approval-template-show needs exactly one template name.'
          : 'approval-template-set needs a bot id and a template name (or off).',
    );
  const rpc = await connect();
  if (command === 'approval-template-set') {
    const template = rest[1]!.trim();
    return rpc('botApprovalTemplateSet', {
      slug: rest[0]!.trim(),
      template: template === 'off' ? null : template,
    });
  }
  const bot = command === 'approval-templates' ? values.bot?.trim() : undefined;
  const listed = (await rpc('approvalTemplates', bot ? { slug: bot } : {})) as {
    templates?: unknown;
    selected?: unknown;
  };
  const templates = Array.isArray(listed?.templates)
    ? (listed.templates as { name: string; text: string }[])
    : [];
  if (command === 'approval-templates')
    return {
      templates: templates.map(({ text: _text, ...summary }) => summary),
      ...(bot ? { bot, selected: listed.selected ?? null } : {}),
    };
  const name = rest[0]!.trim();
  const found = templates.find((template) => template.name === name);
  if (found === undefined)
    throw new CliLiveError('unknown-template', `The Host has no Approval Template named ${name}.`);
  return { template: found };
}
