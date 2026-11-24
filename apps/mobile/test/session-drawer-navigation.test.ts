import { afterEach, expect, it, vi } from 'vitest';

const routing = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), dismissTo: vi.fn() }));
const stored = vi.hoisted(() => ({ last: undefined as unknown }));
vi.mock('expo-router', () => ({ router: routing }));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('../src/features/sessions/last-session', () => ({ lastSession: () => stored.last }));

import {
  landInSessionsTab,
  openDrawerSession,
  openNewSession,
  resetSessionsEntry,
} from '../src/features/sessions/session-drawer-navigation';
import { openSessionDrawer, sessionDrawer } from '../src/features/sessions/session-drawer-state';
import { interfacePreferences } from '../src/ui/interface-preferences';

afterEach(() => {
  interfacePreferences.setSessionNavigation('drawer');
  interfacePreferences.setSessionLaunch('new');
  interfacePreferences.setSessionReturn('stay');
  stored.last = undefined;
  resetSessionsEntry();
  vi.clearAllMocks();
});

it('opens New Session as the Sessions tab root and closes the drawer', () => {
  openSessionDrawer();
  openNewSession();
  expect(routing.replace).toHaveBeenLastCalledWith('/sessions');
  expect(sessionDrawer.getSnapshot().open).toBe(false);
});

it('opens a chosen Session in place of the current Sessions screen', () => {
  openDrawerSession('studio', {
    sessionId: 'native-1',
    source: { kind: 'native' },
    title: 'Map the repository',
  });
  expect(routing.replace).toHaveBeenLastCalledWith({
    pathname: '/session/[id]',
    params: { id: 'native-1', hostId: 'studio', source: 'native', title: 'Map the repository' },
  });
  openDrawerSession('laptop', {
    sessionId: 'bot-1',
    source: { kind: 'bot', botSlug: 'ada', displayName: 'Ada' },
  });
  expect(routing.replace).toHaveBeenLastCalledWith({
    pathname: '/session/[id]',
    params: { id: 'bot-1', hostId: 'laptop', slug: 'ada' },
  });
});

it('pushes Sessions and New Session over the Session list in Stacked style', () => {
  interfacePreferences.setSessionNavigation('stacked');
  openDrawerSession('studio', { sessionId: 'native-1', source: { kind: 'native' } });
  expect(routing.dismissTo).toHaveBeenLastCalledWith('/sessions');
  expect(routing.push).toHaveBeenLastCalledWith({
    pathname: '/session/[id]',
    params: { id: 'native-1', hostId: 'studio', source: 'native' },
  });
  expect(routing.replace).not.toHaveBeenCalled();
  openNewSession('root');
  expect(routing.push).toHaveBeenLastCalledWith('/new-session');
  openNewSession('session');
  expect(routing.replace).toHaveBeenLastCalledWith('/new-session');
});

it('follows On launch first, then Returning to Sessions, then re-tap goes to the root', () => {
  interfacePreferences.setSessionLaunch('last');
  interfacePreferences.setSessionReturn('list');
  stored.last = { hostId: 'studio', sessionId: 'native-1', title: 'Map' };
  const root = { index: 0, routes: [{ name: 'sessions' }] };
  landInSessionsTab(false, root);
  expect(routing.replace).toHaveBeenLastCalledWith({
    pathname: '/session/[id]',
    params: { id: 'native-1', hostId: 'studio', source: 'native', title: 'Map' },
  });
  const open = {
    index: 0,
    routes: [{ name: 'session/[id]', params: { id: 'native-1', hostId: 'studio' } }],
  };
  landInSessionsTab(false, open);
  expect(routing.replace).toHaveBeenLastCalledWith('/sessions');
  expect(sessionDrawer.getSnapshot().open).toBe(true);
  routing.replace.mockClear();
  landInSessionsTab(true, open);
  expect(routing.replace).toHaveBeenLastCalledWith('/sessions');
  expect(sessionDrawer.getSnapshot().open).toBe(false);
});

it('keeps the place by default when returning from another tab', () => {
  landInSessionsTab(false, undefined);
  landInSessionsTab(false, {
    index: 1,
    routes: [{ name: 'sessions' }, { name: 'session/[id]', params: { id: 'a' } }],
  });
  expect(routing.replace).not.toHaveBeenCalled();
  expect(routing.dismissTo).not.toHaveBeenCalled();
});
