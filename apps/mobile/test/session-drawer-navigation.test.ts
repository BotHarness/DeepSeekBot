import { expect, it, vi } from 'vitest';

const routing = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('expo-router', () => ({ router: routing }));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));

import {
  openDrawerSession,
  openNewSession,
} from '../src/features/sessions/session-drawer-navigation';
import { openSessionDrawer, sessionDrawer } from '../src/features/sessions/session-drawer-state';

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
