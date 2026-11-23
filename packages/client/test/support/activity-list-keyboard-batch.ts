import type { ClientState, HumanAttentionItem } from '../../src/client/store.js';

type ActivityPrimitives = ReturnType<typeof import('../primitive-mocks.js').shellPrimitives> &
  typeof import('../activity-list-test-controls.js') & {
    MarkdownText: () => null;
    StateDot: () => null;
  };

export const mockActivityPrimitives = async (): Promise<ActivityPrimitives> => ({
  ...(await import('../primitive-mocks.js')).shellPrimitives(),
  ...(await import('../activity-list-test-controls.js')),

  MarkdownText: () => null,
  StateDot: () => null,
});

export const mockActivitySidebar = async (): Promise<{ useClientState: () => ClientState }> => {
  const { useSyncExternalStore } = await import('react');
  const { store } = await import('../../src/client/store.js');
  return { useClientState: () => useSyncExternalStore(store.subscribe, store.getSnapshot) };
};

export const approval = (slug: string): HumanAttentionItem => ({
  id: 'approval:' + slug,
  category: 'action',
  kind: 'tool-approval',
  channelId: 'dm-' + slug,
  channelName: slug,
  botSlug: slug,
  messageId: 'request-' + slug,
  sourceEventId: 'event-' + slug,
  summary: 'Approve bash for ' + slug,
  createdAt: '2026-10-01T12:00:00Z',
});
