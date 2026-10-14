import type { HumanAttentionItem, HumanAttentionQuery } from '../runtime/human-attention.js';
import type { PushCandidate, PushKind, PushSource } from './delivery.js';

const KIND: Partial<Record<HumanAttentionItem['kind'], PushKind>> = {
  'tool-approval': 'approval',
  'user-question': 'question',
  'private-input': 'private-input',
  'channel-reply': 'reply',
  'channel-mention': 'reply',
};

const ACTION_LIMIT = 100;
const REPLY_LIMIT = 30;

function candidate(item: HumanAttentionItem): PushCandidate[] {
  const kind = KIND[item.kind];
  if (kind === undefined || item.botSlug === '') return [];
  return [
    {
      id: item.id,
      kind,
      attentionKind: item.kind,
      botSlug: item.botSlug,
      createdAt: item.createdAt,
      ...(item.channelId === undefined ? {} : { channelId: item.channelId }),
      ...(item.messageId === undefined ? {} : { messageId: item.messageId }),
    },
  ];
}

export function humanInboxPushSource(
  attention: Pick<HumanAttentionQuery, 'list' | 'actionCount'>,
  botName: (slug: string) => string | undefined,
): PushSource {
  return {
    pending() {
      const action = attention.list({ category: 'action', limit: ACTION_LIMIT }).items;
      const replies = attention
        .list({ category: 'replies', limit: REPLY_LIMIT })
        .items.filter((item) => item.isUnread !== false);
      return {
        items: [...action, ...replies].flatMap(candidate),
        badge: attention.actionCount(),
      };
    },
    botName,
  };
}
