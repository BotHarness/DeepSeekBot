import { CliLiveError } from './cli-live-error.js';

export const MEETING_COMMANDS = [
  {
    command: 'meeting-join',
    description:
      'send a Bot to a meeting link as a guest, like the meeting_join Bot tool (--listen-only to only take notes)',
  },
  { command: 'meeting-leave', description: 'make a Bot leave the meeting it is attending' },
  {
    command: 'meeting-status',
    description: 'show the meeting a Bot is attending, if any, and its recent meetings',
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
  values: { 'listen-only'?: boolean; meeting?: string; after?: string; 'cause-event'?: string },
  connect: () => Promise<{ rpc: LiveRpc }>,
): Promise<unknown> {
  const slug = rest[0]?.trim();
  if (slug === undefined || slug === '') usage(`${command} needs a bot id.`);
  let tool: string;
  let args: Record<string, unknown> = {};
  if (command === 'meeting-join') {
    const url = rest[1]?.trim();
    if (rest.length !== 2 || url === undefined || url === '')
      usage('meeting-join needs a bot id and a meeting link.');
    tool = 'meeting_join';
    args = { url, ...(values['listen-only'] === true ? { listen_only: true } : {}) };
  } else {
    if (rest.length !== 1) usage(`${command} takes only a bot id.`);
    tool = command.replace('-', '_');
    if (command === 'meeting-transcript') {
      const after = values.after === undefined ? undefined : Number(values.after);
      if (after !== undefined && (!Number.isInteger(after) || after < 0))
        usage('--after must be a whole number.');
      args = {
        ...(values.meeting === undefined ? {} : { meeting_id: values.meeting }),
        ...(after === undefined ? {} : { after }),
      };
    }
  }
  return (await connect()).rpc('botToolRun', {
    slug,
    tool,
    args,
    ...(values['cause-event'] === undefined ? {} : { sourceEventId: values['cause-event'] }),
  });
}
