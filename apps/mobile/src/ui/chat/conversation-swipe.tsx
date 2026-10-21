import type { ReactNode } from 'react';

import type { ConversationAction, ConversationActionKey } from './conversation-actions';

export function ConversationSwipe({
  children,
}: {
  actions: readonly ConversationAction[];
  onAction(key: ConversationActionKey): void;
  children: ReactNode;
}) {
  return children;
}
