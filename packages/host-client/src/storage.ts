import type { HostClient } from './client';

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

export type StorageKeptReason = 'bot-working' | 'delivery-pending' | 'memory' | 'migration';

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

export type StorageMessagesKeptReason = 'bot-working' | 'delivery-pending' | 'shared';

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

export function loadStorageUsage(client: HostClient): Promise<StorageUsage> {
  return client.call<StorageUsage>('storageUsage');
}

export function previewStorageCleanup(
  client: HostClient,
  scope: StorageCleanupScope,
): Promise<StorageCleanupPreview> {
  return client.call<StorageCleanupPreview>('storageCleanupPreview', { ...scope });
}

export function confirmStorageCleanup(
  client: HostClient,
  preview: StorageCleanupPreview,
): Promise<StorageCleanupResult> {
  return client.call<StorageCleanupResult>('storageCleanupConfirm', {
    before: preview.scope.before,
    ...(preview.scope.channelIds.length === 0 ? {} : { channelIds: preview.scope.channelIds }),
    kinds: preview.scope.kinds,
    token: preview.token,
  });
}

export function previewStorageMessages(
  client: HostClient,
  scope: { before: string; channelIds?: string[] },
): Promise<StorageMessagesPreview> {
  return client.call<StorageMessagesPreview>('storageMessagesCleanupPreview', { ...scope });
}

export function confirmStorageMessages(
  client: HostClient,
  preview: StorageMessagesPreview,
): Promise<StorageMessagesResult> {
  return client.call<StorageMessagesResult>('storageMessagesCleanupConfirm', {
    before: preview.scope.before,
    ...(preview.scope.channelIds.length === 0 ? {} : { channelIds: preview.scope.channelIds }),
    token: preview.token,
  });
}
