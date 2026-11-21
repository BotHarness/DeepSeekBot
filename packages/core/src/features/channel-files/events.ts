import {
  importAttachmentFile,
  saveAttachmentFile,
  type AttachmentSaveInput,
} from '../../attachments/file-operations.js';
import type {
  OriginalAttachmentAccess,
  OriginalAttachmentInput,
} from '../../attachments/original-access.js';
import { attachmentIdentity, type ChannelAttachmentRef } from '../../attachments/ref.js';
import { sniffAttachmentMime, type AttachmentStore } from '../../attachments/store.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import type { ChannelRecord } from '../../channels/channel.js';
import type { ChannelStore } from '../../channels/store.js';
import type { SessionOwnership } from '../../sessions/ownership.js';
import type { WorkspaceGrantStore } from '../../workspaces/grants.js';

export interface ChannelFileAccess {
  openAttachment?(input: OriginalAttachmentInput): {
    path: string;
    source: ChannelAttachmentRef;
    access: OriginalAttachmentInput['access'];
  };
  saveAttachment?(
    input: AttachmentSaveInput,
  ): Promise<{ path: string; source: ChannelAttachmentRef; size: number }>;
  importAttachment?(input: {
    filePath: string;
    signal?: AbortSignal;
  }): Promise<ChannelAttachmentRef>;
  readAttachment?(input: {
    channelId?: string;
    messageId: string;
    hash?: string;
    attachmentId?: string;
    maxBytes: number;
    signal?: AbortSignal;
  }): Promise<{ ref: ChannelAttachmentRef; data: Uint8Array }>;
}

export function createChannelFileAccess({
  botSlug,
  sessionId,
  defaultChannelId,
  channels,
  attachments,
  grants,
  ownership,
  registry,
  originalAttachments,
  isClosed,
  authorizedPathRoot,
  resolve,
  beforeSend,
  onImport,
}: {
  botSlug: string;
  sessionId: string;
  defaultChannelId: string | undefined;
  channels: Pick<ChannelStore, 'message' | 'attachmentReference'>;
  attachments: AttachmentStore | undefined;
  grants: WorkspaceGrantStore | undefined;
  ownership: SessionOwnership | undefined;
  registry: Pick<PersonaBotRegistry, 'get' | 'memoryDirFor'>;
  originalAttachments: OriginalAttachmentAccess;
  isClosed: () => boolean;
  authorizedPathRoot: (roots: readonly string[], path: string) => string | undefined;
  resolve: (channelId?: string) => ChannelRecord;
  beforeSend: () => void;
  onImport: ((ref: ChannelAttachmentRef) => void) | undefined;
}): Required<ChannelFileAccess> {
  const attachmentSource = (input: { channelId?: string; messageId: string; fileId: string }) => {
    const bot = registry.get(botSlug);
    if (isClosed() || bot === undefined || bot.paused === true)
      throw new Error('Source Bot is unavailable');
    const channel = resolve(input.channelId);
    const message = channels.message(channel.id, input.messageId);
    if (message === undefined) throw new Error('Source message is unavailable');
    const owned =
      channels.attachmentReference === undefined
        ? message.attachments?.find((ref) => attachmentIdentity(ref) === input.fileId)
        : channels.attachmentReference(channel.id, input.messageId, input.fileId);
    if (owned === undefined) throw new Error('File is not attached to this source message');
    if (attachments === undefined) throw new Error('Attachment file operations are unavailable');
    return attachments.current(owned);
  };
  return {
    openAttachment: (input) => {
      const target = originalAttachments.open(sessionId, input, () => {
        const source = attachmentSource(input);
        if (source.fileId === undefined)
          throw new Error('Original attachment identity is unavailable');
        return {
          source,
          path: attachments!.fileTarget(source.fileId).path,
        };
      });
      if (input.access === 'edit-original') beforeSend();
      return target;
    },
    saveAttachment: async (input) => {
      if (attachments === undefined || grants === undefined)
        throw new Error('Attachment file operations are unavailable');
      return saveAttachmentFile(input, {
        botSlug,
        grants: grants,
        attachments: attachments,
        source: () => attachmentSource(input),
      });
    },
    importAttachment: async (input) => {
      if (attachments === undefined || grants === undefined || ownership === undefined)
        throw new Error('Attachment file operations are unavailable');
      const ref = await importAttachmentFile(input, {
        attachments: attachments,
        authorize: (path) => {
          const bot = registry.get(botSlug);
          if (isClosed() || bot === undefined || bot.paused === true)
            throw new Error('Result Bot is unavailable');
          if (defaultChannelId !== undefined) resolve();
          const roots = grants!
            .list(botSlug)
            .filter((grant) => grant.revokedAt === undefined)
            .flatMap((grant) => {
              try {
                return [grants!.requireActive(botSlug, grant.id).workspacePath];
              } catch {
                return [];
              }
            });
          const memory = registry.memoryDirFor(botSlug);
          if (memory !== undefined) roots.push(memory);
          grants!.validatePath?.(botSlug, path);
          if (authorizedPathRoot(roots, path) === undefined)
            throw new Error('Selected file is outside current authorized directories');
        },
      });
      onImport?.(ref);
      return ref;
    },
    readAttachment: async (input) => {
      const channel = resolve(input.channelId);
      const message = channels.message(channel.id, input.messageId);
      if (message === undefined) throw new Error(`Channel message not found: ${input.messageId}`);
      const identity = input.attachmentId ?? input.hash;
      if (identity === undefined || (input.attachmentId !== undefined && input.hash !== undefined))
        throw new Error('Exactly one attachment identity is required');
      const owned =
        channels.attachmentReference === undefined
          ? message.attachments?.find((candidate) => attachmentIdentity(candidate) === identity)
          : channels.attachmentReference(channel.id, input.messageId, identity);
      const ref = owned === undefined ? undefined : attachments?.current(owned);
      if (ref === undefined) {
        throw new Error(
          `Attachment ${identity} is not attached to Channel message ${input.messageId}`,
        );
      }
      if (!ref.mime.startsWith('image/')) {
        throw new Error(`Attachment ${ref.name} is not a supported Channel image`);
      }
      if (ref.size > input.maxBytes) {
        throw new Error(
          `Attachment ${ref.name} exceeds the ${input.maxBytes}-byte model read limit`,
        );
      }
      if (attachments === undefined) throw new Error('Channel attachment store unavailable');
      const downloaded = await attachments.download(
        attachmentIdentity(ref),
        ref.name,
        input.signal,
      );
      if (downloaded.ref.size > input.maxBytes || !downloaded.ref.mime.startsWith('image/')) {
        await downloaded.body.cancel();
        throw new Error('Attachment changed while opening; retry');
      }
      const reader = downloaded.body.getReader();
      const parts: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          length += next.value.byteLength;
          if (length > input.maxBytes) {
            await reader.cancel();
            throw new Error('Attachment exceeds model read limit');
          }
          parts.push(next.value);
        }
      } finally {
        reader.releaseLock();
      }
      const data = new Uint8Array(length);
      let offset = 0;
      for (const part of parts) {
        data.set(part, offset);
        offset += part.byteLength;
      }
      if (
        data.byteLength !== downloaded.ref.size ||
        sniffAttachmentMime(data.subarray(0, 512)) !== downloaded.ref.mime
      ) {
        throw new Error(`Attachment ${ref.name} changed while being read`);
      }
      return { ref: downloaded.ref, data };
    },
  };
}
