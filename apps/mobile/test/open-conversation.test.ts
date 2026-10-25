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

  it('returns to the exact source message without dropping its Computer or DM identity', () => {
    expect(conversationHref(bot, 'computer-a', 'message-older')).toEqual({
      pathname: '/dm/[slug]',
      params: { slug: 'ada', hostId: 'computer-a', focus: 'message-older' },
    });
    expect(conversationHref(channel, 'computer-b', 'message-group')).toEqual({
      pathname: '/channel/[id]',
      params: { id: 'c1', hostId: 'computer-b', focus: 'message-group' },
    });
  });

  it('carries an explicit repeat request separately from the target message', () => {
    expect(conversationHref(bot, 'computer-a', 'same-message', 'request-one')).toEqual({
      pathname: '/dm/[slug]',
      params: {
        slug: 'ada',
        hostId: 'computer-a',
        focus: 'same-message',
        focusRequest: 'request-one',
      },
    });
    expect(conversationHref(channel, 'computer-b', 'same-message', 'request-two')).toEqual({
      pathname: '/channel/[id]',
      params: {
        id: 'c1',
        hostId: 'computer-b',
        focus: 'same-message',
        focusRequest: 'request-two',
      },
    });
  });
});
