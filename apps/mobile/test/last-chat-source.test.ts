import { describe, expect, it } from 'vitest';
import { lastChatSource } from '../src/ui/shell/last-chat-source';

function recent(href: string) {
  return { id: 'saved', title: 'Saved chat', href };
}

describe('native last-chat page source', () => {
  it('keeps the saved Host even when a different workspace is selected', () => {
    expect(lastChatSource(recent('/dm/bot-a?hostId=host-b'))).toEqual({
      expectedHostId: 'host-b',
      place: { kind: 'dm', slug: 'bot-a' },
      focus: undefined,
    });
  });
  it('decodes group identity and keeps the explicit Host', () => {
    expect(lastChatSource(recent('/channel/team%20one?hostId=host%20a'))).toEqual({
      expectedHostId: 'host a',
      place: { kind: 'channel', channelId: 'team one' },
      focus: undefined,
    });
  });
  it.each([
    undefined,
    recent('/dm/a'),
    recent('/dm/a?hostId='),
    recent('/bot/a?hostId=h'),
    recent('/dm/a/memory?hostId=h'),
    recent('/dm/%zz?hostId=h'),
  ])('does not open an unbound, malformed or unrelated saved route: %j', (chat) => {
    expect(lastChatSource(chat)).toBeUndefined();
  });
});
