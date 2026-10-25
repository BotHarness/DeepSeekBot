import { describe, expect, it } from 'vitest';
import { selectionText, toggleMessageSelection } from '../src/ui/chat/message-selection';
import type { ConversationMessage } from '../src/host/conversation';
const message = (id: string, body: string): ConversationMessage => ({
  id,
  body,
  at: '2026-10-26T00:00:00Z',
  author: 'human',
  attachments: [],
  delivery: 'committed',
});
it('copies only selected saved messages in timeline order', () => {
  const messages = [message('a', 'first'), message('b', 'skip'), message('c', 'last')];
  expect(selectionText(['c', 'a'], messages)).toBe('first\n\nlast');
  expect(toggleMessageSelection(['a'], messages[0]!)).toEqual([]);
  expect(toggleMessageSelection([], { ...messages[0]!, delivery: 'pending' })).toEqual([]);
});
