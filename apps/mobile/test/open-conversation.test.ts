import { describe, expect, it } from 'vitest';
import type { Conversation } from '../src/ui/chat/conversations';
import { conversationHref, openConversation } from '../src/ui/shell/open-conversation';
import { channelNavigationHarness } from './channel-navigation-harness';
import { navigateChannel } from '../src/ui/shell/channel-navigation';

const bot: Conversation = {
  kind: 'bot',
  key: 'bot:ada',
  bot: {
    slug: 'ada',
    displayName: 'Ada',
    roles: [],
    computerAccess: false,
    browserAccess: false,
    state: 'idle',
    paused: false,
  },
  needsYou: 0,
  unread: 0,
  muted: false,
};
const channel: Conversation = {
  kind: 'channel',
  key: 'channel:c1',
  channel: { id: 'c1', name: 'Group', memberCount: 0, members: [] },
  needsYou: 0,
  unread: 0,
  muted: false,
};

const focusRequestOf = (params: object | undefined) =>
  params && 'focusRequest' in params ? params.focusRequest : undefined;

describe('conversation navigation', () => {
  it('uses the same scoped destination for tap and native preview', () => {
    const history = channelNavigationHarness();
    openConversation(history.navigation, bot, 'h1');
    const key = history.chats.at(-1)!.key;
    history.push('channel/[id]', { id: 'c1', hostId: 'h1' });
    const href = conversationHref(bot, 'h1');
    history.navigation.dispatch({
      type: 'NAVIGATE',
      payload: {
        name: href.pathname.slice(1),
        params: { ...href.params, __internal__PreviewKey: 'preview' },
      },
    });
    expect(history.chats.at(-1)).toMatchObject({
      key,
      name: 'dm/[slug]',
      params: { slug: 'ada', hostId: 'h1' },
    });
    expect(history.chats).toHaveLength(2);
    history.back();
    expect(history.visible.name).toBe('index');
  });
  it('keeps identical channel names on different Hosts distinct', () => {
    const history = channelNavigationHarness();
    openConversation(history.navigation, channel, 'h1');
    openConversation(history.navigation, channel, 'h2');
    expect(history.chats).toHaveLength(3);
    history.back();
    expect(history.chats.at(-1)!.params).toMatchObject({ hostId: 'h1' });
  });
  it('does not navigate without a source Host', () => {
    const history = channelNavigationHarness();
    expect(openConversation(history.navigation, bot)).toBe(false);
    expect(history.chats).toHaveLength(1);
    expect(history.state.routes).toHaveLength(1);
  });
  it('opens the conversation in Chats from another tab and over a root page', () => {
    const history = channelNavigationHarness(false, {
      tab: '(activity)',
      root: [{ name: 'settings' }],
    });
    expect(navigateChannel(history.navigation, conversationHref(bot, 'h1'))).toBe(true);
    expect(history.state.routes).toHaveLength(1);
    expect(history.tab).toBe('(home)');
    expect(history.visible).toMatchObject({ name: 'dm/[slug]', params: { slug: 'ada' } });
    history.back();
    expect(history.visible.name).toBe('index');
  });
  it('opens from another tab over a different open chat and Back lands on the Chats list', () => {
    const history = channelNavigationHarness(false, {
      tab: '(activity)',
      chats: [{ name: 'channel/[id]', params: { id: 'bo', hostId: 'h1' } }],
    });
    navigateChannel(history.navigation, conversationHref(bot, 'h1'));
    expect(history.tab).toBe('(home)');
    expect(history.chats.map((route) => route.name)).toEqual(['index', 'dm/[slug]']);
    history.back();
    expect(history.visible.name).toBe('index');
  });
  it('reuses the same open chat from another tab and drops the chats above it', () => {
    const history = channelNavigationHarness(false, {
      tab: '(activity)',
      chats: [
        { name: 'dm/[slug]', params: { slug: 'ada', hostId: 'h1' } },
        { name: 'channel/[id]', params: { id: 'bo', hostId: 'h1' } },
      ],
    });
    const key = history.chats[1]!.key;
    navigateChannel(history.navigation, conversationHref(bot, 'h1', 'm1'));
    expect(history.chats).toHaveLength(2);
    expect(history.visible).toMatchObject({ key, params: { slug: 'ada', focus: 'm1' } });
    history.back();
    expect(history.visible.name).toBe('index');
  });
  it('returns from a Profile opened over a conversation to that conversation', () => {
    const history = channelNavigationHarness();
    openConversation(history.navigation, bot, 'h1');
    history.push('bot/[slug]', { slug: 'ada', hostId: 'h1' });
    history.back();
    expect(history.visible).toMatchObject({ name: 'dm/[slug]', params: { slug: 'ada' } });
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
    const first = history.chats.at(-1)!;
    const request = focusRequestOf(first.params);
    expect(request).toEqual(expect.any(String));
    history.push('channel-files', { channelId: 'c1', hostId: 'h1' });
    history.back();
    expect(history.visible).toEqual(first);
    history.push('channel-files', { channelId: 'c1', hostId: 'h1' });
    navigateChannel(history.navigation, destination);
    expect(history.visible.key).toBe(first.key);
    expect(focusRequestOf(history.visible.params)).not.toBe(request);
    expect(history.chats).toHaveLength(2);
    expect(history.state.routes).toHaveLength(1);
  });

  it('preserves a supplied focus request and ordinary destinations carry none', () => {
    const history = channelNavigationHarness();
    navigateChannel(history.navigation, conversationHref(bot, 'h1', 'original', 'supplied'));
    expect(history.chats.at(-1)?.params).toHaveProperty('focusRequest', 'supplied');
    openConversation(history.navigation, channel, 'h1');
    expect(history.chats.at(-1)?.params).not.toHaveProperty('focusRequest');
  });
});
