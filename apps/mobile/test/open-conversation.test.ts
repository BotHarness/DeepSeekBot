import { describe, expect, it } from 'vitest';
import type { Conversation } from '../src/ui/chat/conversations';
import { conversationHref, openConversation } from '../src/ui/shell/open-conversation';
import { channelNavigationHarness } from './channel-navigation-harness';
import { navigateChannel } from '../src/ui/shell/channel-navigation';

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

  it('assigns a new focus request only on explicit source navigation', () => {
    const history = channelNavigationHarness();
    const destination = conversationHref(bot, 'h1', 'original');
    navigateChannel(history.navigation, destination);
    const first = history.state.routes.at(-1)!;
    const request = first.params?.['focusRequest'];
    expect(request).toEqual(expect.any(String));
    history.push('channel-files', { channelId: 'c1', hostId: 'h1' });
    history.back();
    expect(history.state.routes.at(-1)).toEqual(first);
    history.push('channel-files', { channelId: 'c1', hostId: 'h1' });
    navigateChannel(history.navigation, destination);
    expect(history.state.routes.at(-1)?.key).toBe(first.key);
    expect(history.state.routes.at(-1)?.params?.['focusRequest']).not.toBe(request);
    expect(history.state.routes).toHaveLength(2);
  });

  it('preserves a supplied focus request and ordinary destinations carry none', () => {
    const history = channelNavigationHarness();
    navigateChannel(history.navigation, conversationHref(bot, 'h1', 'original', 'supplied'));
    expect(history.state.routes.at(-1)?.params?.['focusRequest']).toBe('supplied');
    openConversation(history.navigation, channel, 'h1');
    expect(history.state.routes.at(-1)?.params).not.toHaveProperty('focusRequest');
  });
});
