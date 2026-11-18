import type { HostClient } from './client';
import { HostAnswerInvalid } from './bot-settings';

type HostCall = Pick<HostClient, 'call'>;

export type StorageMediaKind = 'image' | 'video' | 'audio' | 'file';
export const STORAGE_MEDIA_KINDS: readonly StorageMediaKind[] = ['image', 'video', 'audio', 'file'];

export type StoragePartKind = 'media' | 'messages' | 'memory' | 'other';
export const STORAGE_PARTS: readonly StoragePartKind[] = ['media', 'messages', 'memory', 'other'];

export interface StorageChatUsage {
  channelId: string;
  name: string;
  type: 'dm' | 'group';
  deleted?: true;
  messages: number;
  mediaBytes: number;
}

export interface StorageUsage {
  totalBytes: number;
  parts: { kind: StoragePartKind; bytes: number }[];
  chats: StorageChatUsage[];
}

export interface StorageCleanupScope {
  before: string;
  channelIds?: string[];
  kinds: StorageMediaKind[];
}

export const STORAGE_KEPT = ['bot-working', 'delivery-pending', 'memory', 'migration'] as const;
export type StorageKeptReason = (typeof STORAGE_KEPT)[number];

export interface StorageCleanupPreview {
  token: string;
  scope: { before: string; channelIds: string[]; kinds: StorageMediaKind[] };
  messages: number;
  files: number;
  bytes: number;
  freedBytes: number;
  kept: { reason: StorageKeptReason; files: number }[];
}

export interface StorageCleanupResult {
  messages: number;
  files: number;
  freedBytes: number;
}

export const STORAGE_MESSAGES_KEPT = ['bot-working', 'delivery-pending', 'shared'] as const;
export type StorageMessagesKeptReason = (typeof STORAGE_MESSAGES_KEPT)[number];

export interface StorageMessagesPreview {
  token: string;
  scope: { before: string; channelIds: string[] };
  messages: number;
  bytes: number;
  files: number;
  chats: { channelId: string; name: string; messages: number }[];
  kept: { reason: StorageMessagesKeptReason; messages: number }[];
  memoryReferences: number;
  more: boolean;
}

export interface StorageMessagesResult {
  messages: number;
  freedBytes: number;
}

export const STORAGE_AGES = ['30', '90', '180', '365', 'all'] as const;
export type StorageAge = (typeof STORAGE_AGES)[number];

const DAY = 24 * 60 * 60 * 1000;

export function storageCutoff(age: StorageAge, now: number = Date.now()): string {
  return new Date(age === 'all' ? now : now - Number(age) * DAY).toISOString();
}

export function storageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function exactCount(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new HostAnswerInvalid(`${what} is not a count.`);
  return value;
}

function list(value: unknown): Record<string, unknown>[] {
  return (Array.isArray(value) ? value : []).flatMap((entry: unknown) => {
    const item = record(entry);
    return item === undefined ? [] : [item];
  });
}

function oneOf<T extends string>(options: readonly T[], value: unknown): value is T {
  return (options as readonly unknown[]).includes(value);
}

function ids(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((id): id is string => typeof id === 'string'))
    throw new HostAnswerInvalid('Storage cleanup returned an invalid chat restriction.');
  return value;
}

export function parseStorageUsage(value: unknown): StorageUsage {
  const usage = record(value);
  if (usage === undefined || !Array.isArray(usage['parts']) || !Array.isArray(usage['chats']))
    throw new HostAnswerInvalid('storageUsage returned no parts or chats.');
  return {
    totalBytes: count(usage['totalBytes']),
    parts: list(usage['parts']).flatMap((part) =>
      oneOf(STORAGE_PARTS, part['kind'])
        ? [{ kind: part['kind'], bytes: count(part['bytes']) }]
        : [],
    ),
    chats: list(usage['chats']).flatMap((chat) =>
      typeof chat['channelId'] === 'string' && typeof chat['name'] === 'string'
        ? [
            {
              channelId: chat['channelId'],
              name: chat['name'],
              type: chat['type'] === 'dm' ? ('dm' as const) : ('group' as const),
              ...(chat['deleted'] === true ? { deleted: true as const } : {}),
              messages: count(chat['messages']),
              mediaBytes: count(chat['mediaBytes']),
            },
          ]
        : [],
    ),
  };
}

