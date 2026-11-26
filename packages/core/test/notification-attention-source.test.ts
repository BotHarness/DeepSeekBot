import { expect, it } from 'vitest';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { notificationAttentionPage } from '../src/runtime/notification-attention.js';
import type { HumanAttentionQuery } from '../src/runtime/human-attention.js';

it('passes the Activity source to each Activity section it reads', () => {
  const seen: Parameters<HumanAttentionQuery['list']>[1][] = [];
  const attention = {
    list: (_human: unknown, input: Parameters<HumanAttentionQuery['list']>[1]) => {
      seen.push(input);
      return { items: [] };
    },
    dmReplies: () => [],
  } as unknown as Pick<HumanAttentionQuery, 'list' | 'dmReplies'>;
  const first = notificationAttentionPage(OWNER_HUMAN_CONTEXT, attention, { source: 'all' });
  notificationAttentionPage(OWNER_HUMAN_CONTEXT, attention, {
    source: 'all',
    cursor: first.nextCursor!,
  });
  notificationAttentionPage(OWNER_HUMAN_CONTEXT, attention, {});
  expect(seen.map(({ category, source }) => ({ category, source }))).toEqual([
    { category: 'action', source: 'all' },
    { category: 'replies', source: 'all' },
    { category: 'action', source: undefined },
  ]);
});
