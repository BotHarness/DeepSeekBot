import { describe, expect, it } from 'vitest';

import { chatsSearchResults } from '../src/ui/chat/chats-search-results';
import type { EnvironmentChatItem } from '../src/ui/chat/environment-chat-list';

const bot = (key: string, displayName: string, preview?: string) =>
  ({
    key,
    environment: 'computer:h1',
    type: 'computer',
    pinned: false,
    host: {},
    conversation: {
      kind: 'bot',
      key,
      bot: { slug: key, displayName, ...(preview === undefined ? {} : { preview }) },
      needsYou: 0,
      unread: 0,
    },
  }) as unknown as EnvironmentChatItem;

const section = {
  type: 'section',
  key: 'pinned',
  kind: 'section',
} as unknown as EnvironmentChatItem;

const cloud = {
  key: 'c1',
  environment: 'cloud:x',
  type: 'cloud',
  pinned: false,
  conversation: { channel: { name: 'launch' } },
} as unknown as EnvironmentChatItem;

describe('Chats search results', () => {
  it('lists recent conversations before typing and every match after', () => {
    const items = [section, bot('ada', 'Ada', 'Hi there'), bot('ben', 'ben'), cloud];
    expect(chatsSearchResults(items, '', 2)).toEqual([
      { key: 'ada', title: 'Ada', subtitle: 'Hi there', initial: 'A' },
      { key: 'ben', title: 'ben', subtitle: '', initial: 'B' },
    ]);
    expect(chatsSearchResults(items, 'a', 2).map((result) => result.key)).toEqual([
      'ada',
      'ben',
      'c1',
    ]);
    expect(chatsSearchResults([cloud], 'l', 2)[0]).toEqual({
      key: 'c1',
      title: 'launch',
      subtitle: '',
      initial: 'L',
    });
  });
});
