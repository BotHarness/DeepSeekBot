import { isBotDmChannel, LOCAL_HUMAN_ID } from './channel.js';
import type { ChannelStore } from './store.js';

export interface MarkAllReadScope {
  channelId?: string;
  botSlug?: string;
}

export async function markAllHumanMessagesRead(
  store: ChannelStore,
  scope: MarkAllReadScope = {},
): Promise<{ channels: number }> {
  const visible = (id: string): boolean => {
    const channel = store.get(id);
    return (
      channel !== undefined &&
      (scope.channelId === undefined || channel.id === scope.channelId) &&
      (scope.botSlug === undefined ||
        channel.botSlug === scope.botSlug ||
        (channel.type === 'group' && channel.members.includes(scope.botSlug))) &&
      channel.deletedAt === undefined &&
      !isBotDmChannel(channel) &&
      (channel.type === 'dm' ||
        store.listHumanMembers(id).some((member) => member.humanId === LOCAL_HUMAN_ID))
    );
  };
  const heads = store
    .list()
    .filter((channel) => visible(channel.id))
    .flatMap((channel) => {
      const messageId = store.latestHumanMessageId
        ? store.latestHumanMessageId(channel.id)
        : store.readHumanTimeline(channel.id, { limit: 1 })?.entries.at(-1)?.id;
      return messageId === undefined ? [] : [{ channelId: channel.id, messageId }];
    });
  let channels = 0;
  for (const head of heads) {
    if (!visible(head.channelId)) continue;
    const before = store.readPosition(head.channelId);
    const position = await store.markRead(head.channelId, head.messageId);
    if (position === undefined && visible(head.channelId))
      throw new Error('Channel read position could not be confirmed');
    if (position !== undefined && (before === undefined || position.revision > before.revision))
      channels++;
  }
  return { channels };
}
