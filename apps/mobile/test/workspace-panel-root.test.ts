import { describe, expect, it } from 'vitest';
import type { NavigationAction } from 'expo-router/react-navigation';
import { StackRouter } from '../node_modules/expo-router/build/react-navigation/routers/StackRouter.js';
import { createHostDrawer } from '../src/ui/shell/host-drawer-model';
import { resetWorkspaceRoot } from '../src/ui/shell/workspace-navigation';
import { workspaceStackRoot } from '../src/ui/shell/workspace-panel-root';

const homeNames = ['index'];
const chats = { key: 'chats', name: 'index' };

function homeStack(routes: { key: string; name: string }[], index = routes.length - 1) {
  return {
    stale: false as const,
    type: 'stack' as const,
    key: 'home-state',
    routeKeySeq: 0,
    index,
    routeNames: homeNames,
    routes,
  };
}

const stack = StackRouter({ initialRouteName: '(tabs)' });
const routeNames = ['(tabs)', 'dm/[slug]', 'cloud-channels'];
const options = { routeNames, routeParamList: {}, routeGetIdList: {} };

function navigator(home: ReturnType<typeof homeStack>) {
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
          routeKeySeq: 0,
          index: 1,
          routeNames: ['(home)', '(activity)'],
          routes: [
            { key: 'home', name: '(home)', state: home },
            { key: 'activity', name: '(activity)' },
          ],
        },
      },
    ],
  };
  return {
    getRootState: () => state,
    isReady: () => true,
    dispatch(action: NavigationAction) {
      const supported: Parameters<typeof stack.getStateForAction>[1] =
        action.type === 'RESET'
          ? { type: 'RESET', payload: { ...state, ...action.payload } }
          : {
              type: 'PUSH',
              payload: { name: 'dm/[slug]', params: { slug: 'ada', hostId: 'a' } },
            };
      const result = stack.getStateForAction(state, supported, options);
      if (typeof result === 'object') state = result.state;
    },
  };
}

function home(navigation: ReturnType<typeof navigator>) {
  const tabs = navigation.getRootState().routes[0]?.state;
  return tabs?.routes[0]?.state;
}

describe('workspace selection preserves the Chats root', () => {
  it('keeps the same Chats route and drops nested pages on explicit selection', () => {
    const next = workspaceStackRoot(homeStack([chats, { key: 'detail', name: 'detail' }]));
    expect(next).toMatchObject({ index: 0, routes: [chats] });
    expect(next.routes[0]).toBe(chats);
  });

  it('choosing a Host retains Chats while removing detail routes', async () => {
    const navigation = navigator(homeStack([chats]));
    navigation.dispatch({ type: 'PUSH', payload: { name: 'dm/[slug]' } });
    const drawer = createHostDrawer({
      switchTo: async () => true,
      showView: () => resetWorkspaceRoot(navigation),
      pair() {},
      notifications() {},
    });
    expect(await drawer.select('a')).toBe(true);
    expect(navigation.getRootState().routes.map((route) => route.name)).toEqual(['(tabs)']);
    expect(navigation.getRootState().routes[0]?.state?.index).toBe(0);
    expect(home(navigation)?.index).toBe(0);
    expect(home(navigation)?.routes).toEqual([chats]);
  });
});
