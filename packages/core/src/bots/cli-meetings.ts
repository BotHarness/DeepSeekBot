import { CliLiveError } from './cli-live-error.js';

export const MEETING_COMMANDS = [
  { command: 'meeting-leave', description: 'make a Bot stop listening to the meeting it is in' },
  {
    command: 'meeting-status',
    description: 'show the meeting a Bot is listening to, if any, and its recent meetings',
  },
  {
    command: 'meeting-transcript',
    description:
      "read a Bot's meeting transcript (--meeting <id>, default its latest; --after <seq>)",
  },
] as const;

export type MeetingCommand = (typeof MEETING_COMMANDS)[number]['command'];

export function isMeetingCommand(command: string): command is MeetingCommand {
  return MEETING_COMMANDS.some((entry) => entry.command === command);
}

type LiveRpc = <T>(method: string, args: Record<string, unknown>) => Promise<T>;

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}

export async function runMeetingCommand(
  command: MeetingCommand,
  rest: string[],
  values: { meeting?: string; after?: string; 'cause-event'?: string },
  connect: () => Promise<{ rpc: LiveRpc }>,
): Promise<unknown> {
  const slug = rest[0]?.trim();
  if (slug === undefined || slug === '') usage(`${command} needs a bot id.`);
  if (rest.length !== 1) usage(`${command} takes only a bot id.`);
  const tool = command.replace('-', '_');
  let args: Record<string, unknown> = {};
  if (command === 'meeting-transcript') {
    const after = values.after === undefined ? undefined : Number(values.after);
    if (after !== undefined && (!Number.isInteger(after) || after < 0))
      usage('--after must be a whole number.');
    args = {
      ...(values.meeting === undefined ? {} : { meeting_id: values.meeting }),
      ...(after === undefined ? {} : { after }),
    };
  }
  return (await connect()).rpc('botToolRun', {
    slug,
    tool,
    args,
    ...(values['cause-event'] === undefined ? {} : { sourceEventId: values['cause-event'] }),
  });
}
