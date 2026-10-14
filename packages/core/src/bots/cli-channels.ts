import { readFileSync } from 'node:fs';
import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';
import type { connectLiveHost } from './cli-live.js';

export const CHANNEL_OPTIONS = {
  'avatar-file': { type: 'string' },
  invitation: { type: 'string' },
  request: { type: 'string' },
  accept: { type: 'boolean' },
  decline: { type: 'boolean' },
  inherit: { type: 'boolean' },
  count: { type: 'string' },
  interval: { type: 'string' },
  direction: { type: 'string' },
  around: { type: 'string' },
  'older-limit': { type: 'string' },
  'newer-limit': { type: 'string' },
  through: { type: 'string' },
  'source-event': { type: 'string', multiple: true },
  confirm: { type: 'boolean' },
  off: { type: 'boolean' },
} as const;

export const CHANNEL_COMMANDS = [
  { command: 'channel-rename', description: 'rename a Channel; renaming a Bot DM renames the Bot' },
  {
    command: 'group-avatar-set',
    description: 'set a group avatar from a PNG, JPEG or WebP file, or clear it',
  },
  { command: 'group-invite', description: 'invite a Bot into a group Channel' },
  { command: 'group-invite-cancel', description: 'cancel a pending group invitation' },
  {
    command: 'group-join-decide',
    description: "accept or decline a Bot's request to join a group",
  },
  { command: 'group-member-remove', description: 'remove a Bot from a group Channel' },
  { command: 'group-wake-policies', description: "read each group member's wake policy" },
  { command: 'group-wake-set', description: "set or reset one group member's wake policy" },
  { command: 'group-delete', description: 'delete a group Channel; needs --confirm' },
  {
    command: 'channel-history',
    description: 'list deleted groups whose history can still be purged',
  },
  { command: 'channel-history-sources', description: "page a Channel's purgeable Source Events" },
  {
    command: 'channel-journal',
    description: "page a Channel's message journal through a revision",
  },
  {
    command: 'channel-timeline',
    description: "page a Channel's Human timeline by cursor or anchor",
  },
  { command: 'channel-mark-read', description: 'mark a Channel read through one message' },
  { command: 'channel-mark-all-read', description: 'mark every Channel read' },
  { command: 'channel-unread', description: 'list unread message counts per Channel' },
  {
    command: 'channel-mute',
    description: 'mute a Channel so it stays out of unread badges, or unmute it with --off',
  },
  { command: 'channel-retry', description: 'retry a failed Bot reply to a Human DM message' },
  {
    command: 'channel-purge-preview',
    description: 'preview what purging Source Events removes and get its confirmation token',
  },
  {
    command: 'channel-purge-confirm',
    description: 'purge previewed Source Events with the stdin token; needs --confirm',
  },
] as const;

type ChannelCommand = (typeof CHANNEL_COMMANDS)[number]['command'];

interface ChannelValues {
  timeout?: string;
  name?: string;
  clear?: boolean;
  bot?: string;
  mode?: string;
  cursor?: string;
  before?: string;
  limit?: string;
  'message-id'?: string;
  'confirmation-stdin'?: boolean;
  'avatar-file'?: string;
  invitation?: string;
  request?: string;
  accept?: boolean;
  decline?: boolean;
  inherit?: boolean;
  count?: string;
  interval?: string;
  direction?: string;
  around?: string;
  'older-limit'?: string;
  'newer-limit'?: string;
  through?: string;
  'source-event'?: string[];
  confirm?: boolean;
  off?: boolean;
}

const WAKE_MODES = new Set(['all', 'mentions', 'digest', 'silent']);
const DIRECTIONS = new Set(['older', 'newer', 'around']);
const MAX_AVATAR_BYTES = 98_304;

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}

export function isChannelCommand(command: string): command is ChannelCommand {
  return CHANNEL_COMMANDS.some((entry) => entry.command === command);
}

