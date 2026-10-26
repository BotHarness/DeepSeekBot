import { describe, expect, it } from 'vitest';

import type { ConversationMessage } from '../src/host/conversation';
import { receiptGroups, receiptRecipients } from '../src/host/delivery-receipt';

const message: ConversationMessage = {
  id: 'm1',
  revision: 3,
  at: '2026-10-26T00:00:00.000Z',
  author: 'human',
  body: '@ADA @BEA please check',
  mentions: [
    { botSlug: 'ada', label: 'ADA', start: 0, end: 4 },
    { botSlug: 'bea', label: 'BEA', start: 5, end: 9 },
    { botSlug: 'bea', label: 'BEA', start: 10, end: 14 },
  ],
  attachments: [],
  deliveries: [{ botSlug: 'ada', state: 'ignored' }],
  delivery: 'committed',
};

describe('delivery receipt', () => {
  it('marks a mentioned Bot without an Inbox admission as not received', () => {
    expect(receiptRecipients(message)).toEqual([
      { botSlug: 'ada', state: 'ignored' },
      { botSlug: 'bea', state: 'missing' },
    ]);
  });

  it('orders groups like the desktop receipt', () => {
    expect(
      receiptGroups([
        { botSlug: 'c', state: 'missing' },
        { botSlug: 'a', state: 'ignored' },
        { botSlug: 'b', state: 'handled' },
        { botSlug: 'd', state: 'ignored' },
      ]).map((group) => [group.state, group.recipients.length]),
    ).toEqual([
      ['handled', 1],
      ['ignored', 2],
      ['missing', 1],
    ]);
  });

  it('shows nothing for Bot messages or sends that are not committed', () => {
    expect(receiptRecipients({ ...message, author: 'bot', bot: 'ada' })).toEqual([]);
    expect(receiptRecipients({ ...message, delivery: 'pending' })).toEqual([]);
    expect(receiptRecipients({ ...message, delivery: 'failed' })).toEqual([]);
  });
});
