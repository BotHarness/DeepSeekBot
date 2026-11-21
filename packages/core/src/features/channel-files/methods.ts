import {
  asNonBlank,
  asObject,
  invalidInput,
  type BridgeResult,
} from '../../bridge/method-utils.js';
import { createMessageAttachmentFiles } from '../../attachments/message-files.js';
import { ChannelAttachmentError } from '../../attachments/store.js';
import { type MemoryFileTarget } from '../../memory/file-actions.js';
import type { BridgeMethodsDeps } from '../../bridge/methods.js';

export interface ChannelFilesAdapterMethods {
  messageAttachmentTarget(payload: unknown): BridgeResult<{ target: MemoryFileTarget }>;
}

export function createChannelFilesAdapterMethods(
  deps: BridgeMethodsDeps,
): ChannelFilesAdapterMethods {
  return {
    messageAttachmentTarget(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const messageId = asNonBlank(source, 'messageId');
      const fileId = asNonBlank(source, 'fileId');
      if (channelId === undefined || messageId === undefined || fileId === undefined)
        return invalidInput('channelId, messageId and fileId are required');
      if (deps.attachments === undefined)
        return {
          ok: false,
          error: {
            code: 'storage-unavailable',
            message: 'Attachment store unavailable',
          },
        };
      try {
        return {
          ok: true,
          value: {
            target: createMessageAttachmentFiles(deps.channels, deps.attachments).target(
              channelId,
              messageId,
              fileId,
            ),
          },
        };
      } catch (error) {
        if (error instanceof ChannelAttachmentError)
          return {
            ok: false,
            error: {
              code: error.code === 'not-found' ? 'not-found' : 'invalid-input',
              message: error.message,
            },
          };
        throw error;
      }
    },
  };
}
