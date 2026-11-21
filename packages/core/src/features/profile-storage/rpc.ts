import { unwrap } from '../../bridge/rpc-result.js';
import type { PurgePreview, TextCleanupPreview, TextCleanupResult } from '../../purge/contracts.js';
import type {
  MediaCleanupPreview,
  MediaCleanupResult,
  StorageMediaKind,
  StorageUsage,
} from '../../storage/media-cleanup.js';
import type { DataResetPreview, DataResetResult } from '../../data-reset/reset.js';
import type { ProfileStorageAdapterMethods } from './methods.js';

export function dataResetPreview(methods: ProfileStorageAdapterMethods): {
  preview: DataResetPreview;
} {
  return unwrap(methods.dataResetPreview());
}

export function dataResetConfirm(
  methods: ProfileStorageAdapterMethods,
  token: string,
): { reset: DataResetResult } {
  return unwrap(methods.dataResetConfirm({ token }));
}

export function storageUsage(methods: ProfileStorageAdapterMethods): StorageUsage {
  return unwrap(methods.storageUsage({}));
}

export function storageCleanupPreview(
  methods: ProfileStorageAdapterMethods,
  before: string,
  channelIds?: string[],
  kinds?: StorageMediaKind[],
): MediaCleanupPreview {
  return unwrap(
    methods.storageCleanupPreview({
      before,
      ...(channelIds === undefined ? {} : { channelIds }),
      ...(kinds === undefined ? {} : { kinds }),
    }),
  );
}

export function storageCleanupConfirm(
  methods: ProfileStorageAdapterMethods,
  before: string,
  channelIds: string[] | undefined,
  kinds: StorageMediaKind[] | undefined,
  token: string,
): MediaCleanupResult {
  return unwrap(
    methods.storageCleanupConfirm({
      before,
      ...(channelIds === undefined ? {} : { channelIds }),
      ...(kinds === undefined ? {} : { kinds }),
      token,
    }),
  );
}

export function storageMessagesCleanupPreview(
  methods: ProfileStorageAdapterMethods,
  before: string,
  channelIds?: string[],
): TextCleanupPreview {
  return unwrap(
    methods.storageMessagesCleanupPreview({
      before,
      ...(channelIds === undefined ? {} : { channelIds }),
    }),
  );
}

export function storageMessagesCleanupConfirm(
  methods: ProfileStorageAdapterMethods,
  before: string,
  channelIds: string[] | undefined,
  token: string,
): TextCleanupResult {
  return unwrap(
    methods.storageMessagesCleanupConfirm({
      before,
      ...(channelIds === undefined ? {} : { channelIds }),
      token,
    }),
  );
}

export function channelPurgePreview(
  methods: ProfileStorageAdapterMethods,
  channelId: string,
  sourceEventIds: string[],
): PurgePreview {
  return unwrap(methods.channelPurgePreview({ channelId, sourceEventIds }));
}

export function channelPurgeConfirm(
  methods: ProfileStorageAdapterMethods,
  channelId: string,
  sourceEventIds: string[],
  token: string,
): { accepted: number } {
  return unwrap(methods.channelPurgeConfirm({ channelId, sourceEventIds, token }));
}
