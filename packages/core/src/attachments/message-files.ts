import { attachmentIdentity } from './ref.js';
import type { ChannelStore } from '../channels/store.js';
import type { ChannelMessage } from '../channels/channel.js';
import { ChannelAttachmentError, type AttachmentStore } from './store.js';
import type { MediaVersions } from './media-versions.js';

export function projectAttachmentFiles(
  message: ChannelMessage,
  store?: AttachmentStore,
  versions?: Pick<MediaVersions, 'describe'>,
): ChannelMessage {
  if (store === undefined || !message.attachments?.some((ref) => ref.fileId !== undefined))
    return message;
  return {
    ...message,
    attachments: message.attachments.map((ref) => {
      if (ref.fileId === undefined) return ref;
      try {
        const current = store.current(ref);
        const facts = versions?.describe(ref.fileId);
        return facts === undefined ? current : { ...current, ...facts };
      } catch {
        return ref;
      }
    }),
  };
}

export function createMessageAttachmentFiles(channels: ChannelStore, store: AttachmentStore) {
  const reference = (channelId: string, messageId: string, fileId: string) => {
    const channel = channels.get(channelId);
    const message =
      channel === undefined || channel.deletedAt !== undefined
        ? undefined
        : channels.message(channelId, messageId);
    const ref =
      message === undefined
        ? undefined
        : channels.attachmentReference === undefined
          ? message.attachments?.find((candidate) => attachmentIdentity(candidate) === fileId)
          : channels.attachmentReference(channelId, messageId, fileId);
    if (ref === undefined)
      throw new ChannelAttachmentError('Attachment is not owned by this message', 'not-found');
    return ref;
  };
  return {
    target(channelId: string, messageId: string, fileId: string) {
      reference(channelId, messageId, fileId);
      return store.fileTarget(fileId);
    },
    async download(channelId: string, messageId: string, fileId: string, signal?: AbortSignal) {
      const ref = reference(channelId, messageId, fileId);
      return store.download(attachmentIdentity(ref), ref.name, signal);
    },
  };
}
