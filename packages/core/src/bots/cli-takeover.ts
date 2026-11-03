import { CliLiveError } from './cli-live-error.js';

export const TAKEOVER_OPTIONS = {
  minutes: { type: 'string' },
  pending: { type: 'boolean' },
} as const;

export const TAKEOVER_COMMANDS = [
  {
    command: 'takeovers',
    description:
      'list Takeover Handoffs (Bot asks the Human to operate its Computer or Browser), newest first',
  },
  {
    command: 'takeover-status',
    description: 'show one Takeover Handoff by Channel and request message id',
  },
  {
    command: 'takeover-request',
    description:
      'post a Takeover Handoff card as a Bot, through the same Host code as the takeover_request Bot tool',
  },
  {
    command: 'takeover-complete',
    description:
      'finish a pending Takeover Handoff as the Human (--outcome done|failed); wakes the Bot',
  },
  {
    command: 'takeover-cancel',
    description:
      'cancel a pending Takeover Handoff as the Human (wakes the Bot), or with --bot as that Bot like takeover_cancel',
  },
] as const;

export type TakeoverCommand = (typeof TAKEOVER_COMMANDS)[number]['command'];

export function isTakeoverCommand(command: string): command is TakeoverCommand {
  return TAKEOVER_COMMANDS.some((entry) => entry.command === command);
}

export interface TakeoverValues {
  channel?: string;
  target?: string;
  title?: string;
  body?: string;
  minutes?: string;
  limit?: string;
  pending?: boolean;
  'message-id'?: string;
  outcome?: string;
  bot?: string;
}

type LiveRpc = <T>(method: string, args: Record<string, unknown>) => Promise<T>;

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}

function text(value: string | undefined): string | undefined {
  const next = value?.trim();
  return next === undefined || next === '' ? undefined : next;
}

function whole(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  if (!/^[0-9]+$/u.test(value.trim()) || Number(value) < 1)
    usage(`${flag} must be a positive whole number.`);
  return Number(value);
}

export interface PreparedTakeover {
  method:
    | 'takeoverList'
    | 'takeoverStatus'
    | 'takeoverRequest'
    | 'takeoverComplete'
    | 'takeoverCancel';
  args: Record<string, unknown>;
}

export function prepareTakeoverCommand(
  command: TakeoverCommand,
  rest: readonly string[],
  values: TakeoverValues,
): PreparedTakeover {
  if (command === 'takeovers') {
    if (rest.length > 1) usage('takeovers takes at most one bot id.');
    const slug = text(rest[0]);
    const channelId = text(values.channel);
    const limit = whole(values.limit, '--limit');
    return {
      method: 'takeoverList',
      args: {
        query: {
          ...(slug === undefined ? {} : { slug }),
          ...(channelId === undefined ? {} : { channelId }),
          ...(limit === undefined ? {} : { limit }),
          pendingOnly: values.pending === true,
        },
      },
    };
  }
  if (command === 'takeover-request') {
    const slug = rest.length === 1 ? text(rest[0]) : undefined;
    if (slug === undefined) usage('takeover-request needs exactly one bot id.');
    const target = text(values.target);
    const title = text(values.title);
    const message = text(values.body);
    if (target === undefined || title === undefined || message === undefined)
      usage('takeover-request needs --target computer|browser, --title and --body.');
    if (target !== 'computer' && target !== 'browser')
      usage('--target must be computer or browser.');
    const channelId = text(values.channel);
    const minutes = whole(values.minutes, '--minutes');
    return {
      method: 'takeoverRequest',
      args: {
        slug,
        input: {
          target,
          title,
          message,
          ...(channelId === undefined ? {} : { channelId }),
          ...(minutes === undefined ? {} : { minutes }),
        },
      },
    };
  }
  if (rest.length > 0) usage(`${command} takes --channel and --message-id, not positional ids.`);
  const channelId = text(values.channel);
  const messageId = text(values['message-id']);
  if (channelId === undefined || messageId === undefined)
    usage(`${command} needs --channel and --message-id.`);
  if (command === 'takeover-status')
    return { method: 'takeoverStatus', args: { channelId, messageId } };
  if (command === 'takeover-cancel') {
    const bot = text(values.bot);
    return {
      method: 'takeoverCancel',
      args: { channelId, messageId, surface: 'cli', ...(bot === undefined ? {} : { bot }) },
    };
  }
  const outcome = text(values.outcome);
  if (outcome !== 'done' && outcome !== 'failed')
    usage('takeover-complete needs --outcome done or --outcome failed.');
  return {
    method: 'takeoverComplete',
    args: { channelId, messageId, outcome, surface: 'cli' },
  };
}

export async function runTakeoverCommand(
  command: TakeoverCommand,
  rest: readonly string[],
  values: TakeoverValues,
  connect: () => Promise<{ rpc: LiveRpc }>,
): Promise<unknown> {
  const prepared = prepareTakeoverCommand(command, rest, values);
  return (await connect()).rpc(prepared.method, prepared.args);
}
