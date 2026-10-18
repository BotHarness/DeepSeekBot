import { attachmentUploadInput } from './cli-attachment-upload.js';
import type { AgentManagementInvocation } from './cli-agent-management.js';
import { CliLiveError } from './cli-live-error.js';
import { channelAvatarDataUrl, channelExpectedState } from './cli-channels.js';

export const TOB_AGENT_CHANNEL_COMMAND_USAGE: Readonly<Record<string, string>> = {
  'attachment-upload':
    'deepseekbot attachment-upload --file <canonical-regular-file> --upload-id <stable-UUID-v4>; uploads up to 25 MiB without sending a message',
  'channel-preferences':
    'deepseekbot channel-preferences <channel-id>; current Human preferences and stateFingerprint, not Group settings',
  'channel-pin':
    'deepseekbot channel-pin <channel-id> [--off] --expected-state <observed-fingerprint>; pin or unpin only this Channel',
  'channel-hide':
    'deepseekbot channel-hide <channel-id> [--off] --expected-state <observed-fingerprint>; hide or show only this Channel',
  'channel-mute':
    'deepseekbot channel-mute <channel-id> [--off] --expected-state <observed-fingerprint>; enable or disable personal do not disturb only for this Channel',
  'channel-human-name-set':
    'deepseekbot channel-human-name-set <channel-id> (--nickname <text> | --clear) --expected-state <observed-fingerprint>; set or clear the Human nickname only in this Channel',
  channels:
    'deepseekbot channels [--limit <1..100>] [--cursor <last-channel-id>]; bounded Channel metadata, not messages',
  channel:
    'deepseekbot channel <group-channel-id>; returns channelFingerprint for reviewed Group changes',
  'channel-rename':
    'deepseekbot channel-rename <group-channel-id> --name <name> --expected-channel <observed-fingerprint>',
  'group-delete':
    'deepseekbot group-delete <group-channel-id> --confirm --expected-channel <observed-fingerprint>; ends the Group for every member and preserves history',
  'group-avatar-set':
    'deepseekbot group-avatar-set <group-channel-id> (--avatar-file <PNG/JPEG/WebP-path> | --clear) --expected-channel <observed-fingerprint>',
  'group-wake-policies': 'deepseekbot group-wake-policies <group-channel-id>',
  'group-wake-set':
    'deepseekbot group-wake-set <group-channel-id> --bot <bot-slug> (--mode <all|mentions|digest|silent> | --inherit) [--count <1..100>] [--interval <1..3600>] --expected-channel <observed-fingerprint>',
  'group-member-remove':
    'deepseekbot group-member-remove <group-channel-id> --bot <bot-slug> --expected-channel <observed-fingerprint>',
  'group-create':
    'deepseekbot group-create <name> --operation-key <stable-key> [--member <bot-slug> ...]; explicit initial members join directly, matching Human group creation',
  'group-invite-cancel':
    'deepseekbot group-invite-cancel <group-channel-id> --invitation <invitation-id> --expected-channel <observed-fingerprint>; cancel a pending invitation only',
  'group-join-decide':
    'deepseekbot group-join-decide <group-channel-id> --request <join-request-id> (--accept | --decline) --expected-channel <observed-fingerprint>; decide one pending join request',
  'group-invite':
    'deepseekbot group-invite <channel-id> --bot <bot-slug> --operation-key <stable-key> --expected-channel <observed-fingerprint>; preserves the existing invitation acceptance policy',
};

