import type { ChannelAttachmentRef, ChannelMessage } from './store.js';

export type GeneratedFile = { messageId: string; ref: ChannelAttachmentRef };

export function createGeneratedFilesHistory(botSlug: string) {
  const entries = new Map<string, { at: string; files: GeneratedFile[] }>();
  const liveIds = new Set<string>();
  const purgedIds = new Set<string>();
  return {
    accept(messages: readonly ChannelMessage[], source: 'history' | 'live'): void {
      for (const message of messages) {
        if (source === 'history' && liveIds.has(message.id)) continue;
        if (source === 'live') liveIds.add(message.id);
        if (message.contentPurged) purgedIds.add(message.id);
        entries.delete(message.id);
        if (
          purgedIds.has(message.id) ||
          message.author.kind !== 'bot' ||
          message.author.slug !== botSlug ||
          !message.attachments?.length
        )
          continue;
        entries.set(message.id, {
          at: message.at,
          files: message.attachments.map((ref) => ({ messageId: message.id, ref })),
        });
      }
    },
    purge(messageIds: readonly string[]): void {
      for (const id of messageIds) {
        purgedIds.add(id);
        entries.delete(id);
      }
    },
    files(): GeneratedFile[] {
      return [...entries.values()]
        .sort((left, right) => right.at.localeCompare(left.at))
        .flatMap((entry) => entry.files);
    },
  };
}
