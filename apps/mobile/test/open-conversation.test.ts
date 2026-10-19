import { describe, expect, it, vi } from 'vitest';

import type { Conversation } from '../src/ui/chat/conversations';
import { conversationHref, openConversation } from '../src/ui/shell/open-conversation';

const bot = { kind: 'bot', bot: { slug: 'ada' } } as unknown as Conversation;
const channel = { kind: 'channel', channel: { id: 'c1' } } as unknown as Conversation;

describe('conversation links', () => {
  it('points a Bot row at its DM and a channel row at its channel', () => {
    expect(conversationHref(bot, 'h1')).toEqual({
      pathname: '/dm/[slug]',
      params: { slug: 'ada', hostId: 'h1' },
    });
    expect(conversationHref(channel)).toEqual({
      pathname: '/channel/[id]',
      params: { id: 'c1', hostId: undefined },
    });
  });

  it('opens the same place the long-press preview shows', () => {
    const push = vi.fn();
    openConversation({ push }, bot, 'h1');
    expect(push).toHaveBeenCalledWith(conversationHref(bot, 'h1'));
  });
});