export function parseStorageCleanupPreview(value: unknown): StorageCleanupPreview {
  const preview = record(value);
  const scope = record(preview?.['scope']);
  const token = preview?.['token'];
  if (typeof token !== 'string' || typeof scope?.['before'] !== 'string')
    throw new HostAnswerInvalid('storageCleanupPreview returned no token or scope.');
  return {
    token,
    scope: {
      before: scope['before'],
      channelIds: ids(scope['channelIds']),
      kinds: Array.isArray(scope['kinds'])
        ? scope['kinds'].filter((kind): kind is StorageMediaKind =>
            oneOf(STORAGE_MEDIA_KINDS, kind),
          )
        : [...STORAGE_MEDIA_KINDS],
    },
    messages: count(preview?.['messages']),
    files: count(preview?.['files']),
    bytes: count(preview?.['bytes']),
    freedBytes: count(preview?.['freedBytes']),
    kept: list(preview?.['kept']).flatMap((item) =>
      oneOf(STORAGE_KEPT, item['reason'])
        ? [{ reason: item['reason'], files: count(item['files']) }]
        : [],
    ),
  };
}

export function parseStorageMessagesPreview(value: unknown): StorageMessagesPreview {
  const preview = record(value);
  const scope = record(preview?.['scope']);
  const token = preview?.['token'];
  if (typeof token !== 'string' || typeof scope?.['before'] !== 'string')
    throw new HostAnswerInvalid('storageMessagesCleanupPreview returned no token or scope.');
  return {
    token,
    scope: { before: scope['before'], channelIds: ids(scope['channelIds']) },
    messages: count(preview?.['messages']),
    bytes: count(preview?.['bytes']),
    files: count(preview?.['files']),
    chats: list(preview?.['chats']).flatMap((chat) =>
      typeof chat['channelId'] === 'string' && typeof chat['name'] === 'string'
        ? [{ channelId: chat['channelId'], name: chat['name'], messages: count(chat['messages']) }]
        : [],
    ),
    kept: list(preview?.['kept']).flatMap((item) =>
      oneOf(STORAGE_MESSAGES_KEPT, item['reason'])
        ? [{ reason: item['reason'], messages: count(item['messages']) }]
        : [],
    ),
    memoryReferences: exactCount(
      preview?.['memoryReferences'],
      'storageMessagesCleanupPreview memoryReferences',
    ),
    more: preview?.['more'] === true,
  };
}

export async function loadStorageUsage(host: HostCall): Promise<StorageUsage> {
  return parseStorageUsage(await host.call<unknown>('storageUsage'));
}

export async function previewStorageCleanup(
  host: HostCall,
  scope: StorageCleanupScope,
): Promise<StorageCleanupPreview> {
  return parseStorageCleanupPreview(
    await host.call<unknown>('storageCleanupPreview', { ...scope }),
  );
}

export async function confirmStorageCleanup(
  host: HostCall,
  preview: Pick<StorageCleanupPreview, 'scope' | 'token'>,
): Promise<StorageCleanupResult> {
  const result = record(
    await host.call<unknown>('storageCleanupConfirm', {
      before: preview.scope.before,
      ...(preview.scope.channelIds.length === 0 ? {} : { channelIds: preview.scope.channelIds }),
      kinds: preview.scope.kinds,
      token: preview.token,
    }),
  );
  return {
    messages: exactCount(result?.['messages'], 'storageCleanupConfirm messages'),
    files: exactCount(result?.['files'], 'storageCleanupConfirm files'),
    freedBytes: exactCount(result?.['freedBytes'], 'storageCleanupConfirm freedBytes'),
  };
}

export async function previewStorageMessages(
  host: HostCall,
  scope: { before: string; channelIds?: string[] },
): Promise<StorageMessagesPreview> {
  return parseStorageMessagesPreview(
    await host.call<unknown>('storageMessagesCleanupPreview', { ...scope }),
  );
}

export async function confirmStorageMessages(
  host: HostCall,
  preview: Pick<StorageMessagesPreview, 'scope' | 'token'>,
): Promise<StorageMessagesResult> {
  const result = record(
    await host.call<unknown>('storageMessagesCleanupConfirm', {
      before: preview.scope.before,
      ...(preview.scope.channelIds.length === 0 ? {} : { channelIds: preview.scope.channelIds }),
      token: preview.token,
    }),
  );
  return {
    messages: exactCount(result?.['messages'], 'storageMessagesCleanupConfirm messages'),
    freedBytes: exactCount(result?.['freedBytes'], 'storageMessagesCleanupConfirm freedBytes'),
  };
}
