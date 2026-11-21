import { markChannelRead } from '@botharness/host-client/channel-messages';
import { createConversation, type Conversation } from '@botharness/host-client/conversation';
import { observeInbox } from '@botharness/host-client/inbox';
import type { RemoteHosts } from '../../remote-hosts.js';
import type { HostEntry, RemoteConversationTarget } from './remote-host-types.js';

export function conversationKey(target: RemoteConversationTarget): string {
  return JSON.stringify([
    target.hostId,
    target.channelId === undefined ? 'bot' : 'channel',
    target.channelId ?? target.botSlug ?? '',
  ]);
}

export function createRemoteHostConversations(options: {
  clients: ReadonlyMap<string, HostEntry>;
  requireOwner: () => void;
}): Pick<RemoteHosts, 'activity' | 'markRead' | 'conversation'> & {
  detach: (hostId: string) => void;
} {
  const { clients, requireOwner } = options;
  const activity = new Map<string, ReturnType<typeof observeInbox>>();
  const conversations = new Map<string, Conversation>();

  return {
    detach(hostId) {
      activity.delete(hostId);
      for (const [key, conversation] of conversations)
        if ((JSON.parse(key) as string[])[0] === hostId) {
          conversation.stop();
          conversations.delete(key);
        }
    },
    activity(hostId, query) {
      const entry = clients.get(hostId);
      if (entry === undefined) return undefined;
      if (query !== undefined) return observeInbox(entry.client, query);
      let observed = activity.get(hostId);
      if (observed === undefined) {
        observed = {
          getSnapshot: () => entry.inbox?.feed.getSnapshot() ?? entry.retained,
          getInbox: () => entry.inbox?.feed,
          subscribe(listener) {
            return entry.inbox?.feed.subscribe(listener) ?? (() => {});
          },
          watching: () => entry.inbox !== undefined,
        };
        activity.set(hostId, observed);
      }
      return observed;
    },
    async markRead(target, messageId) {
      requireOwner();
      const entry = clients.get(target.hostId);
      if (entry === undefined) return;
      const channelId =
        target.channelId ??
        entry.client.getSnapshot().roster?.bots.find((bot) => bot.slug === target.botSlug)
          ?.dmChannelId;
      if (channelId === undefined) throw new Error('The remote Channel is not ready.');
      await markChannelRead(entry.client, channelId, messageId);
      await entry.inbox?.feed.refresh();
    },
    conversation(target) {
      const entry = clients.get(target.hostId);
      if (entry === undefined) return undefined;
      const key = conversationKey(target);
      let conversation = conversations.get(key);
      if (conversation === undefined) {
        conversation = createConversation({
          host: entry.client,
          displayName: target.title,
          ...(target.botSlug === undefined ? {} : { botSlug: target.botSlug }),
          ...(target.channelId === undefined ? {} : { channelId: target.channelId }),
        });
        conversations.set(key, conversation);
      }
      return conversation;
    },
  };
}
