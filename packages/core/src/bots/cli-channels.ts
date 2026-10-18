import {
  AvatarSourceError,
  MAX_GROUP_AVATAR_IMAGE_BYTES,
  prepareAvatarImage,
  readAvatarSource,
} from './avatar-source.js';
import { writeFileSync } from 'node:fs';
import { attachmentUploadInput } from './cli-attachment-upload.js';
import { createHash } from 'node:crypto';
import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';
import type { connectLiveHost } from './cli-live.js';

export const CHANNEL_OPTIONS = {
  file: { type: 'string' },
  'upload-id': { type: 'string' },
  'avatar-file': { type: 'string' },
  'expected-channel': { type: 'string' },
  'expected-state': { type: 'string' },
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
  emoji: { type: 'string' },
  remove: { type: 'boolean' },
  off: { type: 'boolean' },
  attachment: { type: 'string' },
} as const;

export const CHANNEL_COMMANDS = [
  {
    command: 'attachment-upload',
    description: 'upload a local file without sending it; optional stable --upload-id UUID',
  },
  {
    command: 'channel-preferences',
    description: 'read personal Channel preferences and their current fingerprint',
  },
  { command: 'channel-pin', description: 'pin one Channel, or unpin it with --off' },
  { command: 'channel-hide', description: 'hide one Channel, or show it with --off' },
  { command: 'channel', description: 'read a group Channel and its current fingerprint' },
  {
    command: 'channel-media-target',
    description: 'acquire authorized source media and resolve its Host file target',
  },
  {
    command: 'channel-media-download',
    description: 'download authorized source media to a new local --out file',
  },
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
  {
    command: 'group-send-review',
    description: 'read Group send review; --accept enables and --off disables it',
  },
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
  {
    command: 'channel-react',
    description: 'add or remove your emoji reaction on one Channel message',
  },
  { command: 'channel-search', description: "search a Channel's messages, newest first" },
  { command: 'channel-unread', description: 'list unread message counts per Channel' },
  {
    command: 'channel-mute',
    description: 'mute a Channel so it stays out of unread badges, or unmute it with --off',
  },
  { command: 'channel-retry', description: 'retry a failed Bot reply to a Human DM message' },
  { command: 'channel-bot-stop', description: "stop a working Bot's current turn in a Channel" },
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
  file?: string;
  'upload-id'?: string;
  'operation-key'?: string;
  'expected-channel'?: string;
  'expected-state'?: string;
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
  emoji?: string;
  remove?: boolean;
  query?: string;
  off?: boolean;
  attachment?: string;
  out?: string;
}

const WAKE_MODES = new Set(['all', 'mentions', 'digest', 'silent']);
const DIRECTIONS = new Set(['older', 'newer', 'around']);

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}

export function channelExpectedState(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value))
    usage('--expected-state must be the observed personal Channel preferences fingerprint.');
  return value;
}

export function channelOperationKey(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(value))
    usage(
      '--operation-key must be 8–128 letters, digits, dots, underscores, colons or hyphens, starting with a letter or digit.',
    );
  return value;
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

