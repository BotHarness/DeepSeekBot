import { describe, expect, it } from 'vitest';
import { StackRouter } from '../node_modules/expo-router/build/react-navigation/routers/StackRouter.js';
import { createHostDrawer } from '../src/ui/shell/host-drawer-model';
import {
  resetWorkspaceRoot,
  removeScopedRoutes,
  selectCloudWorkspace,
} from '../src/ui/shell/workspace-navigation';

const stack = StackRouter({ initialRouteName: '(tabs)' });
const routeNames = ['(tabs)', 'dm/[slug]', 'bot/[slug]', 'cloud-channels', 'cloud-services'];
const options = { routeNames, routeParamList: {}, routeGetIdList: {} };
function navigator() {
  let state: Parameters<typeof stack.getStateForAction>[0] = {
    stale: false,
    type: 'stack',
    key: 'root',
    routeKeySeq: 0,
    index: 0,
    routeNames,
    routes: [
      {
        key: 'tabs',
        name: '(tabs)',
        state: {
          stale: false,
          type: 'tab',
          key: 'tabs-state',
          index: 1,
          routeNames: ['(home)', '(activity)'],
          routes: [
            { key: 'home', name: '(home)' },
            { key: 'activity', name: '(activity)' },
          ],
        },
      },
    ],
  };
  const navigation = {
    isReady: () => true,
    getRootState: () => state,
    dispatch(action: Parameters<typeof stack.getStateForAction>[1]) {
      const result = stack.getStateForAction(state, action, options);
      if (typeof result === 'object') state = result.state;
    },
  };
  return {
    navigation,
    push(name: string, params: Record<string, string>) {
      navigation.dispatch({ type: 'PUSH', payload: { name, params } });
    },
  };
}

