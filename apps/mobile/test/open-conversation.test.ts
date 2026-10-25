import { describe, expect, it } from 'vitest';
import type { Conversation } from '../src/ui/chat/conversations';
import { conversationHref, openConversation } from '../src/ui/shell/open-conversation';
import { channelNavigationHarness } from './channel-navigation-harness';

const bot = { kind: 'bot', bot: { slug: 'ada' } } as Conversation;
const channel = { kind: 'channel', channel: { id: 'c1' } } as Conversation;

describe('conversation navigation', () => {
  it('uses the same scoped destination for tap and native preview', () => {
    const history = channelNavigationHarness();
    openConversation(history.navigation, bot, 'h1');
    const key = history.state.routes.at(-1)!.key;
    history.push('channel/[id]', { id: 'c1', hostId: 'h1' });
    const href = conversationHref(bot, 'h1');
    history.navigation.dispatch({
      type: 'NAVIGATE',
      payload: {
        name: href.pathname.slice(1),
        params: { ...href.params, __internal__PreviewKey: 'preview' },
      },
    });
    expect(history.state.routes.at(-1)).toMatchObject({
      key,
      name: 'dm/[slug]',
      params: { slug: 'ada', hostId: 'h1' },
    });
    expect(history.state.routes).toHaveLength(2);
    history.back();
    expect(history.state.routes.at(-1)!.name).toBe('(tabs)');
  });
  it('keeps identical channel names on different Hosts distinct', () => {
    const history = channelNavigationHarness();
    openConversation(history.navigation, channel, 'h1');
    openConversation(history.navigation, channel, 'h2');
    expect(history.state.routes).toHaveLength(3);
    history.back();
    expect(history.state.routes.at(-1)!.params).toMatchObject({ hostId: 'h1' });
  });
  it('does not navigate without a source Host', () => {
    const history = channelNavigationHarness();
    expect(openConversation(history.navigation, bot)).toBe(false);
    expect(history.state.routes).toHaveLength(1);
  });
  it('leaves explicit PUSH presentation semantics unchanged', () => {
    const history = channelNavigationHarness();
    history.push('bot/[slug]', { slug: 'ada', hostId: 'h1' });
    history.push('dm/[slug]', { slug: 'ada', hostId: 'h1' });
    history.back();
    expect(history.state.routes.at(-1)!.name).toBe('bot/[slug]');
  });
});
