import {
  asObject,
  invalidInput,
  unavailable,
  type BridgeResult,
} from '../../bridge/method-utils.js';
import {
  ContentPurgeError,
  type PurgePreview,
  type TextCleanupPreview,
  type TextCleanupResult,
} from '../../purge/contracts.js';
import {
  STORAGE_MEDIA_KINDS,
  StorageCleanupError,
  type MediaCleanupPreview,
  type MediaCleanupResult,
  type StorageUsage,
} from '../../storage/media-cleanup.js';
import { z } from 'zod';
import {
  DataResetError,
  type DataResetPreview,
  type DataResetResult,
} from '../../data-reset/reset.js';
import type { BridgeMethodsDeps } from '../../bridge/methods.js';
import type { HumanContext } from '../../humans/context.js';

const storageCleanupScope = z
  .object({
    before: z.iso.datetime(),
    channelIds: z.array(z.string().min(1).max(200)).max(500).optional(),
    kinds: z.array(z.enum(STORAGE_MEDIA_KINDS)).min(1).max(4).optional(),
  })
  .strict();

const storageMessagesScope = z
  .object({
    before: z.iso.datetime(),
    channelIds: z.array(z.string().min(1).max(200)).max(500).optional(),
  })
  .strict();

export function purgeFailure(error: unknown, message: string): BridgeResult<never> {
  return {
    ok: false,
    error:
      error instanceof ContentPurgeError
        ? {
            code: error.code === 'purge-preview-stale' ? 'storage-preview-stale' : error.code,
            message: error.message,
          }
        : { code: 'purge-unavailable', message },
  };
}

function storageFailure(
  error: unknown,
  message: string,
  warn?: (message: string) => void,
): BridgeResult<never> {
  if (!(error instanceof StorageCleanupError))
    warn?.(`${message}: ${error instanceof Error ? error.message : String(error)}`);
  return {
    ok: false,
    error:
      error instanceof StorageCleanupError
        ? { code: error.code, message: error.message }
        : { code: 'storage-unavailable', message },
  };
}

function dataResetFailure(error: unknown): BridgeResult<never> {
  if (error instanceof DataResetError)
    return { ok: false, error: { code: error.code, message: error.message } };
  return {
    ok: false,
    error: {
      code: 'data-reset-failed',
      message: error instanceof Error ? error.message : 'BotHarness data could not be cleared',
    },
  };
}

export interface ProfileStorageAdapterMethods {
  dataResetPreview(): BridgeResult<{ preview: DataResetPreview }>;
  dataResetConfirm(payload: unknown): BridgeResult<{ reset: DataResetResult }>;
  channelPurgePreview(payload: unknown): BridgeResult<PurgePreview>;
  storageUsage(payload?: unknown): BridgeResult<StorageUsage>;
  storageCleanupPreview(payload: unknown): BridgeResult<MediaCleanupPreview>;
  storageCleanupConfirm(payload: unknown): BridgeResult<MediaCleanupResult>;
  storageMessagesCleanupPreview(payload: unknown): BridgeResult<TextCleanupPreview>;
  storageMessagesCleanupConfirm(payload: unknown): BridgeResult<TextCleanupResult>;
  channelPurgeConfirm(
    payload: unknown,
  ): BridgeResult<{ accepted: number; cleanupPending?: number }>;
}

export function createProfileStorageAdapterMethods(
  human: HumanContext,
  deps: BridgeMethodsDeps,
): ProfileStorageAdapterMethods {
  return {
    dataResetPreview() {
      if (deps.dataReset === undefined) return unavailable();
      try {
        return { ok: true, value: { preview: deps.dataReset.preview() } };
      } catch (error) {
        return dataResetFailure(error);
      }
    },
    dataResetConfirm(payload) {
      const token = asObject(payload)['token'];
      if (typeof token !== 'string' || token.length === 0 || token.length > 256)
        return invalidInput('token is required');
      if (deps.dataReset === undefined) return unavailable();
      try {
        return { ok: true, value: { reset: deps.dataReset.confirm(token) } };
      } catch (error) {
        return dataResetFailure(error);
      }
    },
    channelPurgePreview(payload) {
      const input = z
        .object({
          channelId: z.string().min(1).max(200),
          sourceEventIds: z.array(z.string().min(1).max(200)).min(1).max(100),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return invalidInput('Invalid purge scope');
      try {
        if (!deps.contentPurge) return unavailable();
        return {
          ok: true,
          value: deps.contentPurge.preview(human, input.data.channelId, input.data.sourceEventIds),
        };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: error instanceof ContentPurgeError ? error.code : 'purge-unavailable',
            message:
              error instanceof ContentPurgeError ? error.message : 'Purge preview is unavailable',
          },
        };
      }
    },
    storageUsage() {
      if (!deps.storage) return unavailable();
      try {
        return { ok: true, value: deps.storage.usage() };
      } catch (error) {
        return storageFailure(error, 'Storage usage is unavailable', deps.warn);
      }
    },
    storageCleanupPreview(payload) {
      const input = storageCleanupScope.safeParse(payload);
      if (!input.success) return invalidInput('Invalid storage cleanup scope');
      if (!deps.storage) return unavailable();
      try {
        return { ok: true, value: deps.storage.preview(input.data) };
      } catch (error) {
        return storageFailure(error, 'Storage cleanup preview is unavailable', deps.warn);
      }
    },
    storageCleanupConfirm(payload) {
      const input = storageCleanupScope
        .extend({ token: z.string().min(1).max(512) })
        .strict()
        .safeParse(payload);
      if (!input.success) return invalidInput('Invalid storage cleanup confirmation');
      if (!deps.storage) return unavailable();
      const { token, ...scope } = input.data;
      try {
        return { ok: true, value: deps.storage.confirm(scope, token) };
      } catch (error) {
        return storageFailure(error, 'Storage cleanup could not complete', deps.warn);
      }
    },
    storageMessagesCleanupPreview(payload) {
      const input = storageMessagesScope.safeParse(payload);
      if (!input.success) return invalidInput('Invalid message cleanup scope');
      if (!deps.contentPurge) return unavailable();
      try {
        return { ok: true, value: deps.contentPurge.textPreview(human, input.data) };
      } catch (error) {
        return purgeFailure(error, 'Message cleanup preview is unavailable');
      }
    },
    storageMessagesCleanupConfirm(payload) {
      const input = storageMessagesScope
        .extend({ token: z.string().min(1).max(512) })
        .strict()
        .safeParse(payload);
      if (!input.success) return invalidInput('Invalid message cleanup confirmation');
      if (!deps.contentPurge) return unavailable();
      const { token, ...scope } = input.data;
      try {
        return { ok: true, value: deps.contentPurge.textConfirm(human, scope, token) };
      } catch (error) {
        return purgeFailure(error, 'Message cleanup could not complete');
      }
    },
    channelPurgeConfirm(payload) {
      const input = z
        .object({
          channelId: z.string().min(1).max(200),
          sourceEventIds: z.array(z.string().min(1).max(200)).min(1).max(100),
          token: z.string().min(1).max(512),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return invalidInput('Invalid purge confirmation');
      try {
        if (!deps.contentPurge) return unavailable();
        return {
          ok: true,
          value: deps.contentPurge.confirm(
            human,
            input.data.channelId,
            input.data.sourceEventIds,
            input.data.token,
          ),
        };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: error instanceof ContentPurgeError ? error.code : 'purge-unavailable',
            message:
              error instanceof ContentPurgeError
                ? error.message
                : 'Purge could not complete; inspect recovery diagnostics',
          },
        };
      }
    },
  };
}
