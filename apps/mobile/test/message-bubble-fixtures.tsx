import { type ConversationMessage } from '@botharness/host-client/conversation';

export const { BubbleBody, MessageBubble, DraftBubble, deliveryLabel, secondTap, replyable } =
  await import('../src/ui/chat/message-bubble');

export const { t } = await import('../src/ui/strings');

export const { MessageActions, dismissQueue, menuTime, messageMenuActions } =
  await import('../src/ui/chat/message-actions');

export const human = (overrides: Partial<ConversationMessage>): ConversationMessage => ({
  id: 'human-1',
  at: '2026-10-14T08:00:00.000Z',
  author: 'human',
  body: 'hello',
  attachments: [],
  delivery: 'committed',
  ...overrides,
});
