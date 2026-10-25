import { expect, it } from 'vitest';
import { channelNavigationHarness } from './channel-navigation-harness';
import { navigateChannel } from '../src/ui/shell/channel-navigation';
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
  expect(history.state.routes.at(-1)).toMatchObject({
    name: 'dm/[slug]',
    params: { hostId: 'b', slug: 'ada' },
  });
  history.back();
  expect(history.state.routes.at(-1)?.name).toBe('(tabs)');
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
  removeScopedRoutes(history.navigation, new Set(['b']), new Set());
  expect(history.state.routes).toHaveLength(1);
});
