import { dmChannelId } from '../channels/channel.js';
import type { ChannelVoiceCallRecord } from '../channels/voice-call-record.js';
import { CliLiveError } from './cli-live-error.js';

export const CALL_TIMELINE_OPTIONS = {
  'from-ms': { type: 'string' },
  'to-ms': { type: 'string' },
} as const;

export const CALL_TIMELINE_COMMANDS = [
  {
    command: 'call-list',
    description:
      "list the voice calls in a Bot's DM, newest first: call id, start, end, duration and state, from the call notices",
  },
  {
    command: 'call-read',
    description:
      'read one call in a Bot DM oldest first, as the Bot does with channel_read call: call-read <bot> <call-id> [--from-ms N] [--to-ms N] (milliseconds from the call start) [--limit N] [--cursor C]',
  },
] as const;

type Command = (typeof CALL_TIMELINE_COMMANDS)[number]['command'];
type LiveRpc = <T>(method: string, args: Record<string, unknown>) => Promise<T>;

export interface CallTimelineValues {
  'from-ms'?: string;
  'to-ms'?: string;
  limit?: string;
  cursor?: string;
}

export interface CallListEntry {
  callId: string;
  startedAt: string;
  state: 'started' | 'ended';
  endedAt?: string;
  durationMs?: number;
  reason?: string;
  heard?: number;
}

interface ToolPage {
  messages?: Array<{ message?: { voiceCallRecord?: ChannelVoiceCallRecord } }>;
  nextCursor?: string;
}

const MAX_LIST_PAGES = 50;

export function isCallTimelineCommand(command: string): command is Command {
  return CALL_TIMELINE_COMMANDS.some((entry) => entry.command === command);
}

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}

function milliseconds(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d+$/u.test(value.trim()) || !Number.isSafeInteger(Number(value)))
    usage(`${flag} must be a whole number of milliseconds from the call start.`);
  return Number(value);
}

async function channelRead(
  rpc: LiveRpc,
  slug: string,
  args: Record<string, unknown>,
): Promise<ToolPage & Record<string, unknown>> {
  const run = await rpc<{ result?: unknown }>('botToolRun', {
    slug,
    tool: 'channel_read',
    args: { channel_id: dmChannelId(slug), ...args },
  });
  if (typeof run.result !== 'object' || run.result === null)
    throw new CliLiveError('host-protocol-error', 'channel_read returned no JSON page.');
  return run.result as ToolPage & Record<string, unknown>;
}

export function callListEntries(records: Iterable<ChannelVoiceCallRecord>): CallListEntry[] {
  const calls = new Map<string, CallListEntry>();
  for (const record of records) {
    if (record.state !== 'started' && record.state !== 'ended') continue;
    const entry = calls.get(record.callId) ?? {
      callId: record.callId,
      startedAt: record.startedAt,
      state: 'started' as const,
    };
    if (record.state === 'ended')
      Object.assign(entry, {
        state: 'ended',
        endedAt: record.endedAt,
        durationMs: record.durationMs,
        reason: record.reason,
        heard: record.heard,
      });
    calls.set(record.callId, entry);
  }
  return [...calls.values()].sort(
    (left, right) =>
      Date.parse(right.startedAt) - Date.parse(left.startedAt) ||
      right.callId.localeCompare(left.callId),
  );
}

export async function runCallTimelineCommand(
  command: Command,
  rest: string[],
  values: CallTimelineValues,
  connect: () => Promise<{ rpc: LiveRpc }>,
): Promise<unknown> {
  if (command === 'call-list') {
    if (rest.length !== 1 || !rest[0]!.trim()) usage('call-list needs exactly one bot id.');
    if (values['from-ms'] !== undefined || values['to-ms'] !== undefined)
      usage('call-list takes no --from-ms or --to-ms; read a call with call-read.');
    const slug = rest[0]!.trim();
    const { rpc } = await connect();
    const records: ChannelVoiceCallRecord[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
      const read = await channelRead(rpc, slug, {
        text: 'voice call',
        author_kind: 'system',
        limit: 200,
        ...(cursor === undefined ? {} : { cursor }),
      });
      for (const entry of read.messages ?? [])
        if (entry.message?.voiceCallRecord !== undefined)
          records.push(entry.message.voiceCallRecord);
      cursor = read.nextCursor;
      if (cursor === undefined) break;
    }
    return {
      botId: slug,
      channelId: dmChannelId(slug),
      calls: callListEntries(records),
      ...(cursor === undefined ? {} : { truncated: true }),
    };
  }
  if (rest.length !== 2 || rest.some((value) => !value.trim()))
    usage('call-read needs a bot id and a call id.');
  const fromMs = milliseconds(values['from-ms'], '--from-ms');
  const toMs = milliseconds(values['to-ms'], '--to-ms');
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 200))
    usage('--limit must be an integer from 1 to 200.');
  const slug = rest[0]!.trim();
  return channelRead((await connect()).rpc, slug, {
    call: rest[1]!.trim(),
    ...(fromMs === undefined ? {} : { from_ms: fromMs }),
    ...(toMs === undefined ? {} : { to_ms: toMs }),
    ...(limit === undefined ? {} : { limit }),
    ...(values.cursor === undefined ? {} : { cursor: values.cursor }),
  });
}
