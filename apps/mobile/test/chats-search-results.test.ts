import { describe, expect, it } from 'vitest';

import { chatsSearchResults } from '../src/ui/chat/chats-search-results';
import type { EnvironmentChatItem } from '../src/ui/chat/environment-chat-list';

const bot = (key: string, displayName: string, preview?: string, paused = false) =>
  ({
    key,
    environment: 'computer:h1',
    type: 'computer',
    pinned: false,
    host: { saved: { hostId: 'h1' } },
    conversation: {
      kind: 'bot',
      key,
      bot: { slug: key, displayName, paused, ...(preview === undefined ? {} : { preview }) },
      needsYou: 0,
      unread: 0,
    },
  }) as unknown as EnvironmentChatItem;

const channel = (id: string, name: string, avatar?: string) =>
  ({
    key: id,
    environment: 'computer:h1',
    type: 'computer',
    pinned: false,
    host: { saved: { hostId: 'h1' } },
    conversation: {
      kind: 'channel',
      key: id,
      channel: { id, name, ...(avatar === undefined ? {} : { avatar }) },
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

const cached = (host: string, file: string) => `file:///avatars/${host}/${file}`;

describe('Chats search results', () => {
  it('lists recent conversations before typing and every match after', () => {
    const items = [section, bot('ada', 'Ada', 'Hi there'), bot('ben', 'ben'), cloud];
    expect(chatsSearchResults(items, '', 2)).toEqual([
      { key: 'ada', title: 'Ada', subtitle: 'Hi there', initial: 'A', image: '', dimmed: false },
      { key: 'ben', title: 'ben', subtitle: '', initial: 'B', image: '', dimmed: false },
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
      initial: '#',
      image: '',
      dimmed: false,
    });
  });

  it('draws each avatar from the device avatar cache with the Chats row fallbacks', () => {
    const items = [
      bot('ada', 'Ada'),
      bot('rest', 'Rest', undefined, true),
      channel('g1', 'Launch', 'https://host/g1.png'),
      channel('g2', 'Ops'),
    ];
    expect(
      chatsSearchResults(items, 'x', 0, cached).map(({ initial, image, dimmed }) => ({
        initial,
        image,
        dimmed,
      })),
    ).toEqual([
      { initial: 'A', image: 'file:///avatars/h1/bot-ada.png', dimmed: false },
      { initial: 'R', image: 'file:///avatars/h1/bot-rest.png', dimmed: true },
      { initial: '#', image: 'file:///avatars/h1/channel-g1.png', dimmed: false },
      { initial: '#', image: '', dimmed: false },
    ]);
  });
});