export async function channelAvatarDataUrl(path: string): Promise<string> {
  try {
    return await prepareAvatarImage(readAvatarSource(path), MAX_GROUP_AVATAR_IMAGE_BYTES);
  } catch (error) {
    if (error instanceof AvatarSourceError) usage(error.message);
    throw error;
  }
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
    command === 'attachment-upload' ||
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

  if (command === 'attachment-upload') {
    const upload = attachmentUploadInput(values.file, values['upload-id']);
    const host = await connect(values, io, AbortSignal.timeout(Math.ceil(seconds * 1000)));
    const response = await host.stream(
      '/api/botharness/attachment/upload?' +
        new URLSearchParams({ name: upload.name, uploadId: upload.uploadId }),
      {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: new Uint8Array(upload.bytes),
      },
    );
    return { ...(await response.json()), sha256: upload.sha256, uploadId: upload.uploadId };
  }
  let args: Record<string, unknown> = { channelId };
  let method: string;
  switch (command) {
    case 'channel-preferences':
      method = 'channelPreferences';
      break;
    case 'channel-pin':
      method = 'channelPinSet';
      args.pinned = values.off !== true;
      break;
    case 'channel-hide':
      method = 'channelHiddenSet';
      args.hidden = values.off !== true;
      break;
    case 'channel':
      method = 'channelGet';
      break;
    case 'channel-media-target':
    case 'channel-media-download':
      method = 'channelMediaTarget';
      if (values['source-event']?.length !== 1)
        usage('--source-event must identify exactly one Source Event.');
      args.sourceEventId = required(values['source-event'][0], '--source-event');
      args.attachmentId = required(values.attachment, '--attachment');
      if (command === 'channel-media-download') required(values.out, '--out');
      break;
    case 'channel-rename':
      method = 'channelRename';
      args.name = required(values.name, '--name');
      break;
    case 'group-avatar-set':
      method = 'channelGroupAvatarSet';
      if ((values['avatar-file'] === undefined) === (values.clear !== true))
        usage('group-avatar-set needs exactly one of --avatar-file <path> or --clear.');
      args.avatar =
        values.clear === true ? null : await channelAvatarDataUrl(values['avatar-file']!);
      break;
    case 'group-invite':
      method = 'channelGroupInvite';
      args.botSlug = required(values.bot, '--bot');
      if (values['operation-key'] !== undefined)
        args.operationKey = channelOperationKey(values['operation-key']);
      if (values['expected-channel'] !== undefined)
        args.expectedChannel = required(values['expected-channel'], '--expected-channel');
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
    case 'group-send-review':
      method = 'channelGroupSendReview';
      if (values.accept && values.off) usage('Choose --accept or --off');
      if (values.accept || values.off) args.enabled = values.accept === true;
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
    case 'channel-react':
      method = 'channelReact';
      args.messageId = required(values['message-id'], '--message-id');
      args.emoji = required(values.emoji, '--emoji');
      args.active = values.remove !== true;
      break;
    case 'channel-search': {
      method = 'channelSearch';
      const limit = integer(values.limit, '--limit', 1, 50);
      args.text = required(values.query, '--query');
      if (values.cursor !== undefined) args.cursor = values.cursor;
      if (limit !== undefined) args.limit = limit;
      break;
    }
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
    case 'channel-bot-stop':
      method = 'channelBotStop';
      args.botSlug = required(values.bot, '--bot');
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
  if (values['expected-channel'] !== undefined && command !== 'group-invite') {
    const fingerprint = required(values['expected-channel'], '--expected-channel');
    if (!/^[a-f0-9]{64}$/u.test(fingerprint))
      usage('--expected-channel must be the observed Channel fingerprint.');
    args.expectedChannel = fingerprint;
  }

  if (values['expected-state'] !== undefined)
    args.expectedState = channelExpectedState(values['expected-state']);

  const host = await connect(values, io, AbortSignal.timeout(Math.ceil(seconds * 1000)));
  if (command === 'channel-media-download') {
    const { bytes, response } = await host.http(
      '/api/botharness/attachment?' +
        new URLSearchParams({
          channelId,
          sourceEventId: String(args.sourceEventId),
          attachmentId: String(args.attachmentId),
        }),
    );
    if (bytes.byteLength > 25 * 1024 * 1024)
      throw new CliLiveError('too-large', 'Attachment exceeds the 25 MiB limit.');
    try {
      writeFileSync(values.out!, bytes, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      const exists = error instanceof Error && 'code' in error && error.code === 'EEXIST';
      throw new CliLiveError(
        exists ? 'output-exists' : 'output-unavailable',
        exists
          ? 'The output already exists; choose a new --out path.'
          : 'Could not write the output file.',
      );
    }
    return {
      download: {
        path: values.out,
        bytes: bytes.byteLength,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        mime: response.headers.get('content-type'),
      },
    };
  }
  return host.rpc(method, args);
}
