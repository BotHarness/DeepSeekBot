import { describe, expect, it } from 'vitest';
import type { NavigationAction } from 'expo-router/react-navigation';
import { StackRouter } from '../node_modules/expo-router/build/react-navigation/routers/StackRouter.js';
import { createHostDrawer } from '../src/ui/shell/host-drawer-model';
import { resetWorkspaceRoot } from '../src/ui/shell/workspace-navigation';
import {
  usesWorkspacePanel,
  withWorkspacePanel,
  workspaceStackRoot,
} from '../src/ui/shell/workspace-panel-root';

const homeNames = ['index', 'workspaces'];
const chats = { key: 'chats', name: 'index' };
const panel = { key: 'panel', name: 'workspaces' };

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

describe('iOS workspace panel under Chats (#3017)', () => {
  it('is the iOS Chats structure only', () => {
    expect(usesWorkspacePanel('ios')).toBe(true);
    expect(usesWorkspacePanel('android')).toBe(false);
    expect(usesWorkspacePanel('web')).toBe(false);
  });

  it('a cold start keeps Chats on top and puts the panel beneath it', () => {
    const next = withWorkspacePanel(homeStack([chats]));
    expect(next?.index).toBe(1);
    expect(next?.routes.map((route) => route.name)).toEqual(['workspaces', 'index']);
    expect(next?.routes[1]).toBe(chats);
  });

  it('leaves a stack that already has the panel, or does not start at Chats', () => {
    expect(withWorkspacePanel(homeStack([panel, chats]))).toBeUndefined();
    expect(withWorkspacePanel(homeStack([panel], 0))).toBeUndefined();
    expect(withWorkspacePanel({ routes: [] })).toBeUndefined();
  });

  it('choosing from the panel pushes a new Chats page above it', () => {
    const next = workspaceStackRoot(homeStack([panel], 0));
    expect(next.index).toBe(1);
    expect(next.routes[0]).toBe(panel);
    expect(next.routes[1]).toMatchObject({ name: 'index' });
    expect(next.routes[1]?.key).not.toBe(chats.key);
  });

  it('reuses the Chats page when the choice comes from the sidebar or Settings', () => {
    const next = workspaceStackRoot(homeStack([panel, chats]));
    expect(next).toMatchObject({ index: 1, routes: [panel, chats] });
  });

  it('keeps the single-root reset on Android and the web', () => {
    const next = workspaceStackRoot(homeStack([chats, { key: 'x', name: 'other' }]));
    expect(next).toMatchObject({ index: 0, routes: [chats] });
  });

  it('a Host chosen on the panel lands on Chats above the panel, with details removed', async () => {
    const navigation = navigator(homeStack([panel], 0));
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
    expect(home(navigation)?.index).toBe(1);
    expect(home(navigation)?.routes.map((route) => route.name)).toEqual(['workspaces', 'index']);
  });
});
