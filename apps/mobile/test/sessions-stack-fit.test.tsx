// @vitest-environment jsdom
import { act, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  reset: vi.fn(),
}));
vi.mock('expo-router', () => ({
  useFocusEffect: (work: () => void | (() => void)) => useLayoutEffect(work, [work]),
  useSegments: () => ['(tabs)', '(sessions)', 'new-session'],
  useNavigation: () => ({ getState: () => nav.state, reset: nav.reset }),
}));

import { useSessionsStackFit } from '../src/features/sessions/drawer-root';
import { interfacePreferences } from '../src/ui/interface-preferences';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function Probe() {
  useSessionsStackFit();
  return null;
}

afterEach(() => interfacePreferences.setSessionNavigation('drawer'));

it('puts the Session list under a Stacked screen that became the stack root, with a complete state', () => {
  interfacePreferences.setSessionNavigation('stacked');
  const top = { key: 'new-session:0-0-3-0', name: 'new-session', params: {} };
  nav.state = {
    key: 'navigator:0-0-3',
    index: 0,
    routeNames: ['sessions', 'new-session', 'session/[id]'],
    routes: [top],
    routeKeySeq: 1,
    stale: false,
    type: 'stack',
  };
  const root = createRoot(document.createElement('div'));
  act(() => root.render(<Probe />));
  expect(nav.reset).toHaveBeenCalledExactlyOnceWith({
    ...nav.state,
    index: 1,
    routes: [{ name: 'sessions' }, top],
  });
  act(() => root.unmount());
});
