import type { PurgedPlacement } from '../../../core/src/purge/contracts.js';
import type {
  BotInboxState,
  ChannelMessage,
  ChannelSummary,
  ConversationState,
  HumanInboxState,
} from './store.js';

export function parseContentRedactions(event: Event): PurgedPlacement[] {
  try {
    const value: unknown = JSON.parse((event as MessageEvent<string>).data);
    if (typeof value !== 'object' || value === null || !('placements' in value)) return [];
    const placements = value.placements;
    if (!Array.isArray(placements) || placements.length > 100) return [];
    return placements.filter(
      (item): item is PurgedPlacement =>
        typeof item === 'object' &&
        item !== null &&
        ['sourceEventId', 'channelId', 'messageId'].every(
          (key) => typeof item[key] === 'string' && item[key].length > 0 && item[key].length <= 200,
        ),
    );
  } catch {
    return [];
  }
}

export function createContentRedactions() {
  const sources = new Set<string>();
  const placements = new Map<string, Set<string>>();
  const matches = (channelId: string | undefined, messageId: string | undefined): boolean =>
    channelId !== undefined &&
    messageId !== undefined &&
    placements.get(channelId)?.has(messageId) === true;
  const message = (channelId: string, value: ChannelMessage): ChannelMessage => {
    if (matches(channelId, value.id))
      return {
        id: value.id,
        at: value.at,
        author: value.author,
        body: '',
        contentPurged: true,
        ...(value.channelRevision === undefined ? {} : { channelRevision: value.channelRevision }),
        ...(value.deliveries === undefined ? {} : { deliveries: value.deliveries }),
        ...(value.humanReceipts === undefined ? {} : { humanReceipts: value.humanReceipts }),
        ...(value.replyTo === undefined ? {} : { replyTo: value.replyTo }),
      };
    return matches(channelId, value.replyTo) ? { ...value, replyToPreview: null } : value;
  };
  const channel = (value: ChannelSummary): ChannelSummary => {
    if (value.latestMessage === undefined) return value;
    const latestMessage = message(value.id, value.latestMessage);
    return latestMessage === value.latestMessage ? value : { ...value, latestMessage };
  };
  return {
    accept(values: readonly PurgedPlacement[]): void {
      for (const value of values) {
        sources.add(value.sourceEventId);
        let ids = placements.get(value.channelId);
        if (ids === undefined) placements.set(value.channelId, (ids = new Set()));
        ids.add(value.messageId);
      }
    },
    channel,
    conversation(value: ConversationState): ConversationState {
      if (value.channel === undefined) return value;
      const channelId = value.channel.id;
      return {
        ...value,
        channel: channel(value.channel),
        messages: value.messages.map((item) => message(channelId, item)),
      };
    },
    botInbox(value: BotInboxState): BotInboxState {
      return {
        ...value,
        items: value.items.map((item) => {
          if (!matches(item.sourceChannelId, item.sourceMessageId)) return item;
          const { externalOrigin: _externalOrigin, ...rest } = item;
          return { ...rest, summary: '', sourceAvailable: false };
        }),
      };
    },
    humanInbox(value: HumanInboxState): HumanInboxState {
      return {
        ...value,
        items: value.items.map((item) =>
          (item.sourceEventId !== undefined && sources.has(item.sourceEventId)) ||
          matches(item.channelId, item.messageId)
            ? { ...item, summary: '' }
            : item,
        ),
      };
    },
  };
}