function integer(value: string | undefined, flag: string, min: number, max: number) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!/^\d+$/u.test(value.trim()) || !Number.isSafeInteger(parsed) || parsed < min || parsed > max)
    usage(`${flag} must be an integer from ${String(min)} to ${String(max)}.`);
  return parsed;
}

function required(value: string | undefined, flag: string): string {
  const trimmed = value?.trim();
  if (!trimmed) usage(`${flag} is required.`);
  return trimmed;
}

function avatarDataUrl(path: string): string {
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch {
    usage('Cannot read --avatar-file.');
  }
  if (bytes.length === 0 || bytes.length > MAX_AVATAR_BYTES)
    usage(`--avatar-file must be 1 to ${String(MAX_AVATAR_BYTES)} bytes.`);
  const type = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? 'png'
    : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      ? 'jpeg'
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
        ? 'webp'
        : usage('--avatar-file must be a PNG, JPEG or WebP image.');
  return `data:image/${type};base64,${bytes.toString('base64')}`;
}

async function purgeToken(io: BotCreateCliIo): Promise<string> {
  let input: unknown;
  try {
    input = JSON.parse(await (io.readStdin?.() ?? Promise.resolve('')));
  } catch {
    usage('Confirmation stdin must be JSON with the token from channel-purge-preview.');
  }
  if (
    typeof input !== 'object' ||
    input === null ||
    !('token' in input) ||
    typeof input.token !== 'string' ||
    !input.token.trim() ||
    input.token.length > 512
  )
    usage('Confirmation stdin must contain the token string from channel-purge-preview.');
  return input.token;
}