const OPTIONS: Readonly<Record<string, readonly string[]>> = {
  'attachment-upload': ['file', 'upload-id'],
  'channel-preferences': [],
  'channel-pin': ['off', 'expected-state'],
  'channel-hide': ['off', 'expected-state'],
  'channel-mute': ['off', 'expected-state'],
  'channel-human-name-set': ['nickname', 'clear', 'expected-state'],
  channels: ['limit', 'cursor'],
  channel: [],
  'channel-rename': ['name', 'expected-channel'],
  'group-delete': ['confirm', 'expected-channel'],
  'group-avatar-set': ['avatar-file', 'clear', 'expected-channel'],
  'group-wake-policies': [],
  'group-wake-set': ['bot', 'mode', 'count', 'interval', 'inherit', 'expected-channel'],
  'group-member-remove': ['bot', 'expected-channel'],
  'group-create': ['member', 'operation-key'],
  'group-invite': ['bot', 'operation-key', 'expected-channel'],
  'group-invite-cancel': ['invitation', 'expected-channel'],
  'group-join-decide': ['request', 'accept', 'decline', 'expected-channel'],
};
function usage(message: string): never {
  throw new CliLiveError('usage', message);
}
function text(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 512 ||
    [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
    usage(`${label} requires nonempty text of at most 512 characters without control characters.`);
  return value.trim();
}
function operationKey(value: unknown): string {
  const key = text(value, '--operation-key');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(key))
    usage(
      '--operation-key requires 8–128 letters, digits, dots, underscores, colons or hyphens, beginning with a letter or digit.',
    );
  return key;
}
function fingerprint(value: unknown): string {
  const result = text(value, '--expected-channel');
  if (!/^[a-f0-9]{64}$/u.test(result))
    usage('--expected-channel must be the observed Channel fingerprint.');
  return result;
}
function integer(value: unknown, flag: string, max: number, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/u.test(value.trim()))
    usage(`${flag} must be an integer from 1 to ${String(max)}.`);
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1 || result > max)
    usage(`${flag} must be an integer from 1 to ${String(max)}.`);
  return result;
}
export async function parseAgentChannels(
  command: string,
  rest: string[],
  values: Record<string, unknown>,
): Promise<AgentManagementInvocation | undefined> {
  if (!Object.hasOwn(OPTIONS, command)) return undefined;
  const allowed = new Set(['compact', 'help', 'timeout', ...OPTIONS[command]!]);
  if (Object.entries(values).some(([key, value]) => value !== undefined && !allowed.has(key)))
    throw new CliLiveError(
      'agent-scope-denied',
      'This option is not available for the scoped Channel operation.',
    );
  if (rest.length !== (command === 'channels' || command === 'attachment-upload' ? 0 : 1))
    usage('This Channel operation has missing or extra positional arguments.');
  if (command === 'attachment-upload') {
    const upload = attachmentUploadInput(values.file, values['upload-id'], true);
    return {
      command,
      args: { name: upload.name, uploadId: upload.uploadId, data: upload.bytes.toString('base64') },
      write: true,
    };
  }
  if (command === 'channels') {
    const args: Record<string, unknown> = {};
    if (values.limit !== undefined) {
      if (typeof values.limit !== 'string' || !/^\d+$/u.test(values.limit))
        usage('--limit must be an integer from 1 to 100.');
      const limit = Number(values.limit);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
        usage('--limit must be an integer from 1 to 100.');
      args.limit = limit;
    }
    if (values.cursor !== undefined) args.cursor = text(values.cursor, '--cursor');
    return { command, args, write: false };
  }
  const target = text(rest[0], command === 'group-create' ? 'Group name' : 'Channel ID');
  if (
    command === 'channel' ||
    command === 'group-wake-policies' ||
    command === 'channel-preferences'
  )
    return { command, args: { channelId: target }, write: false };
  if (['channel-pin', 'channel-hide', 'channel-mute', 'channel-human-name-set'].includes(command)) {
    const args: Record<string, unknown> = {
      channelId: target,
      expectedState: channelExpectedState(values['expected-state']),
    };
    if (command === 'channel-human-name-set') {
      if (
        (values.clear !== undefined && typeof values.clear !== 'boolean') ||
        (values.nickname === undefined) === (values.clear !== true)
      )
        usage('channel-human-name-set needs --nickname or --clear, not both or neither.');
      const nickname = values.clear === true ? null : text(values.nickname, '--nickname');
      if (nickname !== null && nickname.length > 128)
        usage('--nickname must contain at most 128 characters.');
      args.nickname = nickname;
    } else {
      if (values.off !== undefined && typeof values.off !== 'boolean')
        usage('--off must be a boolean flag.');
      const field =
        command === 'channel-pin' ? 'pinned' : command === 'channel-hide' ? 'hidden' : 'muted';
      args[field] = values.off !== true;
    }
    return { command, args, write: true };
  }
  if (command !== 'group-create' && command !== 'group-invite') {
    const args: Record<string, unknown> = {
      channelId: target,
      expectedChannel: fingerprint(values['expected-channel']),
    };
    switch (command) {
      case 'group-delete':
        if (values.confirm !== true) usage('group-delete requires --confirm.');
        args.confirm = true;
        break;
      case 'channel-rename':
        args.name = text(values.name, '--name');
        break;
      case 'group-avatar-set':
        if ((values['avatar-file'] === undefined) === (values.clear !== true))
          usage('group-avatar-set needs exactly one of --avatar-file <path> or --clear.');
        args.avatar =
          values.clear === true
            ? null
            : await channelAvatarDataUrl(text(values['avatar-file'], '--avatar-file'));
        break;
      case 'group-invite-cancel':
        args.invitationId = text(values.invitation, '--invitation');
        break;
      case 'group-join-decide':
        if (
          (values.accept !== undefined && typeof values.accept !== 'boolean') ||
          (values.decline !== undefined && typeof values.decline !== 'boolean') ||
          (values.accept === true) === (values.decline === true)
        )
          usage('group-join-decide needs exactly one of --accept or --decline.');
        args.requestId = text(values.request, '--request');
        args.accept = values.accept === true;
        break;
      case 'group-member-remove':
        args.botSlug = text(values.bot, '--bot');
        break;
      case 'group-wake-set': {
        const mode = values.mode ?? (values.inherit === true ? 'digest' : undefined);
        if (typeof mode !== 'string' || !['all', 'mentions', 'digest', 'silent'].includes(mode))
          usage('--mode must be all, mentions, digest or silent, unless --inherit resets it.');
        Object.assign(args, {
          botSlug: text(values.bot, '--bot'),
          mode,
          count: integer(values.count, '--count', 100, 5),
          intervalSeconds: integer(values.interval, '--interval', 3600, 30),
          ...(values.inherit === true ? { inherit: true } : {}),
        });
        break;
      }
    }
    return { command, args, write: true };
  }
  const key = operationKey(values['operation-key']);
  if (command === 'group-create') {
    if (
      values.member !== undefined &&
      (!Array.isArray(values.member) || values.member.length > 100)
    )
      usage('--member must be a list of at most 100 Bot IDs.');
    const members = ((values.member ?? []) as unknown[]).map((member) => text(member, '--member'));
    if (new Set(members).size !== members.length)
      usage('--member must not contain duplicate Bot IDs.');
    return { command, args: { name: target, members, operationKey: key }, write: true };
  }
  const expectedChannel = fingerprint(values['expected-channel']);
  return {
    command,
    args: {
      channelId: target,
      botSlug: text(values.bot, '--bot'),
      expectedChannel,
      operationKey: key,
    },
    write: true,
  };
}
