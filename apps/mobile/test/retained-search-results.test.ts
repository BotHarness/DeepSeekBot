import { expect, it } from 'vitest';
import type { Conversation } from '../src/ui/chat/conversations';
import type { SearchHit } from '../src/host/retained-search';
import {
  retainedMessageMatches,
  retainedSearchResults,
} from '../src/ui/search/retained-search-results';
const cached: SearchHit = {
  key: 'cached',
  source: { hostId: 'a', deviceId: 'phone', name: 'Studio' },
  target: { kind: 'channel', id: 'channel-b', name: 'Project' },
  message: { id: 'same-id', body: 'needle', author: 'human', at: '2026-10-29T00:00:00Z' },
};
const conversation = (id: string): Conversation => ({
  kind: 'channel',
  key: id,
  channel: { id, name: 'Project', members: [], memberCount: 0 },
  needsYou: 0,
  unread: 0,
  muted: false,
});
it('deduplicates only the same Host, channel and message identity', () => {
  const online = {
    hostId: 'a',
    channelId: 'channel-a',
    messageId: 'same-id',
    at: '2026-10-29T00:00:00Z',
    author: { kind: 'human' as const },
    snippet: 'needle',
  };
  expect(retainedMessageMatches(cached, online, conversation('channel-a'))).toBe(false);
  expect(
    retainedMessageMatches(
      cached,
      { ...online, channelId: 'channel-b' },
      conversation('channel-b'),
    ),
  ).toBe(true);
  expect(
    retainedMessageMatches(
      cached,
      { ...online, hostId: 'b', channelId: 'channel-b' },
      conversation('channel-b'),
    ),
  ).toBe(false);
});
it('keeps channel, source, sender, excerpt and timestamp in native search results', () => {
  expect(
    retainedSearchResults([cached], 'Messages', new Date(cached.message!.at), 'You')[0],
  ).toMatchObject({
    title: 'Project',
    subtitle: 'Studio · You: needle',
    section: 'Messages',
    trailing: expect.any(String),
  });
  expect(
    retainedSearchResults([cached], undefined, new Date(cached.message!.at), 'You')[0]!.trailing,
  ).not.toBe('');
});
