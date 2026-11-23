import { type BotAttentionItem } from '../../src/client/store.js';

type InboxPrimitives = ReturnType<typeof import('../primitive-mocks.js').shellPrimitives> & {
  StateDot: () => null;
  relativeTime: () => { unit: 'now'; n: number };
};

export const mockInboxPrimitives = async (): Promise<InboxPrimitives> => {
  const stub = () => null;

  return {
    ...(await import('../primitive-mocks.js')).shellPrimitives(),

    StateDot: stub,

    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
};

export const item: BotAttentionItem = {
  id: 'source-1',
  botSlug: 'ada',
  reason: 'group-mention',
  state: 'pending',
  createdAt: '2026-09-26T00:00:00.000Z',
  sourceKind: 'human-message',
  sourceChannelId: 'group-team',
  sourceChannelName: 'Team',
  sourceMessageId: 'm1',
  sourceAvailable: true,
  authorKind: 'human',
  summary: 'Please check this',
};
