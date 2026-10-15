import { CliLiveError } from './cli-live-error.js';

type Rpc = (method: string, payload: Record<string, unknown>) => Promise<unknown>;

export const APPROVAL_REVIEWER_OPTIONS = {
  effort: { type: 'string' },
} as const;

export const APPROVAL_REVIEWER_COMMANDS = [
  {
    command: 'approval-reviewer-model',
    description: 'show the model every Approval Reviewer uses, or that it follows each Bot',
  },
  {
    command: 'approval-reviewer-model-set',
    description:
      "set one reviewer model for every Bot (<provider>/<model>), or `bot`; from a Bot's Shell this always asks the Human",
  },
] as const;

export interface ApprovalReviewerValues {
  effort?: string;
}

type Command = (typeof APPROVAL_REVIEWER_COMMANDS)[number]['command'];

export function isApprovalReviewerCommand(command: string): command is Command {
  return APPROVAL_REVIEWER_COMMANDS.some((entry) => entry.command === command);
}

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}

function modelArgument(value: string, effort: string | undefined): Record<string, string> | null {
  if (value === 'bot') {
    if (effort !== undefined) usage('--effort applies only to a named model, not `bot`.');
    return null;
  }
  const slash = value.indexOf('/');
  const provider = slash < 0 ? '' : value.slice(0, slash).trim();
  const model = slash < 0 ? '' : value.slice(slash + 1).trim();
  if (!provider || !model)
    usage(
      'approval-reviewer-model-set needs <provider>/<model> (for example deepseek/<model>) or bot.',
    );
  if (effort !== undefined && !effort.trim()) usage('--effort must not be empty.');
  return { provider, model, ...(effort === undefined ? {} : { reasoningEffort: effort.trim() }) };
}

export async function runApprovalReviewerCommand(
  command: Command,
  rest: string[],
  values: ApprovalReviewerValues,
  connect: () => Promise<Rpc>,
): Promise<unknown> {
  if (command === 'approval-reviewer-model') {
    if (rest.length !== 0 || values.effort !== undefined)
      usage('approval-reviewer-model takes no arguments.');
    const rpc = await connect();
    return rpc('approvalReviewerModel', {});
  }
  if (rest.length !== 1 || !rest[0]!.trim())
    usage('approval-reviewer-model-set needs exactly one <provider>/<model>, or bot.');
  const model = modelArgument(rest[0]!.trim(), values.effort);
  const rpc = await connect();
  return rpc('approvalReviewerModelSet', { model });
}
