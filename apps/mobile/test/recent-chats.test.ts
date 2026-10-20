import { beforeEach, describe, expect, it, vi } from 'vitest';

const stored = new Map<string, string>();
const shortcuts: unknown[][] = [];

vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => stored.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    stored.set(key, value);
  },
}));
vi.mock('expo-quick-actions', () => ({
  setItems: async (items: unknown[]) => {
    shortcuts.push(items);
  },
}));

const { chatHref, parseRecentChats, quickAction, recordRecentChat, rememberChat } =
  await import('../src/ui/shell/recent-chats');

const chat = (id: string, title = id) => ({ id, title, href: `/dm/${id}` });

beforeEach(() => {
  shortcuts.length = 0;
});

describe('recent chats on the home-screen icon', () => {
  it('keeps the newest chat first, without duplicates, up to the limit', () => {
    const list = [chat('a'), chat('b'), chat('c')];
    expect(rememberChat(list, chat('b'), 3).map((item) => item.id)).toEqual(['b', 'a', 'c']);
    expect(rememberChat(list, chat('d'), 3).map((item) => item.id)).toEqual(['d', 'a', 'b']);
  });

  it('links to the chat on the same Host', () => {
    expect(chatHref('/dm/writer', 'host 1')).toBe('/dm/writer?hostId=host%201');
    expect(chatHref('/channel/c1', undefined)).toBe('/channel/c1');
    expect(quickAction(chat('writer', 'Writer'))).toMatchObject({
      title: 'Writer',
      params: { href: '/dm/writer' },
    });
  });

  it('ignores stored entries that are damaged or point outside the app', () => {
    expect(parseRecentChats('not json')).toEqual([]);
    expect(
      parseRecentChats(JSON.stringify([chat('a'), { id: 'x', title: 'X', href: 'https://x' }, 3])),
    ).toEqual([chat('a')]);
  });

  it('updates the shortcuts when a different chat opens, and not again for the same one', async () => {
    await recordRecentChat(chat('a', 'Alpha'));
    await recordRecentChat(chat('b', 'Beta'));
    await recordRecentChat(chat('b', 'Beta'));
    expect(shortcuts).toHaveLength(2);
    expect(shortcuts.at(-1)).toMatchObject([{ title: 'Beta' }, { title: 'Alpha' }]);
    expect(parseRecentChats(stored.get('deepseekbot.recent-chats.v1') ?? null)).toHaveLength(2);
  });
});