export async function runChannelCommand(
  command: ChannelCommand,
  rest: string[],
  input: object,
  io: BotCreateCliIo,
  connect: typeof connectLiveHost,
): Promise<unknown> {
  const values = input as ChannelValues;
  const noTarget =
    command === 'channel-history' ||
    command === 'channel-mark-all-read' ||
    command === 'channel-unread';
  if (rest.length !== (noTarget ? 0 : 1))
    usage(
      `${command} ${noTarget ? 'takes no positional arguments' : 'needs exactly one Channel ID'}.`,
    );
  const channelId = rest[0]?.trim() ?? '';
  if (!noTarget && !channelId) usage(`${command} requires a nonempty Channel ID.`);
  const seconds = values.timeout === undefined ? 120 : Number(values.timeout);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 600)
    usage('--timeout must be between 0 and 600 seconds.');

  let args: Record<string, unknown> = { channelId };
  let method: string;
  switch (command) {
    case 'channel-rename':
      method = 'channelRename';
      args.name = required(values.name, '--name');
      break;
    case 'group-avatar-set':
      method = 'channelGroupAvatarSet';
      if ((values['avatar-file'] === undefined) === (values.clear !== true))
        usage('group-avatar-set needs exactly one of --avatar-file <path> or --clear.');
      args.avatar = values.clear === true ? null : avatarDataUrl(values['avatar-file']!);
      break;
    case 'group-invite':
      method = 'channelGroupInvite';
      args.botSlug = required(values.bot, '--bot');
      break;
    case 'group-invite-cancel':
      method = 'channelGroupInviteCancel';
      args.invitationId = required(values.invitation, '--invitation');
      break;
    case 'group-join-decide':
      method = 'channelGroupJoinDecide';
      if (values.accept === values.decline)
        usage('group-join-decide needs exactly one of --accept or --decline.');
      args.requestId = required(values.request, '--request');
      args.accept = values.accept === true;
      break;
    case 'group-member-remove':
      method = 'channelGroupMemberRemove';
      args.botSlug = required(values.bot, '--bot');
      break;
    case 'group-wake-policies':
      method = 'channelGroupWakePolicies';
      break;
    case 'group-wake-set': {
      method = 'channelGroupWakeSet';
      const mode = values.mode ?? (values.inherit === true ? 'digest' : undefined);
      if (mode === undefined || !WAKE_MODES.has(mode))
        usage('--mode must be all, mentions, digest or silent, unless --inherit resets it.');
      args = {
        channelId,
        botSlug: required(values.bot, '--bot'),
        mode,
        count: integer(values.count, '--count', 1, 100) ?? 5,
        intervalSeconds: integer(values.interval, '--interval', 1, 3600) ?? 30,
        ...(values.inherit === true ? { inherit: true } : {}),
      };
      break;
    }
    case 'group-delete':
      method = 'channelGroupDelete';
      if (values.confirm !== true)
        usage('Deleting a group removes it for every member. Pass --confirm to delete it.');
      break;
    case 'channel-history':
      method = 'channelHistory';
      args = {};
      break;
    case 'channel-history-sources':
      method = 'channelHistorySources';
      if (values.before !== undefined && !/^\d+$/u.test(values.before))
        usage('--before must be the numeric cursor from the previous page.');
      if (values.before !== undefined) args.before = values.before;
      break;
    case 'channel-journal': {
      method = 'channelJournalPage';
      const through = integer(required(values.through, '--through'), '--through', 0, 2 ** 53 - 1);
      const before = integer(values.before, '--before', 1, 2 ** 53 - 1);
      const limit = integer(values.limit, '--limit', 1, 200);
      args = {
        channelId,
        through,
        ...(before === undefined ? {} : { before }),
        ...(limit === undefined ? {} : { limit }),
      };
      break;
    }
    case 'channel-timeline': {
      method = 'channelTimeline';
      if (values.direction !== undefined && !DIRECTIONS.has(values.direction))
        usage('--direction must be older, newer or around.');
      if (values.direction === 'around' && !values.around?.trim())
        usage('--direction around needs --around <message-id>.');
      const limit = integer(values.limit, '--limit', 1, 200);
      const olderLimit = integer(values['older-limit'], '--older-limit', 0, 200);
      const newerLimit = integer(values['newer-limit'], '--newer-limit', 0, 200);
      args = {
        channelId,
        ...(values.direction === undefined ? {} : { direction: values.direction }),
        ...(values.cursor === undefined ? {} : { cursor: values.cursor }),
        ...(values.around === undefined ? {} : { around: values.around.trim() }),
        ...(limit === undefined ? {} : { limit }),
        ...(olderLimit === undefined ? {} : { olderLimit }),
        ...(newerLimit === undefined ? {} : { newerLimit }),
      };
      break;
    }
    case 'channel-mark-read':
      method = 'channelMarkRead';
      args.messageId = required(values['message-id'], '--message-id');
      break;
    case 'channel-mark-all-read':
      method = 'channelMarkAllRead';
      args = {};
      break;
    case 'channel-unread':
      method = 'channelUnreadCounts';
      args = {};
      break;
    case 'channel-mute':
      method = 'channelMuteSet';
      args.muted = values.off !== true;
      break;
    case 'channel-retry':
      method = 'channelRetry';
      args.messageId = required(values['message-id'], '--message-id');
      break;
    case 'channel-purge-preview':
    case 'channel-purge-confirm': {
      method = command === 'channel-purge-preview' ? 'channelPurgePreview' : 'channelPurgeConfirm';
      const sourceEventIds = (values['source-event'] ?? []).map((id) => id.trim()).filter(Boolean);
      if (sourceEventIds.length === 0 || sourceEventIds.length > 100)
        usage(`${command} needs 1 to 100 --source-event <id> flags.`);
      args.sourceEventIds = [...new Set(sourceEventIds)];
      if (command === 'channel-purge-confirm') {
        if (values.confirm !== true)
          usage(
            'Purging permanently removes these Source Events and their content. Pass --confirm.',
          );
        if (values['confirmation-stdin'] !== true)
          usage('channel-purge-confirm reads the preview token with --confirmation-stdin.');
        args.token = await purgeToken(io);
      }
      break;
    }
  }
  const { rpc } = await connect(values, io, AbortSignal.timeout(Math.ceil(seconds * 1000)));
  return rpc(method, args);
}
