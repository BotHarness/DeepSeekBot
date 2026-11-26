import { expect, it } from 'vitest';
import { channelNavigationHarness } from './channel-navigation-harness';
import { conversationRouteOptions, navigateChannel } from '../src/ui/shell/channel-navigation';
import { navigateCloudChannel } from '../src/ui/shell/cloud-channel-navigation';
import { resetWorkspaceRoot, removeScopedRoutes } from '../src/ui/shell/workspace-navigation';

it('opens the originating Host conversation through the Expo 58 wrapper stack', () => {
  const history = channelNavigationHarness(true);
  expect(
    navigateChannel(history.navigation, {
      pathname: '/dm/[slug]',
      params: { hostId: 'b', slug: 'ada' },
    }),
  ).toBe(true);
  expect(history.visible).toMatchObject({
    name: 'dm/[slug]',
    params: { hostId: 'b', slug: 'ada' },
  });
  history.back();
  expect(history.visible.name).toBe('index');
});

it('targets the app stack for cloud navigation, workspace reset and unpair cleanup', () => {
  const history = channelNavigationHarness(true);
  navigateCloudChannel(history.navigation, {
    instanceId: 'cloud',
    accountScope: 'account',
    organizationId: 'org',
    guest: false,
  });
  expect(history.state.routes.at(-1)?.name).toBe('cloud-channels');
  resetWorkspaceRoot(history.navigation);
  expect(history.state.routes).toHaveLength(1);
  history.push('dm/[slug]', { hostId: 'b', slug: 'ada' });
  history.push('channel/[id]', { hostId: 'c', id: 'kept' });
  removeScopedRoutes(history.navigation, new Set(['b']), new Set());
  expect(history.state.routes).toHaveLength(1);
  expect(history.chats.map((route) => route.name)).toEqual(['index', 'channel/[id]']);
  expect(history.visible.params).toMatchObject({ hostId: 'c', id: 'kept' });
});

it('opens a channel deep link from the pairing sheet in Chats with a header that never toggles', () => {
  const history = channelNavigationHarness(true);
  history.push('pair');
  expect(
    navigateChannel(history.navigation, {
      pathname: '/channel/[id]',
      params: { hostId: 'b', id: 'group-history-qa' },
    }),
  ).toBe(true);
  const route = history.visible;
  expect(history.state.routes.map((entry) => entry.name)).toEqual(['(tabs)']);
  expect(history.chats.map((entry) => entry.name)).toEqual(['index', 'channel/[id]']);
  for (const params of [route.params, { ...route.params, entry: 'swipe' }]) {
    expect(conversationRouteOptions({ route: { params } })).toMatchObject({
      title: '',
      headerShown: false,
    });
  }
});
