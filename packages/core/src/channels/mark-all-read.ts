import { type HumanContext } from '../humans/context.js';
import { isBotDmChannel } from './channel.js';
import type { ChannelStore } from './store.js';

export interface MarkAllReadScope {
  channelId?: string;
  botSlug?: string;
}

export async function markAllHumanMessagesRead(
  human: HumanContext,
  store: ChannelStore,
  scope: MarkAllReadScope = {},
): Promise<{ channels: number }> {
  const visible = (human: HumanContext, id: string): boolean => {
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
        store.listHumanMembers(human, id).some((member) => member.humanId === human.humanId))
    );
  };
  const heads = store
    .list()
    .filter((channel) => visible(human, channel.id))
    .flatMap((channel) => {
      const messageId = store.latestHumanMessageId
        ? store.latestHumanMessageId(human, channel.id)
        : store.readHumanTimeline(human, channel.id, { limit: 1 })?.entries.at(-1)?.id;
      return messageId === undefined ? [] : [{ channelId: channel.id, messageId }];
    });
  let channels = 0;
  for (const head of heads) {
    if (!visible(human, head.channelId)) continue;
    const before = store.readPosition(human, head.channelId);
    const position = await store.markRead(human, head.channelId, head.messageId);
    if (position === undefined && visible(human, head.channelId))
      throw new Error('Channel read position could not be confirmed');
    if (position !== undefined && (before === undefined || position.revision > before.revision))
      channels++;
  }
  return { channels };
}