describe('workspace selection through the root navigator', () => {
  it('captures pending channel entry without replacing the active selection', () => {
    const { navigation } = navigator();
    const drawer = createHostDrawer({
      switchTo: async () => true,
      showView: () => resetWorkspaceRoot(navigation),
      pair() {},
      notifications() {},
    });
    const selecting = drawer.beginWorkspaceSelection();
    const entering = drawer.captureWorkspaceSelection();
    expect(selecting()).toBe(true);
    expect(entering()).toBe(true);
    drawer.selectAll();
    expect(selecting()).toBe(false);
    expect(entering()).toBe(false);
  });

  it('a failed Cloud workspace switch retains the usable page and source', async () => {
    const { navigation, push } = navigator();
    push('dm/[slug]', { hostId: 'a', slug: 'ada' });
    const before = navigation.getRootState();
    await expect(
      selectCloudWorkspace(
        navigation,
        { instanceId: 'cloud', organizationId: 'org_a', name: 'A', role: 'owner' },
        {
          scope: () => 'account',
          enter: async () => {
            throw new Error('unavailable');
          },
        },
        () => true,
      ),
    ).rejects.toThrow('unavailable');
    expect(navigation.getRootState()).toBe(before);
  });

  it('a newer drawer choice cancels a pending Cloud completion', async () => {
    const { navigation } = navigator();
    let release = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const drawer = createHostDrawer({
      switchTo: async () => true,
      showView: () => resetWorkspaceRoot(navigation),
      pair() {},
      notifications() {},
    });
    const entering = selectCloudWorkspace(
      navigation,
      { instanceId: 'cloud', organizationId: 'org_a', name: 'A', role: 'owner' },
      { scope: () => 'account', enter: async () => pending },
      drawer.beginWorkspaceSelection(),
    );
    drawer.selectAll();
    const before = navigation.getRootState();
    release();
    expect(await entering).toBe(false);
    expect(navigation.getRootState()).toBe(before);
  });

  it('an account replacement while access is loading cannot install the previous workspace root', async () => {
    const { navigation } = navigator();
    let account = 'old';
    const before = navigation.getRootState();
    expect(
      await selectCloudWorkspace(
        navigation,
        { instanceId: 'cloud', organizationId: 'org_a', name: 'A', role: 'guest' },
        {
          scope: () => account,
          enter: async () => {
            account = 'new';
          },
        },
        () => true,
      ),
    ).toBe(false);
    expect(navigation.getRootState()).toBe(before);
  });
  it('the drawer removes previous details and sheets only after a successful Host selection', async () => {
    const { navigation, push } = navigator();
    push('dm/[slug]', { slug: 'ada', hostId: 'old' });
    push('bot/[slug]', { slug: 'ada', hostId: 'old' });
    let release = (_value: boolean) => {};
    const pending = new Promise<boolean>((resolve) => {
      release = resolve;
    });
    let selected = 'old';
    const drawer = createHostDrawer({
      switchTo: async () => pending,
      showView: (hostId) => {
        selected = hostId ?? 'all';
        resetWorkspaceRoot(navigation);
      },
      pair() {},
      notifications() {},
    });
    const selecting = drawer.select('new');
    expect(navigation.getRootState().routes).toHaveLength(3);
    release(true);
    await selecting;
    expect(selected).toBe('new');
    expect(navigation.getRootState().routes).toHaveLength(1);
    expect(navigation.getRootState().routes[0]).toMatchObject({
      key: 'tabs',
      state: { key: 'tabs-state', index: 0 },
    });
    navigation.dispatch({ type: 'GO_BACK' });
    expect(navigation.getRootState().routes[0]?.name).toBe('(tabs)');
  });

  it('a failed Host selection retains the exact current page and tab state', async () => {
    const { navigation, push } = navigator();
    push('dm/[slug]', { slug: 'ada', hostId: 'old' });
    const before = navigation.getRootState();
    const drawer = createHostDrawer({
      switchTo: async () => false,
      showView: () => resetWorkspaceRoot(navigation),
      pair() {},
      notifications() {},
    });
    expect(await drawer.select('missing')).toBe(false);
    expect(navigation.getRootState()).toBe(before);
  });

  it('reuses the same Cloud workspace root and retained tabs when selected repeatedly', () => {
    const { navigation, push } = navigator();
    const params = {
      instanceId: 'cloud',
      organizationId: 'org_a',
      accountScope: 'account-a',
      guest: 'false',
    };
    resetWorkspaceRoot(navigation, params);
    const listKey = navigation.getRootState().routes[1]?.key;
    push('cloud-channels', { ...params, channelId: 'channel_a' });
    resetWorkspaceRoot(navigation, params);
    expect(navigation.getRootState().routes).toHaveLength(2);
    expect(navigation.getRootState().routes[1]?.key).toBe(listKey);
    expect(navigation.getRootState().routes[0]?.key).toBe('tabs');
    resetWorkspaceRoot(navigation, { ...params, organizationId: 'org_b' });
    expect(navigation.getRootState().routes).toHaveLength(2);
    expect(navigation.getRootState().routes[1]?.params).toMatchObject({ organizationId: 'org_b' });
    navigation.dispatch({ type: 'GO_BACK' });
    expect(navigation.getRootState().routes).toHaveLength(1);
  });

  it('removes old account routes while preserving the account-management page and tab identity', () => {
    const { navigation, push } = navigator();
    push('cloud-channels', { instanceId: 'cloud', accountScope: 'old' });
    push('cloud-services', {});
    removeScopedRoutes(navigation, new Set(), new Set(['cloud']));
    expect(navigation.getRootState().routes.map((route) => route.name)).toEqual([
      '(tabs)',
      'cloud-services',
    ]);
    navigation.dispatch({ type: 'GO_BACK' });
    expect(navigation.getRootState().routes[0]?.key).toBe('tabs');
  });

  it('removes a revoked Host page but preserves unrelated Host history', () => {
    const { navigation, push } = navigator();
    push('dm/[slug]', { hostId: 'a', slug: 'ada' });
    push('bot/[slug]', { hostId: 'b', slug: 'ada' });
    removeScopedRoutes(navigation, new Set(['b']), new Set());
    expect(navigation.getRootState().routes.map((route) => route.name)).toEqual([
      '(tabs)',
      'dm/[slug]',
    ]);
    expect(navigation.getRootState().routes[1]?.params).toMatchObject({ hostId: 'a' });
  });
});
