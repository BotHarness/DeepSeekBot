import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';
import { STORAGE_MEDIA_KINDS, type StorageMediaKind } from '../storage/media-cleanup.js';

type Rpc = (method: string, payload: Record<string, unknown>) => Promise<unknown>;

export const STORAGE_OPTIONS = {
  chat: { type: 'string', multiple: true },
  media: { type: 'string', multiple: true },
  'older-than-days': { type: 'string' },
} as const;

export const STORAGE_COMMANDS = [
  {
    command: 'storage-usage',
    description: 'show how much space media, messages and Memory use, and each chat’s media',
  },
  {
    command: 'storage-cleanup-preview',
    description:
      'preview clearing chat media older than --before <time> or --older-than-days <n>; returns a token',
  },
  {
    command: 'storage-cleanup-confirm',
    description:
      'clear the previewed chat media; pipe the preview JSON on stdin and pass --confirm',
  },
  {
    command: 'storage-messages-cleanup-preview',
    description:
      'preview deleting chat messages older than --before <time> or --older-than-days <n>; returns a token',
  },
  {
    command: 'storage-messages-cleanup-confirm',
    description:
      'delete the previewed chat messages; pipe the preview JSON on stdin and pass --confirm',
  },
] as const;

type Command = (typeof STORAGE_COMMANDS)[number]['command'];

export interface StorageValues {
  before?: string;
  'older-than-days'?: string;
  chat?: string[];
  media?: string[];
  confirm?: boolean;
  'confirmation-stdin'?: boolean;
}

export function isStorageCommand(command: string): command is Command {
  return STORAGE_COMMANDS.some((entry) => entry.command === command);
}

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}

function scope(values: StorageValues, now: Date, messages = false): Record<string, unknown> {
  if ((values.before === undefined) === (values['older-than-days'] === undefined))
    usage('Pass exactly one of --before <ISO time> or --older-than-days <days>.');
  let before: Date;
  if (values.before !== undefined) {
    before = new Date(values.before.trim());
    if (!Number.isFinite(before.getTime())) usage('--before must be an ISO date or time.');
  } else {
    const days = values['older-than-days']!.trim();
    if (!/^\d+$/u.test(days) || Number(days) > 36_500)
      usage('--older-than-days must be whole days from 0 to 36500.');
    before = new Date(now.getTime() - Number(days) * 24 * 60 * 60 * 1000);
  }
  if (messages && values.media !== undefined)
    usage('--media applies to storage-cleanup only; message cleanup covers whole messages.');
  const kinds = [...new Set((values.media ?? []).map((kind) => kind.trim()))];
  if (kinds.some((kind) => !(STORAGE_MEDIA_KINDS as readonly string[]).includes(kind)))
    usage(`--media must be one of ${STORAGE_MEDIA_KINDS.join(', ')}.`);
  const channelIds = [...new Set((values.chat ?? []).map((id) => id.trim()).filter(Boolean))];
  return {
    before: before.toISOString(),
    ...(channelIds.length === 0 ? {} : { channelIds }),
    ...(kinds.length === 0 ? {} : { kinds: kinds as StorageMediaKind[] }),
  };
}

async function confirmation(
  io: BotCreateCliIo,
  preview: string,
): Promise<{ token: string; scope?: Record<string, unknown> }> {
  let input: unknown;
  try {
    input = JSON.parse(await (io.readStdin?.() ?? Promise.resolve('')));
  } catch {
    usage(`Confirmation stdin must be JSON with the token from ${preview}.`);
  }
  if (
    typeof input !== 'object' ||
    input === null ||
    !('token' in input) ||
    typeof input.token !== 'string' ||
    !input.token.trim() ||
    input.token.length > 512
  )
    usage(`Confirmation stdin must contain the token string from ${preview}.`);
  const previewed = 'scope' in input ? input.scope : undefined;
  if (previewed === undefined) return { token: input.token };
  if (
    typeof previewed !== 'object' ||
    previewed === null ||
    !('before' in previewed) ||
    typeof previewed.before !== 'string'
  )
    usage(`The scope on stdin must be the one ${preview} returned.`);
  const { before, channelIds, kinds } = previewed as Record<string, unknown>;
  return {
    token: input.token,
    scope: {
      before,
      ...(Array.isArray(channelIds) && channelIds.length > 0 ? { channelIds } : {}),
      ...(Array.isArray(kinds) ? { kinds } : {}),
    },
  };
}

export async function runStorageCommand(
  command: Command,
  rest: string[],
  values: StorageValues,
  io: BotCreateCliIo,
  connect: () => Promise<Rpc>,
  now: () => Date = () => new Date(),
): Promise<unknown> {
  if (rest.length !== 0) usage(`${command} takes no positional arguments.`);
  if (command === 'storage-usage') return (await connect())('storageUsage', {});
  const messages = command.startsWith('storage-messages-');
  if (command === 'storage-cleanup-preview')
    return (await connect())('storageCleanupPreview', scope(values, now()));
  if (command === 'storage-messages-cleanup-preview')
    return (await connect())('storageMessagesCleanupPreview', scope(values, now(), true));
  if (values.confirm !== true)
    usage(
      messages
        ? 'Deleting permanently removes these messages and their files. Pass --confirm.'
        : 'Clearing permanently deletes these images, videos, audio and files. Pass --confirm.',
    );
  if (values['confirmation-stdin'] !== true)
    usage(`${command} reads the preview JSON or its token with --confirmation-stdin.`);
  const { token, scope: previewed } = await confirmation(
    io,
    messages ? 'storage-messages-cleanup-preview' : 'storage-cleanup-preview',
  );
  const args =
    previewed ??
    (values.before === undefined
      ? usage('Pipe the preview JSON on stdin, or pass the same --before the preview returned.')
      : scope(values, now(), messages));
  return (await connect())(messages ? 'storageMessagesCleanupConfirm' : 'storageCleanupConfirm', {
    ...(messages
      ? { before: args.before, ...(args.channelIds ? { channelIds: args.channelIds } : {}) }
      : args),
    token,
  });
}
